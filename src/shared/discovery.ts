import { SESSION_ID } from "./sessions.ts";
import { isThinkingLevel, type ThinkingLevel } from "./thinking.ts";

export interface HostDirectoryEntry {
  name: string;
  path: string;
}

export interface HostDirectoryListing {
  path: string;
  parent: string | null;
  directories: HostDirectoryEntry[];
  truncated: boolean;
}

export interface PiModelOption {
  provider: string;
  id: string;
  supportsImages?: boolean;
}

export interface AvailableModelsResponse {
  models: PiModelOption[];
}

export interface PiSessionModelOption extends PiModelOption {
  supportsImages: boolean;
  thinkingLevels: ThinkingLevel[];
}

export interface SessionModelsResponse {
  sessionId: string;
  models: PiSessionModelOption[];
}

export function isSessionModelsResponse(value: unknown): value is SessionModelsResponse {
  return (
    isObject(value) &&
    typeof value.sessionId === "string" &&
    SESSION_ID.test(value.sessionId) &&
    Array.isArray(value.models) &&
    value.models.length <= 10_000 &&
    value.models.every(
      (item: unknown) =>
        isModelOption(item) &&
        isObject(item) &&
        typeof item.supportsImages === "boolean" &&
        Array.isArray(item.thinkingLevels) &&
        item.thinkingLevels.length > 0 &&
        item.thinkingLevels.length <= 7 &&
        item.thinkingLevels.every(isThinkingLevel) &&
        new Set(item.thinkingLevels).size === item.thinkingLevels.length,
    )
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbsolutePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\"))
  );
}

function isModelOption(value: unknown): value is PiModelOption {
  return (
    isObject(value) &&
    typeof value.provider === "string" &&
    value.provider.length > 0 &&
    value.provider.length <= 200 &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= 300 &&
    (value.supportsImages === undefined || typeof value.supportsImages === "boolean")
  );
}

export function isHostDirectoryListing(value: unknown): value is HostDirectoryListing {
  if (
    !isObject(value) ||
    !isAbsolutePath(value.path) ||
    (value.parent !== null && !isAbsolutePath(value.parent)) ||
    !Array.isArray(value.directories) ||
    value.directories.length > 500 ||
    typeof value.truncated !== "boolean"
  ) {
    return false;
  }
  return value.directories.every(
    (entry) =>
      isObject(entry) &&
      typeof entry.name === "string" &&
      entry.name.length > 0 &&
      entry.name.length <= 255 &&
      isAbsolutePath(entry.path),
  );
}

export function isAvailableModelsResponse(value: unknown): value is AvailableModelsResponse {
  if (!isObject(value) || !Array.isArray(value.models) || value.models.length > 10_000)
    return false;
  return value.models.every(isModelOption);
}
