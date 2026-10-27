import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { SessionService } from "../src/sessions/service.ts";
import type { StreamFrame } from "../src/shared/events.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

async function waitFor<T>(read: () => T, predicate: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 8000;
  for (;;) {
    const value = read();
    if (predicate(value)) return value;
    assert.ok(Date.now() < deadline, "Timed out waiting for event/state.");
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
  return { service, session, env, options, release: () => writeFile(gate, "release") };
}

test("session subscriptions snapshot without starting Pi and runtime closes are published", async (t) => {
  const { service, session } = await setup(t);
  await service.closeSession(session.id);
  const frames: StreamFrame[] = [];
  const sub = service.subscribeEvents(session.id, undefined, (frame) => {
    frames.push(frame);
  });
  t.after(sub.unsubscribe);
  assert.equal(service.runtimeCount, 0);
  assert.equal(sub.initial[0]?.type, "snapshot");
  const initial = sub.initial[0];
  assert.ok(initial?.type === "snapshot");
  assert.equal(initial.payload.session.runtimeState, "closed");
  await service.openSession(session.id);
  await service.closeSession(session.id);
  assert.ok(
    frames.some(
      (frame) => frame.type === "session.updated" && frame.payload.runtimeState === "ready",
    ),
  );
  assert.ok(
    frames.some(
      (frame) => frame.type === "session.updated" && frame.payload.runtimeState === "closed",
    ),
  );
});

test("a late subscriber sees the partial message then final state without duplicate text", async (t) => {
  const { service, session, release } = await setup(t);
  const first: StreamFrame[] = [];
  const a = service.subscribeEvents(session.id, undefined, (frame) => {
    first.push(frame);
  });
  t.after(a.unsubscribe);
  const { turn } = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "stream",
  });
  await waitFor(() => first.some((frame) => frame.type === "message.delta"), Boolean);
  const later: StreamFrame[] = [];
  const b = service.subscribeEvents(session.id, undefined, (frame) => {
    later.push(frame);
  });
  t.after(b.unsubscribe);
  const snapshot = b.initial[0];
  assert.ok(snapshot?.type === "snapshot");
  assert.equal(snapshot.payload.activeTurn?.runId, turn.runId);
  assert.match(snapshot.payload.live.message?.text ?? "", /first/i);
  a.unsubscribe();
  await release();
  await waitFor(
    () => service.getTurn(session.id, turn.runId),
    (value) => value.status === "completed",
  );
  assert.ok(later.some((frame) => frame.type === "message.delta"));
  assert.ok(
    later.some((frame) => frame.type === "turn.updated" && frame.payload.status === "completed"),
  );
  const finished = [...later].reverse().find((frame) => frame.type === "message.finished");
  assert.ok(finished?.type === "message.finished");
  assert.match(finished.payload.text, /first.*second/is);
  let restoredText = snapshot.payload.live.message?.text ?? "";
  for (const frame of later) {
    if (frame.type === "message.delta") restoredText += frame.payload.text;
  }
  assert.equal(restoredText, finished.payload.text);
  const terminal = [...later]
    .reverse()
    .find((frame) => frame.type === "turn.updated" && frame.payload.status === "completed");
  assert.ok(terminal?.cursor);
  const replay = service.subscribeEvents(session.id, terminal.cursor, () => {});
  t.after(replay.unsubscribe);
  assert.ok(replay.initial.every((frame) => frame.type !== "snapshot"));
});

test("failed observers do not fail execution and tool events remain Dwell projections", async (t) => {
  const { service, session } = await setup(t);
  const failed = service.subscribeEvents(session.id, undefined, () => {
    throw new Error("observer failed");
  });
  t.after(failed.unsubscribe);
  const frames: StreamFrame[] = [];
  const sub = service.subscribeEvents(session.id, undefined, (frame) => {
    frames.push(frame);
  });
  t.after(sub.unsubscribe);
  const { turn } = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "tool",
  });
  await waitFor(
    () => service.getTurn(session.id, turn.runId),
    (value) => value.status === "completed",
  );
  assert.ok(frames.some((frame) => frame.type === "tool.started"));
  assert.ok(frames.some((frame) => frame.type === "tool.finished"));
  assert.ok(frames.every((frame) => frame.sessionId === session.id));
  assert.equal(
    frames.some((frame) => JSON.stringify(frame).includes("assistantMessageEvent")),
    false,
  );
});

test("ledger failure emits a stream fault and never a durable completed event", async (t) => {
  const env = await createPiEnvironment();
  let reached!: () => void;
  let release!: () => void;
  const atSettlement = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const dataDir = join(env.root, "dwell");
  const service = await SessionService.create({
    dataDir,
    env: env.env,
    extensions: [env.extensionPath],
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
  const frames: StreamFrame[] = [];
  const sub = service.subscribeEvents(session.id, undefined, (frame) => {
    frames.push(frame);
  });
  t.after(sub.unsubscribe);
  await service.submitTurn(session.id, { requestId: randomUUID(), message: "hello" });
  await atSettlement;
  const db = new DatabaseSync(join(dataDir, "catalog.sqlite"));
  db.exec("BEGIN EXCLUSIVE");
  release();
  try {
    await waitFor(() => frames.some((frame) => frame.type === "stream.error"), Boolean);
  } finally {
    db.exec("ROLLBACK");
    db.close();
  }
  assert.equal(
    frames.some((frame) => frame.type === "turn.updated" && frame.payload.status === "completed"),
    false,
  );
  assert.ok(frames.some((frame) => frame.type === "message.finished"));
});

test("an idle Pi process loss is observable without submitting another turn", async (t) => {
  const { service, session, env } = await setup(t);
  const frames: StreamFrame[] = [];
  const sub = service.subscribeEvents(session.id, undefined, (frame) => {
    frames.push(frame);
  });
  t.after(sub.unsubscribe);
  const pid = Number((await readFile(join(env.root, "starts.log"), "utf8")).trim());
  assert.ok(Number.isSafeInteger(pid) && pid > 1);
  process.kill(pid, "SIGKILL");
  await waitFor(
    () =>
      frames.some(
        (frame) => frame.type === "session.updated" && frame.payload.runtimeState === "failed",
      ),
    Boolean,
  );
});

test("a restarted host resynchronizes an old cursor without opening a runtime", async (t) => {
  const { service, session, options } = await setup(t);
  const previous = service.subscribeEvents(session.id, undefined, () => {});
  const cursor = previous.initial[0]?.cursor;
  assert.ok(cursor);
  previous.unsubscribe();
  await service.shutdown();
  const restored = await SessionService.create(options);
  t.after(() => restored.shutdown());
  const next = restored.subscribeEvents(session.id, cursor, () => {});
  t.after(next.unsubscribe);
  assert.equal(next.initial[0]?.type, "resync");
  assert.equal(next.initial[1]?.type, "snapshot");
  assert.equal(restored.runtimeCount, 0);
  assert.notEqual(next.initial[1]?.cursor, cursor);
});
