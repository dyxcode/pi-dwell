import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { readHostStatus } from "../src/clients/cli/status.ts";
import { startHost } from "../src/server/http.ts";

test("a live loopback host serves health, validated status and its browser page", async (t) => {
  const host = await startHost({ port: 0 });
  t.after(() => host.close());
  assert.equal(new URL(host.url).hostname, "127.0.0.1");

  const health = await fetch(`${host.url}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });

  const status = await readHostStatus(Number(new URL(host.url).port));
  assert.equal(status.service, "pi-dwell");
  assert.equal(status.protocolVersion, 1);
  assert.equal(status.phase, "scaffold");
  assert.deepEqual(status.capabilities, { sessions: false, tasks: false });
  assert.ok(Number.isFinite(Date.parse(status.startedAt)));

  const page = await fetch(host.url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await page.text(), /pi-dwell/);

  const missing = await fetch(`${host.url}/api/v1/sessions`);
  assert.equal(missing.status, 404);
  const write = await fetch(`${host.url}/api/v1/status`, { method: "POST" });
  assert.equal(write.status, 405);
  assert.equal(write.headers.get("allow"), "GET");
  assert.equal(write.headers.get("access-control-allow-origin"), null);
});

test("closing is repeatable and releases the listening port", async () => {
  const host = await startHost({ port: 0 });
  const port = Number(new URL(host.url).port);
  await Promise.all([host.close(), host.close()]);
  await assert.rejects(fetch(`${host.url}/healthz`));
  const restarted = await startHost({ port });
  await restarted.close();
});

test("an occupied port reports startup failure without replacing the running host", async (t) => {
  const first = await startHost({ port: 0 });
  t.after(() => first.close());
  const port = Number(new URL(first.url).port);
  await assert.rejects(startHost({ port }), { code: "EADDRINUSE" });
  assert.equal((await readHostStatus(port)).service, "pi-dwell");
});

test("status client rejects unrelated or incompatible HTTP services", async (t) => {
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
  await assert.rejects(readHostStatus(address.port), /incompatible/i);
});
