import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PiProcess } from "../src/runtime/pi-process.ts";
import { SessionService } from "../src/sessions/service.ts";
import { SessionCatalog } from "../src/storage/catalog.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

const entryPoint = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry"));

async function setup(t: TestContext) {
  const environment = await createPiEnvironment();
  const dataDir = join(environment.root, "dwell");
  const options = {
    dataDir,
    env: { ...environment.env, DWELL_TEST_START_LOG: join(environment.root, "starts.log") },
    extensions: [environment.extensionPath],
  };
  const service = await SessionService.create(options);
  t.after(async () => {
    await service.shutdown();
    await environment.cleanup();
  });
  const configure = () => service.configure({ executable: process.execPath, entryPoint });
  const request = {
    requestId: randomUUID(),
    directory: environment.cwd,
    provider: "dwell-test",
    model: "dwell-test",
  };
  return { service, environment, options, configure, request };
}

test("sessions start without Pi configuration and create/reopen empty identities durably", async (t) => {
  const { service, request, configure, options } = await setup(t);
  assert.deepEqual(service.listSessions(), []);
  await assert.rejects(service.createSession(request), /configure|configured/i);
  await configure();
  const first = await service.createSession(request);
  assert.equal(first.status, "ready");
  assert.equal(first.runtimeState, "ready");
  assert.equal(first.historyState, "empty");
  await service.shutdown();
  const restored = await SessionService.create(options);
  t.after(() => restored.shutdown());
  assert.equal(restored.listSessions()[0]?.id, first.id);
  assert.equal(restored.listSessions()[0]?.runtimeState, "closed");
  const reopened = await restored.openSession(first.id);
  assert.equal(reopened.piSessionId, first.piSessionId);
  assert.deepEqual(await restored.getContext(first.id), { messages: [] });
  await restored.closeSession(first.id);
  await restored.shutdown();
});

test("create retries and concurrent opens share one persisted session and runtime", async (t) => {
  const { service, configure, request, environment } = await setup(t);
  await configure();
  const [a, b] = await Promise.all([
    service.createSession(request),
    service.createSession(request),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(service.listSessions().length, 1);
  assert.equal(
    (await readFile(join(environment.root, "starts.log"), "utf8")).trim().split("\n").length,
    1,
  );
  await assert.rejects(
    service.createSession({ ...request, model: "different" }),
    /conflict|different/i,
  );
  await service.closeSession(a.id);
  const [c, d] = await Promise.all([service.openSession(a.id), service.openSession(a.id)]);
  assert.equal(c.piSessionId, d.piSessionId);
  assert.equal(service.runtimeCount, 1);
  assert.equal(
    (await readFile(join(environment.root, "starts.log"), "utf8")).trim().split("\n").length,
    2,
  );
});

test("known populated history reopens through Pi and missing history never becomes an empty replacement", async (t) => {
  const { service, configure, request, options, environment } = await setup(t);
  await configure();
  const session = await service.createSession(request);
  await service.closeSession(session.id);
  await service.shutdown();
  const catalog = await SessionCatalog.open(options.dataDir);
  const stored = catalog.get(session.id);
  assert.ok(stored?.piSessionFile);
  catalog.close();
  const pi = await PiProcess.start({
    executable: process.execPath,
    entryPoint,
    cwd: environment.cwd,
    env: environment.env,
    sessionDirectory: join(options.dataDir, "sessions", session.id),
    sessionId: session.piSessionId,
    provider: request.provider,
    model: request.model,
    extensions: [environment.extensionPath],
  });
  await pi.run("tool");
  const state = await pi.getState();
  await pi.stop();
  assert.ok(state.sessionFile);
  const restored = await SessionService.create(options);
  t.after(() => restored.shutdown());
  const reopened = await restored.openSession(session.id);
  assert.equal(reopened.historyState, "available");
  assert.equal(reopened.piSessionId, session.piSessionId);
  assert.ok((await restored.getContext(session.id)).messages.length > 0);
  await restored.closeSession(session.id);
  const refreshed = await SessionCatalog.open(options.dataDir);
  const saved = refreshed.get(session.id);
  refreshed.close();
  assert.ok(saved?.piSessionFile);
  await unlink(saved.piSessionFile);
  await assert.rejects(restored.openSession(session.id), /history.*unavailable/i);
  assert.equal(restored.getSession(session.id).historyState, "unavailable");
});

test("invalid directories and failed Pi startup do not become successful sessions", async (t) => {
  const { service, configure, request, environment } = await setup(t);
  await configure();
  await assert.rejects(
    service.createSession({ ...request, directory: join(environment.root, "missing") }),
    /directory/i,
  );
  assert.equal(service.listSessions().length, 0);
  const failed = await service.createSession({ ...request, provider: "missing-dwell-provider" });
  assert.equal(failed.status, "failed");
  assert.equal(service.runtimeCount, 0);
  const retry = await service.createSession({ ...request, provider: "missing-dwell-provider" });
  assert.equal(retry.id, failed.id);
});

test("shutdown closes every runtime and rejects later work", async (t) => {
  const { service, configure, request, options } = await setup(t);
  await configure();
  const a = await service.createSession(request);
  assert.equal(service.runtimeCount, 1);
  await service.shutdown();
  assert.equal(service.runtimeCount, 0);
  await assert.rejects(service.openSession(a.id), /stopping|closed|shutdown/i);
  const contents = await readFile(join(options.dataDir, "catalog.sqlite"));
  assert.ok(contents.length > 0);
});

test("a locked catalog prevents session dispatch before durable admission", async (t) => {
  const { service, configure, request, options } = await setup(t);
  await configure();
  const locker = new DatabaseSync(join(options.dataDir, "catalog.sqlite"));
  locker.exec("BEGIN EXCLUSIVE");
  try {
    await assert.rejects(service.createSession(request), /locked/i);
    assert.equal(service.runtimeCount, 0);
  } finally {
    locker.exec("ROLLBACK");
    locker.close();
  }
  assert.deepEqual(service.listSessions(), []);
});

test("a corrupt history header is rejected before Pi can replace it", async (t) => {
  const { service, configure, request, options } = await setup(t);
  await configure();
  const session = await service.createSession(request);
  await service.closeSession(session.id);
  const catalog = await SessionCatalog.open(options.dataDir);
  const stored = catalog.get(session.id);
  catalog.close();
  assert.ok(stored?.piSessionFile);
  await writeFile(stored.piSessionFile, "corrupt session header\n", { mode: 0o600 });
  await assert.rejects(service.openSession(session.id), /history.*invalid/i);
  assert.equal(await readFile(stored.piSessionFile, "utf8"), "corrupt session header\n");
  assert.equal(service.runtimeCount, 0);
});

test("semantic catalog corruption fails startup before any runtime is created", async (t) => {
  const { service, configure, request, options } = await setup(t);
  await configure();
  await service.createSession(request);
  await service.shutdown();
  const database = new DatabaseSync(join(options.dataDir, "catalog.sqlite"));
  database.prepare("UPDATE sessions SET directory = ?").run("relative-project");
  database.close();
  await assert.rejects(SessionService.create(options), /catalog.*invalid/i);
});
