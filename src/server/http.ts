import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { HOST_PAGE, STYLE } from "../clients/web/page.ts";
import { BROWSER_SCRIPT } from "../clients/web/script.ts";
import { dataDirectory, type HostMode } from "../local/paths.ts";
import { DEFAULT_PORT, type HostStatus } from "../shared/protocol.ts";
import { AccessError, LocalAuth, SESSION_MS } from "./auth.ts";

export interface HostOptions {
  /** Internal embedding/test seam. The public CLI always uses DEFAULT_PORT. */
  port?: number;
  dataDir?: string;
  mode?: HostMode;
  now?: () => number;
}
export interface RunningHost {
  url: string;
  close(): Promise<void>;
}

function fail(status: number, code: string, message: string): never {
  throw new AccessError(status, code, message);
}
function cookieToken(request: IncomingMessage, name: string): string | undefined {
  const values = (request.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (values.length !== 1) return undefined;
  return values[0]?.slice(name.length + 1);
}
function browserRequest(request: IncomingMessage, origin: string): void {
  if (request.headers.origin !== origin || request.headers["x-dwell-request"] !== "1") {
    fail(403, "forbidden_origin", "Open Dwell at its local address to perform this operation.");
  }
}
async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers["content-type"] ?? "")
  ) {
    fail(415, "unsupported_media_type", "Use application/json.");
  }
  if (request.headers["content-encoding"] !== undefined)
    fail(415, "unsupported_encoding", "Compressed request bodies are not supported.");
  const limit = 8192;
  if (Number(request.headers["content-length"] ?? 0) > limit)
    fail(413, "body_too_large", "Request body exceeds 8 KiB.");
  const text = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    request.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > limit) {
        reject(new AccessError(413, "body_too_large", "Request body exceeds 8 KiB."));
        return;
      }
      chunks.push(chunk);
    });
    request.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.once("error", reject);
    request.once("aborted", () =>
      reject(new AccessError(400, "aborted", "Request was interrupted.")),
    );
  });
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail(400, "invalid_json", "Request body must contain valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(400, "invalid_input", "Request body must be a JSON object.");
  return Object.fromEntries(Object.entries(value));
}
function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status);
  response.end(JSON.stringify(body));
}

export async function startHost({
  port = DEFAULT_PORT,
  mode = "production",
  dataDir = dataDirectory(mode),
  now = Date.now,
}: HostOptions = {}): Promise<RunningHost> {
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Port must be an integer between 0 and 65535.");
  const status: HostStatus = {
    service: "pi-dwell",
    protocolVersion: 1,
    phase: "scaffold",
    startedAt: new Date().toISOString(),
    capabilities: { sessions: false, tasks: false },
    processId: process.pid,
    instanceId: randomUUID(),
    mode,
  };
  let auth: LocalAuth | undefined;
  let url = "";
  let stopping = false;
  const cookieName = `dwell_browser_${mode}`;
  const cookie = (token: string, maxAge: number) =>
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
  const active = new Set<Promise<void>>();

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    try {
      for (const header of [
        "host",
        "origin",
        "authorization",
        "cookie",
        "x-dwell-request",
        "x-dwell-browser",
      ]) {
        if (
          request.rawHeaders.filter(
            (item, index) => index % 2 === 0 && item.toLowerCase() === header,
          ).length > 1
        )
          fail(400, "duplicate_header", "Duplicate request header.");
      }
      if (request.headers.host !== url.slice("http://".length))
        fail(403, "forbidden_host", "Use the canonical Dwell loopback address.");
      if (request.headers.origin !== undefined && request.headers.origin !== url)
        fail(403, "forbidden_origin", "Cross-origin requests are not allowed.");
      if (!auth || stopping)
        fail(503, "unavailable", "Dwell is starting or stopping. Try again shortly.");
      const path = request.url ?? "";
      if (path.length > 2048) fail(414, "url_too_long", "Request URL is too long.");
      if (path.includes("?")) fail(400, "unexpected_query", "Query parameters are not supported.");
      const gets = ["/", "/client.js", "/style.css", "/healthz", "/api/v1/status"];
      const posts = [
        "/api/v1/auth/pairings",
        "/api/v1/auth/pair",
        "/api/v1/auth/logout",
        "/api/v1/auth/revoke",
      ];
      const method = gets.includes(path) ? "GET" : posts.includes(path) ? "POST" : undefined;
      if (!method) fail(404, "not_found", "Unknown route.");
      if (request.method !== method) {
        response.setHeader("Allow", method);
        fail(405, "method_not_allowed", `Use ${method} for this route.`);
      }
      if (method === "GET") {
        if (
          request.headers["transfer-encoding"] !== undefined ||
          Number(request.headers["content-length"] ?? 0) !== 0
        )
          fail(400, "unexpected_body", "GET requests must not contain a body.");
        if (path === "/healthz") {
          send(response, 200, { status: "ok" });
          return;
        }
        if (path === "/" || path === "/client.js" || path === "/style.css") {
          response.setHeader(
            "Content-Type",
            path === "/"
              ? "text/html; charset=utf-8"
              : path === "/client.js"
                ? "text/javascript; charset=utf-8"
                : "text/css; charset=utf-8",
          );
          response.end(path === "/" ? HOST_PAGE : path === "/client.js" ? BROWSER_SCRIPT : STYLE);
          return;
        }
        if (
          !auth.isCli(request.headers.authorization) &&
          !auth.isBrowser(cookieToken(request, cookieName), request.headers["x-dwell-browser"])
        )
          fail(401, "unauthenticated", "Connect this browser or use a valid local CLI credential.");
        send(response, 200, status);
        return;
      }
      if (path === "/api/v1/auth/pairings" || path === "/api/v1/auth/revoke") {
        if (!auth.isCli(request.headers.authorization))
          fail(401, "unauthenticated", "This operation requires the local CLI credential.");
      } else {
        browserRequest(request, url);
      }
      const body = await readJson(request);
      if (stopping) fail(503, "unavailable", "Dwell is stopping.");
      if (path === "/api/v1/auth/pair") {
        if (
          Object.keys(body).length !== 2 ||
          typeof body.code !== "string" ||
          !/^[a-f0-9]{32}$/.test(body.code) ||
          typeof body.browserKey !== "string" ||
          !/^[a-f0-9]{64}$/.test(body.browserKey)
        )
          fail(400, "invalid_input", "Enter the 32-character pairing code from the local CLI.");
        const token = await auth.redeem(body.code, body.browserKey);
        response.setHeader("Set-Cookie", cookie(token, SESSION_MS / 1000));
      } else {
        if (Object.keys(body).length !== 0)
          fail(400, "invalid_input", "This operation expects an empty JSON object.");
        if (path === "/api/v1/auth/pairings") {
          send(response, 201, auth.createPairing());
          return;
        }
        if (path === "/api/v1/auth/revoke") await auth.revoke();
        else {
          const token = cookieToken(request, cookieName);
          if (!token || !auth.isBrowser(token, request.headers["x-dwell-browser"]))
            fail(401, "unauthenticated", "This browser session has expired or been revoked.");
          await auth.logout(token);
          response.setHeader("Set-Cookie", cookie("", 0));
        }
      }
      send(response, 200, { ok: true });
    } catch (error) {
      if (response.destroyed) return;
      response.setHeader("Connection", "close");
      if (error instanceof AccessError) {
        if (error.status === 429)
          response.setHeader("Retry-After", error.code === "pairing_limit" ? "300" : "60");
        send(response, error.status, { error: { code: error.code, message: error.message } });
      } else
        send(response, 500, {
          error: { code: "internal_error", message: "Dwell could not complete the request." },
        });
    }
  }
  const server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
    const operation = handle(request, response);
    active.add(operation);
    void operation.then(
      () => active.delete(operation),
      () => active.delete(operation),
    );
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.setTimeout(5000, (socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Host did not bind a TCP address.");
  }
  url = `http://127.0.0.1:${address.port}`;
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    if (!closing) {
      stopping = true;
      closing = (async () => {
        server.closeAllConnections();
        await Promise.all(active);
        await auth?.drain();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        server.closeAllConnections();
      })();
    }
    return closing;
  };
  try {
    auth = await LocalAuth.open(dataDir, now);
  } catch (error) {
    await close();
    throw error;
  }
  return { url, close };
}
