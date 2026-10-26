import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { startHost } from "../src/server/http.ts";
import { isSessionInfo } from "../src/shared/sessions.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

async function setup(t: TestContext) {
  const environment = await createPiEnvironment();
  const options = {
    port: 0,
    dataDir: join(environment.root, "dwell"),
    sessions: { env: environment.env, extensions: [environment.extensionPath] },
  };
  const host = await startHost(options);
  t.after(async () => {
    await host.close();
    await environment.cleanup();
  });
  const token = (await readFile(join(options.dataDir, "auth-token"), "utf8")).trim();
  const request = async (path: string, body?: unknown, url = host.url) =>
    fetch(`${url}/api/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const configure = () =>
    request("/runtime", {
      executable: process.execPath,
      entryPoint: fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry")),
    });
  const body = {
    requestId: randomUUID(),
    directory: environment.cwd,
    provider: "dwell-test",
    model: "dwell-test",
  };
  return { environment, options, host, request, configure, body, token };
}

test("session routes require authentication and validate configuration/body boundaries", async (t) => {
  const { host, request, configure, body } = await setup(t);
  assert.equal((await fetch(`${host.url}/api/v1/sessions`)).status, 401);
  assert.equal((await request("/sessions", body)).status, 503);
  assert.equal((await configure()).status, 200);
  assert.equal(
    (await request("/runtime", { executable: process.execPath, entryPoint: "" })).status,
    400,
  );
  assert.equal((await request("/sessions", { ...body, extra: true })).status, 400);
  assert.equal(
    (await request("/sessions", { ...body, provider: "missing-dwell-provider" })).status,
    503,
  );
  assert.equal((await request(`/sessions/${randomUUID()}`)).status, 404);
  const status: unknown = await (await request("/status")).json();
  assert.ok(status && typeof status === "object" && "capabilities" in status);
  assert.deepEqual(status.capabilities, { sessions: true, tasks: false });
});

test("slow authenticated configuration outlives the ordinary five-second socket timeout", {
  timeout: 12_000,
}, async (t) => {
  const environment = await createPiEnvironment();
  const dataDir = join(environment.root, "dwell-slow");
  const host = await startHost({
    port: 0,
    dataDir,
    sessions: { env: { ...environment.env, DWELL_PI_FAULT: "slow-version" } },
  });
  t.after(async () => {
    await host.close();
    await environment.cleanup();
  });
  const token = (await readFile(join(dataDir, "auth-token"), "utf8")).trim();
  const response = await fetch(`${host.url}/api/v1/runtime`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      executable: process.execPath,
      entryPoint: fileURLToPath(new URL("./fixtures/pi-fault.ts", import.meta.url)),
    }),
  });
  assert.equal(response.status, 200);
});

test("paired browsers can read sessions but cannot configure executables or bypass mutation guards", async (t) => {
  const { request, configure, host, body } = await setup(t);
  await configure();
  const pairing: unknown = await (await request("/auth/pairings", {})).json();
  assert.ok(pairing && typeof pairing === "object" && "code" in pairing);
  const binding = "a".repeat(64);
  const paired = await fetch(`${host.url}/api/v1/auth/pair`, {
    method: "POST",
    headers: { Origin: host.url, "X-Dwell-Request": "1", "Content-Type": "application/json" },
    body: JSON.stringify({ code: pairing.code, browserKey: binding }),
  });
  const cookie = paired.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const browser = { Cookie: cookie, "X-Dwell-Browser": binding };
  assert.equal((await fetch(`${host.url}/api/v1/sessions`, { headers: browser })).status, 200);
  assert.equal(
    (
      await fetch(`${host.url}/api/v1/runtime`, {
        method: "POST",
        headers: {
          ...browser,
          "Content-Type": "application/json",
          Origin: host.url,
          "X-Dwell-Request": "1",
        },
        body: JSON.stringify({ executable: process.execPath }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${host.url}/api/v1/sessions`, {
        method: "POST",
        headers: { ...browser, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    ).status,
    403,
  );
  const created = await fetch(`${host.url}/api/v1/sessions`, {
    method: "POST",
    headers: {
      ...browser,
      "Content-Type": "application/json",
      Origin: host.url,
      "X-Dwell-Request": "1",
    },
    body: JSON.stringify(body),
  });
  assert.equal(created.status, 201);
  const createdSession: unknown = await created.json();
  assert.ok(isSessionInfo(createdSession));
  const turnDenied = await fetch(`${host.url}/api/v1/sessions/${createdSession.id}/turns`, {
    method: "POST",
    headers: { ...browser, "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: randomUUID(), message: "hello" }),
  });
  assert.equal(turnDenied.status, 403);
});

test("HTTP create/list/open/close/context preserve one session across host restart", async (t) => {
  const { request, configure, body, host, options } = await setup(t);
  assert.equal((await configure()).status, 200);
  const response = await request("/sessions", body);
  assert.equal(response.status, 201);
  const created: unknown = await response.json();
  assert.ok(isSessionInfo(created));
  assert.equal(created.activeTurnId, null);
  assert.equal(created.latestTurnId, null);
  const duplicate: unknown = await (await request("/sessions", body)).json();
  assert.ok(isSessionInfo(duplicate));
  assert.equal(created.id, duplicate.id);
  assert.equal((await request("/sessions", { ...body, model: "different" })).status, 409);
  assert.equal((await request(`/sessions/${created.id}/close`, {})).status, 200);
  await host.close();
  const restarted = await startHost(options);
  t.after(() => restarted.close());
  const listed: unknown = await (await request("/sessions", undefined, restarted.url)).json();
  assert.ok(Array.isArray(listed) && listed.length === 1 && isSessionInfo(listed[0]));
  assert.equal(listed[0].runtimeState, "closed");
  assert.equal(listed[0].activeTurnId, null);
  assert.equal(listed[0].latestTurnId, null);
  const opened: unknown = await (
    await request(`/sessions/${created.id}/open`, {}, restarted.url)
  ).json();
  assert.ok(isSessionInfo(opened));
  assert.equal(opened.piSessionId, created.piSessionId);
  const context: unknown = await (
    await request(`/sessions/${created.id}/context`, undefined, restarted.url)
  ).json();
  assert.deepEqual(context, { messages: [] });
  await restarted.close();
});

test("disconnecting an admitted creation request does not cancel or duplicate it", async (t) => {
  const { request, configure, body, host, token } = await setup(t);
  await configure();
  const controller = new AbortController();
  const creating = fetch(`${host.url}/api/v1/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).catch(() => undefined);
  const deadline = Date.now() + 5000;
  let admitted = false;
  while (Date.now() < deadline) {
    const listed: unknown = await (await request("/sessions")).json();
    if (Array.isArray(listed) && listed.length === 1) {
      admitted = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(admitted);
  controller.abort();
  await creating;
  const retried = await request("/sessions", body);
  assert.equal(retried.status, 201);
  const result: unknown = await retried.json();
  assert.ok(isSessionInfo(result));
  assert.equal(result.status, "ready");
  const list: unknown = await (await request("/sessions")).json();
  assert.ok(Array.isArray(list) && list.length === 1);
});
