import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { startHost } from "../src/server/http.ts";
import { isSessionInfo, type SessionInfo } from "../src/shared/sessions.ts";
import { isTurnInfo, type TurnInfo } from "../src/shared/turns.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

type HttpRequest = (path: string, body?: unknown, signal?: AbortSignal) => Promise<Response>;

async function setup(t: TestContext) {
  const environment = await createPiEnvironment();
  const dataDir = join(environment.root, "dwell");
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
  const request: HttpRequest = (path, body, signal) =>
    fetch(`${host.url}/api/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  const configure = async () => {
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
  return { environment, host, token, request, configure, createSession };
}

function asTurnInfo(value: unknown): TurnInfo {
  if (!isTurnInfo(value)) throw new Error("Response did not contain valid turn metadata.");
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Response did not contain a JSON object.");
  return Object.fromEntries(Object.entries(value));
}

async function getSession(request: HttpRequest, id: string): Promise<SessionInfo> {
  const response = await request(`/sessions/${id}`);
  assert.equal(response.status, 200);
  const value: unknown = await response.json();
  assert.ok(isSessionInfo(value));
  return value;
}

async function waitForTurn(
  request: HttpRequest,
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

test("turn routes retain authentication, request limits, and exact path matching", async (t) => {
  const { host, token } = await setup(t);
  const sessionId = randomUUID();
  const runId = randomUUID();
  const route = `${host.url}/api/v1/sessions/${sessionId}/turns`;
  const body = JSON.stringify({ requestId: randomUUID(), message: "hello" });

  const unauthenticated = await fetch(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  assert.equal(unauthenticated.status, 401);

  const malformed = await fetch(route, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: randomUUID(), message: "" }),
  });
  assert.equal(malformed.status, 400);

  const oversized = await fetch(route, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: randomUUID(), message: "x".repeat(9000) }),
  });
  assert.equal(oversized.status, 413);

  const wrongMethod = await fetch(route, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST");

  const foreignOrigin = await fetch(route, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: "http://localhost:8787",
      "Content-Type": "application/json",
    },
    body,
  });
  assert.equal(foreignOrigin.status, 403);

  const invalidAction = await fetch(`${route}/${runId}/unknown`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(invalidAction.status, 404);
  const extraSegment = await fetch(`${route}/${runId}/result/extra`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(extraSegment.status, 404);
});

test("HTTP turn admission is idempotent, session-scoped, and exposes finalized entries", async (t) => {
  const { request, configure, createSession } = await setup(t);
  await configure();
  const session = await createSession();
  assert.equal(session.activeTurnId, null);
  assert.equal(session.latestTurnId, null);

  const admissionRequestId = randomUUID();
  const extraField = await request(`/sessions/${session.id}/turns`, {
    requestId: admissionRequestId,
    message: "hello",
    unexpected: true,
  });
  assert.equal(extraField.status, 400);
  const slashCommand = await request(`/sessions/${session.id}/turns`, {
    requestId: admissionRequestId,
    message: "/help",
  });
  assert.equal(slashCommand.status, 400);
  const unchanged = await getSession(request, session.id);
  assert.equal(unchanged.activeTurnId, null);
  assert.equal(unchanged.latestTurnId, null);

  const create = { requestId: admissionRequestId, message: "hello" };
  const admitted = await request(`/sessions/${session.id}/turns`, create);
  assert.equal(admitted.status, 202);
  const turn = asTurnInfo(await admitted.json());
  assert.equal(turn.sessionId, session.id);
  assert.equal(turn.requestId, create.requestId);

  const duplicate = await request(`/sessions/${session.id}/turns`, create);
  assert.equal(duplicate.status, 200);
  assert.equal(asTurnInfo(await duplicate.json()).runId, turn.runId);

  const conflict = await request(`/sessions/${session.id}/turns`, {
    ...create,
    message: "different content",
  });
  assert.equal(conflict.status, 409);

  const otherSession = await createSession();
  const scoped = await request(`/sessions/${otherSession.id}/turns/${turn.runId}`);
  assert.equal(scoped.status, 404);

  const completed = await waitForTurn(
    request,
    session.id,
    turn.runId,
    (current) => current.status === "completed",
  );
  assert.equal(completed.status, "completed");
  const sessionAfterTurn = await getSession(request, session.id);
  assert.equal(sessionAfterTurn.activeTurnId, null);
  assert.equal(sessionAfterTurn.latestTurnId, turn.runId);

  const resultResponse = await request(`/sessions/${session.id}/turns/${turn.runId}/result`);
  assert.equal(resultResponse.status, 200);
  const result = asRecord(await resultResponse.json());
  assert.equal(result.runId, turn.runId);
  assert.ok(Array.isArray(result.entries) && result.entries.length > 0);
});

test("paired browsers must present the binding and mutation headers for turn submission and abort", async (t) => {
  const { host, request, configure, createSession } = await setup(t);
  await configure();
  const session = await createSession();
  const pairingResponse = await request("/auth/pairings", {});
  assert.equal(pairingResponse.status, 201);
  const pairing = asRecord(await pairingResponse.json());
  assert.ok(typeof pairing.code === "string");

  const browserKey = "b".repeat(64);
  const paired = await fetch(`${host.url}/api/v1/auth/pair`, {
    method: "POST",
    headers: {
      Origin: host.url,
      "X-Dwell-Request": "1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: pairing.code, browserKey }),
  });
  assert.equal(paired.status, 200);
  const cookie = paired.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const browserHeaders = { Cookie: cookie, "X-Dwell-Browser": browserKey };
  const browserRequest: HttpRequest = (path, body, signal) =>
    fetch(`${host.url}/api/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...browserHeaders,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  const browserMutation: HttpRequest = (path, body, signal) =>
    fetch(`${host.url}/api/v1${path}`, {
      method: "POST",
      headers: {
        ...browserHeaders,
        Origin: host.url,
        "X-Dwell-Request": "1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
      ...(signal ? { signal } : {}),
    });

  const turnPath = `/sessions/${session.id}/turns`;
  const create = { requestId: randomUUID(), message: "hello" };
  const turnUrl = `${host.url}/api/v1${turnPath}`;
  const missingOrigin = await fetch(turnUrl, {
    method: "POST",
    headers: { ...browserHeaders, "X-Dwell-Request": "1", "Content-Type": "application/json" },
    body: JSON.stringify(create),
  });
  assert.equal(missingOrigin.status, 403);
  const missingMutationHeader = await fetch(turnUrl, {
    method: "POST",
    headers: { ...browserHeaders, Origin: host.url, "Content-Type": "application/json" },
    body: JSON.stringify(create),
  });
  assert.equal(missingMutationHeader.status, 403);
  const missingBinding = await fetch(turnUrl, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: host.url,
      "X-Dwell-Request": "1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(create),
  });
  assert.equal(missingBinding.status, 401);

  const accepted = await browserMutation(turnPath, create);
  assert.equal(accepted.status, 202);
  const turn = asTurnInfo(await accepted.json());
  const completed = await waitForTurn(
    browserRequest,
    session.id,
    turn.runId,
    (current) => current.status === "completed",
  );
  assert.equal(completed.status, "completed");
  const stateResponse = await browserRequest(`/sessions/${session.id}/turns/${turn.runId}`);
  assert.equal(stateResponse.status, 200);
  assert.equal(asTurnInfo(await stateResponse.json()).runId, turn.runId);
  const resultResponse = await browserRequest(`/sessions/${session.id}/turns/${turn.runId}/result`);
  assert.equal(resultResponse.status, 200);
  assert.equal(asRecord(await resultResponse.json()).runId, turn.runId);

  const slowCreate = { requestId: randomUUID(), message: "slow" };
  const slowResponse = await browserMutation(turnPath, slowCreate);
  assert.equal(slowResponse.status, 202);
  const slowTurn = asTurnInfo(await slowResponse.json());
  const abortPath = `/sessions/${session.id}/turns/${slowTurn.runId}/abort`;
  const abortUrl = `${host.url}/api/v1${abortPath}`;
  const emptyBody = JSON.stringify({});
  const abortMissingOrigin = await fetch(abortUrl, {
    method: "POST",
    headers: { ...browserHeaders, "X-Dwell-Request": "1", "Content-Type": "application/json" },
    body: emptyBody,
  });
  assert.equal(abortMissingOrigin.status, 403);
  const abortMissingMutationHeader = await fetch(abortUrl, {
    method: "POST",
    headers: { ...browserHeaders, Origin: host.url, "Content-Type": "application/json" },
    body: emptyBody,
  });
  assert.equal(abortMissingMutationHeader.status, 403);
  const abortMissingBinding = await fetch(abortUrl, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: host.url,
      "X-Dwell-Request": "1",
      "Content-Type": "application/json",
    },
    body: emptyBody,
  });
  assert.equal(abortMissingBinding.status, 401);

  const abortResponse = await browserMutation(abortPath, {});
  assert.equal(abortResponse.status, 200);
  assert.equal(asTurnInfo(await abortResponse.json()).cancellationRequested, true);
  const aborted = await waitForTurn(
    browserRequest,
    session.id,
    slowTurn.runId,
    (current) => current.status === "aborted",
  );
  assert.equal(aborted.status, "aborted");
});

test("an admitted turn survives client disconnect, blocks competing work, and can be aborted", async (t) => {
  const { host, token, request, configure, createSession } = await setup(t);
  await configure();
  const session = await createSession();
  const create = { requestId: randomUUID(), message: "slow" };
  const controller = new AbortController();
  const response = await fetch(`${host.url}/api/v1/sessions/${session.id}/turns`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(create),
    signal: controller.signal,
  });
  assert.equal(response.status, 202);
  await response.body?.cancel();
  controller.abort();

  const active = await getSession(request, session.id);
  assert.ok(active.activeTurnId);
  const runId = active.activeTurnId;

  const retried = await request(`/sessions/${session.id}/turns`, create);
  assert.equal(retried.status, 200);
  assert.equal(asTurnInfo(await retried.json()).runId, runId);

  const busy = await request(`/sessions/${session.id}/turns`, {
    requestId: randomUUID(),
    message: "another request",
  });
  assert.equal(busy.status, 409);

  const pendingResult = await request(`/sessions/${session.id}/turns/${runId}/result`);
  assert.equal(pendingResult.status, 409);
  const pendingError = asRecord(await pendingResult.json());
  assert.equal(asRecord(pendingError.error).code, "turn_pending");

  const abortResponse = await request(`/sessions/${session.id}/turns/${runId}/abort`, {});
  assert.equal(abortResponse.status, 200);
  assert.equal(asTurnInfo(await abortResponse.json()).cancellationRequested, true);
  const aborted = await waitForTurn(
    request,
    session.id,
    runId,
    (current) => current.status === "aborted",
  );
  assert.equal(aborted.status, "aborted");
  const finished = await getSession(request, session.id);
  assert.equal(finished.activeTurnId, null);
  assert.equal(finished.latestTurnId, runId);
});
