import type { PiSessionModelOption } from "../shared/discovery.ts";
import { THINKING_LEVELS, type ThinkingLevel } from "../shared/thinking.ts";
import { isRecord } from "./pi-rpc.ts";

/** Whitelist public capability metadata from the loaded Pi 1.4 model registry. */
export function parsePiSessionModels(value: unknown): PiSessionModelOption[] {
  const invalid = () => new Error("Pi returned invalid session model metadata.");
  if (!isRecord(value) || !Array.isArray(value.models) || value.models.length > 10_000)
    throw invalid();
  const seen = new Set<string>();
  const models: PiSessionModelOption[] = [];
  for (const item of value.models) {
    if (
      !isRecord(item) ||
      typeof item.provider !== "string" ||
      !item.provider ||
      item.provider.length > 200 ||
      typeof item.id !== "string" ||
      !item.id ||
      item.id.length > 300 ||
      typeof item.reasoning !== "boolean" ||
      !Array.isArray(item.input) ||
      !item.input.every((input: unknown) => typeof input === "string")
    )
      throw invalid();
    const key = JSON.stringify([item.provider, item.id]);
    if (seen.has(key)) throw invalid();
    seen.add(key);
    const map = item.thinkingLevelMap;
    if (
      map !== undefined &&
      (!isRecord(map) ||
        Object.values(map).some((level) => level !== null && typeof level !== "string"))
    )
      throw invalid();
    // Pi's registry marks disabled levels with null; extended levels require an explicit mapping.
    const thinkingLevels: ThinkingLevel[] = [];
    if (!item.reasoning) thinkingLevels.push("off");
    else
      for (const level of THINKING_LEVELS) {
        const mapped = isRecord(map) ? map[level] : undefined;
        if (mapped === null || ((level === "xhigh" || level === "max") && mapped === undefined))
          continue;
        thinkingLevels.push(level);
      }
    if (thinkingLevels.length === 0) throw invalid();
    models.push({
      provider: item.provider,
      id: item.id,
      supportsImages: item.input.includes("image"),
      thinkingLevels,
    });
  }
  if (Buffer.byteLength(JSON.stringify(models)) > 1024 * 1024)
    throw new Error("Pi session model metadata exceeds the response limit.");
  return models;
}
