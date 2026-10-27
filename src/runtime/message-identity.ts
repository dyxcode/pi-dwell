import { createHash } from "node:crypto";
import type { PiEntry } from "./pi-process.ts";

/** Identity of the complete native message, never its display text alone. */
function canonical(value: unknown, depth = 0): unknown {
  if (depth > 64) throw new Error("Message identity exceeds the nesting limit.");
  if (Array.isArray(value)) return value.map((item) => canonical(item, depth + 1));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, item]) => [key, canonical(item, depth + 1)]),
    );
  return value;
}

export function nextMessageKey(message: unknown, counts: Map<string, number>): string | undefined {
  try {
    const serialized = JSON.stringify(canonical(message));
    if (serialized === undefined) return undefined;
    const digest = createHash("sha256").update(serialized).digest("hex");
    if (!counts.has(digest) && counts.size >= 100_000) return undefined;
    const occurrence = (counts.get(digest) ?? 0) + 1;
    counts.set(digest, occurrence);
    return `${digest}:${occurrence}`;
  } catch {
    // Unprojectable identities never suppress live content.
    return undefined;
  }
}

export function savedMessageKeys(entries: readonly PiEntry[]): {
  keys: Map<string, string>;
  counts: Map<string, number>;
} {
  const keys = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const message = entry.message;
    if (
      entry.type !== "message" ||
      !message ||
      typeof message !== "object" ||
      !("role" in message) ||
      message.role !== "assistant"
    )
      continue;
    const key = nextMessageKey(message, counts);
    if (key) keys.set(entry.id, key);
  }
  return { keys, counts };
}
