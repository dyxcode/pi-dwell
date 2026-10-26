/// <reference lib="dom" />
export const BINDING_KEY = "dwell.browser-binding.v1";
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function binding(create = false): string | null {
  try {
    let value = localStorage.getItem(BINDING_KEY);
    if (value && !/^[a-f0-9]{64}$/.test(value)) value = null;
    if (!value && create) {
      value = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join("");
      localStorage.setItem(BINDING_KEY, value);
      if (localStorage.getItem(BINDING_KEY) !== value)
        throw new Error("Storage verification failed.");
    }
    return value;
  } catch {
    throw new ApiError(
      0,
      "storage",
      "Browser storage is unavailable. Enable storage for this site, then retry.",
    );
  }
}
export function headers(): Headers {
  const result = new Headers({ Accept: "application/json" });
  const key = binding();
  if (key) result.set("X-Dwell-Browser", key);
  return result;
}
export async function responseError(response: Response): Promise<ApiError> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    /* bounded generic failure below */
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "object" &&
    value.error !== null &&
    "message" in value.error &&
    typeof value.error.message === "string" &&
    "code" in value.error &&
    typeof value.error.code === "string"
  )
    return new ApiError(response.status, value.error.code, value.error.message);
  return new ApiError(response.status, "http", `The host returned HTTP ${response.status}.`);
}
export async function api(path: string, body?: unknown): Promise<unknown> {
  const requestHeaders = headers();
  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
    requestHeaders.set("X-Dwell-Request", "1");
  }
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: requestHeaders,
    credentials: binding() ? "same-origin" : "omit",
    cache: "no-store",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(body === undefined ? 15_000 : 60_000),
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}
export function message(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}
