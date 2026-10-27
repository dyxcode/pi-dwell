import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { HistoryReadBudgetError, runWithHistoryReadBudget } from "./pi-history-budget.ts";
import type { PiEntry } from "./pi-process.ts";

const MAX_SOURCE_BYTES = 128 * 1024 * 1024; // Several image-bearing turns, bounded per read.
const MAX_RECORD_BYTES = 8 * 1024 * 1024; // Fits a 5 MiB decoded image plus JSON/base64 overhead.
const MAX_ENTRIES = 100_000;
const MAX_NATIVE_ID_BYTES = 1024;
const MAX_TIMESTAMP_BYTES = 100;
const READ_CHUNK_BYTES = 64 * 1024;
const REVISION_PATTERN = /^[a-f0-9]{64}$/;

export class HistoryReadError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HistoryReadError";
    this.status = status;
    this.code = code;
  }
}

export interface HistoryPrefix {
  bytes: number;
  revision: string;
}

export interface SavedHistory {
  entries: PiEntry[];
  leafId: string | null;
  revision: string;
  bytes: number;
  incompleteTail: boolean;
}

export interface SavedHistoryReadOptions {
  file: string;
  piSessionId: string;
  directory: string;
  prefix?: HistoryPrefix;
  signal?: AbortSignal;
  /** Let an admitted public read use a free permit after shutdown, but never wait in the queue. */
  cancelQueuedOnly?: boolean;
}

function changed(): HistoryReadError {
  return new HistoryReadError(409, "history_changed", "Saved session history changed.");
}

function invalid(): HistoryReadError {
  return new HistoryReadError(409, "invalid_history", "Saved session history is invalid.");
}

function unavailable(): HistoryReadError {
  return new HistoryReadError(410, "history_unavailable", "Saved session history is unavailable.");
}

function overLimit(): HistoryReadError {
  return new HistoryReadError(
    413,
    "history_limit",
    "Saved session history exceeds its size limits.",
  );
}

function busy(): HistoryReadError {
  return new HistoryReadError(
    429,
    "history_busy",
    "Two history reads are already active. Try again shortly.",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("code" in error)) return undefined;
  const code: unknown = error.code;
  return typeof code === "string" ? code : undefined;
}

function openError(error: unknown, hasPrefix: boolean): HistoryReadError {
  const code = errorCode(error);
  if (code === "ENOENT") return unavailable();
  if (hasPrefix && (code === "ELOOP" || code === "ENOTDIR")) return changed();
  if (code === "ELOOP" || code === "EISDIR" || code === "ENOTDIR") return invalid();
  return unavailable();
}

function validatePrefix(prefix: HistoryPrefix | undefined): number | undefined {
  if (prefix === undefined) return undefined;
  if (!isRecord(prefix)) throw changed();
  if (!Number.isSafeInteger(prefix.bytes) || prefix.bytes <= 0) throw changed();
  if (prefix.bytes > MAX_SOURCE_BYTES) throw overLimit();
  if (!REVISION_PATTERN.test(prefix.revision)) throw changed();
  return prefix.bytes;
}

function sameIdentity(
  first: { dev: bigint; ino: bigint },
  second: { dev: bigint; ino: bigint },
): boolean {
  return first.dev === second.dev && first.ino === second.ino;
}

function sameReadMetadata(
  first: { size: bigint; mtimeNs: bigint; ctimeNs: bigint },
  second: { size: bigint; mtimeNs: bigint; ctimeNs: bigint },
): boolean {
  return (
    first.size === second.size &&
    first.mtimeNs === second.mtimeNs &&
    first.ctimeNs === second.ctimeNs
  );
}

function assertSafeFile(info: { isFile(): boolean; uid: bigint; nlink: bigint }): void {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (!info.isFile() || uid === undefined || info.uid !== BigInt(uid) || info.nlink !== 1n)
    throw invalid();
}

async function assertPathIdentity(
  file: string,
  identity: { dev: bigint; ino: bigint },
  hasPrefix: boolean,
): Promise<void> {
  const pathInfo = await lstat(file, { bigint: true }).catch(() => {
    throw changed();
  });
  assertSafeFile(pathInfo);
  if (!sameIdentity(identity, pathInfo)) throw hasPrefix ? changed() : invalid();
}

async function readBoundary(
  handle: Awaited<ReturnType<typeof open>>,
  byteLength: number,
): Promise<Buffer> {
  const content = Buffer.allocUnsafe(byteLength);
  let offset = 0;
  while (offset < byteLength) {
    const length = Math.min(READ_CHUNK_BYTES, byteLength - offset);
    let result: { bytesRead: number };
    try {
      result = await handle.read(content, offset, length, offset);
    } catch {
      throw unavailable();
    }
    if (result.bytesRead === 0) throw changed();
    offset += result.bytesRead;
  }
  return content;
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_TIMESTAMP_BYTES)
    return false;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return false;
  try {
    return new Date(milliseconds).toISOString() === value;
  } catch {
    return false;
  }
}

function parseRecord(buffer: Buffer): Record<string, unknown> | null {
  if (buffer.byteLength > MAX_RECORD_BYTES) throw overLimit();
  let line: string;
  try {
    line = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw invalid();
  }
  if (line.endsWith("\r")) line = line.slice(0, -1);
  if (line.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw invalid();
  }
  if (!isRecord(parsed)) throw invalid();
  return parsed;
}

function parseEntries(
  content: Buffer,
  completeBytes: number,
  options: SavedHistoryReadOptions,
): { entries: PiEntry[]; leafId: string | null } {
  const entries: PiEntry[] = [];
  const ids = new Set<string>();
  let leafId: string | null = null;
  let headerSeen = false;
  let start = 0;

  while (start < completeBytes) {
    const end = content.indexOf(0x0a, start);
    if (end < 0 || end >= completeBytes) throw invalid();
    const record = parseRecord(content.subarray(start, end));
    start = end + 1;
    if (record === null) continue;

    if (!headerSeen) {
      if (
        record.type !== "session" ||
        record.version !== 3 ||
        record.id !== options.piSessionId ||
        record.cwd !== options.directory ||
        !validTimestamp(record.timestamp)
      )
        throw invalid();
      headerSeen = true;
      continue;
    }

    const { id, parentId, timestamp, type } = record;
    if (
      type === "session" ||
      typeof type !== "string" ||
      type.length === 0 ||
      type.length > MAX_NATIVE_ID_BYTES ||
      typeof id !== "string" ||
      id.length === 0 ||
      id.length > MAX_NATIVE_ID_BYTES ||
      (parentId !== null &&
        (typeof parentId !== "string" ||
          parentId.length === 0 ||
          parentId.length > MAX_NATIVE_ID_BYTES)) ||
      !validTimestamp(timestamp) ||
      ids.has(id) ||
      (typeof parentId === "string" && !ids.has(parentId))
    )
      throw invalid();

    const entry: PiEntry = { ...record, id, type, parentId };
    if (entries.length >= MAX_ENTRIES) throw overLimit();
    entries.push(entry);
    ids.add(id);
    leafId = id;
  }

  if (!headerSeen) throw invalid();
  return { entries, leafId };
}

function makeRevision(dev: bigint, ino: bigint, content: Buffer): string {
  return createHash("sha256")
    .update(dev.toString())
    .update("\0")
    .update(ino.toString())
    .update("\0")
    .update(content.byteLength.toString())
    .update("\0")
    .update(content)
    .digest("hex");
}

function completedBytes(content: Buffer): number {
  return content.lastIndexOf(0x0a) + 1;
}

async function readSavedHistorySnapshot(
  options: SavedHistoryReadOptions,
  prefixBytes: number | undefined,
): Promise<SavedHistory> {
  const hasPrefix = prefixBytes !== undefined;
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(
      options.file,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch (error) {
    throw openError(error, hasPrefix);
  }

  try {
    const initial = await handle.stat({ bigint: true });
    assertSafeFile(initial);
    await assertPathIdentity(options.file, initial, hasPrefix);

    if (initial.size < 0n) throw invalid();
    if (hasPrefix && BigInt(prefixBytes) > initial.size) throw changed();
    if (!hasPrefix && initial.size > BigInt(MAX_SOURCE_BYTES)) throw overLimit();
    const targetBytes = hasPrefix ? prefixBytes : Number(initial.size);
    const content = await readBoundary(handle, targetBytes);
    const afterRead = await handle.stat({ bigint: true });
    assertSafeFile(afterRead);
    if (!sameIdentity(initial, afterRead) || afterRead.size < initial.size) throw changed();

    if (!sameReadMetadata(initial, afterRead)) {
      const confirmation = await readBoundary(handle, targetBytes);
      const afterConfirmation = await handle.stat({ bigint: true });
      assertSafeFile(afterConfirmation);
      if (
        !content.equals(confirmation) ||
        !sameIdentity(initial, afterConfirmation) ||
        afterConfirmation.size < initial.size
      )
        throw changed();
    }

    await assertPathIdentity(options.file, initial, hasPrefix);

    const completeLength = completedBytes(content);
    if (hasPrefix && completeLength !== targetBytes) throw changed();
    const complete = content.subarray(0, completeLength);
    const revision = makeRevision(initial.dev, initial.ino, complete);
    if (options.prefix && revision !== options.prefix.revision) throw changed();
    const { entries, leafId } = parseEntries(complete, completeLength, options);

    return {
      entries,
      leafId,
      revision,
      bytes: completeLength,
      incompleteTail: completeLength < content.byteLength,
    };
  } catch (error) {
    if (error instanceof HistoryReadError) throw error;
    throw unavailable();
  } finally {
    await handle.close().catch(() => {});
  }
}

/** Reads a bounded, immutable snapshot of a saved Pi v3 JSONL session. */
export async function readSavedHistory(options: SavedHistoryReadOptions): Promise<SavedHistory> {
  const prefixBytes = validatePrefix(options.prefix);
  try {
    return await runWithHistoryReadBudget(
      () => readSavedHistorySnapshot(options, prefixBytes),
      options.signal,
      { cancelQueuedOnly: options.cancelQueuedOnly ?? false },
    );
  } catch (error) {
    if (error instanceof HistoryReadBudgetError) throw busy();
    throw error;
  }
}
