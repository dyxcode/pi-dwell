import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { SessionService } from "../src/sessions/service.ts";
import { SessionCatalog } from "../src/storage/catalog.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

const entryPoint = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry"));
async function setup(t: TestContext) {
  const env = await createPiEnvironment();
  const options = {
    dataDir: join(env.root, "dwell"),
    env: env.env,
    extensions: [env.extensionPath],
  };
  const service = await SessionService.create(options);
  t.after(async () => {
    await service.shutdown();
    await env.cleanup();
  });
  await service.configure({ executable: process.execPath, entryPoint });
  const create = () =>
    service.createSession({
      requestId: randomUUID(),
      directory: env.cwd,
      provider: "dwell-test",
      model: "dwell-test",
    });
  return { service, options, env, create, session: await create() };
}
async function until<T>(read: () => T, matches: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 8000;
  for (;;) {
    const value = read();
    if (matches(value)) return value;
    if (Date.now() > deadline)
      throw new Error(`Timed out waiting for state: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("turn admission deduplicates before busy and saved results survive host restart", async (t) => {
  const { service, session, options } = await setup(t);
  const request = { requestId: randomUUID(), message: "tool" };
  const [first, retry] = await Promise.all([
    service.submitTurn(session.id, request),
    service.submitTurn(session.id, request),
  ]);
  assert.equal(first.created, true);
  assert.equal(retry.created, false);
  assert.equal(first.turn.runId, retry.turn.runId);
  await assert.rejects(
    service.submitTurn(session.id, { ...request, message: "changed" }),
    /different/i,
  );
  const result = await until(
    () => service.getTurn(session.id, first.turn.runId),
    (value) => value.status === "completed",
  );
  assert.ok(result.entryIds.length >= 4);
  const saved = await service.getTurnResult(session.id, result.runId);
  assert.match(JSON.stringify(saved), /Echo complete/);
  assert.equal(
    saved.entries.filter(
      (entry) => entry.type === "message" && JSON.stringify(entry).includes('"role":"user"'),
    ).length,
    1,
  );
  assert.equal(service.getSession(session.id).latestTurnId, result.runId);
  assert.equal(service.getSession(session.id).activeTurnId, null);
  await service.shutdown();
  const restored = await SessionService.create(options);
  t.after(() => restored.shutdown());
  assert.deepEqual(await restored.getTurnResult(session.id, result.runId), saved);
  assert.equal((await restored.submitTurn(session.id, request)).turn.runId, result.runId);
});

test("slow turns do not block other sessions and abort is scoped to its run", async (t) => {
  const { service, session, create } = await setup(t);
  const other = await create();
  const slow = await service.submitTurn(session.id, { requestId: randomUUID(), message: "slow" });
  await until(
    () => service.getTurn(session.id, slow.turn.runId),
    (value) => value.status === "running",
  );
  await assert.rejects(
    service.submitTurn(session.id, { requestId: randomUUID(), message: "hello" }),
    /busy/i,
  );
  await assert.rejects(service.closeSession(session.id), /active|busy/i);
  const fast = await service.submitTurn(other.id, { requestId: randomUUID(), message: "hello" });
  await until(
    () => service.getTurn(other.id, fast.turn.runId),
    (value) => value.status === "completed",
  );
  await assert.rejects(service.abortTurn(other.id, slow.turn.runId), /Unknown/i);
  await service.abortTurn(session.id, slow.turn.runId);
  const stopped = await until(
    () => service.getTurn(session.id, slow.turn.runId),
    (value) => value.status === "aborted",
  );
  assert.equal(stopped.cancellationRequested, true);
  const next = await service.submitTurn(session.id, { requestId: randomUUID(), message: "slow" });
  await until(
    () => service.getTurn(session.id, next.turn.runId),
    (value) => value.status === "running",
  );
  await service.abortTurn(session.id, slow.turn.runId);
  assert.equal(service.getTurn(session.id, next.turn.runId).cancellationRequested, false);
  await service.abortTurn(session.id, next.turn.runId);
  await until(
    () => service.getTurn(session.id, next.turn.runId),
    (value) => value.status === "aborted",
  );
});

test("accepted work can be cancelled before dispatch and provider failures remain explicit", async (t) => {
  const { service, session } = await setup(t);
  const first = await service.submitTurn(session.id, { requestId: randomUUID(), message: "hello" });
  const aborted = await service.abortTurn(session.id, first.turn.runId);
  assert.equal(aborted.status, "aborted");
  await until(
    () => service.getSession(session.id),
    (value) => value.activeTurnId === null,
  );
  assert.deepEqual(await service.getContext(session.id), { messages: [] });
  const failure = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "fail",
  });
  const failed = await until(
    () => service.getTurn(session.id, failure.turn.runId),
    (value) => value.status === "failed",
  );
  assert.ok(failed.error);
  assert.equal((await service.abortTurn(session.id, failure.turn.runId)).status, "failed");
});

test("database admission failure never sends a prompt and removed history is unavailable", async (t) => {
  const { service, session, options } = await setup(t);
  const lock = new DatabaseSync(join(options.dataDir, "catalog.sqlite"));
  lock.exec("BEGIN EXCLUSIVE");
  try {
    await assert.rejects(
      service.submitTurn(session.id, { requestId: randomUUID(), message: "hello" }),
      /locked/i,
    );
  } finally {
    lock.exec("ROLLBACK");
    lock.close();
  }
  assert.deepEqual(await service.getContext(session.id), { messages: [] });
  const { turn } = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "hello",
  });
  await until(
    () => service.getTurn(session.id, turn.runId),
    (value) => value.status === "completed",
  );
  const catalog = await SessionCatalog.open(options.dataDir);
  const path = catalog.get(session.id)?.piSessionFile;
  catalog.close();
  assert.ok(path);
  assert.match(await readFile(path, "utf8"), /Hello from/);
  await unlink(path);
  await assert.rejects(service.getTurnResult(session.id, turn.runId), /unavailable/i);
  const missing = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "must not recreate deleted history",
  });
  const refused = await until(
    () => service.getTurn(session.id, missing.turn.runId),
    (value) => !["accepted", "dispatching", "running"].includes(value.status),
  );
  assert.equal(refused.status, "failed");
  assert.equal(refused.error?.code, "history_unavailable");
  await assert.rejects(readFile(path), { code: "ENOENT" });
});

test("shutdown bounds active work and restarting never replays it", async (t) => {
  const { service, session, options } = await setup(t);
  const request = { requestId: randomUUID(), message: "slow" };
  const { turn } = await service.submitTurn(session.id, request);
  await until(
    () => service.getTurn(session.id, turn.runId),
    (value) => value.status === "running",
  );
  const start = Date.now();
  await service.shutdown();
  assert.ok(Date.now() - start < 8000);
  const restored = await SessionService.create(options);
  t.after(() => restored.shutdown());
  const retry = await restored.submitTurn(session.id, request);
  assert.equal(retry.created, false);
  assert.ok(["aborted", "interrupted"].includes(retry.turn.status));
  assert.equal(restored.runtimeCount, 0);
});

test("cancel during dispatch preparation preserves an empty session; completion can win an abort race", async (t) => {
  const env = await createPiEnvironment();
  let reached!: () => void;
  let release!: () => void;
  let point = "dispatching";
  let entered = new Promise<void>((resolve) => {
    reached = resolve;
  });
  let barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const service = await SessionService.create({
    dataDir: join(env.root, "dwell"),
    env: env.env,
    extensions: [env.extensionPath],
    turnCheckpoint: async (current) => {
      if (current === point) {
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
  await service.configure({ executable: process.execPath, entryPoint });
  const session = await service.createSession({
    requestId: randomUUID(),
    directory: env.cwd,
    provider: "dwell-test",
    model: "dwell-test",
  });
  const first = await service.submitTurn(session.id, { requestId: randomUUID(), message: "hello" });
  await entered;
  assert.equal((await service.abortTurn(session.id, first.turn.runId)).status, "aborted");
  release();
  await until(
    () => service.getSession(session.id),
    (value) => value.activeTurnId === null,
  );
  await service.closeSession(session.id);
  await service.openSession(session.id);
  assert.deepEqual(await service.getContext(session.id), { messages: [] });
  point = "settled";
  entered = new Promise<void>((resolve) => {
    reached = resolve;
  });
  barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = await service.submitTurn(session.id, { requestId: randomUUID(), message: "hello" });
  await entered;
  assert.equal((await service.abortTurn(session.id, next.turn.runId)).cancellationRequested, true);
  release();
  const completed = await until(
    () => service.getTurn(session.id, next.turn.runId),
    (value) => value.status === "completed",
  );
  assert.equal(completed.cancellationRequested, true);
});

test("extension-handled text is interrupted explicitly rather than reported completed", async (t) => {
  const { service, session } = await setup(t);
  const { turn } = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "handled",
  });
  const handled = await until(
    () => service.getTurn(session.id, turn.runId),
    (value) => value.status === "interrupted",
  );
  assert.equal(handled.error?.code, "unsupported_prompt");
  assert.equal(service.getSession(session.id).runtimeState, "closed");
});
