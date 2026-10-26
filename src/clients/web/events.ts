import {
  isStreamFrame,
  type LiveMessage,
  type LiveTool,
  type StreamFrame,
  type TurnProjection,
} from "../../shared/events.ts";
import { type HistoryPage, isHistoryPage } from "../../shared/history.ts";
import type { SessionInfo } from "../../shared/sessions.ts";

export const MAX_SSE_FRAME_BYTES = 256 * 1024;
const MAX_LIVE_MESSAGES = 64;
const MAX_LIVE_TOOLS = 64;
const MAX_LIVE_MESSAGE_BYTES = 64 * 1024;

export type ResyncReason = "cursor_stale" | "cursor_ahead" | "epoch_changed" | "replay_limit";

export interface ConversationState {
  sessionId: string | null;
  cursor: string | null;
  session: SessionInfo | null;
  activeTurn: TurnProjection | null;
  latestTurn: TurnProjection | null;
  metadataTruncated: boolean;
  messages: LiveMessage[];
  tools: LiveTool[];
  liveRunId: string | null;
  liveTruncated: boolean;
  liveIncomplete: boolean;
  history: HistoryPage | null;
  resyncReason: ResyncReason | null;
  error: {
    type: "projection.error" | "stream.error";
    code: string;
    message: string;
  } | null;
}

export type SseDecodeErrorCode =
  | "frame_too_large"
  | "malformed_sse"
  | "invalid_json"
  | "invalid_frame"
  | "event_mismatch"
  | "id_mismatch";

export class SseDecodeError extends Error {
  readonly code: SseDecodeErrorCode;

  constructor(code: SseDecodeErrorCode, message: string) {
    super(message);
    this.name = "SseDecodeError";
    this.code = code;
  }
}

interface EventFields {
  blockBytes: number;
  event: string | undefined;
  id: string | undefined;
  data: string[];
}

/** Incrementally decodes the host's bounded, JSON-only SSE event protocol. */
export class SSEDecoder {
  #line = "";
  #lineBytes = 0;
  #pendingHighSurrogate = false;
  #pendingCR = false;
  #atStart = true;
  #fields: EventFields = this.#emptyFields();

  push(chunk: string): StreamFrame[] {
    const frames: StreamFrame[] = [];
    if (this.#atStart && chunk.length > 0) {
      this.#atStart = false;
      if (chunk.startsWith("\uFEFF")) chunk = chunk.slice(1);
    }

    try {
      for (const character of chunk) {
        if (this.#pendingCR) {
          this.#pendingCR = false;
          this.#lineEnding(character === "\n" ? 2 : 1, frames);
          if (character === "\n") continue;
        }

        if (character === "\r") {
          this.#pendingCR = true;
          if (this.#fields.blockBytes + this.#lineBytes + 1 > MAX_SSE_FRAME_BYTES)
            this.#fail("frame_too_large", "SSE frame exceeded its byte limit.");
        } else if (character === "\n") {
          this.#lineEnding(1, frames);
        } else {
          if (this.#pendingHighSurrogate && isLowSurrogate(character)) this.#lineBytes -= 2;
          this.#pendingHighSurrogate = false;
          this.#line += character;
          this.#lineBytes += utf8Bytes(character);
          this.#pendingHighSurrogate = isHighSurrogate(character);
          if (this.#fields.blockBytes + this.#lineBytes > MAX_SSE_FRAME_BYTES)
            this.#fail("frame_too_large", "SSE frame exceeded its byte limit.");
        }
      }
    } catch (error) {
      this.#line = "";
      this.#lineBytes = 0;
      this.#pendingHighSurrogate = false;
      this.#pendingCR = false;
      this.#fields = this.#emptyFields();
      throw error;
    }

    return frames;
  }

  #lineEnding(endingBytes: number, frames: StreamFrame[]): void {
    this.#fields.blockBytes += this.#lineBytes + endingBytes;
    if (this.#fields.blockBytes > MAX_SSE_FRAME_BYTES)
      this.#fail("frame_too_large", "SSE frame exceeded its byte limit.");

    const line = this.#line;
    this.#line = "";
    this.#lineBytes = 0;
    this.#pendingHighSurrogate = false;
    if (line.length === 0) {
      const frame = this.#dispatch();
      if (frame) frames.push(frame);
      this.#fields = this.#emptyFields();
      return;
    }
    if (line.startsWith(":")) return;

    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    switch (field) {
      case "event":
        this.#fields.event = value;
        break;
      case "id":
        if (value.includes("\0")) this.#fail("malformed_sse", "SSE id contains a null byte.");
        this.#fields.id = value;
        break;
      case "data":
        this.#fields.data.push(value);
        break;
    }
  }

  #dispatch(): StreamFrame | null {
    if (this.#fields.data.length === 0) return null;
    if (this.#fields.event === undefined)
      this.#fail("malformed_sse", "SSE event is missing its event name.");

    let parsed: unknown;
    try {
      parsed = JSON.parse(this.#fields.data.join("\n"));
    } catch {
      this.#fail("invalid_json", "SSE data is not valid JSON.");
    }
    if (!isStreamFrame(parsed))
      this.#fail("invalid_frame", "SSE data is not a valid stream frame.");
    if (this.#fields.event !== parsed.type)
      this.#fail("event_mismatch", "SSE event name does not match its stream frame.");

    if (parsed.cursor === null) {
      if (this.#fields.id !== undefined)
        this.#fail("id_mismatch", "A resync frame must not have an SSE id.");
    } else if (this.#fields.id !== parsed.cursor) {
      this.#fail("id_mismatch", "SSE id does not match its stream frame cursor.");
    }
    return parsed;
  }

  #emptyFields(): EventFields {
    return { blockBytes: 0, event: undefined, id: undefined, data: [] };
  }

  #fail(code: SseDecodeErrorCode, message: string): never {
    throw new SseDecodeError(code, message);
  }
}

export function emptyConversationState(sessionId?: string): ConversationState {
  return {
    sessionId: sessionId ?? null,
    cursor: null,
    session: null,
    activeTurn: null,
    latestTurn: null,
    metadataTruncated: false,
    messages: [],
    tools: [],
    liveRunId: null,
    liveTruncated: false,
    liveIncomplete: false,
    history: null,
    resyncReason: null,
    error: null,
  };
}

interface CursorParts {
  sessionId: string;
  epoch: string;
  sequence: number;
}

function cursorParts(cursor: string): CursorParts | null {
  const match = /^([a-f0-9-]{36}):([a-f0-9-]{36}):(0|[1-9][0-9]*)$/.exec(cursor);
  if (!match) return null;
  const sessionId = match[1];
  const epoch = match[2];
  const sequence = Number(match[3]);
  if (!sessionId || !epoch || !Number.isSafeInteger(sequence)) return null;
  return { sessionId, epoch, sequence };
}

function copyTurn(value: TurnProjection | null): TurnProjection | null {
  if (value === null) return null;
  return { ...value, error: value.error ? { ...value.error } : null };
}

function copyMessage(value: LiveMessage): LiveMessage {
  return { ...value };
}

function copyTool(value: LiveTool): LiveTool {
  return { ...value };
}

function copyHistory(value: HistoryPage): HistoryPage {
  return {
    ...value,
    entries: value.entries.map((entry) => ({
      ...entry,
      blocks: entry.blocks.map((block) => ({ ...block })),
    })),
  };
}

function utf8Bytes(character: string): number {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined || codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

function isHighSurrogate(character: string): boolean {
  const codeUnit = character.charCodeAt(0);
  return character.length === 1 && codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(character: string): boolean {
  const codeUnit = character.charCodeAt(0);
  return character.length === 1 && codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

function isTerminal(status: TurnProjection["status"]): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "aborted" ||
    status === "interrupted"
  );
}

function coveredLiveRun(
  history: HistoryPage | null,
  liveRunId: string | null,
  activeTurn: TurnProjection | null,
  latestTurn: TurnProjection | null,
): boolean {
  return (
    history !== null &&
    liveRunId !== null &&
    history.coveredTurnId === liveRunId &&
    activeTurn === null &&
    latestTurn?.runId === liveRunId &&
    isTerminal(latestTurn.status)
  );
}

function applyCoveredHistory(state: ConversationState): ConversationState {
  if (!coveredLiveRun(state.history, state.liveRunId, state.activeTurn, state.latestTurn))
    return state;
  return {
    ...state,
    messages: [],
    tools: [],
    liveTruncated: false,
    liveIncomplete: false,
  };
}

function snapshotState(
  state: ConversationState,
  frame: Extract<StreamFrame, { type: "snapshot" }>,
): ConversationState {
  const previousCursor = state.cursor === null ? null : cursorParts(state.cursor);
  const incomingCursor = cursorParts(frame.cursor);
  if (previousCursor && incomingCursor && previousCursor.epoch === incomingCursor.epoch) {
    if (incomingCursor.sequence <= previousCursor.sequence) return state;
  }
  const payload = frame.payload;
  const history = state.history?.sessionId === frame.sessionId ? state.history : null;
  const liveRunId = payload.activeTurn?.runId ?? payload.latestTurn?.runId ?? null;
  const covered = coveredLiveRun(history, liveRunId, payload.activeTurn, payload.latestTurn);
  const messages = !covered && payload.live.message ? [copyMessage(payload.live.message)] : [];
  const tools = covered ? [] : payload.live.tools.map(copyTool);
  const epochChanged =
    previousCursor !== null &&
    incomingCursor !== null &&
    previousCursor.epoch !== incomingCursor.epoch;

  return {
    sessionId: frame.sessionId,
    cursor: frame.cursor,
    session: { ...payload.session },
    activeTurn: copyTurn(payload.activeTurn),
    latestTurn: copyTurn(payload.latestTurn),
    metadataTruncated: payload.metadataTruncated,
    messages,
    tools,
    liveRunId,
    liveTruncated: payload.live.truncated,
    liveIncomplete:
      !covered &&
      (liveRunId !== null ||
        payload.live.message !== null ||
        payload.live.tools.length > 0 ||
        epochChanged),
    history,
    resyncReason: null,
    error: null,
  };
}

function upsertMessage(
  messages: readonly LiveMessage[],
  value: LiveMessage,
): { messages: LiveMessage[]; dropped: boolean } {
  const index = messages.findIndex((message) => message.id === value.id);
  if (index < 0) {
    const combined = [...messages, copyMessage(value)];
    return {
      messages: combined.slice(-MAX_LIVE_MESSAGES),
      dropped: combined.length > MAX_LIVE_MESSAGES,
    };
  }
  return {
    messages: messages.map((message, current) =>
      current === index ? copyMessage(value) : message,
    ),
    dropped: false,
  };
}

function appendDelta(
  messages: readonly LiveMessage[],
  messageId: string,
  delta: string,
  truncated: boolean,
): { messages: LiveMessage[]; truncated: boolean; dropped: boolean } {
  const index = messages.findIndex((message) => message.id === messageId);
  const current =
    index < 0 ? { id: messageId, text: "", finished: false, truncated: false } : messages[index];
  if (!current) return { messages: [...messages], truncated: false, dropped: false };
  if (current.finished) return { messages: [...messages], truncated: false, dropped: false };

  const existingBytes = new TextEncoder().encode(current.text).byteLength;
  let remaining = Math.max(0, MAX_LIVE_MESSAGE_BYTES - existingBytes);
  let suffix = "";
  let clipped = false;
  for (const character of delta) {
    const size = utf8Bytes(character);
    if (size > remaining) {
      clipped = true;
      break;
    }
    suffix += character;
    remaining -= size;
  }
  const next: LiveMessage = {
    ...current,
    text: current.text + suffix,
    truncated: current.truncated || truncated || clipped,
  };
  const combined = index < 0 ? [...messages, next] : [...messages];
  if (index >= 0) combined[index] = next;
  return {
    messages: combined.slice(-MAX_LIVE_MESSAGES),
    truncated: clipped,
    dropped: combined.length > MAX_LIVE_MESSAGES,
  };
}

function upsertTool(
  tools: readonly LiveTool[],
  value: LiveTool,
): { tools: LiveTool[]; dropped: boolean } {
  const index = tools.findIndex((tool) => tool.id === value.id);
  if (index < 0) {
    const combined = [...tools, copyTool(value)];
    return {
      tools: combined.slice(-MAX_LIVE_TOOLS),
      dropped: combined.length > MAX_LIVE_TOOLS,
    };
  }
  return {
    tools: tools.map((tool, current) => (current === index ? copyTool(value) : tool)),
    dropped: false,
  };
}

/** Applies one validated stream frame without mutating the prior client state. */
export function reduceFrame(state: ConversationState, frame: StreamFrame): ConversationState {
  if (!isStreamFrame(frame)) return state;
  if (state.sessionId !== null && state.sessionId !== frame.sessionId) return state;

  if (frame.type === "resync") {
    return {
      ...emptyConversationState(frame.sessionId),
      history: state.history?.sessionId === frame.sessionId ? state.history : null,
      resyncReason: frame.payload.reason,
      liveIncomplete: true,
    };
  }
  if (frame.type === "snapshot") return snapshotState(state, frame);

  let gap = false;
  const previous = state.cursor === null ? null : cursorParts(state.cursor);
  const incoming = cursorParts(frame.cursor);
  if (!incoming) return state;
  if (previous !== null) {
    if (previous.epoch !== incoming.epoch || previous.sessionId !== incoming.sessionId)
      return state;
    if (incoming.sequence <= previous.sequence) return state;
    gap = incoming.sequence > previous.sequence + 1;
  } else if (incoming.sequence > 1) {
    gap = true;
  }

  let next: ConversationState = {
    ...state,
    sessionId: frame.sessionId,
    cursor: frame.cursor,
    resyncReason: null,
    liveIncomplete: state.liveIncomplete || gap,
  };

  switch (frame.type) {
    case "session.updated":
      next = { ...next, session: { ...frame.payload } };
      break;
    case "turn.updated": {
      const newRun = next.liveRunId !== frame.payload.runId;
      next = {
        ...next,
        session: next.session
          ? {
              ...next.session,
              activeTurnId: isTerminal(frame.payload.status) ? null : frame.payload.runId,
              latestTurnId: frame.payload.runId,
            }
          : null,
        activeTurn: isTerminal(frame.payload.status) ? null : copyTurn(frame.payload),
        latestTurn: copyTurn(frame.payload),
        ...(newRun
          ? {
              messages: [],
              tools: [],
              liveTruncated: false,
              liveIncomplete: gap,
            }
          : {}),
        liveRunId: frame.payload.runId,
      };
      return applyCoveredHistory(next);
    }
    case "message.started":
    case "message.finished": {
      if (next.liveRunId !== null && frame.runId !== null && frame.runId !== next.liveRunId)
        return next;
      const liveRunId = next.liveRunId ?? frame.runId;
      const result = upsertMessage(next.messages, frame.payload);
      next = {
        ...next,
        messages: result.messages,
        liveRunId,
        liveTruncated: next.liveTruncated || frame.payload.truncated || result.dropped,
        liveIncomplete: next.liveIncomplete || result.dropped,
      };
      break;
    }
    case "message.delta": {
      if (next.liveRunId !== null && frame.runId !== null && frame.runId !== next.liveRunId)
        return next;
      const liveRunId = next.liveRunId ?? frame.runId;
      const result = appendDelta(
        next.messages,
        frame.payload.messageId,
        frame.payload.text,
        frame.payload.truncated,
      );
      next = {
        ...next,
        messages: result.messages,
        liveRunId,
        liveTruncated:
          next.liveTruncated || frame.payload.truncated || result.truncated || result.dropped,
        liveIncomplete: next.liveIncomplete || result.truncated || result.dropped,
      };
      break;
    }
    case "tool.started":
    case "tool.updated":
    case "tool.finished": {
      if (next.liveRunId !== null && frame.runId !== null && frame.runId !== next.liveRunId)
        return next;
      const liveRunId = next.liveRunId ?? frame.runId;
      const result = upsertTool(next.tools, frame.payload);
      next = {
        ...next,
        tools: result.tools,
        liveRunId,
        liveTruncated: next.liveTruncated || frame.payload.truncated || result.dropped,
        liveIncomplete: next.liveIncomplete || result.dropped,
      };
      break;
    }
    case "projection.limited":
      next =
        frame.payload.scope === "metadata"
          ? { ...next, metadataTruncated: true }
          : { ...next, liveTruncated: true };
      break;
    case "projection.error":
    case "stream.error":
      next = {
        ...next,
        error: {
          type: frame.type,
          code: frame.payload.code,
          message: frame.payload.message,
        },
      };
      break;
  }
  return next;
}

/** Associates the latest saved-history page and removes only its covered terminal live run. */
export function reconcileHistory(state: ConversationState, page: HistoryPage): ConversationState {
  if (!isHistoryPage(page) || (state.sessionId !== null && state.sessionId !== page.sessionId))
    return state;
  const history = copyHistory(page);
  return applyCoveredHistory({ ...state, sessionId: page.sessionId, history });
}
