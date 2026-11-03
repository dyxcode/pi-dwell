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

export const MAX_SESSION_NAME_LENGTH = 80;

export interface SessionNameRequest {
  displayName: string | null;
  expectedRevision: number;
}

export interface NativeExecutionInfo {
  /** Ephemeral Pi execution identity; it does not identify a Dwell request or durable turn. */
  id: string;
  status: "running" | "completed" | "failed" | "aborted" | "interrupted";
  error: string | null;
}

export type HistoryCheckState = "not-created" | "readable" | "missing" | "invalid";

export interface HistoryCheck {
  state: HistoryCheckState;
  checkedAt: number;
}

export interface SessionInfo {
  id: string;
  displayName: string | null;
  metadataRevision: number;
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
  /** Last complete observation of the native history file; absent means unchecked. */
  historyCheck?: HistoryCheck;
  error: string | null;
  /** Current or most recent native Pi extension execution; absent on older protocol fixtures. */
  nativeExecution?: NativeExecutionInfo | null;
  activeTurnId: string | null;
  latestTurnId: string | null;
}

export function mergeSessionMetadata(current: SessionInfo, incoming: SessionInfo): SessionInfo {
  if (current.id !== incoming.id || incoming.metadataRevision >= current.metadataRevision)
    return incoming;
  return {
    ...incoming,
    displayName: current.displayName,
    metadataRevision: current.metadataRevision,
  };
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
    "displayName" in value &&
    isSessionDisplayName(value.displayName) &&
    "metadataRevision" in value &&
    typeof value.metadataRevision === "number" &&
    Number.isSafeInteger(value.metadataRevision) &&
    value.metadataRevision >= 0 &&
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
    (!Object.hasOwn(value, "historyCheck") ||
      ("historyCheck" in value && isHistoryCheck(value.historyCheck))) &&
    "error" in value &&
    (value.error === null || typeof value.error === "string") &&
    (!Object.hasOwn(value, "nativeExecution") ||
      ("nativeExecution" in value &&
        (value.nativeExecution === null || isNativeExecutionInfo(value.nativeExecution)))) &&
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

export function isSessionDisplayName(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value.length > 0 &&
      !value.includes("\0") &&
      value.trim() === value &&
      Array.from(value).length <= MAX_SESSION_NAME_LENGTH)
  );
}

export function isSessionNameRequest(value: unknown): value is SessionNameRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 2 &&
    Object.hasOwn(value, "displayName") &&
    Object.hasOwn(value, "expectedRevision") &&
    "displayName" in value &&
    (value.displayName === null ||
      (typeof value.displayName === "string" &&
        !value.displayName.includes("\0") &&
        value.displayName.trim().length > 0 &&
        Array.from(value.displayName.trim()).length <= MAX_SESSION_NAME_LENGTH)) &&
    "expectedRevision" in value &&
    typeof value.expectedRevision === "number" &&
    Number.isSafeInteger(value.expectedRevision) &&
    value.expectedRevision >= 0
  );
}

export function isHistoryCheck(value: unknown): value is HistoryCheck {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return (
    Object.keys(value).length === 2 &&
    Object.hasOwn(value, "state") &&
    Object.hasOwn(value, "checkedAt") &&
    "state" in value &&
    typeof value.state === "string" &&
    ["not-created", "readable", "missing", "invalid"].includes(value.state) &&
    "checkedAt" in value &&
    typeof value.checkedAt === "number" &&
    Number.isSafeInteger(value.checkedAt)
  );
}

function isNativeExecutionInfo(value: unknown): value is NativeExecutionInfo {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const fields = ["id", "status", "error"];
  return (
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field)) &&
    "id" in value &&
    typeof value.id === "string" &&
    SESSION_ID.test(value.id) &&
    "status" in value &&
    typeof value.status === "string" &&
    ["running", "completed", "failed", "aborted", "interrupted"].includes(value.status) &&
    "error" in value &&
    (value.error === null ||
      (typeof value.error === "string" && new TextEncoder().encode(value.error).byteLength <= 2048))
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
