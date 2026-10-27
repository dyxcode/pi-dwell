import { type ImageContent, isImageContentArray } from "./images.ts";

export type TurnStatus =
  | "accepted"
  | "dispatching"
  | "running"
  | "completed"
  | "failed"
  | "aborted"
  | "interrupted";

export interface TurnError {
  code: string;
  message: string;
}

export interface TurnCreateRequest {
  requestId: string;
  message: string;
  images?: ImageContent[];
}

export interface TurnInfo {
  runId: string;
  sessionId: string;
  requestId: string;
  status: TurnStatus;
  cancellationRequested: boolean;
  createdAt: number;
  updatedAt: number;
  error: TurnError | null;
  entryIds: string[];
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const TURN_STATUSES = new Set<string>([
  "accepted",
  "dispatching",
  "running",
  "completed",
  "failed",
  "aborted",
  "interrupted",
]);
const TURN_INFO_KEYS = [
  "runId",
  "sessionId",
  "requestId",
  "status",
  "cancellationRequested",
  "createdAt",
  "updatedAt",
  "error",
  "entryIds",
] as const;

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isTurnError(value: unknown): value is TurnError {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    hasExactKeys(value, ["code", "message"]) &&
    "code" in value &&
    typeof value.code === "string" &&
    value.code.trim().length > 0 &&
    "message" in value &&
    typeof value.message === "string" &&
    value.message.trim().length > 0
  );
}

export function isTurnCreateRequest(value: unknown): value is TurnCreateRequest {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("requestId" in value) ||
    !isUuid(value.requestId) ||
    !("message" in value) ||
    typeof value.message !== "string"
  ) {
    return false;
  }
  const hasImages = Object.hasOwn(value, "images");
  if (
    !hasExactKeys(
      value,
      hasImages ? ["requestId", "message", "images"] : ["requestId", "message"],
    ) ||
    (hasImages && !("images" in value && isImageContentArray(value.images)))
  )
    return false;
  return (
    (value.message.trim().length > 0 ||
      (hasImages && "images" in value && Array.isArray(value.images) && value.images.length > 0)) &&
    new TextEncoder().encode(value.message).byteLength <= 8192 &&
    !value.message.trimStart().startsWith("/")
  );
}

export function isTurnInfo(value: unknown): value is TurnInfo {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !hasExactKeys(value, TURN_INFO_KEYS) ||
    !("runId" in value) ||
    !isUuid(value.runId) ||
    !("sessionId" in value) ||
    !isUuid(value.sessionId) ||
    !("requestId" in value) ||
    !isUuid(value.requestId) ||
    !("status" in value) ||
    typeof value.status !== "string" ||
    !TURN_STATUSES.has(value.status) ||
    !("cancellationRequested" in value) ||
    typeof value.cancellationRequested !== "boolean" ||
    !("createdAt" in value) ||
    !isTimestamp(value.createdAt) ||
    !("updatedAt" in value) ||
    !isTimestamp(value.updatedAt) ||
    !("error" in value) ||
    (value.error !== null && !isTurnError(value.error)) ||
    !("entryIds" in value) ||
    !Array.isArray(value.entryIds)
  ) {
    return false;
  }

  for (let index = 0; index < value.entryIds.length; index += 1) {
    if (!Object.hasOwn(value.entryIds, index)) return false;
    const entryId: unknown = value.entryIds[index];
    if (typeof entryId !== "string" || entryId.length === 0) return false;
  }
  return true;
}
