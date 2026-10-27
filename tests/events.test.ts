import assert from "node:assert/strict";
import { test } from "node:test";
import type { RpcRecord } from "../src/runtime/pi-rpc.ts";
import { SessionEvents } from "../src/sessions/events.ts";
import {
  isStreamFrame,
  type LiveMessage,
  type LiveMessageDelta,
  type LiveTool,
  type StreamFrame,
} from "../src/shared/events.ts";
import type { SessionInfo } from "../src/shared/sessions.ts";
import type { TurnInfo } from "../src/shared/turns.ts";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_SESSION_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "44444444-4444-4444-8444-444444444444";

function session(id = SESSION_ID, updatedAt = 10): SessionInfo {
  return {
    id,
    directory: "/tmp/project",
    provider: "synthetic",
    model: "offline-test",
    thinkingLevel: "off",
    piSessionId: "55555555-5555-4555-8555-555555555555",
    createdAt: 1,
    updatedAt,
    status: "ready",
    runtimeState: "ready",
    historyState: "available",
    error: null,
    activeTurnId: null,
    latestTurnId: null,
  };
}

function turn(status: TurnInfo["status"] = "running", updatedAt = 11, runId = RUN_ID): TurnInfo {
  return {
    runId,
    sessionId: SESSION_ID,
    requestId: REQUEST_ID,
    status,
    cancellationRequested: false,
    createdAt: 10,
    updatedAt,
    error: null,
    entryIds: [],
  };
}

function withTurn(value: SessionInfo, activeTurnId: string | null, latestTurnId: string | null) {
  return { ...value, activeTurnId, latestTurnId };
}

function connect(
  hub: SessionEvents,
  value = session(),
  activeTurn: TurnInfo | null = null,
  latestTurn: TurnInfo | null = null,
  cursor: string | undefined = undefined,
  listener: (frame: StreamFrame) => void = () => {},
) {
  return hub.connect(value, activeTurn, latestTurn, cursor, listener);
}

function snapshot(frames: readonly StreamFrame[]): Extract<StreamFrame, { type: "snapshot" }> {
  const frame = frames.find((candidate) => candidate.type === "snapshot");
  assert.ok(frame, "expected a snapshot frame");
  return frame;
}

function cursorEpoch(cursor: string): string {
  const epoch = cursor.split(":")[1];
  assert.ok(epoch);
  return epoch;
}

function ordinary(frames: readonly StreamFrame[], type: string): StreamFrame {
  const frame = frames.find(
    (candidate) => candidate.type === type && candidate.type !== "snapshot",
  );
  assert.ok(frame, `expected a ${type} frame`);
  return frame;
}

function messagePayload(frame: StreamFrame): LiveMessage {
  if (frame.type === "message.started" || frame.type === "message.finished") return frame.payload;
  assert.fail("expected a full live message payload");
}

function toolPayload(frame: StreamFrame): LiveTool {
  if (
    frame.type === "tool.started" ||
    frame.type === "tool.updated" ||
    frame.type === "tool.finished"
  )
    return frame.payload;
  assert.fail("expected a live tool payload");
}

function messageDeltaPayload(frame: StreamFrame): LiveMessageDelta {
  if (frame.type === "message.delta") return frame.payload;
  assert.fail("expected an incremental message delta payload");
}

function makeRecord(type: string, fields: Record<string, unknown> = {}): RpcRecord {
  return { ...fields, type };
}

test("connect returns a bounded snapshot and replays only missing ordered events", () => {
  const hub = new SessionEvents();
  const received: StreamFrame[] = [];
  const subscription = connect(hub, session(), null, null, undefined, (frame) =>
    received.push(frame),
  );
  const initial = snapshot(subscription.initial);
  assert.equal(initial.sessionId, SESSION_ID);
  assert.equal(initial.cursor, `${SESSION_ID}:${cursorEpoch(initial.cursor)}:0`);
  assert.deepEqual(initial.payload.live, { message: null, tools: [], truncated: false });
  assert.ok(isStreamFrame(initial));

  const updatedSession = session(SESSION_ID, 12);
  hub.publishSession(updatedSession);
  const updatedTurn = turn("running", 13);
  hub.publishTurn(withTurn(updatedSession, RUN_ID, RUN_ID), updatedTurn, updatedTurn);
  assert.equal(received.length, 3);
  assert.equal(received[0]?.type, "session.updated");
  assert.equal(received[1]?.type, "session.updated");
  assert.equal(received[2]?.type, "turn.updated");
  assert.ok(isStreamFrame(received[0]));
  assert.ok(isStreamFrame(received[1]));
  assert.ok(isStreamFrame(received[2]));
  assert.equal(received[0]?.cursor, `${SESSION_ID}:${cursorEpoch(initial.cursor)}:1`);
  assert.equal(received[1]?.cursor, `${SESSION_ID}:${cursorEpoch(initial.cursor)}:2`);
  assert.equal(received[2]?.cursor, `${SESSION_ID}:${cursorEpoch(initial.cursor)}:3`);

  subscription.unsubscribe();
  const replay = connect(
    hub,
    withTurn(updatedSession, RUN_ID, RUN_ID),
    updatedTurn,
    updatedTurn,
    initial.cursor,
  );
  assert.deepEqual(
    replay.initial.map((frame) => frame.type),
    ["session.updated", "session.updated", "turn.updated"],
  );
  assert.equal(replay.initial[0]?.cursor, received[0]?.cursor);
  replay.unsubscribe();

  const caughtUp = connect(
    hub,
    withTurn(updatedSession, RUN_ID, RUN_ID),
    updatedTurn,
    updatedTurn,
    received[2]?.cursor,
  );
  assert.deepEqual(caughtUp.initial, []);
  caughtUp.unsubscribe();
  hub.close();
});

test("snapshot and subscriber registration share one synchronous sequence boundary", () => {
  const hub = new SessionEvents();
  const seen: StreamFrame[] = [];
  const subscription = connect(hub, session(), null, null, undefined, (frame) => seen.push(frame));
  const cursor = snapshot(subscription.initial).cursor;

  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_start", { message: { role: "assistant", content: [] } }),
  );
  assert.equal(seen.length, 0, "turn observation is ignored until beginTurn pins that run");

  hub.beginTurn(SESSION_ID, RUN_ID);
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_start", { message: { role: "assistant", content: [] } }),
  );
  assert.equal(seen[0]?.type, "message.started");
  assert.ok(seen[0]);
  assert.ok(seen[0].cursor > cursor);
  subscription.unsubscribe();
  hub.endTurn(SESSION_ID, RUN_ID);
  hub.close();
});

test("invalid and foreign cursors are rejected while stale, ahead, and old-epoch cursors resync", () => {
  const hub = new SessionEvents({ maxReplayEvents: 2 });
  const base = connect(hub);
  const firstCursor = snapshot(base.initial).cursor;
  base.unsubscribe();
  hub.publishSession(session(SESSION_ID, 11));
  hub.publishSession(session(SESSION_ID, 12));
  hub.publishSession(session(SESSION_ID, 13));

  assert.throws(
    () => connect(hub, session(SESSION_ID), null, null, "not-a-cursor"),
    (error: unknown) => error instanceof Error && error.name === "InvalidCursorError",
  );
  assert.throws(
    () => connect(hub, session(), null, null, `${OTHER_SESSION_ID}:${firstCursor.split(":")[1]}:0`),
    (error: unknown) => error instanceof Error && error.name === "InvalidCursorError",
  );

  const resyncCases: Array<{
    cursor: string;
    reason: "cursor_stale" | "cursor_ahead" | "epoch_changed";
  }> = [
    { cursor: firstCursor, reason: "cursor_stale" },
    { cursor: `${SESSION_ID}:${cursorEpoch(firstCursor)}:999`, reason: "cursor_ahead" },
    { cursor: `${SESSION_ID}:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:1`, reason: "epoch_changed" },
  ];
  for (const { cursor, reason } of resyncCases) {
    const result = connect(hub, session(), null, null, cursor);
    assert.deepEqual(
      result.initial.map((frame) => frame.type),
      ["resync", "snapshot"],
    );
    assert.equal(result.initial[0]?.type, "resync");
    if (result.initial[0]?.type === "resync")
      assert.equal(result.initial[0].payload.reason, reason);
    result.unsubscribe();
  }
  hub.close();
});

test("a metadata read catches a newer durable view up for existing subscribers", () => {
  const hub = new SessionEvents();
  const live: StreamFrame[] = [];
  const subscription = connect(hub, session(SESSION_ID, 10), null, null, undefined, (frame) =>
    live.push(frame),
  );
  const initialCursor = snapshot(subscription.initial).cursor;
  const newer = session(SESSION_ID, 20);
  const seeded = connect(hub, newer, null, null, initialCursor);
  assert.deepEqual(
    seeded.initial.map((frame) => frame.type),
    ["session.updated"],
  );
  assert.equal(live[0]?.type, "session.updated");
  if (live[0]?.type === "session.updated") assert.equal(live[0].payload.updatedAt, 20);

  const catchup = seeded.initial[0];
  assert.ok(catchup?.type === "session.updated");
  const caughtUp = connect(hub, newer, null, null, catchup.cursor);
  assert.deepEqual(caughtUp.initial, []);
  subscription.unsubscribe();
  seeded.unsubscribe();
  caughtUp.unsubscribe();
  hub.close();
});

test("a newly accepted run clears the previous run live projection before dispatch", () => {
  const hub = new SessionEvents();
  const previous = turn("completed", 15);
  const previousSession = withTurn(session(), null, previous.runId);
  hub.publishTurn(previousSession, null, previous);
  hub.beginTurn(SESSION_ID, previous.runId);
  hub.observe(
    SESSION_ID,
    previous.runId,
    makeRecord("message_end", {
      message: { role: "assistant", content: [{ type: "text", text: "Prior answer" }] },
    }),
  );
  hub.endTurn(SESSION_ID, previous.runId);

  const next = turn("accepted", 20, "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  const nextSession = withTurn(session(SESSION_ID, 20), next.runId, next.runId);
  hub.publishTurn(nextSession, next, next);
  const subscription = connect(hub, nextSession, next, next);
  const current = snapshot(subscription.initial);
  assert.equal(current.payload.latestTurn?.runId, next.runId);
  assert.deepEqual(current.payload.live, { message: null, tools: [], truncated: false });
  subscription.unsubscribe();
  hub.close();
});

test("first snapshots flag bounded session metadata even without a prior limit event", () => {
  const hub = new SessionEvents();
  const oversized = {
    ...session(),
    directory: `/tmp/${"project".repeat(1500)}`,
  };
  const subscription = connect(hub, oversized);
  const current = snapshot(subscription.initial);
  assert.equal(current.payload.metadataTruncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(current)) < 224 * 1024);
  subscription.unsubscribe();
  hub.close();
});

test("replay batches that exceed the HTTP queue resync from a bounded snapshot", () => {
  const hub = new SessionEvents();
  const base = connect(hub);
  const cursor = snapshot(base.initial).cursor;
  base.unsubscribe();
  const runs = [
    "66666666-6666-4666-8666-666666666666",
    "77777777-7777-4777-8777-777777777777",
    "88888888-8888-4888-8888-888888888888",
    "99999999-9999-4999-8999-999999999999",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ];
  for (const runId of runs) {
    hub.beginTurn(SESSION_ID, runId);
    hub.observe(
      SESSION_ID,
      runId,
      makeRecord("message_update", {
        assistantMessageEvent: {
          type: "text_delta",
          contentIndex: 0,
          delta: "x".repeat(45 * 1024),
        },
      }),
    );
    hub.endTurn(SESSION_ID, runId);
  }

  const result = connect(hub, session(), null, null, cursor);
  assert.deepEqual(
    result.initial.map((frame) => frame.type),
    ["resync", "snapshot"],
  );
  const resync = result.initial[0];
  assert.ok(resync?.type === "resync");
  assert.equal(resync.payload.reason, "replay_limit");
  const current = snapshot(result.initial);
  assert.ok(Buffer.byteLength(JSON.stringify(result.initial)) < 256 * 1024);
  assert.equal(current.payload.live.message?.text.length, 45 * 1024);
  result.unsubscribe();
  hub.close();
});

test("Pi messages and tools become capped Dwell projections without raw record leakage", () => {
  const hub = new SessionEvents();
  const received: StreamFrame[] = [];
  const subscription = connect(hub, session(), null, null, undefined, (frame) =>
    received.push(frame),
  );
  hub.beginTurn(SESSION_ID, RUN_ID);
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_start", {
      message: {
        role: "assistant",
        id: "private-entry-id",
        content: [{ type: "text", text: "Hello" }],
        providerMetadata: "private",
      },
    }),
  );
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_update", {
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hello" },
    }),
  );
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_update", {
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: " world" },
    }),
  );
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_end", {
      message: {
        role: "assistant",
        id: "private-entry-id",
        entryId: "private-entry-id",
        content: [{ type: "text", text: "Hello world" }],
        providerMetadata: "private",
      },
    }),
  );
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("tool_execution_start", {
      toolCallId: "private-tool-call-id",
      toolName: "shell",
      args: { command: "echo hi" },
      parentToolCallId: "private-parent-call-id",
    }),
  );
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("tool_execution_update", {
      toolCallId: "private-tool-call-id",
      toolName: "shell",
      args: { command: "echo hi" },
      partialResult: { content: [{ type: "text", text: "running" }], details: "private" },
    }),
  );
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("tool_execution_end", {
      toolCallId: "private-tool-call-id",
      toolName: "shell",
      result: { content: [{ type: "text", text: "done" }], details: "private" },
      isError: false,
    }),
  );

  const messageFrame = ordinary(received, "message.finished");
  assert.equal(messageFrame.type, "message.finished");
  const message = messagePayload(messageFrame);
  assert.equal(message.text, "Hello world");
  assert.equal(message.finished, true);
  assert.notEqual(message.id, "private-entry-id");
  const deltas = received.filter((frame) => frame.type === "message.delta");
  assert.equal(deltas.length, 1, "the first provider delta repeats message_start content");
  if (deltas[0]?.type === "message.delta") {
    assert.equal(deltas[0].payload.messageId, message.id);
    assert.equal(deltas[0].payload.text, " world");
  }
  const started = ordinary(received, "message.started");
  assert.equal(started.type, "message.started");
  assert.equal(
    started.payload.text +
      deltas.map((frame) => (frame.type === "message.delta" ? frame.payload.text : "")).join(""),
    message.text,
  );

  const toolFrame = ordinary(received, "tool.finished");
  assert.equal(toolFrame.type, "tool.finished");
  const tool = toolPayload(toolFrame);
  assert.equal(tool.name, "shell");
  assert.equal(tool.input, '{"command":"echo hi"}');
  assert.equal(tool.output, "done");
  assert.equal(tool.status, "completed");
  assert.notEqual(tool.id, "private-tool-call-id");
  assert.equal(tool.callId, "private-tool-call-id"); // Native correlation is an explicit public field.

  const serialized = JSON.stringify(received);
  for (const forbidden of [
    "private-entry-id",
    "private-parent-call-id",
    "providerMetadata",
    "assistantMessageEvent",
    '"details"',
  ])
    assert.equal(serialized.includes(forbidden), false, `leaked ${forbidden}`);

  const latest = connect(hub, session(), null, null);
  const liveSnapshot = snapshot(latest.initial).payload.live;
  assert.equal(liveSnapshot.message?.text, "Hello world");
  assert.equal(liveSnapshot.tools[0]?.output, "done");
  latest.unsubscribe();
  subscription.unsubscribe();
  hub.endTurn(SESSION_ID, RUN_ID);
  hub.close();
});

test("live assistant content preserves indexed visible thinking and deduplicates seeded prefixes", () => {
  const hub = new SessionEvents();
  const received: StreamFrame[] = [];
  const subscription = connect(hub, session(), null, null, undefined, (frame) =>
    received.push(frame),
  );
  hub.beginTurn(SESSION_ID, RUN_ID);
  const initial = [
    { type: "text", text: "Before " },
    { type: "thinking", thinking: "Check the source", signature: "opaque-start-signature" },
    { type: "text", text: "after" },
    { type: "thinking", thinking: "", redacted: true, signature: "opaque-redacted-signature" },
  ];
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_start", {
      message: { role: "assistant", content: initial, providerMetadata: "private-metadata" },
    }),
  );
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_update", {
      assistantMessageEvent: {
        type: "thinking_start",
        contentIndex: 1,
        partial: { content: initial },
      },
    }),
  );
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_update", {
      assistantMessageEvent: { type: "thinking_delta", contentIndex: 1, delta: "Check the source" },
    }),
  );
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_update", {
      assistantMessageEvent: { type: "thinking_delta", contentIndex: 1, delta: " and compare." },
    }),
  );
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_update", {
      assistantMessageEvent: {
        type: "thinking_end",
        contentIndex: 1,
        content: "Check the source and compare.",
        contentSignature: "opaque-end-signature",
      },
    }),
  );
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_update", {
      assistantMessageEvent: { type: "text_delta", contentIndex: 2, delta: "after" },
    }),
  );
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_end", {
      message: {
        role: "assistant",
        id: "private-entry-id",
        content: [
          { type: "text", text: "Before " },
          { type: "thinking", thinking: "Check the source and compare.", signature: "opaque" },
          { type: "text", text: "after" },
          { type: "thinking", thinking: "", redacted: true, signature: "opaque-redacted" },
        ],
        providerMetadata: "private-metadata",
      },
    }),
  );

  const started = ordinary(received, "message.started");
  assert.equal(started.type, "message.started");
  const finished = ordinary(received, "message.finished");
  assert.equal(finished.type, "message.finished");
  const message = messagePayload(finished);
  assert.equal(message.text, "Before after");
  assert.equal(message.finished, true);
  assert.deepEqual(
    message.blocks?.map((block) => [block.type, block.contentIndex]),
    [
      ["text", 0],
      ["thinking", 1],
      ["text", 2],
      ["thinking", 3],
    ],
  );
  const thinking = message.blocks?.filter((block) => block.type === "thinking");
  assert.deepEqual(
    thinking?.map((block) => (block.type === "thinking" ? block.text : "")),
    ["Check the source and compare.", ""],
  );
  const textBlocks = message.blocks?.filter((block) => block.type === "text");
  assert.deepEqual(
    textBlocks?.map((block) =>
      block.type === "text"
        ? block.ranges.map(({ start, end }) => message.text.slice(start, end)).join("")
        : "",
    ),
    ["Before ", "after"],
  );
  const serialized = JSON.stringify(received);
  for (const forbidden of [
    "opaque-start-signature",
    "opaque-end-signature",
    "opaque-redacted-signature",
    "private-metadata",
    "contentSignature",
    "providerMetadata",
  ])
    assert.equal(serialized.includes(forbidden), false, `leaked ${forbidden}`);
  const textDeltas = received.filter(
    (frame) => frame.type === "message.delta" && frame.payload.block?.type === "text",
  );
  assert.equal(
    textDeltas
      .filter((frame) => frame.type === "message.delta")
      .map((frame) => frame.payload.text)
      .join(""),
    "",
    "the provider repeated text already visible in the message_start prefix",
  );
  const thinkingDeltas = received.filter(
    (frame) => frame.type === "message.delta" && frame.payload.block?.type === "thinking",
  );
  assert.equal(
    thinkingDeltas
      .filter((frame) => frame.type === "message.delta")
      .map((frame) => (frame.payload.block?.type === "thinking" ? frame.payload.block.text : ""))
      .join(""),
    " and compare.",
  );
  assert.ok(received.every(isStreamFrame));
  subscription.unsubscribe();
  hub.endTurn(SESSION_ID, RUN_ID);
  hub.close();
});

test("authoritative cumulative partials preserve a repeated legitimate prefix delta", () => {
  const hub = new SessionEvents();
  const received: StreamFrame[] = [];
  const subscription = connect(hub, session(), null, null, undefined, (frame) =>
    received.push(frame),
  );
  hub.beginTurn(SESSION_ID, RUN_ID);
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_start", {
      message: { role: "assistant", content: [{ type: "text", text: "abc" }] },
    }),
  );
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_update", {
      assistantMessageEvent: {
        type: "text_delta",
        contentIndex: 0,
        delta: "abc",
        partial: { content: [{ type: "text", text: "abcabc" }] },
      },
    }),
  );
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_update", {
      assistantMessageEvent: {
        type: "text_delta",
        contentIndex: 0,
        delta: "!",
        partial: { content: [{ type: "text", text: "abcabc!" }] },
      },
    }),
  );
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_end", {
      message: { role: "assistant", content: [{ type: "text", text: "abcabc!" }] },
    }),
  );

  const deltas = received.filter((frame) => frame.type === "message.delta");
  assert.deepEqual(
    deltas.map((frame) => (frame.type === "message.delta" ? frame.payload.text : "")),
    ["abc", "!"],
  );
  const finished = ordinary(received, "message.finished");
  assert.equal(finished.type, "message.finished");
  assert.equal(finished.payload.text, "abcabc!");
  assert.ok(received.every(isStreamFrame));
  subscription.unsubscribe();
  hub.endTurn(SESSION_ID, RUN_ID);
  hub.close();
});

test("sequential assistant messages get distinct live identities and clear the prior native key", () => {
  const hub = new SessionEvents();
  const received: StreamFrame[] = [];
  const subscription = connect(hub, session(), null, null, undefined, (frame) =>
    received.push(frame),
  );
  hub.beginTurn(SESSION_ID, RUN_ID);
  for (const text of ["first response", "second response"]) {
    hub.observe(
      SESSION_ID,
      RUN_ID,
      makeRecord("message_start", {
        message: { role: "assistant", content: [{ type: "text", text }] },
      }),
    );
    hub.observe(
      SESSION_ID,
      RUN_ID,
      makeRecord("message_end", {
        message: { role: "assistant", content: [{ type: "text", text }] },
      }),
    );
  }

  const started = received.filter((frame) => frame.type === "message.started");
  const finished = received.filter((frame) => frame.type === "message.finished");
  assert.equal(started.length, 2);
  assert.equal(finished.length, 2);
  const firstStarted = started[0];
  const secondStarted = started[1];
  const firstFinished = finished[0];
  const secondFinished = finished[1];
  assert.ok(firstStarted?.type === "message.started");
  assert.ok(secondStarted?.type === "message.started");
  assert.ok(firstFinished?.type === "message.finished");
  assert.ok(secondFinished?.type === "message.finished");
  assert.notEqual(firstStarted.payload.id, secondStarted.payload.id);
  assert.ok((secondStarted.payload.order ?? 0) > (firstStarted.payload.order ?? 0));
  assert.equal(secondStarted.payload.nativeKey, undefined);
  assert.notEqual(firstFinished.payload.nativeKey, secondFinished.payload.nativeKey);
  assert.ok(received.every(isStreamFrame));
  subscription.unsubscribe();
  hub.endTurn(SESSION_ID, RUN_ID);
  hub.close();
});

test("live content exceeding the supported block count is explicitly truncated", () => {
  const hub = new SessionEvents();
  const received: StreamFrame[] = [];
  const subscription = connect(hub, session(), null, null, undefined, (frame) =>
    received.push(frame),
  );
  hub.beginTurn(SESSION_ID, RUN_ID);
  const content = Array.from({ length: 65 }, (_, index) =>
    index === 63 ? { type: "toolCall", id: "call-63" } : { type: "text", text: "x" },
  );
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_start", {
      message: { role: "assistant", content },
    }),
  );
  const frame = ordinary(received, "message.started");
  assert.equal(frame.type, "message.started");
  assert.equal(frame.payload.truncated, true);
  assert.ok(frame.payload.blocks?.every((block) => block.contentIndex < 64));
  assert.ok(isStreamFrame(frame));
  subscription.unsubscribe();
  hub.endTurn(SESSION_ID, RUN_ID);
  hub.close();
});

test("bounded live thinking keeps the SSE event and snapshot limits", () => {
  const hub = new SessionEvents();
  const received: StreamFrame[] = [];
  const subscription = connect(hub, session(), null, null, undefined, (frame) =>
    received.push(frame),
  );
  hub.beginTurn(SESSION_ID, RUN_ID);
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_start", {
      message: { role: "assistant", content: [] },
    }),
  );
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_update", {
      assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "x".repeat(70_000) },
    }),
  );
  const finishedMessage = received.filter((frame) => frame.type === "message.delta").at(-1);
  assert.ok(finishedMessage?.type === "message.delta");
  assert.ok(Buffer.byteLength(JSON.stringify(finishedMessage)) <= 64 * 1024);
  assert.ok(finishedMessage.payload.truncated);
  const current = snapshot(connect(hub).initial);
  assert.ok(Buffer.byteLength(JSON.stringify(current)) <= 224 * 1024);
  assert.equal(current.payload.live.message?.blocks?.[0]?.type, "thinking");
  subscription.unsubscribe();
  hub.endTurn(SESSION_ID, RUN_ID);
  hub.close();
});

test("observer failures remove only the failing subscriber and never escape the observer", () => {
  const hub = new SessionEvents();
  let brokenCalls = 0;
  const healthy: StreamFrame[] = [];
  const broken = connect(hub, session(), null, null, undefined, () => {
    brokenCalls += 1;
    throw new Error("transport closed");
  });
  const live = connect(hub, session(), null, null, undefined, (frame) => healthy.push(frame));

  assert.doesNotThrow(() => hub.beginTurn(SESSION_ID, RUN_ID));
  assert.doesNotThrow(() =>
    hub.observe(
      SESSION_ID,
      RUN_ID,
      makeRecord("message_start", { message: { role: "assistant", content: [] } }),
    ),
  );
  assert.equal(brokenCalls, 1);
  assert.equal(healthy[0]?.type, "message.started");

  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_end", { message: { role: "assistant", content: [] } }),
  );
  assert.equal(brokenCalls, 1);
  assert.equal(healthy[1]?.type, "message.finished");
  broken.unsubscribe();
  live.unsubscribe();
  hub.endTurn(SESSION_ID, RUN_ID);
  hub.close();
});

test("rejected asynchronous listeners are removed without affecting healthy observers", async () => {
  const hub = new SessionEvents();
  let rejectedCalls = 0;
  const healthy: StreamFrame[] = [];
  const rejected = connect(hub, session(), null, null, undefined, async () => {
    rejectedCalls += 1;
    throw new Error("async transport closed");
  });
  const live = connect(hub, session(), null, null, undefined, (frame) => healthy.push(frame));
  hub.beginTurn(SESSION_ID, RUN_ID);
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_start", { message: { role: "assistant", content: [] } }),
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_end", { message: { role: "assistant", content: [] } }),
  );
  assert.equal(rejectedCalls, 1);
  assert.equal(healthy.filter((frame) => frame.type === "message.finished").length, 1);
  rejected.unsubscribe();
  live.unsubscribe();
  hub.endTurn(SESSION_ID, RUN_ID);
  hub.close();
});

test("truncation and replay retention stay within explicit serialized byte limits", () => {
  const hub = new SessionEvents({ maxReplayEvents: 3, maxReplayBytes: 128 * 1024 });
  const seen: StreamFrame[] = [];
  const subscription = connect(hub, session(), null, null, undefined, (frame) => seen.push(frame));
  const start = snapshot(subscription.initial).cursor;
  hub.beginTurn(SESSION_ID, RUN_ID);
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_start", { message: { role: "assistant", content: [] } }),
  );
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("message_update", {
      assistantMessageEvent: {
        type: "text_delta",
        contentIndex: 0,
        delta: "\u0000".repeat(50_000),
      },
    }),
  );
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("tool_execution_start", {
      toolCallId: "large-tool",
      toolName: "shell",
      args: { value: "\\".repeat(80_000) },
    }),
  );
  for (let index = 0; index < 8; index += 1) {
    hub.observe(
      SESSION_ID,
      RUN_ID,
      makeRecord("tool_execution_start", {
        toolCallId: `tool-${index}`,
        toolName: "shell",
        args: { index },
      }),
    );
  }
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("tool_execution_start", {
      toolCallId: "x".repeat(1025),
      toolName: "shell",
      args: {},
    }),
  );

  const message = ordinary(seen, "message.delta");
  assert.equal(message.type, "message.delta");
  assert.equal(messageDeltaPayload(message).truncated, true);
  const tool = ordinary(seen, "tool.started");
  assert.equal(tool.type, "tool.started");
  assert.equal(toolPayload(tool).truncated, true);
  assert.ok(seen.some((frame) => frame.type === "projection.limited"));
  assert.ok(seen.some((frame) => frame.type === "projection.error"));
  assert.equal(seen.filter((frame) => frame.type === "tool.started").length, 8);
  for (const frame of seen) assert.ok(Buffer.byteLength(JSON.stringify(frame)) <= 64 * 1024);

  const metadata = connect(hub, session(), null, null);
  const currentSnapshot = snapshot(metadata.initial);
  assert.ok(Buffer.byteLength(JSON.stringify(currentSnapshot)) < 224 * 1024);
  assert.equal(currentSnapshot.payload.live.tools.length, 8);
  metadata.unsubscribe();

  hub.publishSession(session(SESSION_ID, 14));
  hub.publishSession(session(SESSION_ID, 15));
  const old = connect(hub, session(), null, null, start);
  assert.deepEqual(
    old.initial.map((frame) => frame.type),
    ["resync", "snapshot"],
  );
  old.unsubscribe();
  subscription.unsubscribe();
  hub.endTurn(SESSION_ID, RUN_ID);
  hub.close();
});

test("subscriber and hub limits enforce bounded ownership and evict only idle streams", () => {
  const hub = new SessionEvents({
    maxSessions: 1,
    maxSubscribersPerSession: 1,
    maxSubscribers: 1,
  });
  const first = connect(hub, session());
  const cursor = snapshot(first.initial).cursor;
  assert.throws(
    () => connect(hub, session()),
    (error: unknown) => error instanceof Error && error.name === "SubscriberLimitError",
  );
  assert.throws(
    () => connect(hub, session(OTHER_SESSION_ID)),
    (error: unknown) => error instanceof Error && error.name === "SubscriberLimitError",
  );

  first.unsubscribe();
  hub.beginTurn(SESSION_ID, RUN_ID);
  assert.throws(() => hub.ensure(OTHER_SESSION_ID), /stream capacity/i);
  hub.endTurn(SESSION_ID, RUN_ID);
  hub.ensure(OTHER_SESSION_ID);
  const recreated = connect(hub, session(), null, null, cursor);
  assert.deepEqual(
    recreated.initial.map((frame) => frame.type),
    ["resync", "snapshot"],
  );
  if (recreated.initial[0]?.type === "resync")
    assert.equal(recreated.initial[0].payload.reason, "epoch_changed");
  assert.notEqual(snapshot(recreated.initial).cursor, cursor);

  recreated.unsubscribe();
  hub.close();
});

test("stream.error is delivered as a bounded projection and close clears subscriptions", () => {
  const hub = new SessionEvents();
  const seen: StreamFrame[] = [];
  const subscription = connect(hub, session(), null, null, undefined, (frame) => seen.push(frame));
  hub.fail(SESSION_ID, "storage_unavailable", "Turn state cannot be persisted.");
  const failure = ordinary(seen, "stream.error");
  assert.equal(failure.type, "stream.error");
  if (failure.type === "stream.error") {
    assert.equal(failure.runId, null);
    assert.deepEqual(failure.payload, {
      code: "storage_unavailable",
      message: "Turn state cannot be persisted.",
    });
  }
  hub.close();
  hub.fail(SESSION_ID, "ignored", "closed");
  assert.equal(seen.length, 1);
  subscription.unsubscribe();
});

test("native message identities distinguish identical occurrences and retain tool references", () => {
  const hub = new SessionEvents();
  const frames: StreamFrame[] = [];
  const sub = connect(
    hub,
    withTurn(session(), RUN_ID, RUN_ID),
    turn(),
    turn(),
    undefined,
    (frame) => frames.push(frame),
  );
  hub.beginTurn(SESSION_ID, RUN_ID);
  const message = {
    role: "assistant",
    content: [{ type: "text", text: "Same text" }],
    timestamp: 1,
  };
  for (let i = 0; i < 2; i++) {
    hub.observe(SESSION_ID, RUN_ID, makeRecord("message_start", { message }));
    hub.observe(SESSION_ID, RUN_ID, makeRecord("message_end", { message }));
  }
  const finished = frames.filter((f) => f.type === "message.finished");
  assert.equal(finished.length, 2);
  assert.match(JSON.stringify(finished[0]), /"nativeKey":"[a-f0-9]{64}:1"/);
  assert.match(JSON.stringify(finished[1]), /"nativeKey":"[a-f0-9]{64}:2"/);
  hub.observe(
    SESSION_ID,
    RUN_ID,
    makeRecord("tool_execution_start", {
      toolCallId: "native-tool",
      toolName: "bash",
      args: { command: "echo test" },
    }),
  );
  const tool = frames.find((f) => f.type === "tool.started");
  assert.match(JSON.stringify(tool), /"callId":"native-tool"/);
  assert.ok(frames.every(isStreamFrame));
  sub.unsubscribe();
  hub.close();
});

test("native execution starts from active Dwell message counts instead of a stale file baseline", () => {
  const hub = new SessionEvents();
  const frames: StreamFrame[] = [];
  const sub = connect(
    hub,
    withTurn(session(), RUN_ID, RUN_ID),
    turn(),
    turn(),
    undefined,
    (frame) => frames.push(frame),
  );
  const savedCounts = new Map([["a".repeat(64), 1]]);
  hub.beginTurn(SESSION_ID, RUN_ID, savedCounts);
  const message = {
    role: "assistant",
    content: [{ type: "text", text: "Dwell answer also seen before native start" }],
    timestamp: 2,
  };
  hub.observe(SESSION_ID, RUN_ID, makeRecord("message_start", { message }));
  hub.observe(SESSION_ID, RUN_ID, makeRecord("message_end", { message }));
  const dwellMessage = frames.find((frame) => frame.type === "message.finished");
  assert.ok(dwellMessage?.type === "message.finished" && dwellMessage.payload.nativeKey);
  const digest = dwellMessage.payload.nativeKey.split(":")[0];
  assert.ok(digest);

  const nativeRunId = "66666666-6666-4666-8666-666666666666";
  const baseline = hub.beginNativeExecution(SESSION_ID, nativeRunId, savedCounts);
  assert.equal(baseline?.messageCounts.get(digest), 1);
  hub.observe(SESSION_ID, nativeRunId, makeRecord("message_start", { message }));
  hub.observe(SESSION_ID, nativeRunId, makeRecord("message_end", { message }));
  const finished = frames.filter((frame) => frame.type === "message.finished");
  const nativeMessage = finished.at(-1);
  assert.ok(nativeMessage?.type === "message.finished" && nativeMessage.payload.nativeKey);
  assert.equal(nativeMessage.payload.nativeKey, `${digest}:2`);
  sub.unsubscribe();
  hub.close();
});
