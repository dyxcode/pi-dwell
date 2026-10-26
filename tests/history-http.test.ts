import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { startHost } from "../src/server/http.ts";
import { type HistoryPage, isHistoryPage } from "../src/shared/history.ts";
import { isSessionInfo, type SessionInfo } from "../src/shared/sessions.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a JSON object.");
  return Object.fromEntries(Object.entries(value));
}

async function setup(t: TestContext) {
  const environment = await createPiEnvironment();
  const dataDir = join(environment.root, "dwell");
  const startLog = join(environment.root, "pi-start.log");
  const streamStarted = join(environment.root, "history-stream-started");
  const streamRelease = join(environment.root, "history-stream-release");
  environment.env.DWELL_TEST_START_LOG = startLog;
  environment.env.DWELL_TEST_STREAM_STARTED = streamStarted;
  environment.env.DWELL_TEST_STREAM_RELEASE = streamRelease;
  const host = await startHost({
    port: 0,
    dataDir,
    sessions: { env: environment.env, extensions: [environment.extensionPath] },
  });
  t.after(async () => {
    await host.close();
    await environment.cleanup();
  });
  const token = (await readFile(join(dataDir, "auth-token"), "utf8")).trim();
  const request = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(`${host.url}/api/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const configure = async (): Promise<void> => {
    const response = await request("/runtime", {
      executable: process.execPath,
      entryPoint: fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry")),
    });
    assert.equal(response.status, 200);
  };
  const createSession = async (): Promise<SessionInfo> => {
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
  return {
    environment,
    host,
    token,
    startLog,
    streamStarted,
    request,
    configure,
    createSession,
  };
}

function assertHistoryPage(value: unknown, sessionId: string): HistoryPage {
  assert.ok(isHistoryPage(value));
  assert.equal(value.sessionId, sessionId);
  return value;
}

async function piStarts(path: string): Promise<number> {
  return (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).length;
}

async function waitForTextFile(path: string, timeoutMs = 5000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const text = await readFile(path, "utf8");
      if (text.endsWith("\n")) return text;
    } catch {
      // The fixture may not have created its marker yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`File ${path} did not contain a complete marker before the deadline.`);
}

async function rawResponse(
  url: string,
  path: string,
  headers: readonly string[] = [],
  body = "",
): Promise<{ status: number; body: string }> {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const socket = httpRequest(
      {
        host: target.hostname,
        port: Number(target.port),
        method: "GET",
        path,
        headers: {
          Host: target.host,
          Connection: "close",
          ...Object.fromEntries(
            headers.map((header) => {
              const split = header.indexOf(":");
              return [header.slice(0, split), header.slice(split + 1).trim()];
            }),
          ),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.once("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    socket.once("error", reject);
    socket.end(body);
  });
}

async function pairBrowser(
  hostUrl: string,
  token: string,
): Promise<{ cookie: string; browserKey: string }> {
  const pairingResponse = await fetch(`${hostUrl}/api/v1/auth/pairings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(pairingResponse.status, 201);
  const pairing = asRecord(await pairingResponse.json());
  assert.equal(typeof pairing.code, "string");
  const browserKey = randomBytes(32).toString("hex");
  const redeem = await fetch(`${hostUrl}/api/v1/auth/pair`, {
    method: "POST",
    headers: {
      Origin: hostUrl,
      "X-Dwell-Request": "1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: pairing.code, browserKey }),
  });
  assert.equal(redeem.status, 200);
  const cookie = redeem.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);
  return { cookie, browserKey };
}

function asTurn(value: unknown): Record<string, unknown> {
  return asRecord(value);
}

async function waitForTurn(
  request: (path: string, body?: unknown, headers?: Record<string, string>) => Promise<Response>,
  sessionId: string,
  runId: string,
  status: string,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await request(`/sessions/${sessionId}/turns/${runId}`);
    assert.equal(response.status, 200);
    const turn = asTurn(await response.json());
    if (turn.status === status) return turn;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Turn ${runId} did not reach ${status} before the deadline.`);
}

test("history reads an empty closed session without reopening Pi", async (t) => {
  const { host, request, configure, createSession, startLog } = await setup(t);
  await configure();
  const session = await createSession();
  const startsBeforeRead = await piStarts(startLog);
  assert.equal(startsBeforeRead, 1);

  const closed = await request(`/sessions/${session.id}/close`, {});
  assert.equal(closed.status, 200);

  const history = await request(`/sessions/${session.id}/history`);
  assert.equal(history.status, 200);
  const page = assertHistoryPage(await history.json(), session.id);
  assert.equal(page.status, "empty");
  assert.deepEqual(page.entries, []);
  assert.equal(page.activeTurnId, null);
  assert.equal(page.latestTurnId, null);

  const startsAfterRead = await piStarts(startLog);
  assert.equal(startsAfterRead, startsBeforeRead);
  const sessionResponse = await request(`/sessions/${session.id}`);
  assert.equal(sessionResponse.status, 200);
  const currentSession = asRecord(await sessionResponse.json());
  assert.equal(currentSession.runtimeState, "closed");
  assert.equal(new URL(host.url).hostname, "127.0.0.1");
});

test("history route retains authentication, query, method, body, and exact-path guards", async (t) => {
  const { host, token } = await setup(t);
  const sessionId = randomUUID();
  const path = `/api/v1/sessions/${sessionId}/history`;
  const url = `${host.url}${path}`;

  assert.equal((await fetch(url)).status, 401);

  const unknown = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), {
    error: { code: "session_not_found", message: "Unknown Dwell session." },
  });

  const withCursor = await fetch(`${url}?cursor=opaque`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(withCursor.status, 404);
  assert.deepEqual(await withCursor.json(), {
    error: { code: "session_not_found", message: "Unknown Dwell session." },
  });

  for (const query of ["cursor=", `cursor=${"x".repeat(1537)}`, "cursor=first&cursor=second"]) {
    const response = await fetch(`${url}?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 400, query.slice(0, 80));
    const error = asRecord(asRecord(await response.json()).error);
    assert.equal(error.code, "invalid_cursor");
  }

  for (const query of ["other=value", "cursor=opaque&token=secret"]) {
    const response = await fetch(`${url}?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 400);
    assert.equal(asRecord(asRecord(await response.json()).error).code, "unexpected_query");
  }
  const credentialInUrl = await fetch(`${url}?token=${encodeURIComponent(token)}`);
  assert.equal(credentialInUrl.status, 400);
  assert.equal(asRecord(asRecord(await credentialInUrl.json()).error).code, "unexpected_query");

  const wrongMethod = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "GET");

  const getBody = await rawResponse(
    host.url,
    path,
    [`Authorization: Bearer ${token}`, "Content-Length: 1"],
    "x",
  );
  assert.equal(getBody.status, 400);
  assert.equal(asRecord(asRecord(JSON.parse(getBody.body)).error).code, "unexpected_body");

  const wrongOrigin = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Origin: "http://localhost:8787" },
  });
  assert.equal(wrongOrigin.status, 403);

  const wrongHost = await rawResponse(host.url, path, [
    `Authorization: Bearer ${token}`,
    "Host: localhost:8787",
  ]);
  assert.equal(wrongHost.status, 403);

  const normalizedPath = await rawResponse(host.url, `${path}/`);
  assert.equal(normalizedPath.status, 404);
  const duplicateSlashPath = await rawResponse(host.url, `/api/v1/sessions//${sessionId}/history`);
  assert.equal(duplicateSlashPath.status, 404);

  const otherSessionQuery = await fetch(`${host.url}/api/v1/sessions?cursor=opaque`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(otherSessionQuery.status, 400);
  assert.equal(asRecord(asRecord(await otherSessionQuery.json()).error).code, "unexpected_query");
  const eventQuery = await fetch(`${host.url}/api/v1/sessions/${sessionId}/events?cursor=opaque`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(eventQuery.status, 400);
  assert.equal(asRecord(asRecord(await eventQuery.json()).error).code, "unexpected_query");
});

test("history reads support paired browsers, completed pages, and active-turn metadata without Pi reads", async (t) => {
  const { host, token, request, configure, createSession, startLog, streamStarted } =
    await setup(t);
  await configure();

  const emptySession = await createSession();
  assert.equal(await piStarts(startLog), 1);
  const paired = await pairBrowser(host.url, token);
  const historyUrl = `${host.url}/api/v1/sessions/${emptySession.id}/history`;
  const cookieOnly = await fetch(historyUrl, { headers: { Cookie: paired.cookie } });
  assert.equal(cookieOnly.status, 401);
  const bindingOnly = await fetch(historyUrl, {
    headers: { "X-Dwell-Browser": paired.browserKey },
  });
  assert.equal(bindingOnly.status, 401);
  const browserHistory = await fetch(historyUrl, {
    headers: { Cookie: paired.cookie, "X-Dwell-Browser": paired.browserKey },
  });
  assert.equal(browserHistory.status, 200);
  assert.equal(assertHistoryPage(await browserHistory.json(), emptySession.id).status, "empty");

  assert.equal((await request(`/sessions/${emptySession.id}/close`, {})).status, 200);
  const emptyHistoryResponse = await request(`/sessions/${emptySession.id}/history`);
  assert.equal(emptyHistoryResponse.status, 200);
  const emptyPage = assertHistoryPage(await emptyHistoryResponse.json(), emptySession.id);
  assert.equal(emptyPage.status, "empty");
  assert.deepEqual(emptyPage.entries, []);
  assert.equal(emptyPage.activeTurnId, null);
  assert.equal(emptyPage.latestTurnId, null);
  assert.equal(await piStarts(startLog), 1);

  const completedSession = await createSession();
  assert.equal(await piStarts(startLog), 2);
  const submit = await request(`/sessions/${completedSession.id}/turns`, {
    requestId: randomUUID(),
    message: "hello",
  });
  assert.equal(submit.status, 202);
  const submittedTurn = asTurn(await submit.json());
  assert.equal(submittedTurn.status, "accepted");
  assert.equal(typeof submittedTurn.runId, "string");
  const runId = String(submittedTurn.runId);
  await waitForTurn(request, completedSession.id, runId, "completed");
  assert.equal((await request(`/sessions/${completedSession.id}/close`, {})).status, 200);

  const completedResponse = await request(`/sessions/${completedSession.id}/history`);
  assert.equal(completedResponse.status, 200);
  const completedPage = assertHistoryPage(await completedResponse.json(), completedSession.id);
  assert.equal(completedPage.status, "available");
  assert.ok(completedPage.entries.length > 0);
  assert.equal(completedPage.activeTurnId, null);
  assert.equal(completedPage.latestTurnId, runId);
  assert.equal(completedPage.coveredTurnId, runId);
  assert.equal(await piStarts(startLog), 2);
  const closedSessionResponse = await request(`/sessions/${completedSession.id}`);
  assert.equal(asRecord(await closedSessionResponse.json()).runtimeState, "closed");

  const activeSession = await createSession();
  assert.equal(await piStarts(startLog), 3);
  const activeSubmit = await request(`/sessions/${activeSession.id}/turns`, {
    requestId: randomUUID(),
    message: "stream",
  });
  assert.equal(activeSubmit.status, 202);
  const activeTurn = asTurn(await activeSubmit.json());
  assert.equal(typeof activeTurn.runId, "string");
  const activeRunId = String(activeTurn.runId);
  assert.match(await waitForTextFile(streamStarted), /first-chunk/u);
  const pendingResponse = await request(`/sessions/${activeSession.id}/history`);
  assert.equal(pendingResponse.status, 200);
  const pendingPage = assertHistoryPage(await pendingResponse.json(), activeSession.id);
  assert.ok(["pending", "available"].includes(String(pendingPage.status)));
  assert.equal(pendingPage.activeTurnId, activeRunId);
  assert.equal(pendingPage.latestTurnId, activeRunId);
  assert.equal(pendingPage.coveredTurnId, null);
  assert.equal(await piStarts(startLog), 3);
});

test("history rejects malformed signed cursors through the session error envelope", async (t) => {
  const { host, request, configure, createSession } = await setup(t);
  await configure();
  const session = await createSession();
  const response = await request(
    `/sessions/${session.id}/history?cursor=not-a-valid-signed-cursor`,
  );
  assert.equal(response.status, 400);
  const error = asRecord(asRecord(await response.json()).error);
  assert.equal(error.code, "invalid_cursor");
  assert.equal(typeof error.message, "string");
  assert.equal(new URL(host.url).hostname, "127.0.0.1");
});
