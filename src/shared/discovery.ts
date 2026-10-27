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
