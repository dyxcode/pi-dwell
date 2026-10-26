import {
  isRuntimeConfiguration,
  isSessionInfo,
  type RuntimeConfiguration,
  type SessionCreateRequest,
  type SessionInfo,
} from "../../shared/sessions.ts";
import { type ClientOptions, localRequest } from "./status.ts";

const SESSION_REQUEST_TIMEOUT_MS = 60_000;

function sessionOptions(options: ClientOptions): ClientOptions {
  return {
    ...options,
    timeoutMs: Math.max(options.timeoutMs ?? 0, SESSION_REQUEST_TIMEOUT_MS),
  };
}

export async function configureRuntime(
  options: ClientOptions,
  configuration: RuntimeConfiguration,
): Promise<RuntimeConfiguration> {
  const value = await localRequest(
    "/api/v1/runtime",
    sessionOptions(options),
    "POST",
    configuration,
  );
  if (!isRuntimeConfiguration(value))
    throw new Error("Incompatible pi-dwell runtime configuration response.");
  return value;
}

export async function createHostedSession(
  options: ClientOptions,
  request: SessionCreateRequest,
): Promise<SessionInfo> {
  let value: unknown;
  try {
    value = await localRequest("/api/v1/sessions", sessionOptions(options), "POST", request);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith("Cannot reach") || error.message.includes("timed out"))
    ) {
      throw new Error(
        `${error.message} Creation may already be admitted. Retry with --request-id ${request.requestId} and the same settings.`,
        { cause: error },
      );
    }
    throw error;
  }
  if (!isSessionInfo(value)) throw new Error("Incompatible pi-dwell session response.");
  return value;
}

export async function listHostedSessions(options: ClientOptions): Promise<SessionInfo[]> {
  const value = await localRequest("/api/v1/sessions", sessionOptions(options));
  if (!Array.isArray(value) || !value.every(isSessionInfo))
    throw new Error("Incompatible pi-dwell session list response.");
  return value;
}

export async function readHostedSession(
  options: ClientOptions,
  sessionId: string,
): Promise<SessionInfo> {
  return readSession(options, sessionId);
}

export async function openHostedSession(
  options: ClientOptions,
  sessionId: string,
): Promise<SessionInfo> {
  return mutateSession(options, sessionId, "open");
}

export async function closeHostedSession(
  options: ClientOptions,
  sessionId: string,
): Promise<SessionInfo> {
  return mutateSession(options, sessionId, "close");
}

async function readSession(options: ClientOptions, sessionId: string): Promise<SessionInfo> {
  const value = await localRequest(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}`,
    sessionOptions(options),
  );
  if (!isSessionInfo(value)) throw new Error("Incompatible pi-dwell session response.");
  return value;
}

async function mutateSession(
  options: ClientOptions,
  sessionId: string,
  action: "open" | "close",
): Promise<SessionInfo> {
  const value = await localRequest(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/${action}`,
    sessionOptions(options),
    "POST",
    {},
  );
  if (!isSessionInfo(value)) throw new Error("Incompatible pi-dwell session response.");
  return value;
}
