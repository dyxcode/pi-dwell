import { readCredential } from "../../local/files.ts";
import { dataDirectory } from "../../local/paths.ts";
import { DEFAULT_PORT, type HostStatus, isHostStatus } from "../../shared/protocol.ts";

export interface ClientOptions {
  port?: number;
  dataDir?: string;
  timeoutMs?: number;
}

export async function localRequest(
  path: string,
  options: ClientOptions = {},
  method = "GET",
): Promise<unknown> {
  const { port = DEFAULT_PORT, dataDir = dataDirectory(), timeoutMs = 3000 } = options;
  const token = await readCredential(dataDir);
  const url = `http://127.0.0.1:${port}`;
  let response: Response;
  try {
    response = await fetch(`${url}${path}`, {
      method,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(method === "POST" ? { body: "{}" } : {}),
    });
  } catch (error) {
    throw new Error(
      `Cannot reach pi-dwell at ${url}. Start it with npm start or npm run dwell -- service start.`,
      { cause: error },
    );
  }
  if (response.status === 401)
    throw new Error(
      "Dwell rejected the local credential. Check that the CLI and host use the same development/production mode.",
    );
  if (!response.ok)
    throw new Error(`Dwell returned HTTP ${response.status}. Check the host status and try again.`);
  try {
    return await response.json();
  } catch {
    throw new Error("Incompatible pi-dwell host response.");
  }
}

export async function readHostStatus(options: ClientOptions = {}): Promise<HostStatus> {
  const value = await localRequest("/api/v1/status", options);
  if (!isHostStatus(value)) throw new Error("Incompatible pi-dwell host status.");
  return value;
}

export async function createPairing(
  options: ClientOptions = {},
): Promise<{ code: string; expiresAt: number }> {
  const value = await localRequest("/api/v1/auth/pairings", options, "POST");
  if (
    !value ||
    typeof value !== "object" ||
    !("code" in value) ||
    typeof value.code !== "string" ||
    !/^[a-f0-9]{32}$/.test(value.code) ||
    !("expiresAt" in value) ||
    typeof value.expiresAt !== "number" ||
    !Number.isSafeInteger(value.expiresAt)
  ) {
    throw new Error("Incompatible pairing response.");
  }
  return { code: value.code, expiresAt: value.expiresAt };
}

export async function revokeBrowsers(options: ClientOptions = {}): Promise<void> {
  const value = await localRequest("/api/v1/auth/revoke", options, "POST");
  if (!value || typeof value !== "object" || !("ok" in value) || value.ok !== true)
    throw new Error("Incompatible revocation response.");
}
