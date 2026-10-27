import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PiProcess } from "../src/runtime/pi-process.ts";
import { SessionService } from "../src/sessions/service.ts";
import { SessionCatalog } from "../src/storage/catalog.ts";
import type { StreamFrame } from "../src/shared/events.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

const entryPoint = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry"));

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

async function setup(t: TestContext, captureSystemPrompt = false) {
  const environment = await createPiEnvironment();
  const dataDir = join(environment.root, "dwell");
  const options = {
    dataDir,
    env: {
      ...environment.env,
      DWELL_TEST_START_LOG: join(environment.root, "starts.log"),
      ...(captureSystemPrompt
        ? { DWELL_TEST_SYSTEM_PROMPT: join(environment.root, "prompt.txt") }
        : {}),
    },
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

test("a model and thinking-level selection is one idle session mutation and survives reopen", async (t) => {
  const { service, environment, configure, request } = await setup(t);
  await configure();
  const session = await service.createSession(request);
  const selected = await service.setSessionModel(session.id, {
    provider: "dwell-test",
    model: "dwell-test-reasoning",
    thinkingLevel: "max",
  });
  assert.equal(selected.model, "dwell-test-reasoning");
  assert.equal(selected.thinkingLevel, "xhigh");
  assert.equal(service.getSession(session.id).thinkingLevel, "xhigh");
  await service.closeSession(session.id);
  const reopened = await service.openSession(session.id);
  assert.equal(reopened.model, "dwell-test-reasoning");
  assert.equal(reopened.thinkingLevel, "xhigh");
  const settings = await readFile(join(environment.agentDir, "settings.json"), "utf8");
  assert.match(settings, /"defaultModel": "dwell-test"/u);
});

test("host restart reloads changed native instructions while preserving session history", async (t) => {
  const { service, environment, options, configure, request } = await setup(t, true);
  const report = join(environment.root, "prompt.txt");
  const instructions = join(environment.cwd, "AGENTS.md");
  await writeFile(instructions, "DWELL_CONTEXT_BEFORE_RESTART");
  await configure();
  const first = await service.createSession(request);
  const { turn } = await service.submitTurn(first.id, {
    requestId: randomUUID(),
    message: "hello",
  });
  await until(
    () => service.getTurn(first.id, turn.runId),
    (current) => current.status === "completed",
  );
  assert.match(await readFile(report, "utf8"), /DWELL_CONTEXT_BEFORE_RESTART/);
  const before = await service.getContext(first.id);
  assert.ok(before.messages.length > 0);
  await service.shutdown();
  await writeFile(instructions, "DWELL_CONTEXT_AFTER_RESTART");

  const restored = await SessionService.create(options);
  t.after(() => restored.shutdown());
  const reopened = await restored.openSession(first.id);
  assert.equal(reopened.piSessionId, first.piSessionId);
  assert.deepEqual(await restored.getContext(first.id), before);
  const { turn: next } = await restored.submitTurn(first.id, {
    requestId: randomUUID(),
    message: "hello again",
  });
  await until(
    () => restored.getTurn(first.id, next.runId),
    (current) => current.status === "completed",
  );
  const prompt = await readFile(report, "utf8");
  assert.match(prompt, /DWELL_CONTEXT_AFTER_RESTART/);
  assert.ok(!prompt.includes("DWELL_CONTEXT_BEFORE_RESTART"));
  assert.ok((await restored.getContext(first.id)).messages.length > before.messages.length);
  await restored.shutdown();
});

test("directory-only sessions use Pi defaults and persist native idle model changes", async (t) => {
  const { service, configure, options, environment } = await setup(t);
  await configure();
  const creating = service.createSession({
    requestId: randomUUID(),
    directory: environment.cwd,
  });
  const pending = await until(
    () => service.listSessions()[0],
    (current) => current?.status === "creating",
  );
  assert.ok(pending);
  assert.equal(pending.provider, null);
  assert.equal(pending.model, null);
  const session = await creating;
  assert.equal(session.status, "ready");
  assert.equal(session.provider, "dwell-test");
  assert.equal(session.model, "dwell-test");

  const frames: StreamFrame[] = [];
  const stream = service.subscribeEvents(session.id, undefined, (frame) => frames.push(frame));
  const changed = await service.setSessionModel(session.id, {
    provider: "dwell-test",
    model: "dwell-test-alt",
  });
  assert.equal(changed.provider, "dwell-test");
  assert.equal(changed.model, "dwell-test-alt");
  assert.ok(
    stream.initial.some(
      (frame) => frame.type === "snapshot" && frame.payload.session.model === "dwell-test",
    ),
  );
  assert.ok(
    frames.some(
      (frame) => frame.type === "session.updated" && frame.payload.model === "dwell-test-alt",
    ),
  );
  stream.unsubscribe();

  await service.closeSession(session.id);
  await service.shutdown();
  const restored = await SessionService.create(options);
  t.after(() => restored.shutdown());
  const reopened = await restored.openSession(session.id);
  assert.equal(reopened.provider, "dwell-test");
  assert.equal(reopened.model, "dwell-test-alt");
});

test("model changes are rejected while a session turn is active", async (t) => {
  const { service, configure, request } = await setup(t);
  await configure();
  const session = await service.createSession({
    requestId: randomUUID(),
    directory: request.directory,
  });
  const { turn } = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "slow",
  });
  await until(
    () => service.getTurn(session.id, turn.runId),
    (current) => current.status === "running",
  );
  await assert.rejects(
    service.setSessionModel(session.id, { provider: "dwell-test", model: "dwell-test-alt" }),
    /busy|active/i,
  );
  await service.abortTurn(session.id, turn.runId);
  await until(
    () => service.getSession(session.id),
    (current) => current.activeTurnId === null,
  );
});

test("a failed native model-change append closes the uncertain runtime and can reopen safely", async (t) => {
  const { service, configure, request, options } = await setup(t);
  await configure();
  const session = await service.createSession({
    requestId: randomUUID(),
    directory: request.directory,
  });
  const { turn } = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "tool",
  });
  await until(
    () => service.getTurn(session.id, turn.runId),
    (current) => current.status === "completed",
  );
  const catalog = await SessionCatalog.open(options.dataDir);
  const stored = catalog.get(session.id);
  catalog.close();
  assert.ok(stored?.piSessionFile);

  const savedFile = `${stored.piSessionFile}.saved`;
  await rename(stored.piSessionFile, savedFile);
  await mkdir(stored.piSessionFile);
  try {
    await assert.rejects(
      service.setSessionModel(session.id, {
        provider: "dwell-test",
        model: "dwell-test-alt",
      }),
      /could not confirm/i,
    );
    assert.equal(service.runtimeCount, 0);
    assert.equal(service.getSession(session.id).runtimeState, "closed");
    assert.equal(service.getSession(session.id).model, "dwell-test");
  } finally {
    await rm(stored.piSessionFile, { recursive: true, force: true });
    await rename(savedFile, stored.piSessionFile);
  }

  const reopened = await service.openSession(session.id);
  assert.equal(reopened.status, "ready");
  assert.equal(reopened.provider, "dwell-test");
  assert.equal(reopened.model, "dwell-test");
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
