import { isSessionInfo, type SessionInfo } from "./sessions.ts";
import type { TurnError, TurnStatus } from "./turns.ts";

export const STREAM_EVENT_MAX_BYTES = 64 * 1024;
export const STREAM_SNAPSHOT_MAX_BYTES = 224 * 1024;

export interface TurnProjection {
  runId: string;
  sessionId: string;
  requestId: string;
  status: TurnStatus;
  cancellationRequested: boolean;
  createdAt: number;
  updatedAt: number;
  error: TurnError | null;
  entryCount: number;
  errorTruncated: boolean;
}

export interface LiveMessage {
  id: string;
  text: string;
  finished: boolean;
  truncated: boolean;
}

export interface LiveMessageDelta {
  messageId: string;
  text: string;
  truncated: boolean;
}

export interface LiveTool {
  id: string;
  name: string;
  input: string;
  output: string;
  status: "running" | "completed" | "failed";
  truncated: boolean;
}

export interface LiveProjection {
  message: LiveMessage | null;
  tools: LiveTool[];
  truncated: boolean;
}

export interface SessionSnapshot {
  session: SessionInfo;
  activeTurn: TurnProjection | null;
  latestTurn: TurnProjection | null;
  metadataTruncated: boolean;
  live: LiveProjection;
}

export interface StreamEventBase {
  sessionId: string;
  runId: string | null;
  cursor: string;
}

export type ProjectionLimitScope =
  | "metadata"
  | "message"
  | "tool_input"
  | "tool_output"
  | "tool_name"
  | "tool_count";

export type StreamFrame =
  | {
      sessionId: string;
      cursor: string;
      type: "snapshot";
      payload: SessionSnapshot;
    }
  | {
      sessionId: string;
      cursor: null;
      type: "resync";
      payload: { reason: "cursor_stale" | "cursor_ahead" | "epoch_changed" | "replay_limit" };
    }
  | (StreamEventBase & { type: "session.updated"; payload: SessionInfo })
  | (StreamEventBase & { type: "turn.updated"; payload: TurnProjection })
  | (StreamEventBase & { type: "message.started"; payload: LiveMessage })
  | (StreamEventBase & { type: "message.delta"; payload: LiveMessageDelta })
  | (StreamEventBase & { type: "message.finished"; payload: LiveMessage })
  | (StreamEventBase & { type: "tool.started"; payload: LiveTool })
  | (StreamEventBase & { type: "tool.updated"; payload: LiveTool })
  | (StreamEventBase & { type: "tool.finished"; payload: LiveTool })
  | (StreamEventBase & {
      type: "projection.limited";
      payload: { scope: ProjectionLimitScope; limit: number };
    })
  | (StreamEventBase & {
      type: "projection.error";
      payload: { code: string; message: string };
    })
  | (StreamEventBase & {
      type: "stream.error";
      payload: { code: string; message: string };
    });

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const CURSOR = /^([a-f0-9-]{36}):([a-f0-9-]{36}):(0|[1-9][0-9]*)$/;
const SESSION_KEYS = [
  "id",
  "directory",
  "provider",
  "model",
  "piSessionId",
  "createdAt",
  "updatedAt",
  "status",
  "runtimeState",
  "historyState",
  "error",
  "activeTurnId",
  "latestTurnId",
] as const;
const TURN_PROJECTION_KEYS = [
  "runId",
  "sessionId",
  "requestId",
  "status",
  "cancellationRequested",
  "createdAt",
  "updatedAt",
  "error",
  "entryCount",
  "errorTruncated",
] as const;
const SNAPSHOT_KEYS = ["session", "activeTurn", "latestTurn", "metadataTruncated", "live"] as const;
const LIVE_KEYS = ["message", "tools", "truncated"] as const;
const MESSAGE_KEYS = ["id", "text", "finished", "truncated"] as const;
const MESSAGE_DELTA_KEYS = ["messageId", "text", "truncated"] as const;
const TOOL_KEYS = ["id", "name", "input", "output", "status", "truncated"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function isBoundedString(value: unknown, maxBytes: number): value is string {
  return typeof value === "string" && new TextEncoder().encode(value).byteLength <= maxBytes;
}

function isCursorFor(value: unknown, sessionId: string): value is string {
  if (typeof value !== "string") return false;
  const match = CURSOR.exec(value);
  return (
    match !== null &&
    match[1] === sessionId &&
    UUID.test(match[2] ?? "") &&
    Number.isSafeInteger(Number(match[3]))
  );
}

function isSession(value: unknown): value is SessionInfo {
  return isRecord(value) && hasExactKeys(value, SESSION_KEYS) && isSessionInfo(value);
}

function isTurnProjection(value: unknown): value is TurnProjection {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, TURN_PROJECTION_KEYS) ||
    typeof value.runId !== "string" ||
    !UUID.test(value.runId) ||
    typeof value.sessionId !== "string" ||
    !UUID.test(value.sessionId) ||
    typeof value.requestId !== "string" ||
    !UUID.test(value.requestId) ||
    typeof value.status !== "string" ||
    ![
      "accepted",
      "dispatching",
      "running",
      "completed",
      "failed",
      "aborted",
      "interrupted",
    ].includes(value.status) ||
    typeof value.cancellationRequested !== "boolean" ||
    typeof value.createdAt !== "number" ||
    !Number.isSafeInteger(value.createdAt) ||
    typeof value.updatedAt !== "number" ||
    !Number.isSafeInteger(value.updatedAt) ||
    typeof value.entryCount !== "number" ||
    !Number.isSafeInteger(value.entryCount) ||
    value.entryCount < 0 ||
    typeof value.errorTruncated !== "boolean"
  ) {
    return false;
  }
  if (value.error === null) return true;
  return (
    isRecord(value.error) &&
    hasExactKeys(value.error, ["code", "message"]) &&
    isBoundedString(value.error.code, 128) &&
    isBoundedString(value.error.message, 2048)
  );
}

function isLiveMessage(value: unknown): value is LiveMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, MESSAGE_KEYS) &&
    typeof value.id === "string" &&
    UUID.test(value.id) &&
    isBoundedString(value.text, STREAM_EVENT_MAX_BYTES) &&
    typeof value.finished === "boolean" &&
    typeof value.truncated === "boolean"
  );
}

function isLiveMessageDelta(value: unknown): value is LiveMessageDelta {
  return (
    isRecord(value) &&
    hasExactKeys(value, MESSAGE_DELTA_KEYS) &&
    typeof value.messageId === "string" &&
    UUID.test(value.messageId) &&
    isBoundedString(value.text, STREAM_EVENT_MAX_BYTES) &&
    typeof value.truncated === "boolean"
  );
}

function isLiveTool(value: unknown): value is LiveTool {
  return (
    isRecord(value) &&
    hasExactKeys(value, TOOL_KEYS) &&
    typeof value.id === "string" &&
    UUID.test(value.id) &&
    isBoundedString(value.name, 512) &&
    isBoundedString(value.input, 16 * 1024) &&
    isBoundedString(value.output, 16 * 1024) &&
    (value.status === "running" || value.status === "completed" || value.status === "failed") &&
    typeof value.truncated === "boolean"
  );
}

function isLiveProjection(value: unknown): value is LiveProjection {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, LIVE_KEYS) ||
    (value.message !== null && !isLiveMessage(value.message)) ||
    !Array.isArray(value.tools) ||
    value.tools.length > 8 ||
    typeof value.truncated !== "boolean"
  ) {
    return false;
  }
  return value.tools.every(isLiveTool);
}

function hasBoundedJsonSize(value: unknown, maxBytes: number): boolean {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= maxBytes;
  } catch {
    return false;
  }
}

function isCommonEvent(value: Record<string, unknown>): boolean {
  return (
    typeof value.sessionId === "string" &&
    UUID.test(value.sessionId) &&
    (value.runId === null || (typeof value.runId === "string" && UUID.test(value.runId))) &&
    isCursorFor(value.cursor, value.sessionId)
  );
}

/** Runtime guard for the intentionally small, JSON-safe SSE protocol. */
export function isStreamFrame(value: unknown): value is StreamFrame {
  if (!isRecord(value) || typeof value.type !== "string") return false;

  if (value.type === "snapshot") {
    if (
      !hasExactKeys(value, ["sessionId", "cursor", "type", "payload"]) ||
      typeof value.sessionId !== "string" ||
      !UUID.test(value.sessionId) ||
      !isCursorFor(value.cursor, value.sessionId) ||
      !isRecord(value.payload) ||
      !hasExactKeys(value.payload, SNAPSHOT_KEYS) ||
      !isSession(value.payload.session) ||
      value.payload.session.id !== value.sessionId ||
      (value.payload.activeTurn !== null && !isTurnProjection(value.payload.activeTurn)) ||
      (value.payload.latestTurn !== null && !isTurnProjection(value.payload.latestTurn)) ||
      typeof value.payload.metadataTruncated !== "boolean" ||
      !isLiveProjection(value.payload.live)
    ) {
      return false;
    }
    const activeTurn = value.payload.activeTurn;
    const latestTurn = value.payload.latestTurn;
    if (
      (activeTurn !== null &&
        (activeTurn.sessionId !== value.sessionId ||
          activeTurn.runId !== value.payload.session.activeTurnId)) ||
      (latestTurn !== null &&
        (latestTurn.sessionId !== value.sessionId ||
          latestTurn.runId !== value.payload.session.latestTurnId)) ||
      (activeTurn === null && value.payload.session.activeTurnId !== null) ||
      (latestTurn === null && value.payload.session.latestTurnId !== null)
    ) {
      return false;
    }
    return hasBoundedJsonSize(value, STREAM_SNAPSHOT_MAX_BYTES);
  }

  if (value.type === "resync") {
    return (
      hasExactKeys(value, ["sessionId", "cursor", "type", "payload"]) &&
      typeof value.sessionId === "string" &&
      UUID.test(value.sessionId) &&
      value.cursor === null &&
      isRecord(value.payload) &&
      hasExactKeys(value.payload, ["reason"]) &&
      (value.payload.reason === "cursor_stale" ||
        value.payload.reason === "cursor_ahead" ||
        value.payload.reason === "epoch_changed" ||
        value.payload.reason === "replay_limit") &&
      hasBoundedJsonSize(value, STREAM_EVENT_MAX_BYTES)
    );
  }

  if (!hasExactKeys(value, ["sessionId", "runId", "cursor", "type", "payload"])) return false;
  if (!isCommonEvent(value)) return false;

  switch (value.type) {
    case "session.updated":
      return (
        isSession(value.payload) &&
        value.payload.id === value.sessionId &&
        hasBoundedJsonSize(value, STREAM_EVENT_MAX_BYTES)
      );
    case "turn.updated":
      return (
        isTurnProjection(value.payload) &&
        value.payload.sessionId === value.sessionId &&
        value.runId === value.payload.runId &&
        hasBoundedJsonSize(value, STREAM_EVENT_MAX_BYTES)
      );
    case "message.started":
    case "message.finished":
      return isLiveMessage(value.payload) && hasBoundedJsonSize(value, STREAM_EVENT_MAX_BYTES);
    case "message.delta":
      return isLiveMessageDelta(value.payload) && hasBoundedJsonSize(value, STREAM_EVENT_MAX_BYTES);
    case "tool.started":
    case "tool.updated":
    case "tool.finished":
      return isLiveTool(value.payload) && hasBoundedJsonSize(value, STREAM_EVENT_MAX_BYTES);
    case "projection.limited":
      return (
        isRecord(value.payload) &&
        hasExactKeys(value.payload, ["scope", "limit"]) &&
        ["metadata", "message", "tool_input", "tool_output", "tool_name", "tool_count"].includes(
          String(value.payload.scope),
        ) &&
        typeof value.payload.limit === "number" &&
        Number.isSafeInteger(value.payload.limit) &&
        value.payload.limit > 0 &&
        hasBoundedJsonSize(value, STREAM_EVENT_MAX_BYTES)
      );
    case "projection.error":
    case "stream.error":
      return (
        isRecord(value.payload) &&
        hasExactKeys(value.payload, ["code", "message"]) &&
        isBoundedString(value.payload.code, 128) &&
        isBoundedString(value.payload.message, 2048) &&
        hasBoundedJsonSize(value, STREAM_EVENT_MAX_BYTES)
      );
    default:
      return false;
  }
}
