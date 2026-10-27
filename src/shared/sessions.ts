import { isThinkingLevel, type ThinkingLevel } from "./thinking.ts";

export const SESSION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export interface RuntimeConfiguration {
  executable: string;
  entryPoint?: string;
}

export interface SessionCreateRequest {
  requestId: string;
  directory: string;
  provider?: string;
  model?: string;
}

export interface SessionModelRequest {
  provider: string;
  model: string;
  thinkingLevel?: ThinkingLevel;
}

export interface SessionInfo {
  id: string;
  directory: string;
  provider: string | null;
  model: string | null;
  thinkingLevel: ThinkingLevel | null;
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
    (value.provider === null ||
      (typeof value.provider === "string" && value.provider.length > 0)) &&
    "model" in value &&
    (value.model === null || (typeof value.model === "string" && value.model.length > 0)) &&
    "thinkingLevel" in value &&
    (value.thinkingLevel === null || isThinkingLevel(value.thinkingLevel)) &&
    ((value.provider === null && value.model === null) ||
      (typeof value.provider === "string" && typeof value.model === "string")) &&
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
      (typeof value.latestTurnId === "string" && SESSION_ID.test(value.latestTurnId))) &&
    (value.status !== "ready" ||
      (typeof value.provider === "string" && typeof value.model === "string"))
  );
}

export function isSessionModelRequest(value: unknown): value is SessionModelRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return (
    (Object.keys(value).length === 2 || Object.keys(value).length === 3) &&
    Object.hasOwn(value, "provider") &&
    Object.hasOwn(value, "model") &&
    Object.keys(value).every(
      (key) => key === "provider" || key === "model" || key === "thinkingLevel",
    ) &&
    "provider" in value &&
    typeof value.provider === "string" &&
    value.provider.length > 0 &&
    value.provider.length <= 200 &&
    "model" in value &&
    typeof value.model === "string" &&
    value.model.length > 0 &&
    value.model.length <= 300 &&
    (!Object.hasOwn(value, "thinkingLevel") ||
      ("thinkingLevel" in value && isThinkingLevel(value.thinkingLevel)))
  );
}
