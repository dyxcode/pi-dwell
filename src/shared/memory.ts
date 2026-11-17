export const MEMORY_SEARCH_LIMIT = 20;
export const MEMORY_QUERY_CODEPOINTS = 128;
export const MEMORY_PREVIEW_CODEPOINTS = 500;
export const MEMORY_READ_CODEPOINTS = 8_000;
export const MEMORY_CURSOR_CHARACTERS = 8_192;
export const MEMORY_ID_CODEPOINTS = 512;

export const MEMORY_ERROR_CODES = [
  "invalid_input",
  "memory_not_found",
  "memory_changed",
  "invalid_cursor",
  "memory_unavailable",
] as const;

export type MemoryErrorCode = (typeof MEMORY_ERROR_CODES)[number];

export interface MemorySearchRequest {
  query: string;
  cursor?: string;
  limit?: number;
}

export interface MemorySearchItem {
  id: string;
  revision: number;
  preview: string;
}

export interface MemorySearchResponse {
  items: MemorySearchItem[];
  nextCursor?: string;
}

export interface MemoryReadRequest {
  id: string;
  expectedRevision: number;
  cursor?: string;
}

export interface MemoryReadResponse {
  id: string;
  revision: number;
  text: string;
  nextCursor?: string;
}

export type ClientCapabilityState = "disabled" | "ready" | "unavailable";

export interface ClientCapability {
  configured: boolean;
  state: ClientCapabilityState;
}

export interface ClientCapabilities {
  memory: ClientCapability;
  library: ClientCapability;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}

function keysWithOptional(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  return exact(value, [...required, ...optional.filter((key) => Object.hasOwn(value, key))]);
}

function wellFormed(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function text(
  value: unknown,
  limit: number,
  allowEmpty = false,
  rejectNul = false,
): value is string {
  if (typeof value !== "string") return false;
  let codepoints = 0;
  for (const character of value) {
    if (rejectNul && character === "\0") return false;
    codepoints += 1;
    if (codepoints > limit) return false;
  }
  return wellFormed(value) && (allowEmpty || value.trim().length > 0);
}

function revision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function cursor(value: unknown): value is string {
  return text(value, MEMORY_CURSOR_CHARACTERS, false, true);
}

function memoryId(value: unknown): value is string {
  return text(value, MEMORY_ID_CODEPOINTS, false, true);
}

export function isMemoryErrorCode(value: unknown): value is MemoryErrorCode {
  return typeof value === "string" && MEMORY_ERROR_CODES.some((code) => code === value);
}

export function isMemorySearchRequest(value: unknown): value is MemorySearchRequest {
  return (
    record(value) &&
    keysWithOptional(value, ["query"], ["cursor", "limit"]) &&
    text(value.query, MEMORY_QUERY_CODEPOINTS, false, true) &&
    (value.cursor === undefined || cursor(value.cursor)) &&
    (value.limit === undefined ||
      (typeof value.limit === "number" &&
        Number.isSafeInteger(value.limit) &&
        value.limit >= 1 &&
        value.limit <= MEMORY_SEARCH_LIMIT))
  );
}

export function isMemoryReadRequest(value: unknown): value is MemoryReadRequest {
  return (
    record(value) &&
    keysWithOptional(value, ["id", "expectedRevision"], ["cursor"]) &&
    memoryId(value.id) &&
    revision(value.expectedRevision) &&
    (value.cursor === undefined || cursor(value.cursor))
  );
}

function isMemorySearchItem(value: unknown): value is MemorySearchItem {
  return (
    record(value) &&
    exact(value, ["id", "revision", "preview"]) &&
    memoryId(value.id) &&
    revision(value.revision) &&
    text(value.preview, MEMORY_PREVIEW_CODEPOINTS, true)
  );
}

export function isMemorySearchResponse(value: unknown): value is MemorySearchResponse {
  return (
    record(value) &&
    keysWithOptional(value, ["items"], ["nextCursor"]) &&
    Array.isArray(value.items) &&
    value.items.length <= MEMORY_SEARCH_LIMIT &&
    value.items.every(isMemorySearchItem) &&
    (value.nextCursor === undefined || cursor(value.nextCursor))
  );
}

export function isMemoryReadResponse(value: unknown): value is MemoryReadResponse {
  return (
    record(value) &&
    keysWithOptional(value, ["id", "revision", "text"], ["nextCursor"]) &&
    memoryId(value.id) &&
    revision(value.revision) &&
    text(value.text, MEMORY_READ_CODEPOINTS, true) &&
    (value.nextCursor === undefined || cursor(value.nextCursor))
  );
}

function isCapability(value: unknown): value is ClientCapability {
  return (
    record(value) &&
    exact(value, ["configured", "state"]) &&
    typeof value.configured === "boolean" &&
    (value.state === "disabled" || value.state === "ready" || value.state === "unavailable") &&
    (value.configured || value.state === "disabled") &&
    (!value.configured || value.state !== "disabled")
  );
}

export function isClientCapabilities(value: unknown): value is ClientCapabilities {
  return (
    record(value) &&
    exact(value, ["memory", "library"]) &&
    isCapability(value.memory) &&
    isCapability(value.library)
  );
}
