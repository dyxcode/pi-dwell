import { SESSION_ID } from "./sessions.ts";

export interface HistoryBlock {
  type: "text" | "thinking" | "tool_call" | "unsupported";
  text: string;
  callId: string | null;
  name: string | null;
}

/** Display projection of a saved native entry; never a model-context reconstruction. */
export interface HistoryEntry {
  id: string;
  parentId: string | null;
  timestamp: string;
  type: string;
  role: "user" | "assistant" | "toolResult" | "custom" | null;
  blocks: HistoryBlock[];
  toolCallId: string | null;
  toolName: string | null;
  targetId: string | null;
  truncated: boolean;
}

export interface HistoryPage {
  sessionId: string;
  status: "empty" | "pending" | "available";
  revision: string | null;
  /** Last persisted entry. An unpersisted runtime branch move is outside this projection. */
  leafId: string | null;
  entries: HistoryEntry[];
  nextCursor: string | null;
  incompleteTail: boolean;
  activeTurnId: string | null;
  latestTurnId: string | null;
  /** Latest terminal Dwell turn whose recorded entries all exist on this saved branch. */
  coveredTurnId: string | null;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown, limit = 1024): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= limit;
}
function optionalText(value: unknown): boolean {
  return value === null || text(value);
}
function optionalUuid(value: unknown): boolean {
  return value === null || (typeof value === "string" && SESSION_ID.test(value));
}
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}
function block(value: unknown): value is HistoryBlock {
  return (
    record(value) &&
    exact(value, ["type", "text", "callId", "name"]) &&
    typeof value.type === "string" &&
    ["text", "thinking", "tool_call", "unsupported"].includes(value.type) &&
    typeof value.text === "string" &&
    value.text.length <= 64 * 1024 &&
    optionalText(value.callId) &&
    optionalText(value.name)
  );
}
function entry(value: unknown): value is HistoryEntry {
  return (
    record(value) &&
    exact(value, [
      "id",
      "parentId",
      "timestamp",
      "type",
      "role",
      "blocks",
      "toolCallId",
      "toolName",
      "targetId",
      "truncated",
    ]) &&
    text(value.id) &&
    optionalText(value.parentId) &&
    text(value.timestamp, 100) &&
    text(value.type) &&
    (value.role === null ||
      (typeof value.role === "string" &&
        ["user", "assistant", "toolResult", "custom"].includes(value.role))) &&
    Array.isArray(value.blocks) &&
    value.blocks.length <= 64 &&
    Array.from(value.blocks).every(block) &&
    optionalText(value.toolCallId) &&
    optionalText(value.toolName) &&
    optionalText(value.targetId) &&
    typeof value.truncated === "boolean"
  );
}

export function isHistoryPage(value: unknown): value is HistoryPage {
  if (
    !record(value) ||
    !exact(value, [
      "sessionId",
      "status",
      "revision",
      "leafId",
      "entries",
      "nextCursor",
      "incompleteTail",
      "activeTurnId",
      "latestTurnId",
      "coveredTurnId",
    ]) ||
    typeof value.sessionId !== "string" ||
    !SESSION_ID.test(value.sessionId) ||
    typeof value.status !== "string" ||
    !["empty", "pending", "available"].includes(value.status) ||
    !(
      value.revision === null ||
      (typeof value.revision === "string" && /^[a-f0-9]{64}$/.test(value.revision))
    ) ||
    !optionalText(value.leafId) ||
    !(value.nextCursor === null || text(value.nextCursor, 1536)) ||
    !Array.isArray(value.entries) ||
    value.entries.length > 100 ||
    !Array.from(value.entries).every(entry) ||
    typeof value.incompleteTail !== "boolean" ||
    !optionalUuid(value.activeTurnId) ||
    !optionalUuid(value.latestTurnId) ||
    !optionalUuid(value.coveredTurnId)
  )
    return false;
  if (
    value.status !== "available" &&
    (value.entries.length !== 0 ||
      value.revision !== null ||
      value.leafId !== null ||
      value.nextCursor !== null ||
      value.coveredTurnId !== null)
  )
    return false;
  if (value.status === "available" && value.revision === null) return false;
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 256 * 1024;
}
