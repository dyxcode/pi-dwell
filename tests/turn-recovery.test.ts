import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SessionService } from "../src/sessions/service.ts";
import { isTurnInfo } from "../src/shared/turns.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

for (const point of ["accepted", "dispatching", "running", "settled"]) {
  test(`SIGKILL at ${point} preserves request identity and never replays execution`, async (t) => {
    const env = await createPiEnvironment();
    t.after(() => env.cleanup());
    const dataDir = join(env.root, "dwell");
    const log = join(env.root, "turns.log");
    const childEnv = { ...env.env, DWELL_TEST_TURN_LOG: log };
    const requestId = randomUUID();
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL("./fixtures/turn-owner.ts", import.meta.url)),
        dataDir,
        env.cwd,
        env.extensionPath,
        point,
        requestId,
      ],
      { env: childEnv, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const closed = once(child, "close");
    const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
    t.after(() => {
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    });
    let value: unknown;
    for await (const line of createInterface({ input: child.stdout })) {
      value = JSON.parse(line);
      break;
    }
    assert.ok(
      value && typeof value === "object" && "turn" in value && isTurnInfo(value.turn),
      stderr,
    );
    const original = value.turn;
    if (point === "running") {
      const deadline = Date.now() + 5000;
      for (;;) {
        try {
          if ((await readFile(log, "utf8")).includes("slow\n")) break;
        } catch (error) {
          if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
            throw error;
        }
        assert.ok(Date.now() < deadline, "Provider did not start before crash barrier.");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    child.kill("SIGKILL");
    await closed;
    clearTimeout(timer);
    const restored = await SessionService.create({
      dataDir,
      env: childEnv,
      extensions: [env.extensionPath],
    });
    t.after(() => restored.shutdown());
    const turn = restored.getTurn(original.sessionId, original.runId);
    assert.equal(turn.status, "interrupted");
    assert.equal(turn.error?.code, point === "accepted" ? "not_dispatched" : "outcome_unknown");
    const retry = await restored.submitTurn(turn.sessionId, {
      requestId,
      message: point === "running" ? "slow" : "hello",
    });
    assert.equal(retry.created, false);
    assert.equal(retry.turn.runId, original.runId);
    assert.equal(restored.runtimeCount, 0);
    const count = async () => {
      try {
        return (await readFile(log, "utf8")).trim().split("\n").length;
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
          return 0;
        throw error;
      }
    };
    assert.equal(await count(), point === "accepted" || point === "dispatching" ? 0 : 1);
    if (point === "dispatching")
      await assert.rejects(restored.openSession(turn.sessionId), /history.*unavailable/i);
    if (point === "settled")
      assert.match(JSON.stringify(await restored.getContext(turn.sessionId)), /Hello from/);
    assert.equal(await count(), point === "accepted" || point === "dispatching" ? 0 : 1);
  });
}

test("a final ledger write failure blocks new execution until restart without losing Pi history", async (t) => {
  const env = await createPiEnvironment();
  const dataDir = join(env.root, "dwell");
  let reached!: () => void;
  let release!: () => void;
  const atSettlement = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const options = { dataDir, env: env.env, extensions: [env.extensionPath] };
  const service = await SessionService.create({
    ...options,
    turnCheckpoint: async (point) => {
      if (point === "settled") {
        reached();
        await barrier;
      }
    },
  });
  t.after(async () => {
    release();
    await service.shutdown();
    await env.cleanup();
  });
  await service.configure({
    executable: process.execPath,
    entryPoint: fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry")),
  });
  const session = await service.createSession({
    requestId: randomUUID(),
    directory: env.cwd,
    provider: "dwell-test",
    model: "dwell-test",
  });
  const request = { requestId: randomUUID(), message: "hello" };
  const { turn } = await service.submitTurn(session.id, request);
  await atSettlement;
  const lock = new DatabaseSync(join(dataDir, "catalog.sqlite"));
  lock.exec("BEGIN EXCLUSIVE");
  release();
  // Keep the lock until runtime cleanup proves that final persistence failed.
  const deadline = Date.now() + 5000;
  while (service.runtimeCount > 0 && Date.now() < deadline) {
    // Runtime map keeps failed/exited children; the turn slot disappears only after cleanup.
    try {
      service.getTurn(session.id, turn.runId);
    } catch (error) {
      if (error instanceof Error && error.message.includes("could not be saved")) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  lock.exec("ROLLBACK");
  lock.close();
  assert.throws(() => service.getTurn(session.id, turn.runId), /could not be saved/);
  await assert.rejects(
    service.submitTurn(session.id, { requestId: randomUUID(), message: "hello" }),
    /could not be saved/,
  );
  await service.shutdown();
  const restored = await SessionService.create(options);
  t.after(() => restored.shutdown());
  assert.equal((await restored.submitTurn(session.id, request)).turn.status, "interrupted");
  assert.match(JSON.stringify(await restored.getContext(session.id)), /Hello from/);
});

test("failed cancellation persistence stops the runtime and blocks new work", async (t) => {
  const env = await createPiEnvironment();
  const dataDir = join(env.root, "dwell");
  const service = await SessionService.create({
    dataDir,
    env: env.env,
    extensions: [env.extensionPath],
  });
  t.after(async () => {
    await service.shutdown();
    await env.cleanup();
  });
  await service.configure({
    executable: process.execPath,
    entryPoint: fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry")),
  });
  const session = await service.createSession({
    requestId: randomUUID(),
    directory: env.cwd,
    provider: "dwell-test",
    model: "dwell-test",
  });
  const { turn } = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "slow",
  });
  const deadline = Date.now() + 8000;
  while (service.getTurn(session.id, turn.runId).status !== "running") {
    assert.ok(Date.now() < deadline);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const database = new DatabaseSync(join(dataDir, "catalog.sqlite"));
  database.exec(
    "CREATE TRIGGER reject_turn_write BEFORE UPDATE ON turns BEGIN SELECT RAISE(FAIL, 'synthetic write failure'); END",
  );
  try {
    await assert.rejects(service.abortTurn(session.id, turn.runId), /could not be saved/);
    assert.ok(["closed", "failed"].includes(service.getSession(session.id).runtimeState));
    await assert.rejects(
      service.submitTurn(session.id, { requestId: randomUUID(), message: "hello" }),
      /could not be saved/,
    );
  } finally {
    database.exec("DROP TRIGGER reject_turn_write");
    database.close();
  }
});
