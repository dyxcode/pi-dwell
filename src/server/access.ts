import { join } from "node:path";
import type { IncomingHttpHeaders } from "node:http";
import { readPrivateFile } from "../local/files.ts";
import { hasCode, type HostMode } from "../local/paths.ts";
import { AccessError } from "./auth.ts";

/** Optional production-only browser origin; TLS terminates at the local proxy. */
export async function readBrowserOrigin(
  dataDir: string,
  mode: HostMode,
): Promise<string | undefined> {
  if (mode !== "production") return undefined;
  let text: string;
  try {
    text = await readPrivateFile(join(dataDir, "access.json"));
  } catch (error) {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  }
  const invalid = () =>
    new Error(
      "Invalid access.json. Expected version 1 and one canonical HTTPS browserOrigin without a path, query, or fragment.",
    );
  if (text.length > 4096) throw invalid();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw invalid();
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("version" in value) ||
    value.version !== 1 ||
    !("browserOrigin" in value) ||
    typeof value.browserOrigin !== "string" ||
    Object.keys(value).length !== 2
  )
    throw invalid();
  let url: URL;
  try {
    url = new URL(value.browserOrigin);
  } catch {
    throw invalid();
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== value.browserOrigin ||
    !url.hostname ||
    url.hostname.includes("*")
  )
    throw invalid();
  return url.origin;
}

export interface RequestAccess {
  origin: string;
  proxied: boolean;
}

/** The private proxy enforces remote network access; forwarded fields are not identity. */
export function requestAccess(
  headers: IncomingHttpHeaders,
  localOrigin: string,
  browserOrigin: string | undefined,
): RequestAccess {
  const host = headers.host;
  if (host === new URL(localOrigin).host) {
    // Serve preserves arbitrary incoming Host but injects X-Forwarded-* even
    // for tagged devices. A proxied request must never select the local lane.
    if (
      Object.keys(headers).some((name) => name === "forwarded" || name.startsWith("x-forwarded-"))
    )
      throw new AccessError(
        403,
        "forbidden_proxy",
        "Proxy requests must use the configured HTTPS address.",
      );
    return { origin: localOrigin, proxied: false };
  }
  if (browserOrigin && host === new URL(browserOrigin).host) {
    if (headers["tailscale-funnel-request"] !== undefined)
      throw new AccessError(403, "forbidden_proxy", "Public Funnel is not supported.");
    if (headers["x-forwarded-proto"] !== "https")
      throw new AccessError(403, "forbidden_proxy", "Use the configured HTTPS proxy.");
    return { origin: browserOrigin, proxied: true };
  }
  throw new AccessError(
    403,
    "forbidden_host",
    "Open Dwell at its local or configured HTTPS address.",
  );
}
