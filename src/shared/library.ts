export const LIBRARY_SEARCH_LIMIT = 20;
export const LIBRARY_EXCERPT_CHARACTERS = 2_000;
export const LIBRARY_READ_CHARACTERS = 20_000;

export const LIBRARY_ERROR_CODES = [
  "library_unavailable",
  "library_not_found",
  "library_binding_mismatch",
  "invalid_input",
] as const;

export type LibraryErrorCode = (typeof LIBRARY_ERROR_CODES)[number];
export type LibraryCompleteness = "unknown" | "known-partial";

export interface LibraryReference {
  binding: string;
  itemId: string;
  versionId: string;
}

export interface LibraryReferencesResponse {
  references: LibraryReference[];
}

export interface LibrarySearchRequest {
  query: string;
  source?: string;
  limit?: number;
}

export interface LibraryLatestRequest {
  source?: string;
  limit?: number;
}

export interface LibraryItemView {
  reference: LibraryReference;
  sourceId: string;
  title: string;
  url: string;
  author?: string;
  summary?: string;
  text: string;
  retrievedAt: string;
  sourceCompleteness: LibraryCompleteness;
  truncated: boolean;
  displayTruncated: boolean;
}

export interface LibraryItemsResponse {
  binding: string;
  items: LibraryItemView[];
}

export interface LibraryLatestResponse extends LibraryItemsResponse {
  collectedAt: string | null;
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const BINDING = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const SOURCE = /^[a-z][a-z0-9-]{0,63}$/;

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
  const keys = [...required, ...optional.filter((key) => Object.hasOwn(value, key))];
  return exact(value, keys);
}

function text(value: unknown, limit: number, allowEmpty = false): value is string {
  if (typeof value !== "string") return false;
  let characters = 0;
  for (const character of value) {
    if (character === "\0") return false;
    characters += 1;
    if (characters > limit) return false;
  }
  return allowEmpty || value.trim().length > 0;
}

export function isLibraryBinding(value: unknown): value is string {
  return typeof value === "string" && BINDING.test(value);
}

function source(value: unknown): value is string {
  return typeof value === "string" && SOURCE.test(value);
}

function validLimit(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= LIBRARY_SEARCH_LIMIT
  );
}

export function isLibraryErrorCode(value: unknown): value is LibraryErrorCode {
  return typeof value === "string" && LIBRARY_ERROR_CODES.some((code) => code === value);
}

export function isLibrarySearchRequest(value: unknown): value is LibrarySearchRequest {
  return (
    record(value) &&
    keysWithOptional(value, ["query"], ["source", "limit"]) &&
    text(value.query, 200) &&
    (value.source === undefined || source(value.source)) &&
    (value.limit === undefined || validLimit(value.limit))
  );
}

export function isLibraryLatestRequest(value: unknown): value is LibraryLatestRequest {
  return (
    record(value) &&
    keysWithOptional(value, [], ["source", "limit"]) &&
    (value.source === undefined || source(value.source)) &&
    (value.limit === undefined || validLimit(value.limit))
  );
}

export function isLibraryReference(value: unknown): value is LibraryReference {
  return (
    record(value) &&
    exact(value, ["binding", "itemId", "versionId"]) &&
    isLibraryBinding(value.binding) &&
    typeof value.itemId === "string" &&
    UUID.test(value.itemId) &&
    typeof value.versionId === "string" &&
    UUID.test(value.versionId)
  );
}

export function isLibraryReferencesResponse(value: unknown): value is LibraryReferencesResponse {
  return (
    record(value) &&
    exact(value, ["references"]) &&
    Array.isArray(value.references) &&
    Array.from(value.references).every(isLibraryReference)
  );
}

export function isLibraryItemView(
  value: unknown,
  maxTextCharacters = LIBRARY_READ_CHARACTERS,
): value is LibraryItemView {
  if (
    !record(value) ||
    !keysWithOptional(
      value,
      [
        "reference",
        "sourceId",
        "title",
        "url",
        "text",
        "retrievedAt",
        "sourceCompleteness",
        "truncated",
        "displayTruncated",
      ],
      ["author", "summary"],
    ) ||
    !isLibraryReference(value.reference) ||
    !source(value.sourceId) ||
    !text(value.title, 500, true) ||
    !text(value.url, 8_192) ||
    !text(value.text, maxTextCharacters) ||
    !text(value.retrievedAt, 40) ||
    !Number.isFinite(Date.parse(value.retrievedAt)) ||
    (value.sourceCompleteness !== "unknown" && value.sourceCompleteness !== "known-partial") ||
    typeof value.truncated !== "boolean" ||
    typeof value.displayTruncated !== "boolean" ||
    (value.author !== undefined && !text(value.author, 250, true)) ||
    (value.summary !== undefined && !text(value.summary, 1_000, true))
  )
    return false;

  try {
    const url = new URL(value.url);
    if (!(["http:", "https:"].includes(url.protocol) && !url.username && !url.password))
      return false;
  } catch {
    return false;
  }
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 256 * 1024;
}

export function isLibraryItemsResponse(value: unknown): value is LibraryItemsResponse {
  return (
    record(value) &&
    exact(value, ["binding", "items"]) &&
    isLibraryBinding(value.binding) &&
    Array.isArray(value.items) &&
    value.items.length <= LIBRARY_SEARCH_LIMIT &&
    Array.from(value.items).every((item) => isLibraryItemView(item, LIBRARY_EXCERPT_CHARACTERS)) &&
    new TextEncoder().encode(JSON.stringify(value)).byteLength <= 2 * 1024 * 1024
  );
}

export function isLibraryLatestResponse(value: unknown): value is LibraryLatestResponse {
  return (
    record(value) &&
    exact(value, ["binding", "collectedAt", "items"]) &&
    isLibraryBinding(value.binding) &&
    (value.collectedAt === null ||
      (text(value.collectedAt, 40) && Number.isFinite(Date.parse(value.collectedAt)))) &&
    Array.isArray(value.items) &&
    value.items.length <= LIBRARY_SEARCH_LIMIT &&
    Array.from(value.items).every((item) => isLibraryItemView(item, LIBRARY_EXCERPT_CHARACTERS)) &&
    new TextEncoder().encode(JSON.stringify(value)).byteLength <= 2 * 1024 * 1024
  );
}

export function libraryItemPath(reference: LibraryReference): string {
  if (!isLibraryReference(reference)) throw new TypeError("Invalid library reference.");
  return `/api/v1/library/${encodeURIComponent(reference.binding)}/items/${encodeURIComponent(reference.itemId)}/versions/${encodeURIComponent(reference.versionId)}`;
}
