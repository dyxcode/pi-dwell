import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openDistill } from "../src/integrations/distill.ts";
import { SessionService } from "../src/sessions/service.ts";
import { isTurnInfo } from "../src/shared/turns.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

const module = process.env.DWELL_TEST_DISTILL_MODULE;

async function until(check: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!check()) {
    assert.ok(Date.now() < deadline, message);
    await delay(15);
  }
}

test("idle reclamation and child crash retain a Distill workspace until explicit close", {
  skip: !module,
}, async (t) => {
  assert.ok(module);
  const env = await createPiEnvironment();
  const databasePath = join(env.agentDir, "distill", "memories.sqlite");
  await mkdir(dirname(databasePath), { mode: 0o700 });
  const distill = await openDistill({ module, database: databasePath });
  const database = new DatabaseSync(databasePath);
  const startLog = join(env.root, "starts.log");
  let now = Date.now();
  const options = {
    dataDir: join(env.root, "dwell"),
    env: {
      ...env.env,
      DWELL_TEST_START_LOG: startLog,
      DWELL_IDLE_TIMEOUT_MS: "50",
      DWELL_TEST_DISTILL_EXTRACTION: "1",
    },
    extensions: [env.extensionPath, join(dirname(module), "../src/index.ts")],
    distill,
    now: () => now,
  };
  let service = await SessionService.create(options);
  t.after(async () => {
    await service.shutdown();
    database.close();
    distill.close();
    await env.cleanup();
  });
  await service.configure({
    executable: process.execPath,
    entryPoint: fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry")),
  });
  const session = await service.createSession({ requestId: randomUUID(), directory: env.cwd });
  assert.equal(session.runtimeState, "ready");
  const active = await service.submitTurn(session.id, { requestId: randomUUID(), message: "slow" });
  await until(
    () => service.getTurn(session.id, active.turn.runId).status === "running",
    "turn never started",
  );
  now += 100;
  await delay(180);
  assert.equal(service.getSession(session.id).activeTurnId, active.turn.runId);
  assert.equal(service.runtimeCount, 1, "an active prompt cannot be reclaimed");
  await service.abortTurn(session.id, active.turn.runId);
  await until(
    () => service.getSession(session.id).activeTurnId === null,
    "aborted turn did not settle",
  );
  assert.equal(service.getSession(session.id).idleSince, now);
  now += 100;
  await until(() => service.runtimeCount === 0, "idle child was not reclaimed");
  assert.equal(service.getSession(session.id).workspaceOpen, true);
  assert.equal(service.getSession(session.id).idleSince, null);
  const closeCount = () =>
    database
      .prepare(
        "SELECT count(*) AS count FROM distill_triggers WHERE json_extract(trigger_json, '$.reason') = 'close'",
      )
      .get()?.count;
  assert.equal(closeCount(), 0);
  assert.deepEqual(distill.listPendingHostUses(), []);
  assert.equal(distill.listWorkspaceHolds?.()[0]?.sessionId, session.piSessionId);
  assert.ok((await service.getHistory(session.id)).entries.length > 0);
  assert.equal(service.runtimeCount, 0, "reading history must not wake Pi");
  const next = await service.submitTurn(session.id, { requestId: randomUUID(), message: "hello" });
  await until(
    () => service.getSession(session.id).activeTurnId === null,
    "turn did not finish after wake",
  );
  assert.equal(service.getTurn(session.id, next.turn.runId).status, "completed");
  const pids = (await readFile(startLog, "utf8")).trim().split("\n").map(Number);
  assert.equal(pids.length, 2);
  const childPid = pids[1];
  assert.ok(childPid);
  process.kill(childPid, "SIGKILL");
  await until(
    () => distill.listPendingHostUses().length === 0,
    "child death did not release its process lease",
  );
  const file = distill.listWorkspaceHolds?.()[0]?.sessionFile;
  assert.ok(file);
  await access(file);
  await service.shutdown();
  service = await SessionService.create(options);
  assert.equal(service.getSession(session.id).workspaceOpen, true);
  assert.equal(service.runtimeCount, 0);
  assert.equal(closeCount(), 0);
  database.exec(
    "CREATE TRIGGER fail_hold_release BEFORE DELETE ON host_workspace_holds BEGIN SELECT RAISE(ABORT, 'synthetic release failure'); END",
  );
  await assert.rejects(service.closeSession(session.id), /synthetic release failure/);
  assert.equal(service.getSession(session.id).workspaceOpen, false);
  assert.equal(distill.listWorkspaceHolds?.().length, 1);
  assert.equal(closeCount(), 0, "release and enqueue roll back together");
  database.exec("DROP TRIGGER fail_hold_release");
  await service.shutdown();
  service = await SessionService.create(options);
  assert.equal(service.getSession(session.id).workspaceOpen, false);
  assert.deepEqual(distill.listWorkspaceHolds?.(), []);
  assert.equal(closeCount(), 1, "restart replays the recorded explicit close, not runtime exits");
  // Distill currently advances background work only while a Pi runtime is alive.
  const worker = await service.createSession({ requestId: randomUUID(), directory: env.cwd });
  assert.equal(worker.runtimeState, "ready");
  await until(() => !existsSync(file), "explicitly closed history was not distilled and retired");
  assert.ok(
    database
      .prepare("SELECT 1 FROM memories WHERE content = ?")
      .get("Synthetic Dwell workspace memory."),
  );
});

test("a SIGKILLed Dwell host leaves the Distill workspace open", { skip: !module }, async (t) => {
  assert.ok(module);
  const env = await createPiEnvironment();
  const dataDir = join(env.root, "dwell");
  const databasePath = join(env.agentDir, "distill", "memories.sqlite");
  await mkdir(dirname(databasePath), { mode: 0o700 });
  const extension = join(dirname(module), "../src/index.ts");
  const distill = await openDistill({ module, database: databasePath });
  const database = new DatabaseSync(databasePath);
  const owner = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("./fixtures/turn-owner.ts", import.meta.url)),
      dataDir,
      env.cwd,
      env.extensionPath,
      "settled",
      randomUUID(),
    ],
    {
      env: {
        ...env.env,
        DWELL_TEST_DISTILL_MODULE: module,
        DWELL_TEST_DISTILL_DATABASE: databasePath,
        DWELL_TEST_DISTILL_EXTENSION: extension,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const exited = once(owner, "close");
  const deadline = setTimeout(() => owner.kill("SIGKILL"), 15_000);
  let restarted: SessionService | undefined;
  t.after(async () => {
    clearTimeout(deadline);
    if (owner.exitCode === null && owner.signalCode === null) owner.kill("SIGKILL");
    await exited;
    await restarted?.shutdown();
    database.close();
    distill.close();
    await env.cleanup();
  });
  let stderr = "";
  owner.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  let id: string | undefined;
  for await (const line of createInterface({ input: owner.stdout })) {
    const value: unknown = JSON.parse(line);
    assert.ok(value && typeof value === "object" && "turn" in value && isTurnInfo(value.turn));
    id = value.turn.sessionId;
    break;
  }
  assert.ok(id, stderr);
  assert.equal(distill.listWorkspaceHolds?.().length, 1);
  const oldChild = distill.listPendingHostUses()[0]?.child;
  assert.ok(oldChild);
  assert.ok(owner.kill("SIGKILL"));
  await exited;
  clearTimeout(deadline);
  await until(() => {
    try {
      process.kill(oldChild.pid, 0);
      return false;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ESRCH")
        return true;
      throw error;
    }
  }, "Pi did not exit after losing its Dwell host");
  restarted = await SessionService.create({
    dataDir,
    env: env.env,
    extensions: [env.extensionPath, extension],
    distill,
  });
  assert.equal(restarted.getSession(id).workspaceOpen, true);
  assert.equal(restarted.runtimeCount, 0);
  assert.deepEqual(distill.listPendingHostUses(), []);
  assert.equal(distill.listWorkspaceHolds?.().length, 1);
  assert.match(
    JSON.stringify((await restarted.getHistory(id)).entries),
    /Hello from the offline Pi fixture/,
  );
  assert.equal(restarted.runtimeCount, 0);
  assert.equal(database.prepare("SELECT count(*) AS count FROM distill_triggers").get()?.count, 0);
});

test("configured Distill use follows fresh Pi startup, close and reopen", {
  skip: !module,
}, async (t) => {
  assert.ok(module);
  const env = await createPiEnvironment();
  const databasePath = join(env.root, "memory.sqlite");
  const distill = await openDistill({ module, database: databasePath });
  const database = new DatabaseSync(databasePath);
  const closeTriggers = () =>
    database
      .prepare(
        "SELECT json_extract(trigger_json, '$.leafId') AS leaf FROM distill_triggers WHERE json_extract(trigger_json, '$.reason') = 'close'",
      )
      .all()
      .map((row) => row.leaf);
  const options = {
    dataDir: join(env.root, "dwell"),
    env: env.env,
    extensions: [env.extensionPath],
    distill,
  };
  const service = await SessionService.create(options);
  t.after(async () => {
    await service.shutdown();
    database.close();
    distill.close();
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
  assert.equal(session.runtimeState, "ready");
  assert.deepEqual(
    distill.listWorkspaceHolds?.().map((hold) => hold.sessionId),
    [session.piSessionId],
  );
  const uses = distill.listPendingHostUses();
  assert.equal(uses.length, 1);
  assert.equal(uses[0]?.state, "attached");
  assert.equal(uses[0]?.sessionFile, null);
  const { turn } = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "hello",
  });
  const deadline = Date.now() + 10000;
  while (
    service.getTurn(session.id, turn.runId).status !== "completed" ||
    service.getSession(session.id).activeTurnId !== null
  ) {
    assert.ok(Date.now() < deadline, "Pi turn did not complete");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const history = await service.getHistory(session.id);
  assert.ok(history.entries.length > 0);
  const gate = distill.acquireSourceRead({
    sessionId: session.piSessionId,
    sessionFile: join(env.root, "another-source.jsonl"),
    cwd: env.cwd,
  });
  assert.ok(gate);
  try {
    const closed = await service.closeSession(session.id);
    assert.equal(closed.runtimeState, "closed");
    assert.deepEqual(distill.listPendingHostUses(), []);
    assert.deepEqual(distill.listWorkspaceHolds?.(), []);
    assert.deepEqual(closeTriggers(), [history.leafId]);
  } finally {
    gate.release();
  }
  await service.openSession(session.id);
  assert.equal(distill.listPendingHostUses().length, 1);
  assert.ok(distill.listPendingHostUses()[0]?.sessionFile?.endsWith(".jsonl"));
  await service.shutdown();
  assert.deepEqual(distill.listPendingHostUses(), []);
  assert.deepEqual(closeTriggers(), [history.leafId]);
  assert.deepEqual(
    distill.listWorkspaceHolds?.().map((hold) => hold.sessionId),
    [session.piSessionId],
  );
  const restored = await SessionService.create(options);
  t.after(() => restored.shutdown());
  assert.equal(restored.getSession(session.id).workspaceOpen, true);
  assert.equal(restored.runtimeCount, 0);
  assert.equal((await restored.getHistory(session.id)).leafId, history.leafId);
  assert.equal(restored.runtimeCount, 0);
  await restored.closeSession(session.id);
  assert.deepEqual(distill.listWorkspaceHolds?.(), []);
  assert.deepEqual(closeTriggers(), [history.leafId], "closing the same saved leaf is idempotent");
  await restored.shutdown();
});

test("active turn completes and keeps its runtime open while Distill holds a delete lock on another session", {
  skip: !module,
}, async (t) => {
  assert.ok(module);
  const env = await createPiEnvironment();
  const databasePath = join(env.root, "memory.sqlite");
  const distill = await openDistill({ module, database: databasePath });
  const database = new DatabaseSync(databasePath);
  const service = await SessionService.create({
    dataDir: join(env.root, "dwell"),
    env: env.env,
    extensions: [env.extensionPath],
    distill,
  });
  t.after(async () => {
    await service.shutdown();
    database.close();
    distill.close();
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
  const unrelatedHistoricalFile = join(env.root, "historical-session.jsonl");
  const deleteToken = randomUUID();
  database
    .prepare("INSERT INTO source_access (token, session_file, mode, owner_pid) VALUES (?, ?, ?, ?)")
    .run(deleteToken, unrelatedHistoricalFile, "delete", process.pid);
  try {
    const { turn } = await service.submitTurn(session.id, {
      requestId: randomUUID(),
      message: "hello while historical cleanup runs",
    });
    const deadline = Date.now() + 10000;
    while (
      service.getTurn(session.id, turn.runId).status !== "completed" ||
      service.getSession(session.id).activeTurnId !== null
    ) {
      const current = service.getTurn(session.id, turn.runId);
      assert.notEqual(current.status, "interrupted", current.error?.message ?? "turn interrupted");
      assert.ok(Date.now() < deadline, "Pi turn did not complete");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(service.getSession(session.id).runtimeState, "ready");
  } finally {
    database.prepare("DELETE FROM source_access WHERE token = ?").run(deleteToken);
  }
});
