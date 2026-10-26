import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { HOST_PAGE, STYLE } from "../clients/web/page.ts";
import { prepareDataDirectory } from "../local/files.ts";
import { BROWSER_ASSETS } from "../clients/web/script.ts";
import { dataDirectory, type HostMode } from "../local/paths.ts";
import { SessionError, SessionService, type SessionServiceOptions } from "../sessions/service.ts";
import { DEFAULT_PORT, type HostStatus } from "../shared/protocol.ts";
import { isRuntimeConfiguration } from "../shared/sessions.ts";
import { isTurnCreateRequest } from "../shared/turns.ts";
import { AccessError, LocalAuth, SESSION_MS } from "./auth.ts";
import { browserCookie, readBrowserOrigin, requestAccess } from "./access.ts";
import { createSseConnection, type SseConnection, SseStartError } from "./sse.ts";

export interface HostOptions {
  /** Internal embedding/test seam. The public CLI always uses DEFAULT_PORT. */
  port?: number;
  dataDir?: string;
  mode?: HostMode;
  now?: () => number;
  sessions?: Pick<SessionServiceOptions, "env" | "extensions">;
  /** Internal test seam for exercising stream expiry and heartbeats. */
  eventHeartbeatMs?: number;
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
    fail(403, "forbidden_origin", "Open Dwell at the address used to connect this browser.");
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
function parseHistoryCursor(query: string): string | undefined {
  const parameters = new URLSearchParams(query);
  const cursors = parameters.getAll("cursor");
  if (cursors.length > 1) fail(400, "invalid_cursor", "Provide at most one history cursor.");
  if ([...parameters].some(([name]) => name !== "cursor") || query.split("&").length !== 1)
    fail(400, "unexpected_query", "Only the history cursor query parameter is supported.");
  if (cursors.length !== 1)
    fail(400, "unexpected_query", "Provide one history cursor query parameter.");
  const cursor = cursors[0];
  if (!cursor || cursor.length > 1536)
    fail(400, "invalid_cursor", "History cursor must contain 1 to 1536 characters.");
  return cursor;
}

export async function startHost({
  port = DEFAULT_PORT,
  mode = "production",
  dataDir = dataDirectory(mode),
  now = Date.now,
  sessions: sessionOptions,
  eventHeartbeatMs,
}: HostOptions = {}): Promise<RunningHost> {
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Port must be an integer between 0 and 65535.");
  const status: HostStatus = {
    service: "pi-dwell",
    protocolVersion: 2,
    phase: "sessions",
    startedAt: new Date().toISOString(),
    capabilities: { sessions: true, tasks: false },
    processId: process.pid,
    instanceId: randomUUID(),
    mode,
  };
  let auth: LocalAuth | undefined;
  let sessions: SessionService | undefined;
  let url = "";
  let stopping = false;
  let browserOrigin: string | undefined;
  const active = new Set<Promise<void>>();
  const eventStreams = new Set<SseConnection>();

  function revalidateEventStreams(): void {
    for (const stream of eventStreams) stream.revalidate();
  }

  function openEventStream(
    request: IncomingMessage,
    response: ServerResponse,
    sessionId: string,
    cursor: string | undefined,
    cookieName: string,
  ): void {
    if (!auth || !sessions) fail(503, "unavailable", "Session service is starting.");
    let stream: SseConnection | undefined;
    stream = createSseConnection(response, {
      ...(eventHeartbeatMs === undefined ? {} : { heartbeatMs: eventHeartbeatMs }),
      isAuthorized: () =>
        Boolean(
          auth &&
            (auth.isCli(request.headers.authorization) ||
              auth.isBrowser(cookieToken(request, cookieName), request.headers["x-dwell-browser"])),
        ),
      onClose: () => {
        if (stream) eventStreams.delete(stream);
      },
    });
    eventStreams.add(stream);
    try {
      const subscription = sessions.subscribeEvents(sessionId, cursor, (frame) =>
        stream?.enqueue(frame),
      );
      stream.start(subscription.initial, subscription.unsubscribe);
    } catch (error) {
      stream.close();
      throw error;
    }
  }

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
        "last-event-id",
      ]) {
        if (
          request.rawHeaders.filter(
            (item, index) => index % 2 === 0 && item.toLowerCase() === header,
          ).length > 1
        )
          fail(400, "duplicate_header", "Duplicate request header.");
      }
      const access = requestAccess(request.headers, url, browserOrigin, mode);
      const { cookieName } = access;
      if (request.headers.origin !== undefined && request.headers.origin !== access.origin)
        fail(403, "forbidden_origin", "Cross-origin requests are not allowed.");
      if (access.secure && request.headers.authorization !== undefined)
        fail(403, "local_credential_required", "Use the local address for CLI credentials.");
      if (!auth || stopping)
        fail(503, "unavailable", "Dwell is starting or stopping. Try again shortly.");
      const requestTarget = request.url ?? "";
      if (requestTarget.length > 2048) fail(414, "url_too_long", "Request URL is too long.");
      const queryStart = requestTarget.indexOf("?");
      const path = queryStart < 0 ? requestTarget : requestTarget.slice(0, queryStart);
      const historyMatch = /^\/api\/v1\/sessions\/([a-f0-9-]+)\/history$/.exec(path);
      let historyCursor: string | undefined;
      let directoryPath: string | undefined;
      if (queryStart >= 0) {
        if (path === "/api/v1/directories") {
          const query = new URLSearchParams(requestTarget.slice(queryStart + 1));
          if ([...query].length !== 1 || !query.has("path"))
            fail(400, "unexpected_query", "Provide one directory path.");
          directoryPath = query.get("path") ?? "";
          if (!directoryPath) fail(400, "invalid_input", "Provide a nonempty directory path.");
        } else {
          if (!historyMatch) fail(400, "unexpected_query", "Query parameters are not supported.");
          historyCursor = parseHistoryCursor(requestTarget.slice(queryStart + 1));
        }
      }
      const gets = ["/", "/style.css", "/healthz", "/api/v1/status", ...BROWSER_ASSETS.keys()];
      const posts = [
        "/api/v1/auth/pairings",
        "/api/v1/auth/pair",
        "/api/v1/auth/logout",
        "/api/v1/auth/revoke",
      ];
      const sessionMatch = /^\/api\/v1\/sessions\/([a-f0-9-]+)(?:\/(open|close|context))?$/.exec(
        path,
      );
      const eventMatch = /^\/api\/v1\/sessions\/([a-f0-9-]+)\/events$/.exec(path);
      const turnMatch =
        /^\/api\/v1\/sessions\/([a-f0-9-]+)\/turns(?:\/([a-f0-9-]+)(?:\/(result|abort))?)?$/.exec(
          path,
        );
      const sessionRoute =
        path === "/api/v1/sessions" ||
        path === "/api/v1/directories" ||
        path === "/api/v1/models" ||
        path === "/api/v1/runtime" ||
        sessionMatch !== null ||
        historyMatch !== null ||
        eventMatch !== null ||
        turnMatch !== null;
      let method: string | undefined;
      if (sessionRoute) {
        if (
          path === "/api/v1/runtime" ||
          sessionMatch?.[2] === "open" ||
          sessionMatch?.[2] === "close"
        ) {
          method = "POST";
        } else if (eventMatch || historyMatch) {
          method = "GET";
        } else if (turnMatch) {
          method = turnMatch[2] === undefined || turnMatch[3] === "abort" ? "POST" : "GET";
        } else if (path === "/api/v1/sessions" && request.method === "POST") {
          method = "POST";
        } else {
          method = "GET";
        }
      } else if (gets.includes(path)) {
        method = "GET";
      } else if (posts.includes(path)) {
        method = "POST";
      }
      if (!method) fail(404, "not_found", "Unknown route.");
      if (request.method !== method) {
        response.setHeader("Allow", method);
        fail(405, "method_not_allowed", `Use ${method} for this route.`);
      }
      if (sessionRoute) {
        if (!sessions) fail(503, "unavailable", "Session service is starting.");
        const cli = auth.isCli(request.headers.authorization);
        if (
          !cli &&
          !auth.isBrowser(cookieToken(request, cookieName), request.headers["x-dwell-browser"])
        )
          fail(401, "unauthenticated", "Connect this browser or use a valid local CLI credential.");
        if (
          method === "GET" &&
          (request.headers["transfer-encoding"] !== undefined ||
            Number(request.headers["content-length"] ?? 0) !== 0)
        )
          fail(400, "unexpected_body", "GET requests must not contain a body.");
        if (path === "/api/v1/runtime" && !cli)
          fail(
            403,
            "cli_required",
            "Pi executable configuration requires the local CLI credential.",
          );
        if (method === "POST" && !cli) browserRequest(request, access.origin);
        const body = method === "POST" ? await readJson(request) : {};
        if (stopping) fail(503, "unavailable", "Dwell is stopping.");
        // Body/header deadlines remain bounded; admitted RPC work has its own deadlines.
        request.socket.setTimeout(0);
        if (path === "/api/v1/runtime") {
          if (
            !isRuntimeConfiguration(body) ||
            !Object.keys(body).every((key) => key === "executable" || key === "entryPoint")
          )
            fail(400, "invalid_input", "Provide the Pi executable and optional entryPoint.");
          send(response, 200, await sessions.configure(body));
        } else if (path === "/api/v1/directories") {
          send(response, 200, await sessions.listDirectories(directoryPath));
        } else if (path === "/api/v1/models") {
          send(response, 200, { models: await sessions.listAvailableModels() });
        } else if (path === "/api/v1/sessions") {
          if (method === "GET") send(response, 200, sessions.listSessions());
          else {
            if (
              Object.keys(body).length !== 4 ||
              typeof body.requestId !== "string" ||
              typeof body.directory !== "string" ||
              typeof body.provider !== "string" ||
              typeof body.model !== "string"
            )
              fail(400, "invalid_input", "Provide requestId, directory, provider, and model.");
            const created = await sessions.createSession({
              requestId: body.requestId,
              directory: body.directory,
              provider: body.provider,
              model: body.model,
            });
            if (created.status !== "ready") {
              send(response, created.status === "failed" ? 503 : 409, {
                error: {
                  code:
                    created.status === "failed" ? "session_start_failed" : "session_interrupted",
                  message: `${created.error ?? "Session creation was interrupted."} Session ID: ${created.id}.`,
                },
              });
            } else send(response, 201, created);
          }
        } else if (historyMatch) {
          const id = historyMatch[1];
          if (!id) fail(400, "invalid_input", "Invalid session ID.");
          send(response, 200, await sessions.getHistory(id, historyCursor));
        } else if (eventMatch) {
          const id = eventMatch[1];
          if (!id) fail(400, "invalid_input", "Invalid session ID.");
          const cursorHeader = request.headers["last-event-id"];
          if (cursorHeader !== undefined && typeof cursorHeader !== "string")
            fail(400, "invalid_cursor", "Last-Event-ID must contain one event cursor.");
          openEventStream(request, response, id, cursorHeader, cookieName);
          return;
        } else if (turnMatch) {
          const id = turnMatch[1];
          if (!id) fail(400, "invalid_input", "Invalid session ID.");
          const runId = turnMatch[2];
          const action = turnMatch[3];
          if (runId === undefined) {
            if (!isTurnCreateRequest(body))
              fail(400, "invalid_input", "Provide a request UUID and nonempty plain-text message.");
            const admitted = await sessions.submitTurn(id, body);
            send(response, admitted.created ? 202 : 200, admitted.turn);
          } else if (action === "result") {
            send(response, 200, await sessions.getTurnResult(id, runId));
          } else if (action === "abort") {
            if (Object.keys(body).length !== 0)
              fail(400, "invalid_input", "This operation expects an empty JSON object.");
            send(response, 200, await sessions.abortTurn(id, runId));
          } else {
            send(response, 200, sessions.getTurn(id, runId));
          }
        } else {
          const id = sessionMatch?.[1];
          if (!id) fail(400, "invalid_input", "Invalid session ID.");
          if (Object.keys(body).length !== 0)
            fail(400, "invalid_input", "This operation expects an empty JSON object.");
          const action = sessionMatch?.[2];
          const result =
            action === "open"
              ? await sessions.openSession(id)
              : action === "close"
                ? await sessions.closeSession(id)
                : action === "context"
                  ? await sessions.getContext(id)
                  : sessions.getSession(id);
          send(response, 200, result);
        }
        return;
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
        if (path === "/" || BROWSER_ASSETS.has(path) || path === "/style.css") {
          response.setHeader(
            "Content-Type",
            path === "/"
              ? "text/html; charset=utf-8"
              : BROWSER_ASSETS.has(path)
                ? "text/javascript; charset=utf-8"
                : "text/css; charset=utf-8",
          );
          response.end(
            path === "/" ? HOST_PAGE : BROWSER_ASSETS.has(path) ? BROWSER_ASSETS.get(path) : STYLE,
          );
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
        browserRequest(request, access.origin);
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
        response.setHeader("Set-Cookie", browserCookie(access, token, SESSION_MS / 1000));
      } else {
        if (Object.keys(body).length !== 0)
          fail(400, "invalid_input", "This operation expects an empty JSON object.");
        if (path === "/api/v1/auth/pairings") {
          send(response, 201, auth.createPairing());
          return;
        }
        if (path === "/api/v1/auth/revoke") {
          await auth.revoke();
          revalidateEventStreams();
        } else {
          const token = cookieToken(request, cookieName);
          if (!token || !auth.isBrowser(token, request.headers["x-dwell-browser"]))
            fail(401, "unauthenticated", "This browser session has expired or been revoked.");
          await auth.logout(token);
          revalidateEventStreams();
          response.setHeader("Set-Cookie", browserCookie(access, "", 0));
        }
      }
      send(response, 200, { ok: true });
    } catch (error) {
      if (response.destroyed) return;
      if (error instanceof AccessError && error.code === "storage_unavailable")
        revalidateEventStreams();
      if (response.headersSent) {
        response.destroy();
        return;
      }
      response.setHeader("Connection", "close");
      if (error instanceof AccessError || error instanceof SessionError) {
        if (error.status === 429)
          response.setHeader("Retry-After", error.code === "pairing_limit" ? "300" : "60");
        send(response, error.status, { error: { code: error.code, message: error.message } });
      } else if (error instanceof SseStartError) {
        const status = error.code === "unauthenticated" ? 401 : 503;
        send(response, status, { error: { code: error.code, message: error.message } });
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
        for (const stream of eventStreams) stream.close();
        server.closeAllConnections();
        await Promise.all(active);
        try {
          await sessions?.shutdown();
        } finally {
          await auth?.drain();
          await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          );
          server.closeAllConnections();
        }
      })();
    }
    return closing;
  };
  try {
    const root = await prepareDataDirectory(dataDir);
    browserOrigin = await readBrowserOrigin(root, mode);
    if (browserOrigin && new URL(browserOrigin).host === new URL(url).host)
      throw new Error(
        "The HTTPS browserOrigin must use a different authority from the local listener.",
      );
    auth = await LocalAuth.open(dataDir, now);
    sessions = await SessionService.create({ dataDir, ...sessionOptions, now });
  } catch (error) {
    await close();
    throw error;
  }
  return { url, close };
}
