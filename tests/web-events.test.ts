import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SSEDecoder,
  SseDecodeError,
  emptyConversationState,
  reconcileHistory,
  reduceFrame,
} from "../src/clients/web/events.ts";
import {
  isStreamFrame,
  type LiveMessage,
  type LiveMessageDelta,
  type StreamFrame,
  type TurnProjection,
} from "../src/shared/events.ts";
import type { HistoryPage } from "../src/shared/history.ts";
import type { SessionInfo } from "../src/shared/sessions.ts";

const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_SESSION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EPOCH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_EPOCH = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RUN_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OTHER_RUN_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const MESSAGE_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_MESSAGE_ID = "22222222-2222-4222-8222-222222222222";
const TOOL_ID = "33333333-3333-4333-8333-333333333333";

function session(id = SESSION_ID, overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id,
    directory: "/tmp/project",
    provider: "test-provider",
    model: "test-model",
    thinkingLevel: "off",
    piSessionId: OTHER_SESSION_ID,
    createdAt: 1,
    updatedAt: 1,
    status: "ready",
    runtimeState: "ready",
    historyState: "available",
    error: null,
    activeTurnId: null,
    latestTurnId: null,
    ...overrides,
  };
}

function turn(
  runId = RUN_ID,
  status: TurnProjection["status"] = "running",
  overrides: Partial<TurnProjection> = {},
): TurnProjection {
  return {
    runId,
    sessionId: SESSION_ID,
    requestId: OTHER_RUN_ID,
    status,
    cancellationRequested: false,
    createdAt: 10,
    updatedAt: 10,
    error: null,
    entryCount: 0,
    errorTruncated: false,
    ...overrides,
  };
}

function cursor(sequence: number, epoch = EPOCH, sessionId = SESSION_ID): string {
  return `${sessionId}:${epoch}:${sequence}`;
}

function snapshotFrame(
  sequence: number,
  options: {
    session?: SessionInfo;
    activeTurn?: TurnProjection | null;
    latestTurn?: TurnProjection | null;
    message?: { id: string; text: string; finished: boolean; truncated?: boolean } | null;
    tools?: Array<{
      id: string;
      name: string;
      input: string;
      output: string;
      status: "running" | "completed" | "failed";
      truncated?: boolean;
    }>;
    truncated?: boolean;
    epoch?: string;
  } = {},
): StreamFrame {
  const activeTurn = options.activeTurn ?? null;
  const latestTurn = options.latestTurn ?? null;
  const sessionInfo =
    options.session ??
    session(SESSION_ID, {
      activeTurnId: activeTurn?.runId ?? null,
      latestTurnId: latestTurn?.runId ?? null,
    });
  return {
    sessionId: SESSION_ID,
    cursor: cursor(sequence, options.epoch),
    type: "snapshot",
    payload: {
      session: sessionInfo,
      activeTurn,
      latestTurn,
      metadataTruncated: false,
      live: {
        message: options.message
          ? {
              id: options.message.id,
              text: options.message.text,
              finished: options.message.finished,
              truncated: options.message.truncated ?? false,
            }
          : null,
        tools: (options.tools ?? []).map((tool) => ({
          ...tool,
          truncated: tool.truncated ?? false,
        })),
        truncated: options.truncated ?? false,
      },
    },
  };
}

function messageFrame(
  type: "message.started" | "message.delta" | "message.finished",
  sequence: number,
  payload: LiveMessage | LiveMessageDelta,
  runId = RUN_ID,
): StreamFrame {
  const frame: unknown = {
    sessionId: SESSION_ID,
    runId,
    cursor: cursor(sequence),
    type,
    payload,
  };
  if (!isStreamFrame(frame)) throw new Error("Test message frame is invalid.");
  return frame;
}

function toolFrame(
  type: "tool.started" | "tool.updated" | "tool.finished",
  sequence: number,
  status: "running" | "completed" | "failed",
  output = "",
): StreamFrame {
  return {
    sessionId: SESSION_ID,
    runId: RUN_ID,
    cursor: cursor(sequence),
    type,
    payload: {
      id: TOOL_ID,
      name: "search",
      input: "{}",
      output,
      status,
      truncated: false,
    },
  };
}

function encodeSse(frame: StreamFrame, lineEnding = "\n"): string {
  const event = `event: ${frame.type}`;
  const id = frame.cursor === null ? "" : `${lineEnding}id: ${frame.cursor}`;
  return `${event}${id}${lineEnding}data: ${JSON.stringify(frame)}${lineEnding}${lineEnding}`;
}

function assertDecodeError(action: () => unknown, code: SseDecodeError["code"]): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof SseDecodeError);
    assert.equal(error.code, code);
    return true;
  });
}

test("SSEDecoder accepts fragmented CRLF frames and ignores heartbeat blocks", () => {
  const decoder = new SSEDecoder();
  const frame = snapshotFrame(4);
  const wire = `: heartbeat\r\n\r\n${encodeSse(frame, "\r\n")}`;
  const output: StreamFrame[] = [];
  for (let index = 0; index < wire.length; index += 3) {
    output.push(...decoder.push(wire.slice(index, index + 3)));
  }
  assert.deepEqual(output, [frame]);
  assert.deepEqual(decoder.push(": heartbeat\n\n"), []);
});

test("SSEDecoder permits multiline data fields but validates the JSON protocol frame", () => {
  const decoder = new SSEDecoder();
  const frame = snapshotFrame(1);
  const json = JSON.stringify(frame);
  const split = json.indexOf(",") + 1;
  const wire = `event: snapshot\nid: ${frame.cursor}\ndata: ${json.slice(0, split)}\ndata: ${json.slice(split)}\n\n`;
  assert.deepEqual(decoder.push(wire), [frame]);
});

test("SSEDecoder counts fragmented Unicode as UTF-8 bytes", () => {
  const decoder = new SSEDecoder();
  const frame = snapshotFrame(2, {
    session: session(SESSION_ID, { directory: "😀".repeat(50_000) }),
  });
  const wire = `: ${"x".repeat(50_000)}\n${encodeSse(frame)}`;
  const output: StreamFrame[] = [];
  for (let index = 0; index < wire.length; index += 1) {
    output.push(...decoder.push(wire.slice(index, index + 1)));
  }
  assert.deepEqual(output, [frame]);
});

test("SSEDecoder reports malformed JSON, invalid frames, and mismatched event metadata", () => {
  assertDecodeError(() => new SSEDecoder().push("event: snapshot\ndata: {\n\n"), "invalid_json");
  assertDecodeError(
    () =>
      new SSEDecoder().push(
        `event: snapshot\nid: ${cursor(1)}\ndata: ${JSON.stringify({ type: "snapshot" })}\n\n`,
      ),
    "invalid_frame",
  );
  const frame = snapshotFrame(1);
  assertDecodeError(
    () => new SSEDecoder().push(encodeSse(frame).replace("event: snapshot", "event: wrong")),
    "event_mismatch",
  );
  assertDecodeError(
    () => new SSEDecoder().push(encodeSse(frame).replace(cursor(1), cursor(2))),
    "id_mismatch",
  );
});

test("SSEDecoder bounds an unfinished frame", () => {
  const decoder = new SSEDecoder();
  assertDecodeError(() => decoder.push(`data: ${"x".repeat(256 * 1024)}`), "frame_too_large");
  assertDecodeError(() => new SSEDecoder().push(`data: ${"界".repeat(90_000)}`), "frame_too_large");
});

test("reduceFrame accumulates multiple assistant messages and updates tool output", () => {
  let state = emptyConversationState(SESSION_ID);
  state = reduceFrame(state, snapshotFrame(0));
  state = reduceFrame(
    state,
    messageFrame("message.started", 1, {
      id: MESSAGE_ID,
      text: "",
      finished: false,
      truncated: false,
    }),
  );
  state = reduceFrame(
    state,
    messageFrame("message.delta", 2, {
      messageId: MESSAGE_ID,
      text: "Answer one",
      truncated: false,
    }),
  );
  state = reduceFrame(
    state,
    messageFrame("message.finished", 3, {
      id: MESSAGE_ID,
      text: "Answer one",
      finished: true,
      truncated: false,
    }),
  );
  state = reduceFrame(state, toolFrame("tool.started", 4, "running"));
  state = reduceFrame(state, toolFrame("tool.updated", 5, "running", "partial result"));
  state = reduceFrame(state, toolFrame("tool.finished", 6, "completed", "final result"));
  state = reduceFrame(
    state,
    messageFrame("message.started", 7, {
      id: SECOND_MESSAGE_ID,
      text: "",
      finished: false,
      truncated: false,
    }),
  );
  state = reduceFrame(
    state,
    messageFrame("message.delta", 8, {
      messageId: SECOND_MESSAGE_ID,
      text: "Answer two",
      truncated: false,
    }),
  );
  state = reduceFrame(
    state,
    messageFrame("message.finished", 9, {
      id: SECOND_MESSAGE_ID,
      text: "Answer two",
      finished: true,
      truncated: false,
    }),
  );

  assert.deepEqual(state.messages, [
    { id: MESSAGE_ID, text: "Answer one", finished: true, truncated: false },
    { id: SECOND_MESSAGE_ID, text: "Answer two", finished: true, truncated: false },
  ]);
  assert.deepEqual(state.tools, [
    {
      id: TOOL_ID,
      name: "search",
      input: "{}",
      output: "final result",
      status: "completed",
      truncated: false,
    },
  ]);
  assert.equal(state.cursor, cursor(9));
});

test("reduceFrame leaves previous state and frame payloads untouched", () => {
  const previous = reduceFrame(emptyConversationState(SESSION_ID), snapshotFrame(0));
  const frame = messageFrame("message.started", 1, {
    id: MESSAGE_ID,
    text: "initial",
    finished: false,
    truncated: false,
  });
  const next = reduceFrame(previous, frame);
  assert.deepEqual(previous.messages, []);
  assert.equal(next.messages[0]?.text, "initial");
  if (frame.type === "message.started") frame.payload.text = "changed after reduction";
  assert.equal(next.messages[0]?.text, "initial");
});

test("reduceFrame ignores duplicate and older cursors, and marks sequence gaps incomplete", () => {
  let state = reduceFrame(emptyConversationState(SESSION_ID), snapshotFrame(1));
  const delta = messageFrame("message.delta", 2, {
    messageId: MESSAGE_ID,
    text: "Hi",
    truncated: false,
  });
  state = reduceFrame(state, delta);
  const afterDelta = state;
  state = reduceFrame(state, delta);
  state = reduceFrame(
    state,
    messageFrame("message.delta", 1, {
      messageId: MESSAGE_ID,
      text: "old",
      truncated: false,
    }),
  );
  assert.equal(state, afterDelta);
  state = reduceFrame(
    state,
    messageFrame("message.delta", 4, {
      messageId: MESSAGE_ID,
      text: " there",
      truncated: false,
    }),
  );
  assert.equal(state.messages[0]?.text, "Hi there");
  assert.equal(state.liveIncomplete, true);
});

test("resync clears prior live state and a replacement snapshot marks bounded content incomplete", () => {
  const active = turn(RUN_ID, "running");
  let state = reduceFrame(
    emptyConversationState(SESSION_ID),
    snapshotFrame(2, {
      activeTurn: active,
      latestTurn: active,
      message: { id: MESSAGE_ID, text: "old output", finished: false },
      tools: [
        {
          id: TOOL_ID,
          name: "search",
          input: "{}",
          output: "old tool output",
          status: "running",
        },
      ],
    }),
  );
  const resync: StreamFrame = {
    sessionId: SESSION_ID,
    cursor: null,
    type: "resync",
    payload: { reason: "cursor_stale" },
  };
  state = reduceFrame(state, resync);
  assert.deepEqual(state.messages, []);
  assert.deepEqual(state.tools, []);
  assert.equal(state.cursor, null);
  assert.equal(state.resyncReason, "cursor_stale");

  state = reduceFrame(
    state,
    snapshotFrame(8, {
      activeTurn: active,
      latestTurn: active,
      message: { id: SECOND_MESSAGE_ID, text: "current output", finished: false },
      tools: [
        {
          id: TOOL_ID,
          name: "search",
          input: "{}",
          output: "current tool output",
          status: "running",
        },
      ],
    }),
  );
  assert.deepEqual(state.messages, [
    { id: SECOND_MESSAGE_ID, text: "current output", finished: false, truncated: false },
  ]);
  assert.equal(state.tools[0]?.output, "current tool output");
  assert.equal(state.liveIncomplete, true);
  assert.equal(state.resyncReason, null);
});

test("reconcileHistory clears only the matching covered terminal live run", () => {
  const completed = turn(RUN_ID, "completed");
  let state = reduceFrame(
    emptyConversationState(SESSION_ID),
    snapshotFrame(3, {
      latestTurn: completed,
      message: { id: MESSAGE_ID, text: "saved answer", finished: true },
      tools: [
        {
          id: TOOL_ID,
          name: "search",
          input: "{}",
          output: "saved result",
          status: "completed",
        },
      ],
    }),
  );
  const olderCoverage: HistoryPage = {
    sessionId: SESSION_ID,
    status: "available",
    revision: "a".repeat(64),
    leafId: "entry-2",
    entries: [],
    nextCursor: null,
    incompleteTail: false,
    activeTurnId: null,
    latestTurnId: OTHER_RUN_ID,
    coveredTurnId: OTHER_RUN_ID,
  };
  state = reconcileHistory(state, olderCoverage);
  assert.equal(state.messages.length, 1, "older saved history must not hide the newer live turn");
  assert.equal(state.tools.length, 1);

  const matchingCoverage: HistoryPage = {
    ...olderCoverage,
    latestTurnId: RUN_ID,
    coveredTurnId: RUN_ID,
  };
  state = reconcileHistory(state, matchingCoverage);
  assert.deepEqual(state.messages, []);
  assert.deepEqual(state.tools, []);
  assert.equal(state.liveIncomplete, false);
  assert.deepEqual(state.history, matchingCoverage);
});

test("reduceFrame ignores frames from another session and handles epoch replacement snapshots", () => {
  const initial = reduceFrame(emptyConversationState(SESSION_ID), snapshotFrame(10));
  const otherSession = {
    sessionId: OTHER_SESSION_ID,
    runId: null,
    cursor: cursor(11, EPOCH, OTHER_SESSION_ID),
    type: "session.updated",
    payload: session(OTHER_SESSION_ID),
  } satisfies StreamFrame;
  assert.equal(reduceFrame(initial, otherSession), initial);

  const active = turn(RUN_ID, "running");
  const replacement = snapshotFrame(1, {
    epoch: OTHER_EPOCH,
    activeTurn: active,
    latestTurn: active,
  });
  const changed = reduceFrame(initial, replacement);
  assert.equal(changed.cursor, cursor(1, OTHER_EPOCH));
  assert.equal(changed.liveIncomplete, true);
});
