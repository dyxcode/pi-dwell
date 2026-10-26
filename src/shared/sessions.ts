export const SESSION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export interface RuntimeConfiguration {
  executable: string;
  entryPoint?: string;
}

export interface SessionCreateRequest {
  requestId: string;
  directory: string;
  provider: string;
  model: string;
}

export interface SessionInfo {
  id: string;
  directory: string;
  provider: string;
  model: string;
  piSessionId: string;
  createdAt: number;
  updatedAt: number;
  status: "creating" | "ready" | "failed" | "interrupted";
  runtimeState: "closed" | "opening" | "ready" | "failed" | "closing";
  historyState: "empty" | "available" | "unavailable";
  error: string | null;
  activeTurnId: string | null;
  latestTurnId: string | null;
}

export function isRuntimeConfiguration(value: unknown): value is RuntimeConfiguration {
  return (
    typeof value === "object" &&
    value !== null &&
    "executable" in value &&
    typeof value.executable === "string" &&
    value.executable.length > 0 &&
    (!("entryPoint" in value) ||
      (typeof value.entryPoint === "string" && value.entryPoint.length > 0))
  );
}

export function isSessionInfo(value: unknown): value is SessionInfo {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    SESSION_ID.test(value.id) &&
    "piSessionId" in value &&
    typeof value.piSessionId === "string" &&
    SESSION_ID.test(value.piSessionId) &&
    "directory" in value &&
    typeof value.directory === "string" &&
    "provider" in value &&
    typeof value.provider === "string" &&
    "model" in value &&
    typeof value.model === "string" &&
    "createdAt" in value &&
    typeof value.createdAt === "number" &&
    Number.isSafeInteger(value.createdAt) &&
    "updatedAt" in value &&
    typeof value.updatedAt === "number" &&
    Number.isSafeInteger(value.updatedAt) &&
    "status" in value &&
    typeof value.status === "string" &&
    ["creating", "ready", "failed", "interrupted"].includes(value.status) &&
    "runtimeState" in value &&
    typeof value.runtimeState === "string" &&
    ["closed", "opening", "ready", "failed", "closing"].includes(value.runtimeState) &&
    "historyState" in value &&
    typeof value.historyState === "string" &&
    ["empty", "available", "unavailable"].includes(value.historyState) &&
    "error" in value &&
    (value.error === null || typeof value.error === "string") &&
    "activeTurnId" in value &&
    (value.activeTurnId === null ||
      (typeof value.activeTurnId === "string" && SESSION_ID.test(value.activeTurnId))) &&
    "latestTurnId" in value &&
    (value.latestTurnId === null ||
      (typeof value.latestTurnId === "string" && SESSION_ID.test(value.latestTurnId)))
  );
}
