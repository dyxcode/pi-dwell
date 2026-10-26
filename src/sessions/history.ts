import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  type HistoryPrefix,
  HistoryReadError,
  readSavedHistory,
  type SavedHistory,
} from "../runtime/pi-history.ts";
import type { PiEntry } from "../runtime/pi-process.ts";
import { isRecord } from "../runtime/pi-rpc.ts";
import type { HistoryBlock, HistoryEntry } from "../shared/history.ts";

const ENTRY_BYTES = 64 * 1024;
const PAGE_BYTES = 240 * 1024; // Reserve the rest of the 256 KiB envelope for metadata/cursor.

function string(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 1024 ? value : null;
}
function block(type: HistoryBlock["type"], text: string): HistoryBlock {
  return { type, text, callId: null, name: null };
}

function toolInput(value: unknown): { text: string; truncated: boolean } {
  const stack = [{ value, depth: 0 }];
  let count = 0;
  while (stack.length > 0) {
    const item = stack.pop();
    if (!item) break;
    if (++count > 10000 || item.depth > 32 || stack.length > 10000)
      return { text: "Tool input exceeds the display depth or item limit.", truncated: true };
    if (Array.isArray(item.value) || isRecord(item.value)) {
      for (const child of Object.values(item.value))
        stack.push({ value: child, depth: item.depth + 1 });
    }
  }
  return { text: JSON.stringify(value ?? null), truncated: false };
}

function project(entry: PiEntry): HistoryEntry | null {
  if (entry.type === "custom" || (entry.type === "custom_message" && entry.display !== true))
    return null;
  const view: HistoryEntry = {
    id: entry.id,
    parentId: entry.parentId,
    timestamp: typeof entry.timestamp === "string" ? entry.timestamp : "unknown",
    type: entry.type,
    role: null,
    blocks: [],
    toolCallId: null,
    toolName: null,
    targetId: null,
    truncated: false,
  };
  function metadata(value: unknown): string | null {
    if (typeof value === "string" && value.length > 1024) view.truncated = true;
    return string(value);
  }
  let content: unknown;
  if (entry.type === "message" && isRecord(entry.message)) {
    const role = entry.message.role;
    if (role === "user" || role === "assistant" || role === "toolResult") {
      view.role = role;
      content = entry.message.content;
      if (role === "toolResult") {
        view.toolCallId = metadata(entry.message.toolCallId);
        view.toolName = metadata(entry.message.toolName);
      }
    } else view.blocks.push(block("unsupported", "Unsupported saved message role."));
  } else if (entry.type === "custom_message") {
    view.role = "custom";
    content = entry.content;
  } else if (entry.type === "compaction" || entry.type === "branch_summary") {
    content = entry.summary;
  } else if (entry.type === "context_edit") {
    view.targetId = metadata(entry.targetId);
    content =
      entry.replacement === null
        ? "This entry was omitted from model context. Its original saved content remains in history."
        : "This entry's model context was replaced. History shows the original saved content.";
  } else if (entry.type === "model_change") {
    content = `Model changed: ${metadata(entry.provider) ?? "unknown"}/${metadata(entry.modelId) ?? "unknown"}.`;
  } else if (entry.type === "thinking_level_change") {
    content = `Thinking level: ${metadata(entry.thinkingLevel) ?? "unknown"}.`;
  } else if (entry.type === "session_info") {
    content = `Session name: ${metadata(entry.name) ?? "unnamed"}.`;
  } else if (entry.type === "label") {
    view.targetId = metadata(entry.targetId);
    content = `Bookmark: ${metadata(entry.label) ?? "removed"}.`;
  } else view.blocks.push(block("unsupported", "Unsupported saved entry type."));

  if (typeof content === "string") view.blocks.push(block("text", content));
  else if (Array.isArray(content)) {
    for (const part of content.slice(0, 64)) {
      if (isRecord(part) && part.type === "text" && typeof part.text === "string")
        view.blocks.push(block("text", part.text));
      else if (isRecord(part) && part.type === "thinking" && typeof part.thinking === "string")
        view.blocks.push(block("thinking", part.thinking));
      else if (isRecord(part) && part.type === "toolCall") {
        const input = toolInput(part.arguments);
        if (input.truncated) view.truncated = true;
        view.blocks.push({
          type: "tool_call",
          callId: metadata(part.id),
          name: metadata(part.name),
          text: input.text,
        });
      } else
        view.blocks.push(
          block(
            "unsupported",
            isRecord(part) && part.type === "image"
              ? "Saved image (display unavailable)."
              : "Unsupported saved content block.",
          ),
        );
    }
    if (content.length > 64) view.truncated = true;
  } else if (content !== undefined)
    view.blocks.push(block("unsupported", "Unsupported saved content."));

  // Each entry has a serialized budget, including escaping, IDs and block metadata.
  const original = view.blocks;
  view.blocks = [];
  let remaining = ENTRY_BYTES - Buffer.byteLength(JSON.stringify(view)) - 256;
  for (const part of original) {
    const overhead = Buffer.byteLength(JSON.stringify({ ...part, text: "" })) + 1;
    if (remaining < overhead) {
      view.truncated = true;
      break;
    }
    const budget = remaining - overhead;
    let text = part.text;
    if (Buffer.byteLength(JSON.stringify(text)) - 2 > budget) {
      // Binary search code points so truncation cannot split a surrogate pair.
      const points = Array.from(text);
      let low = 0;
      let high = points.length;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (Buffer.byteLength(JSON.stringify(points.slice(0, middle).join(""))) - 2 <= budget)
          low = middle;
        else high = middle - 1;
      }
      text = points.slice(0, low).join("");
      view.truncated = true;
    }
    const saved = { ...part, text };
    view.blocks.push(saved);
    remaining -= Buffer.byteLength(JSON.stringify(saved)) + 1;
  }
  return view;
}

interface Cursor extends HistoryPrefix {
  sessionId: string;
  before: number;
}
export interface HistorySlice {
  history: SavedHistory;
  branchIds: Set<string>;
  entries: HistoryEntry[];
  nextCursor: string | null;
}

/** Stateless signed cursors pin a byte prefix; no retained transcript cache or database. */
export class HistoryPages {
  readonly #key = randomBytes(32);

  #cursor(value: string, sessionId: string): Cursor {
    if (!value || value.length > 1536 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value))
      throw new HistoryReadError(400, "invalid_cursor", "Invalid history cursor.");
    const [payload, signature] = value.split(".");
    if (!payload || !signature)
      throw new HistoryReadError(400, "invalid_cursor", "Invalid history cursor.");
    const expected = createHmac("sha256", this.#key).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new HistoryReadError(
        400,
        "invalid_cursor",
        "History cursor expired or is invalid. Reload the latest history.",
      );
    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      throw new HistoryReadError(400, "invalid_cursor", "Invalid history cursor.");
    }
    if (
      !isRecord(decoded) ||
      decoded.sessionId !== sessionId ||
      typeof decoded.bytes !== "number" ||
      !Number.isSafeInteger(decoded.bytes) ||
      decoded.bytes < 1 ||
      typeof decoded.revision !== "string" ||
      !/^[a-f0-9]{64}$/.test(decoded.revision) ||
      typeof decoded.before !== "number" ||
      !Number.isSafeInteger(decoded.before) ||
      decoded.before < 1
    )
      throw new HistoryReadError(400, "invalid_cursor", "Invalid history cursor.");
    return { sessionId, bytes: decoded.bytes, revision: decoded.revision, before: decoded.before };
  }

  #encode(cursor: Cursor): string {
    const payload = Buffer.from(JSON.stringify(cursor)).toString("base64url");
    return `${payload}.${createHmac("sha256", this.#key).update(payload).digest("base64url")}`;
  }

  async read(options: {
    sessionId: string;
    file: string;
    piSessionId: string;
    directory: string;
    cursor?: string;
  }): Promise<HistorySlice> {
    const cursor =
      options.cursor === undefined ? undefined : this.#cursor(options.cursor, options.sessionId);
    const history = await readSavedHistory({
      file: options.file,
      piSessionId: options.piSessionId,
      directory: options.directory,
      ...(cursor ? { prefix: cursor } : {}),
    });
    const byId = new Map(history.entries.map((entry) => [entry.id, entry]));
    const branch: PiEntry[] = [];
    let id = history.leafId;
    while (id !== null) {
      const entry = byId.get(id);
      if (!entry)
        throw new HistoryReadError(409, "invalid_history", "Saved branch has a missing parent.");
      branch.push(entry);
      id = entry.parentId;
    }
    branch.reverse();
    const before = cursor?.before ?? branch.length;
    if (before > branch.length)
      throw new HistoryReadError(400, "invalid_cursor", "Invalid history page boundary.");
    const entries: HistoryEntry[] = [];
    let index = before;
    let bytes = 2;
    while (index > 0 && entries.length < 100) {
      const entry = branch[index - 1];
      if (!entry) break;
      const view = project(entry);
      if (view) {
        const size = Buffer.byteLength(JSON.stringify(view)) + 1;
        if (bytes + size > PAGE_BYTES) break;
        entries.push(view);
        bytes += size;
      }
      index--;
    }
    entries.reverse();
    return {
      history,
      branchIds: new Set(branch.map((entry) => entry.id)),
      entries,
      nextCursor:
        index > 0
          ? this.#encode({
              sessionId: options.sessionId,
              bytes: history.bytes,
              revision: history.revision,
              before: index,
            })
          : null,
    };
  }
}
