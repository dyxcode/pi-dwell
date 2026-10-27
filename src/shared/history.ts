import { SESSION_ID } from "./sessions.ts";

export interface HistoryBlock {
  type: "text" | "thinking" | "tool_call" | "image" | "unsupported";
  text: string;
  callId: string | null;
  name: string | null;
  imageIndex?: number;
  mimeType?: string;
}

export interface ContextSource {
  path: string;
  content: string;
  truncated: boolean;
}

/** Display projection of a saved native entry; never a model-context reconstruction. */
export interface HistoryEntry {
  toolOwnerKey?: string;
  nativeKey?: string;
  id: string;
  parentId: string | null;
  timestamp: string;
  type: string;
  role:
    | "user"
    | "assistant"
    | "toolResult"
    | "bashExecution"
    | "custom"
    | "context"
    | "diagnostic"
    | null;
  blocks: HistoryBlock[];
  toolCallId: string | null;
  toolName: string | null;
  targetId: string | null;
  truncated: boolean;
  error?: boolean;
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
  /** Latest terminal native Pi execution proven present on this saved branch. */
  coveredNativeExecutionId?: string;
  /** Instructions proven to have been part of Pi's saved system context. */
  contextSources?: ContextSource[];
  /** True when the saved instruction preview was cut to fit its display limits. */
  contextSourcesTruncated?: boolean;
}

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

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
  const base = ["type", "text", "callId", "name"];
  const image = [...base, "imageIndex", "mimeType"];
  const isImage = record(value) && value.type === "image";
  return (
    record(value) &&
    exact(value, isImage ? image : base) &&
    typeof value.type === "string" &&
    ["text", "thinking", "tool_call", "image", "unsupported"].includes(value.type) &&
    typeof value.text === "string" &&
    value.text.length <= 64 * 1024 &&
    optionalText(value.callId) &&
    optionalText(value.name) &&
    (!isImage ||
      (typeof value.imageIndex === "number" &&
        Number.isSafeInteger(value.imageIndex) &&
        value.imageIndex >= 0 &&
        typeof value.mimeType === "string" &&
        IMAGE_MIME_TYPES.has(value.mimeType)))
  );
}
function contextSource(value: unknown): value is ContextSource {
  return (
    record(value) &&
    exact(value, ["path", "content", "truncated"]) &&
    text(value.path, 4096) &&
    typeof value.content === "string" &&
    new TextEncoder().encode(value.content).byteLength <= 32 * 1024 &&
    typeof value.truncated === "boolean"
  );
}
function entry(value: unknown): value is HistoryEntry {
  const fields = [
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
  ];
  return (
    record(value) &&
    exact(value, [
      ...fields,
      ...(value.error === undefined ? [] : ["error"]),
      ...(value.nativeKey === undefined ? [] : ["nativeKey"]),
      ...(value.toolOwnerKey === undefined ? [] : ["toolOwnerKey"]),
    ]) &&
    (value.toolOwnerKey === undefined ||
      (typeof value.toolOwnerKey === "string" &&
        /^[a-f0-9]{64}:[1-9][0-9]{0,8}$/.test(value.toolOwnerKey))) &&
    (value.nativeKey === undefined ||
      (typeof value.nativeKey === "string" &&
        /^[a-f0-9]{64}:[1-9][0-9]{0,8}$/.test(value.nativeKey))) &&
    text(value.id) &&
    optionalText(value.parentId) &&
    text(value.timestamp, 100) &&
    text(value.type) &&
    (value.role === null ||
      (typeof value.role === "string" &&
        [
          "user",
          "assistant",
          "toolResult",
          "bashExecution",
          "custom",
          "context",
          "diagnostic",
        ].includes(value.role))) &&
    Array.isArray(value.blocks) &&
    value.blocks.length <= 64 &&
    Array.from(value.blocks).every(block) &&
    optionalText(value.toolCallId) &&
    optionalText(value.toolName) &&
    optionalText(value.targetId) &&
    typeof value.truncated === "boolean" &&
    (value.error === undefined || typeof value.error === "boolean")
  );
}

export function isHistoryPage(value: unknown): value is HistoryPage {
  const fields = [
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
  ];
  const optionalFields = [
    fields,
    [...fields, "contextSources"],
    [...fields, "contextSourcesTruncated"],
    [...fields, "contextSources", "contextSourcesTruncated"],
  ].flatMap((candidate) => [candidate, [...candidate, "coveredNativeExecutionId"]]);
  if (
    !record(value) ||
    !optionalFields.some((candidate) => exact(value, candidate)) ||
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
    (value.contextSources !== undefined &&
      (!Array.isArray(value.contextSources) ||
        value.contextSources.length > 32 ||
        !Array.from(value.contextSources).every(contextSource))) ||
    (value.contextSourcesTruncated !== undefined &&
      (value.contextSources === undefined || typeof value.contextSourcesTruncated !== "boolean")) ||
    typeof value.incompleteTail !== "boolean" ||
    !optionalUuid(value.activeTurnId) ||
    !optionalUuid(value.latestTurnId) ||
    !optionalUuid(value.coveredTurnId) ||
    (value.coveredNativeExecutionId !== undefined &&
      (typeof value.coveredNativeExecutionId !== "string" ||
        !SESSION_ID.test(value.coveredNativeExecutionId)))
  )
    return false;
  if (
    value.status !== "available" &&
    (value.entries.length !== 0 ||
      value.revision !== null ||
      value.leafId !== null ||
      value.nextCursor !== null ||
      value.coveredTurnId !== null ||
      value.coveredNativeExecutionId !== undefined)
  )
    return false;
  if (value.status === "available" && value.revision === null) return false;
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 256 * 1024;
}
