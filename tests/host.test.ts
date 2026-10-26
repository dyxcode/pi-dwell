import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { readHostStatus } from "../src/clients/cli/status.ts";
import { startHost } from "../src/server/http.ts";

async function directory(t: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "dwell-host-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("loopback host serves public health/assets and authenticated status", async (t) => {
  const dataDir = await directory(t);
  const host = await startHost({ port: 0, dataDir });
  t.after(() => host.close());
  assert.equal(new URL(host.url).hostname, "127.0.0.1");
  const health = await fetch(`${host.url}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });
  const status = await readHostStatus({ port: Number(new URL(host.url).port), dataDir });
  assert.equal(status.service, "pi-dwell");
  assert.equal(status.phase, "sessions");
  assert.equal(status.protocolVersion, 2);
  assert.equal(status.processId, process.pid);
  assert.equal(status.mode, "production");
  assert.deepEqual(status.capabilities, { sessions: true, tasks: false });
  for (const [route, type] of [
    ["/", "text/html"],
    ["/client.js", "text/javascript"],
    ["/style.css", "text/css"],
  ]) {
    const response = await fetch(`${host.url}${route}`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("content-type")?.includes(type ?? ""));
    assert.match(response.headers.get("content-security-policy") ?? "", /script-src 'self'/);
  }
  assert.equal((await fetch(`${host.url}/api/v1/sessions`)).status, 401);
  const write = await fetch(`${host.url}/api/v1/status`, { method: "POST" });
  assert.equal(write.status, 405);
  assert.equal(write.headers.get("allow"), "GET");
  assert.equal(write.headers.get("access-control-allow-origin"), null);
});

test("closing is repeatable and releases the listening port", async (t) => {
  const dataDir = await directory(t);
  const host = await startHost({ port: 0, dataDir });
  const port = Number(new URL(host.url).port);
  await Promise.all([host.close(), host.close()]);
  await assert.rejects(fetch(`${host.url}/healthz`));
  const restarted = await startHost({ port, dataDir });
  await restarted.close();
});

test("a losing server cannot initialize state, even with a different data root", async (t) => {
  const dataDir = await directory(t);
  const first = await startHost({ port: 0, dataDir });
  t.after(() => first.close());
  const port = Number(new URL(first.url).port);
  const secondDir = join(await directory(t), "must-not-exist");
  await assert.rejects(startHost({ port, dataDir: secondDir }), { code: "EADDRINUSE" });
  await assert.rejects(access(secondDir));
  assert.equal((await readHostStatus({ port, dataDir })).service, "pi-dwell");
});

test("status client rejects incompatible HTTP services", async (t) => {
  const dataDir = await directory(t);
  const original = await startHost({ port: 0, dataDir });
  await original.close();
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ service: "pi-dwell", protocolVersion: 999 }));
  });
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await assert.rejects(readHostStatus({ port: address.port, dataDir }), /incompatible/i);
});

test("Host, Origin, CSRF, media type, body sizes and rate limits are enforced", async (t) => {
  const dataDir = await directory(t);
  const host = await startHost({ port: 0, dataDir });
  t.after(() => host.close());
  const token = (await readFile(join(dataDir, "auth-token"), "utf8")).trim();
  for (const origin of ["http://evil.example", "null", "http://127.0.0.1:1"]) {
    assert.equal((await fetch(`${host.url}/healthz`, { headers: { Origin: origin } })).status, 403);
  }
  const pairUrl = `${host.url}/api/v1/auth/pair`;
  const browser = { Origin: host.url, "X-Dwell-Request": "1", "Content-Type": "application/json" };
  assert.equal(
    (
      await fetch(pairUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(pairUrl, {
        method: "POST",
        headers: { Origin: host.url, "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(pairUrl, {
        method: "POST",
        headers: { ...browser, "Content-Type": "text/plain" },
        body: "{}",
      })
    ).status,
    415,
  );
  assert.equal(
    (await fetch(pairUrl, { method: "POST", headers: browser, body: "x".repeat(8193) })).status,
    413,
  );
  assert.equal((await fetch(pairUrl, { method: "POST", headers: browser, body: "{" })).status, 400);
  assert.equal(
    (
      await fetch(`${host.url}/api/v1/auth/pairings`, {
        method: "POST",
        headers: browser,
        body: "{}",
      })
    ).status,
    401,
  );
  for (let i = 0; i < 21; i++) {
    const response = await fetch(pairUrl, {
      method: "POST",
      headers: browser,
      body: JSON.stringify({ code: "0".repeat(32), browserKey: "a".repeat(64) }),
    });
    assert.equal(response.status, i < 20 ? 401 : 429);
  }
  const cli = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  for (let i = 0; i < 11; i++) {
    assert.equal(
      (
        await fetch(`${host.url}/api/v1/auth/pairings`, {
          method: "POST",
          headers: cli,
          body: "{}",
        })
      ).status,
      i < 10 ? 201 : 429,
    );
  }
  const rawRequest = (method: string, headers: Record<string, string>, body: string) =>
    new Promise<number>((resolve, reject) => {
      const outgoing = request(
        `${host.url}${method === "GET" ? "/healthz" : "/api/v1/auth/pair"}`,
        { method, headers },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      );
      outgoing.on("error", reject);
      outgoing.end(body);
    });
  assert.equal(await rawRequest("GET", { Host: "evil.example" }, ""), 403);
  assert.equal(await rawRequest("GET", { "Content-Length": "2" }, "{}"), 400);
  assert.equal(
    await rawRequest("POST", { ...browser, "Transfer-Encoding": "chunked" }, "x".repeat(8193)),
    413,
  );
});
