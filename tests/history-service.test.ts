import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { SessionService } from "../src/sessions/service.ts";
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
async function setup(t: TestContext) {
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

test("history and native results survive restart without launching Pi", async (t) => {
  const { service, session, options, send, env } = await setup(t);
  assert.equal((await service.getHistory(session.id)).status, "empty");
  const turn = await send("tool");
  const saved = await service.getHistory(session.id);
  assert.equal(isHistoryPage(saved), true);
  assert.equal(saved.coveredTurnId, turn.runId);
  assert.match(JSON.stringify(saved.entries), /Echo complete/);
  const result = await service.getTurnResult(session.id, turn.runId);
  await service.shutdown();
  const starts = await readFile(join(env.root, "starts.log"), "utf8");
  const restored = await SessionService.create(options);
  t.after(() => restored.shutdown());
  const recovered = await restored.getHistory(session.id);
  assert.deepEqual(recovered.entries, saved.entries);
  assert.deepEqual(await restored.getTurnResult(session.id, turn.runId), result);
  assert.equal(restored.runtimeCount, 0);
  assert.equal(await readFile(join(env.root, "starts.log"), "utf8"), starts);
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
  assert.equal(after.latestTurnId, turn.runId);
  assert.equal(service.runtimeCount, 0);
  await service.openSession(session.id);
  assert.match(JSON.stringify(await service.getContext(session.id)), /standalone continuation/);
  await send("tool");
  const continued = await service.getHistory(session.id);
  assert.match(JSON.stringify(continued.entries), /standalone continuation/);
  assert.match(JSON.stringify(continued.entries), /Echo complete/);
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
