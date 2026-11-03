import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFile, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  emptyConversationState,
  reconcileHistory,
  reduceFrame,
  visibleLiveContent,
} from "../src/clients/web/events.ts";
import {
  SessionError,
  SessionService,
  type SessionServiceOptions,
} from "../src/sessions/service.ts";
import type { StreamFrame } from "../src/shared/events.ts";
import { isHistoryPage } from "../src/shared/history.ts";
import { SessionCatalog } from "../src/storage/catalog.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

const runFile = promisify(execFile);
async function until<T>(read: () => T, matches: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 10000;
  for (;;) {
    const value = read();
    if (matches(value)) return value;
    assert.ok(Date.now() < deadline, "Timed out waiting for turn.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
async function setup(
  t: TestContext,
  historyCheckCheckpoint?: NonNullable<SessionServiceOptions["historyCheckCheckpoint"]>,
) {
  const env = await createPiEnvironment();
  const gate = join(env.root, "release");
  const options = {
    dataDir: join(env.root, "dwell"),
    env: {
      ...env.env,
      DWELL_TEST_STREAM_RELEASE: gate,
      DWELL_TEST_START_LOG: join(env.root, "starts.log"),
    },
    extensions: [env.extensionPath],
    ...(historyCheckCheckpoint ? { historyCheckCheckpoint } : {}),
  };
  const service = await SessionService.create(options);
  t.after(async () => {
    await writeFile(gate, "release");
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
  const send = async (message: string) => {
    const { turn } = await service.submitTurn(session.id, { requestId: randomUUID(), message });
    return until(
      () => service.getTurn(session.id, turn.runId),
      (value) =>
        value.status === "completed" && service.getSession(session.id).activeTurnId === null,
    );
  };
  return { service, session, options, env, gate, send };
}

function historyCheck(session: object): unknown {
  return Reflect.get(session, "historyCheck");
}

function historyCheckState(session: object): unknown {
  const check = historyCheck(session);
  return typeof check === "object" && check !== null ? Reflect.get(check, "state") : undefined;
}

function historyCheckTime(session: object): unknown {
  const check = historyCheck(session);
  return typeof check === "object" && check !== null ? Reflect.get(check, "checkedAt") : undefined;
}

test("history and native results survive restart without launching Pi", async (t) => {
  const { service, session, options, send, env } = await setup(t);
  assert.equal((await service.getHistory(session.id)).status, "empty");
  const initial = service.getSession(session.id);
  assert.equal(historyCheckState(initial), "not-created");
  assert.equal(Number.isSafeInteger(historyCheckTime(initial)), true);
  const turn = await send("tool");
  const saved = await service.getHistory(session.id);
  assert.equal(isHistoryPage(saved), true);
  assert.equal(saved.coveredTurnId, turn.runId);
  assert.match(JSON.stringify(saved.entries), /Echo complete/);
  assert.equal(historyCheckState(service.getSession(session.id)), "readable");
  const result = await service.getTurnResult(session.id, turn.runId);
  await service.shutdown();
  const starts = await readFile(join(env.root, "starts.log"), "utf8");
  const restored = await SessionService.create(options);
  t.after(() => restored.shutdown());
  const recovered = await restored.getHistory(session.id);
  assert.deepEqual(recovered.entries, saved.entries);
  assert.equal(historyCheckState(restored.getSession(session.id)), "readable");
  assert.deepEqual(await restored.getTurnResult(session.id, turn.runId), result);
  assert.equal(restored.runtimeCount, 0);
  assert.equal(await readFile(join(env.root, "starts.log"), "utf8"), starts);
});

test("closing an idle runtime still releases Pi when its expected history file is missing", async (t) => {
  const { service, session, options, send } = await setup(t);
  await send("tool");
  const catalog = await SessionCatalog.open(options.dataDir);
  const file = catalog.get(session.id)?.piSessionFile;
  catalog.close();
  assert.ok(file);
  await unlink(file);

  const closed = await service.closeSession(session.id);

  assert.equal(closed.runtimeState, "closed");
  assert.equal(service.runtimeCount, 0);
  assert.equal(historyCheckState(service.getSession(session.id)), "missing");
  assert.equal(service.getSession(session.id).historyState, "unavailable");
});

test("standalone Pi continues the same native file and Dwell reads external messages without inventing turns", async (t) => {
  const { service, session, options, send, env } = await setup(t);
  const turn = await send("hello");
  await service.closeSession(session.id);
  const catalog = await SessionCatalog.open(options.dataDir);
  const file = catalog.get(session.id)?.piSessionFile;
  catalog.close();
  assert.ok(file);
  const before = await service.getHistory(session.id);
  const cli = fileURLToPath(
    new URL("../cli.js", import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry")),
  );
  const execution = runFile(
    process.execPath,
    [
      cli,
      "--print",
      "--mode",
      "json",
      "--session",
      file,
      "--provider",
      "dwell-test",
      "--model",
      "dwell-test",
      "--no-extensions",
      "--no-mcp",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-context-files",
      "--no-builtin-tools",
      "-e",
      env.extensionPath,
      "standalone continuation",
    ],
    { env: env.env, cwd: env.cwd, timeout: 15000, maxBuffer: 1024 * 1024 },
  );
  execution.child.stdin?.end();
  const output = await execution;
  assert.match(output.stdout, /Received: standalone continuation/);
  const after = await service.getHistory(session.id);
  assert.ok(after.entries.length > before.entries.length);
  assert.match(JSON.stringify(after.entries), /standalone continuation/);
  assert.equal(historyCheckState(service.getSession(session.id)), "readable");
  assert.equal(after.latestTurnId, turn.runId);
  assert.equal(service.runtimeCount, 0);
  await service.openSession(session.id);
  assert.match(JSON.stringify(await service.getContext(session.id)), /standalone continuation/);
  await send("tool");
  const continued = await service.getHistory(session.id);
  assert.match(JSON.stringify(continued.entries), /standalone continuation/);
  assert.match(JSON.stringify(continued.entries), /Echo complete/);
});

test("malformed JSONL after a valid header is recorded invalid and never starts a replacement session", async (t) => {
  const { service, session, send, options, env } = await setup(t);
  const turn = await send("tool");
  await service.closeSession(session.id);
  const catalog = await SessionCatalog.open(options.dataDir);
  const file = catalog.get(session.id)?.piSessionFile;
  catalog.close();
  assert.ok(file);
  const contents = await readFile(file, "utf8");
  const lines = contents.split("\n");
  assert.ok(lines.length > 2);
  lines[1] = "{broken-json";
  await writeFile(file, lines.join("\n"));
  const startsBefore = (await readFile(join(env.root, "starts.log"), "utf8"))
    .trim()
    .split("\n").length;

  await assert.rejects(service.getHistory(session.id), /invalid|saved session history/i);
  assert.equal(historyCheckState(service.getSession(session.id)), "invalid");
  assert.equal(service.getSession(session.id).historyState, "unavailable");
  assert.equal(
    service.listSessions().find((value) => value.id === session.id)?.historyState,
    "unavailable",
  );
  await assert.rejects(
    service.getTurnResult(session.id, turn.runId),
    /invalid|saved session history/i,
  );
  await assert.rejects(
    service.getHistoryImage(session.id, "missing-entry", 0),
    /invalid|saved session history/i,
  );
  await assert.rejects(service.openSession(session.id), /invalid|saved session history/i);
  const startsAfter = (await readFile(join(env.root, "starts.log"), "utf8"))
    .trim()
    .split("\n").length;
  assert.equal(startsAfter, startsBefore);
  assert.match(await readFile(file, "utf8"), /\{broken-json/u);
});

test("foreign session and cwd headers are recorded invalid", async (t) => {
  const { service, session, send, options } = await setup(t);
  await send("tool");
  await service.closeSession(session.id);
  const catalog = await SessionCatalog.open(options.dataDir);
  const file = catalog.get(session.id)?.piSessionFile;
  catalog.close();
  assert.ok(file);
  const lines = (await readFile(file, "utf8")).split("\n");
  const header = JSON.parse(lines[0] ?? "null") as Record<string, unknown>;
  header.cwd = `${String(header.cwd)}-foreign`;
  lines[0] = JSON.stringify(header);
  await writeFile(file, lines.join("\n"));

  await assert.rejects(service.getHistory(session.id), /invalid|saved session history/i);
  assert.equal(historyCheckState(service.getSession(session.id)), "invalid");
});

test("a stale history cursor does not downgrade the last verified readable state", async (t) => {
  const { service, session, send, options } = await setup(t);
  await send("tool");
  const catalog = await SessionCatalog.open(options.dataDir);
  const file = catalog.get(session.id)?.piSessionFile;
  catalog.close();
  assert.ok(file);

  const initial = await service.getHistory(session.id);
  assert.equal(initial.status, "available");
  assert.ok(initial.leafId);
  let parentId: string | null = initial.leafId;
  const records: string[] = [];
  for (let index = 0; index < 105; index++) {
    const id = randomUUID();
    records.push(
      JSON.stringify({
        type: "message",
        id,
        parentId,
        timestamp: new Date(Date.now() + index).toISOString(),
        message: { role: "user", content: [{ type: "text", text: `external ${index}` }] },
      }),
    );
    parentId = id;
  }
  await appendFile(file, `${records.join("\n")}\n`);
  const paged = await service.getHistory(session.id);
  assert.ok(paged.nextCursor);
  const verified = service.getSession(session.id);
  const verifiedAt = historyCheckTime(verified);
  assert.equal(historyCheckState(verified), "readable");

  const changed = (await readFile(file, "utf8")).replace('"external 0"', '"external 1"');
  assert.notEqual(changed, await readFile(file, "utf8"));
  await writeFile(file, changed);
  await assert.rejects(service.getHistory(session.id, paged.nextCursor ?? undefined), /changed/i);
  assert.equal(historyCheckState(service.getSession(session.id)), "readable");
  assert.equal(historyCheckTime(service.getSession(session.id)), verifiedAt);
  await service.getHistory(session.id);
  assert.equal(historyCheckState(service.getSession(session.id)), "readable");
  assert.notEqual(historyCheckTime(service.getSession(session.id)), verifiedAt);
});

test("a newer missing-file check is not overwritten by an older completed read", async (t) => {
  let signalEntered!: () => void;
  let releaseRead!: () => void;
  const entered = new Promise<void>((resolve) => {
    signalEntered = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  let delayNextReadableCheck = false;
  let delayed = false;
  const env = await createPiEnvironment();
  const options = {
    dataDir: join(env.root, "dwell"),
    env: { ...env.env, DWELL_TEST_START_LOG: join(env.root, "starts.log") },
    extensions: [env.extensionPath],
    historyCheckCheckpoint: async (state: string) => {
      if (delayNextReadableCheck && !delayed && state === "readable") {
        delayed = true;
        signalEntered();
        await release;
      }
    },
  };
  const service = await SessionService.create(options);
  t.after(async () => {
    releaseRead();
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
    message: "tool",
  });
  await until(
    () => service.getTurn(session.id, turn.runId),
    (value) => value.status === "completed" && service.getSession(session.id).activeTurnId === null,
  );
  const catalog = await SessionCatalog.open(options.dataDir);
  const file = catalog.get(session.id)?.piSessionFile;
  catalog.close();
  assert.ok(file);
  delayNextReadableCheck = true;
  const olderRead = service.getHistory(session.id);
  const enteredRead = await Promise.race([
    entered.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000)),
  ]);
  assert.equal(enteredRead, true, "the first successful history check reached its save boundary");

  await unlink(file);
  await assert.rejects(service.getHistory(session.id), /history.*unavailable/i);
  assert.equal(historyCheckState(service.getSession(session.id)), "missing");
  releaseRead();
  await assert.rejects(olderRead, (error: unknown) => {
    assert.ok(error instanceof SessionError);
    assert.equal(error.code, "history_unavailable");
    return true;
  });
  assert.equal(historyCheckState(service.getSession(session.id)), "missing");
});

test("a close check uses a history observation saved while Pi state was loading", async (t) => {
  let enteredRuntimeStateRead!: () => void;
  let releaseRuntimeStateRead!: () => void;
  const entered = new Promise<void>((resolve) => {
    enteredRuntimeStateRead = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseRuntimeStateRead = resolve;
  });
  let delayRuntimeStateRead = false;
  const { service, session, options, send } = await setup(t, async (point) => {
    if (delayRuntimeStateRead && point === "runtime-state-read") {
      delayRuntimeStateRead = false;
      enteredRuntimeStateRead();
      await release;
    }
  });
  t.after(releaseRuntimeStateRead);
  await send("tool");

  const catalog = await SessionCatalog.open(options.dataDir);
  const stored = catalog.get(session.id);
  assert.ok(stored?.piSessionFile);
  catalog.update({ ...stored, historyExpected: false, historyCheck: null });
  catalog.close();

  delayRuntimeStateRead = true;
  const closing = service.closeSession(session.id);
  await entered;
  await service.getHistory(session.id);
  assert.equal(historyCheckState(service.getSession(session.id)), "readable");
  await unlink(stored.piSessionFile);
  releaseRuntimeStateRead();

  const closed = await closing;

  assert.equal(closed.runtimeState, "closed");
  assert.equal(service.runtimeCount, 0);
  assert.equal(historyCheckState(service.getSession(session.id)), "missing");
});

test("history plus buffered SSE converges on saved entries across a completion race", async (t) => {
  const { service, session, send, gate } = await setup(t);
  await send("hello");
  const frames: StreamFrame[] = [];
  const sub = service.subscribeEvents(session.id, undefined, (frame) => {
    frames.push(frame);
  });
  t.after(sub.unsubscribe);
  const { turn } = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "stream",
  });
  await until(() => frames.some((frame) => frame.type === "message.delta"), Boolean);
  const loading = service.getHistory(session.id);
  await writeFile(gate, "release");
  const initial = await loading;
  if (initial.coveredTurnId === turn.runId)
    assert.match(JSON.stringify(initial.entries), /stream-first-stream-second/);
  await until(() => service.getTurn(session.id, turn.runId).status === "completed", Boolean);
  assert.ok(
    frames.some((frame) => frame.type === "turn.updated" && frame.payload.status === "completed"),
  );
  const saved = await service.getHistory(session.id);
  assert.equal(saved.coveredTurnId, turn.runId);
  const byId = new Map([...initial.entries, ...saved.entries].map((entry) => [entry.id, entry]));
  assert.equal(byId.size, saved.entries.length);
  assert.equal(
    saved.entries.filter((entry) =>
      entry.blocks.some((block) => block.text === "stream-first-stream-second"),
    ).length,
    1,
  );
});

test("deleted history remains unavailable even with a live runtime and corruption never overwrites source", async (t) => {
  const { service, session, options, send } = await setup(t);
  await send("hello");
  const catalog = await SessionCatalog.open(options.dataDir);
  const file = catalog.get(session.id)?.piSessionFile;
  catalog.close();
  assert.ok(file);
  const contents = await readFile(file, "utf8");
  await writeFile(file, `${contents}broken complete record\n`);
  await assert.rejects(service.getHistory(session.id), /invalid|malformed/i);
  assert.equal(await readFile(file, "utf8"), `${contents}broken complete record\n`);
  await unlink(file);
  await assert.rejects(service.getHistory(session.id), /unavailable/i);
});

test("deep native result content reports a response limit while projected history stays readable", async (t) => {
  const { service, session, options, send } = await setup(t);
  const turn = await send("tool");
  const catalog = await SessionCatalog.open(options.dataDir);
  const file = catalog.get(session.id)?.piSessionFile;
  catalog.close();
  assert.ok(file);
  const content = await readFile(file, "utf8");
  const deep = `${"[".repeat(10000)}0${"]".repeat(10000)}`;
  assert.match(content, /"arguments":\{/);
  await writeFile(file, content.replace('"arguments":{', `"arguments":{"deep":${deep},`));
  await assert.rejects(service.getTurnResult(session.id, turn.runId), (error: unknown) => {
    assert.ok(error instanceof Error && "code" in error && error.code === "result_limit");
    return true;
  });
  assert.equal(isHistoryPage(await service.getHistory(session.id)), true);
});

test("a first admitted turn has pending history before dispatch and read admission drains at shutdown", async (t) => {
  const { service, session, options } = await setup(t);
  await service.shutdown();
  let entered!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const restored = await SessionService.create({
    ...options,
    turnCheckpoint: async (point) => {
      if (point === "dispatching") {
        entered();
        await barrier;
      }
    },
  });
  t.after(async () => {
    release();
    await restored.shutdown();
  });
  const { turn } = await restored.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "hello",
  });
  await reached;
  const pending = await restored.getHistory(session.id);
  assert.equal(pending.status, "pending");
  assert.equal(pending.activeTurnId, turn.runId);
  assert.equal(pending.coveredTurnId, null);
  assert.deepEqual(pending.entries, []);
  release();
  await until(() => restored.getSession(session.id).activeTurnId === null, Boolean);
  const a = restored.getHistory(session.id);
  const b = restored.getHistory(session.id);
  await assert.rejects(restored.getHistory(session.id), /reads.*active/i);
  const stopping = restored.shutdown();
  const pages = await Promise.all([a, b]);
  await stopping;
  assert.equal(pages[0]?.status, "available");
  assert.equal(pages[1]?.status, "available");
  await assert.rejects(restored.getHistory(session.id), /stopping/i);
});

test("active saved tool records take over live output across a multi-step reconnect", async (t) => {
  const { service, session, gate, send } = await setup(t);
  await send("hello");
  let state = emptyConversationState(session.id);
  const frames: StreamFrame[] = [];
  const sub = service.subscribeEvents(session.id, undefined, (frame) => {
    frames.push(frame);
    state = reduceFrame(state, frame);
  });
  t.after(sub.unsubscribe);
  const { turn } = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "tool-stream",
  });
  await until(
    () =>
      frames.some(
        (frame) => frame.type === "message.delta" && frame.payload.text.includes("stream-first"),
      ),
    Boolean,
  );
  const saved = await service.getHistory(session.id);
  assert.equal(saved.activeTurnId, turn.runId);
  assert.equal(saved.coveredTurnId, null);
  assert.ok(saved.entries.some((entry) => entry.role === "toolResult"));
  assert.ok(state.tools.length > 0);
  assert.ok(state.messages.some((message) => message.finished && message.nativeKey));
  state = reconcileHistory(state, saved);
  const visible = visibleLiveContent(state, saved.entries);
  assert.equal(visible.filter((item) => item.kind === "tool").length, 0);
  assert.equal(visible.filter((item) => item.kind === "message").length, 1);
  assert.equal(state.messages.find((item) => item.id === visible[0]?.id)?.text, "stream-first-");
  const fresh = service.subscribeEvents(session.id, undefined, () => {});
  t.after(fresh.unsubscribe);
  let reconnected = emptyConversationState(session.id);
  for (const frame of fresh.initial) reconnected = reduceFrame(reconnected, frame);
  assert.deepEqual(visibleLiveContent(reconnected, saved.entries), visible);
  await writeFile(gate, "release");
  await until(() => service.getTurn(session.id, turn.runId).status === "completed", Boolean);
  const completed = await service.getHistory(session.id);
  state = reconcileHistory(state, completed);
  assert.equal(state.tools.length, 0);
  assert.equal(state.messages.length, 0);
});
