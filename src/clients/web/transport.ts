/// <reference lib="dom" />
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function headers(): Headers {
  return new Headers({ Accept: "application/json", "X-Dwell-Request": "1" });
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
export async function api(
  path: string,
  body?: unknown,
  method: "GET" | "POST" | "DELETE" = body === undefined ? "GET" : "POST",
): Promise<unknown> {
  const requestHeaders = headers();
  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }
  const response = await fetch(path, {
    method,
    headers: requestHeaders,
    mode: "same-origin",
    credentials: "omit",
    cache: "no-store",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(method === "GET" ? 15_000 : 60_000),
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}
export function message(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}
