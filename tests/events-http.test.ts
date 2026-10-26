import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest, type IncomingMessage } from "node:http";
import { createConnection } from "node:net";
import { StringDecoder } from "node:string_decoder";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createSseConnection, type SseConnection } from "../src/server/sse.ts";
import { startHost } from "../src/server/http.ts";
import { isStreamFrame, type StreamFrame } from "../src/shared/events.ts";
import { isSessionInfo, type SessionInfo } from "../src/shared/sessions.ts";
import { isTurnInfo, type TurnInfo } from "../src/shared/turns.ts";
import { createPiEnvironment, type PiEnvironment } from "./fixtures/pi-environment.ts";

interface ParsedFrame {
  event: string;
  id?: string;
  data: unknown;
}

interface FrameWaiter {
  predicate(frame: ParsedFrame): boolean;
  resolve(frame: ParsedFrame): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

class EventReader {
  readonly frames: ParsedFrame[] = [];
  readonly heartbeatBlocks: string[] = [];
  readonly closed: Promise<void>;
  #resolveClosed: () => void = () => {};
  #waiters: FrameWaiter[] = [];
  #heartbeatWaiters: Array<{
    resolve(): void;
    reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  #decoder = new StringDecoder("utf8");
  #buffer = "";
  #response: IncomingMessage;
  readonly request: ReturnType<typeof httpRequest>;

  constructor(request: ReturnType<typeof httpRequest>, response: IncomingMessage) {
    this.request = request;
    this.#response = response;
    this.closed = new Promise((resolve) => {
      this.#resolveClosed = resolve;
    });
    response.on("data", (chunk: Buffer) => this.#read(this.#decoder.write(chunk)));
    response.once("end", () => {
      this.#read(this.#decoder.end());
      this.#finish();
    });
    response.once("aborted", () => this.#finish());
    response.once("close", () => this.#finish());
    response.on("error", () => this.#finish());
  }

  get statusCode(): number | undefined {
    return this.#response.statusCode;
  }

  get headers(): IncomingMessage["headers"] {
    return this.#response.headers;
  }

  get isClosed(): boolean {
    return this.#response.destroyed || this.#response.complete;
  }

  pause(): void {
    this.#response.pause();
  }

  resume(): void {
    this.#response.resume();
  }

  disconnect(): void {
    this.request.destroy();
  }

  async waitFor(
    predicate: (frame: ParsedFrame) => boolean,
    timeoutMs = 5000,
  ): Promise<ParsedFrame> {
    const found = this.frames.find(predicate);
    if (found) return found;
    if (this.isClosed) throw new Error("SSE connection closed before the expected event.");
    return new Promise((resolve, reject) => {
      const waiter: FrameWaiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.#waiters = this.#waiters.filter((entry) => entry !== waiter);
          reject(new Error("Timed out waiting for an SSE event."));
        }, timeoutMs),
      };
      this.#waiters.push(waiter);
    });
  }

  async waitForHeartbeat(timeoutMs = 1000): Promise<void> {
    if (this.heartbeatBlocks.length > 0) return;
    if (this.isClosed) throw new Error("SSE connection closed before its heartbeat.");
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.#heartbeatWaiters = this.#heartbeatWaiters.filter((entry) => entry !== waiter);
          reject(new Error("Timed out waiting for an SSE heartbeat."));
        }, timeoutMs),
      };
      this.#heartbeatWaiters.push(waiter);
    });
  }

  async waitForClose(timeoutMs = 2000): Promise<void> {
    if (this.isClosed) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("SSE connection did not close.")), timeoutMs);
      timer.unref();
      void this.closed.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  #read(text: string): void {
    this.#buffer += text;
    let boundary = this.#buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = this.#buffer.slice(0, boundary).replace(/\r$/u, "");
      this.#buffer = this.#buffer.slice(boundary + 2);
      this.#parseBlock(block);
      boundary = this.#buffer.indexOf("\n\n");
    }
  }

  #parseBlock(block: string): void {
    if (block.length === 0) return;
    const lines = block.split(/\r?\n/u);
    if (lines.every((line) => line.startsWith(":"))) {
      this.heartbeatBlocks.push(block);
      for (const waiter of this.#heartbeatWaiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.resolve();
      }
      return;
    }

    let event = "message";
    let id: string | undefined;
    const data: string[] = [];
    for (const line of lines) {
      if (line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /u, "");
      if (field === "event") event = value;
      else if (field === "id") id = value;
      else if (field === "data") data.push(value);
    }
    if (data.length === 0) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.join("\n"));
    } catch {
      return;
    }
    const frame: ParsedFrame = { event, ...(id === undefined ? {} : { id }), data: parsed };
    this.frames.push(frame);
    for (const waiter of [...this.#waiters]) {
      if (!waiter.predicate(frame)) continue;
      this.#waiters = this.#waiters.filter((entry) => entry !== waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(frame);
    }
  }

  #finish(): void {
    this.#resolveClosed();
    for (const waiter of this.#waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("SSE connection closed before the expected event."));
    }
    for (const waiter of this.#heartbeatWaiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("SSE connection closed before its heartbeat."));
    }
  }
}

interface TestSetupOptions {
  withPi?: boolean;
  now?: () => number;
  eventHeartbeatMs?: number;
  prepareEnvironment?(environment: PiEnvironment): void;
}

async function setup(t: TestContext, options: TestSetupOptions = {}) {
  const environment = options.withPi ? await createPiEnvironment() : undefined;
  if (environment) options.prepareEnvironment?.(environment);
  const dataDir = environment
    ? join(environment.root, "dwell")
    : await mkdtemp(join(tmpdir(), "dwell-events-http-"));
  const host = await startHost({
    port: 0,
    dataDir,
    ...(options.now ? { now: options.now } : {}),
    ...(options.eventHeartbeatMs === undefined
      ? {}
      : { eventHeartbeatMs: options.eventHeartbeatMs }),
    ...(environment
      ? { sessions: { env: environment.env, extensions: [environment.extensionPath] } }
      : {}),
  });
  t.after(async () => {
    await host.close();
    if (environment) await environment.cleanup();
    else await rm(dataDir, { recursive: true, force: true });
  });
  const token = (await readFile(join(dataDir, "auth-token"), "utf8")).trim();
  let configured = false;

  const request = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(`${host.url}/api/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${token}`,
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const configure = async (): Promise<void> => {
    if (configured) return;
    const response = await request("/runtime", {
      executable: process.execPath,
      entryPoint: fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry")),
    });
    assert.equal(response.status, 200);
    configured = true;
  };

  const createSession = async (): Promise<SessionInfo> => {
    if (!environment) throw new Error("This test setup has no Pi fixture.");
    await configure();
    const response = await request("/sessions", {
      requestId: randomUUID(),
      directory: environment.cwd,
      provider: "dwell-test",
      model: "dwell-test",
    });
    assert.equal(response.status, 201);
    const value: unknown = await response.json();
    assert.ok(isSessionInfo(value));
    return value;
  };

  return { dataDir, environment, host, token, request, configure, createSession };
}

function openEvents(url: string, headers: Record<string, string> = {}): Promise<EventReader> {
  return new Promise((resolve, reject) => {
    let receivedResponse = false;
    const outgoing = httpRequest(
      url,
      {
        method: "GET",
        headers: { Accept: "text/event-stream", ...headers },
      },
      (response) => {
        receivedResponse = true;
        resolve(new EventReader(outgoing, response));
      },
    );
    outgoing.on("error", (error) => {
      if (!receivedResponse) reject(error);
    });
    outgoing.end();
  });
}

async function pairBrowser(
  hostUrl: string,
  token: string,
): Promise<{
  cookie: string;
  browserKey: string;
  headers: Record<string, string>;
  mutationHeaders: Record<string, string>;
}> {
  const pairingResponse = await fetch(`${hostUrl}/api/v1/auth/pairings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(pairingResponse.status, 201);
  const pairing: unknown = await pairingResponse.json();
  const pairingRecord = asRecord(pairing);
  assert.equal(typeof pairingRecord.code, "string");
  const browserKey = randomBytes(32).toString("hex");
  const redeem = await fetch(`${hostUrl}/api/v1/auth/pair`, {
    method: "POST",
    headers: {
      Origin: hostUrl,
      "X-Dwell-Request": "1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: pairingRecord.code, browserKey }),
  });
  assert.equal(redeem.status, 200);
  const setCookie = redeem.headers.get("set-cookie");
  assert.ok(setCookie);
  const cookie = setCookie.split(";", 1)[0];
  if (cookie === undefined) throw new Error("Pairing response did not contain a browser cookie.");
  const headers = { Cookie: cookie, "X-Dwell-Browser": browserKey };
  return {
    cookie,
    browserKey,
    headers,
    mutationHeaders: { ...headers, Origin: hostUrl, "X-Dwell-Request": "1" },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a JSON object.");
  return Object.fromEntries(Object.entries(value));
}

function asTurnInfo(value: unknown): TurnInfo {
  if (!isTurnInfo(value)) throw new Error("Response did not contain valid turn metadata.");
  return value;
}

function framePayload(frame: ParsedFrame): Record<string, unknown> {
  return asRecord(asRecord(frame.data).payload);
}

async function waitForTurn(
  request: (path: string, body?: unknown, headers?: Record<string, string>) => Promise<Response>,
  sessionId: string,
  runId: string,
  complete: (turn: TurnInfo) => boolean,
): Promise<TurnInfo> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await request(`/sessions/${sessionId}/turns/${runId}`);
    assert.equal(response.status, 200);
    const turn = asTurnInfo(await response.json());
    if (complete(turn)) return turn;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Turn ${runId} did not reach the expected state before the deadline.`);
}

async function waitForTextFile(path: string, timeoutMs = 5000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await readFile(path, "utf8");
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`File ${path} was not created before the deadline.`);
}

async function rawStatus(url: string, headerLines: readonly string[]): Promise<number> {
  const target = new URL(url);
  const port = Number(target.port);
  return new Promise((resolve, reject) => {
    const socket = createConnection(port, "127.0.0.1");
    let response = "";
    socket.setTimeout(5000, () => socket.destroy(new Error("Raw HTTP request timed out.")));
    socket.on("connect", () => {
      socket.write(
        `GET ${target.pathname}${target.search} HTTP/1.1\r\nHost: ${target.host}\r\n${headerLines.join("\r\n")}\r\nConnection: close\r\n\r\n`,
      );
    });
    socket.on("data", (chunk: Buffer) => {
      response += chunk.toString("utf8");
    });
    socket.once("error", reject);
    socket.once("end", () => {
      const line = response.split("\r\n", 1)[0] ?? "";
      const match = /^HTTP\/1\.[01] (\d{3})/u.exec(line);
      if (!match?.[1]) reject(new Error("Raw HTTP response had no status line."));
      else resolve(Number(match[1]));
    });
  });
}

function largeFrame(index: number): StreamFrame {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  return {
    sessionId,
    runId: sessionId,
    cursor: `${sessionId}:${sessionId}:${index}`,
    type: "message.delta",
    payload: {
      messageId: sessionId,
      text: `frame-${index}: ${"x".repeat(60_000)}`,
      truncated: false,
    },
  };
}

test("events routes authenticate and report an unknown session before starting SSE", async (t) => {
  const { host, token } = await setup(t);
  const sessionId = "00000000-0000-4000-8000-000000000001";
  const url = `${host.url}/api/v1/sessions/${sessionId}/events`;

  const unauthenticated = await fetch(url);
  assert.equal(unauthenticated.status, 401);

  const unknown = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), {
    error: { code: "session_not_found", message: "Unknown Dwell session." },
  });
  assert.equal(unknown.headers.get("content-type")?.startsWith("application/json"), true);
});

test("SSE snapshots and events are ordered for two clients; disconnect detaches observation only", async (t) => {
  let releasePath = "";
  let startedPath = "";
  const { host, token, request, createSession, environment } = await setup(t, {
    withPi: true,
    eventHeartbeatMs: 25,
    prepareEnvironment: (value) => {
      releasePath = join(value.root, "stream-release");
      startedPath = join(value.root, "stream-started");
      value.env.DWELL_TEST_STREAM_RELEASE = releasePath;
      value.env.DWELL_TEST_STREAM_STARTED = startedPath;
    },
  });
  assert.ok(environment);
  const session = await createSession();

  const url = `${host.url}/api/v1/sessions/${session.id}/events`;
  const first = await openEvents(url, { Authorization: `Bearer ${token}` });
  const second = await openEvents(url, { Authorization: `Bearer ${token}` });
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.match(String(first.headers["content-type"]), /^text\/event-stream;/u);
  assert.equal(first.headers["cache-control"], "no-store");
  const firstSnapshot = await first.waitFor((frame) => frame.event === "snapshot");
  const secondSnapshot = await second.waitFor((frame) => frame.event === "snapshot");
  assert.equal(firstSnapshot.id, secondSnapshot.id);
  assert.equal(
    framePayload(firstSnapshot).session && asRecord(framePayload(firstSnapshot).session).id,
    session.id,
  );
  await first.waitForHeartbeat();
  assert.deepEqual(first.heartbeatBlocks[0], ": heartbeat");

  const hello = await request(`/sessions/${session.id}/turns`, {
    requestId: randomUUID(),
    message: "hello",
  });
  assert.equal(hello.status, 202);
  const helloTurn = asTurnInfo(await hello.json());
  const completed = (frame: ParsedFrame): boolean => {
    if (frame.event !== "turn.updated") return false;
    const payload = framePayload(frame);
    return payload.runId === helloTurn.runId && payload.status === "completed";
  };
  await Promise.all([first.waitFor(completed), second.waitFor(completed)]);

  const firstOrder = first.frames
    .filter((frame) => frame.event !== "snapshot")
    .map((frame) => [frame.event, frame.id]);
  const secondOrder = second.frames
    .filter((frame) => frame.event !== "snapshot")
    .map((frame) => [frame.event, frame.id]);
  assert.deepEqual(firstOrder, secondOrder);
  const sequences = first.frames
    .filter((frame) => frame.id !== undefined)
    .map((frame) => Number(frame.id?.split(":").at(-1)));
  assert.ok(
    sequences.every((sequence, index) => index === 0 || sequence > (sequences[index - 1] ?? -1)),
  );

  const streamed = await request(`/sessions/${session.id}/turns`, {
    requestId: randomUUID(),
    message: "stream",
  });
  assert.equal(streamed.status, 202);
  const streamTurn = asTurnInfo(await streamed.json());
  const firstDelta = await second.waitFor(
    (frame) =>
      frame.event === "message.delta" && String(framePayload(frame).text).includes("stream-first-"),
  );
  assert.match(await waitForTextFile(startedPath), /first-chunk/u);
  assert.equal(typeof framePayload(firstDelta).messageId, "string");
  assert.equal(framePayload(firstDelta).truncated, false);

  first.disconnect();
  await first.waitForClose();
  assert.equal(second.isClosed, false);
  await writeFile(releasePath, "continue\n", { mode: 0o600 });
  await second.waitFor((frame) => {
    if (frame.event !== "turn.updated") return false;
    const payload = framePayload(frame);
    return payload.runId === streamTurn.runId && payload.status === "completed";
  });
  const finalTurn = await waitForTurn(
    request,
    session.id,
    streamTurn.runId,
    (turn) => turn.status === "completed",
  );
  assert.equal(finalTurn.status, "completed");
  assert.equal(second.isClosed, false);

  const closing = host.close();
  await closing;
  await second.waitForClose();
});

test("browser SSE streams close on revoke, logout, expiry, and auth storage failure", async (t) => {
  let clock = Date.now();
  const { host, token, request, createSession, dataDir } = await setup(t, {
    withPi: true,
    now: () => clock,
    eventHeartbeatMs: 1000,
  });
  const session = await createSession();
  const eventsUrl = `${host.url}/api/v1/sessions/${session.id}/events`;

  const revoked = await pairBrowser(host.url, token);
  const revokedStream = await openEvents(eventsUrl, revoked.headers);
  await revokedStream.waitFor((frame) => frame.event === "snapshot");
  const revokeResponse = await request("/auth/revoke", {});
  assert.equal(revokeResponse.status, 200);
  await revokedStream.waitForClose();

  const loggedOut = await pairBrowser(host.url, token);
  const logoutStream = await openEvents(eventsUrl, loggedOut.headers);
  await logoutStream.waitFor((frame) => frame.event === "snapshot");
  const logoutResponse = await fetch(`${host.url}/api/v1/auth/logout`, {
    method: "POST",
    headers: {
      ...loggedOut.mutationHeaders,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(logoutResponse.status, 200);
  await logoutStream.waitForClose();

  const expiring = await pairBrowser(host.url, token);
  const expiryStream = await openEvents(eventsUrl, expiring.headers);
  await expiryStream.waitFor((frame) => frame.event === "snapshot");
  clock += 30 * 24 * 60 * 60 * 1000 + 1;
  await expiryStream.waitForClose(2000);

  const eventExpired = await pairBrowser(host.url, token);
  const eventStream = await openEvents(eventsUrl, eventExpired.headers);
  await eventStream.waitFor((frame) => frame.event === "snapshot");
  clock += 30 * 24 * 60 * 60 * 1000 + 1;
  const turnResponse = await request(`/sessions/${session.id}/turns`, {
    requestId: randomUUID(),
    message: "hello",
  });
  assert.equal(turnResponse.status, 202);
  await eventStream.waitForClose(500);
  const turn = asTurnInfo(await turnResponse.json());
  await waitForTurn(request, session.id, turn.runId, (current) => current.status === "completed");

  const brokenSave = await pairBrowser(host.url, token);
  const brokenStream = await openEvents(eventsUrl, brokenSave.headers);
  await brokenStream.waitFor((frame) => frame.event === "snapshot");
  const statePath = join(dataDir, "browser-sessions.json");
  await rename(statePath, join(dataDir, "browser-sessions.saved"));
  await mkdir(statePath, { mode: 0o700 });
  const failedLogout = await fetch(`${host.url}/api/v1/auth/logout`, {
    method: "POST",
    headers: {
      ...brokenSave.mutationHeaders,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(failedLogout.status, 503);
  const error: unknown = await failedLogout.json();
  assert.equal(asRecord(asRecord(error).error).code, "storage_unavailable");
  await brokenStream.waitForClose();
});

test("Last-Event-ID is unique, session-scoped, and validated before stream headers", async (t) => {
  const { host, token, createSession } = await setup(t, { withPi: true });
  const firstSession = await createSession();
  const firstUrl = `${host.url}/api/v1/sessions/${firstSession.id}/events`;
  const first = await openEvents(firstUrl, { Authorization: `Bearer ${token}` });
  const snapshot = await first.waitFor((frame) => frame.event === "snapshot");
  assert.ok(snapshot.id);

  const malformed = await fetch(firstUrl, {
    headers: { Authorization: `Bearer ${token}`, "Last-Event-ID": "not-a-cursor" },
  });
  assert.equal(malformed.status, 400);
  assert.equal(asRecord(asRecord(await malformed.json()).error).code, "invalid_cursor");

  const secondSession = await createSession();
  const foreign = await fetch(`${host.url}/api/v1/sessions/${secondSession.id}/events`, {
    headers: { Authorization: `Bearer ${token}`, "Last-Event-ID": snapshot.id },
  });
  assert.equal(foreign.status, 400);
  assert.equal(asRecord(asRecord(await foreign.json()).error).code, "invalid_cursor");

  const query = await fetch(`${firstUrl}?cursor=${encodeURIComponent(snapshot.id ?? "")}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(query.status, 400);
  assert.equal(asRecord(asRecord(await query.json()).error).code, "unexpected_query");

  const wrongMethod = await fetch(firstUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "GET");

  assert.equal(
    await rawStatus(firstUrl, [
      `Authorization: Bearer ${token}`,
      "Last-Event-ID: invalid-one",
      "Last-Event-ID: invalid-two",
    ]),
    400,
  );
  assert.equal(
    await rawStatus(firstUrl, [`Authorization: Bearer ${token}`, `Authorization: Bearer ${token}`]),
    400,
  );
  first.disconnect();
  await first.waitForClose();
});

test("a slow SSE reader overflows only its real loopback connection", async (t) => {
  assert.ok(isStreamFrame(largeFrame(1)));
  const writers = new Map<string, SseConnection>();
  const server = createServer((request, response) => {
    if (request.method === "GET" && (request.url === "/slow" || request.url === "/fast")) {
      const key = request.url.slice(1);
      const writer = createSseConnection(response, {
        heartbeatMs: 60_000,
        isAuthorized: () => true,
        onClose: () => writers.delete(key),
      });
      writers.set(key, writer);
      writer.start([], () => writers.delete(key));
      return;
    }
    if (request.method === "POST" && request.url === "/burst") {
      const slow = writers.get("slow");
      for (let index = 1; index <= 128; index += 1) slow?.enqueue(largeFrame(index));
      writers.get("fast")?.enqueue({
        sessionId: "11111111-1111-4111-8111-111111111111",
        runId: "11111111-1111-4111-8111-111111111111",
        cursor: "11111111-1111-4111-8111-111111111111:11111111-1111-4111-8111-111111111111:999",
        type: "projection.error",
        payload: { code: "still_open", message: "The other stream is still writable." },
      });
      response.end("ok");
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const readers: EventReader[] = [];
  t.after(async () => {
    for (const reader of readers) reader.disconnect();
    for (const writer of writers.values()) writer.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  const slow = await openEvents(`${baseUrl}/slow`);
  readers.push(slow);
  const fast = await openEvents(`${baseUrl}/fast`);
  readers.push(fast);
  assert.equal(slow.isClosed, false);
  assert.equal(fast.isClosed, false);
  slow.pause();

  const publish = await fetch(`${baseUrl}/burst`, { method: "POST" });
  assert.equal(publish.status, 200);
  await slow.waitForClose(5000);
  const healthy = await fast.waitFor(
    (frame) => frame.event === "projection.error" && framePayload(frame).code === "still_open",
  );
  assert.equal(framePayload(healthy).code, "still_open");
  assert.equal(fast.isClosed, false);
});
