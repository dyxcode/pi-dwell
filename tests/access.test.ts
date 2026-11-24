import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { request, type IncomingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { startHost } from "../src/server/http.ts";
import { isSessionInfo } from "../src/shared/sessions.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

const origin = "https://dwell.example.ts.net";
function send(url: string, headers: Record<string, string> = {}, body?: unknown) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; text: string }>(
    (resolve, reject) => {
      const req = request(
        url,
        {
          method: body === undefined ? "GET" : "POST",
          headers: {
            ...headers,
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          },
        },
        (res) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => {
            text += chunk;
          });
          res.on("error", reject);
          res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text }));
        },
      );
      req.on("error", reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    },
  );
}
async function configure(root: string, browserOrigin = origin): Promise<void> {
  await writeFile(join(root, "access.json"), JSON.stringify({ version: 1, browserOrigin }), {
    mode: 0o600,
  });
}
const remote = {
  Host: new URL(origin).host,
  Origin: origin,
  "X-Dwell-Request": "1",
  "X-Forwarded-Proto": "https",
};

function openEventStream(url: string, headers: Record<string, string> = {}) {
  return new Promise<{
    status: number;
    snapshot: Promise<boolean>;
    closed: Promise<void>;
  }>((resolve, reject) => {
    let receivedResponse = false;
    const outgoing = request(
      url,
      { method: "GET", headers: { Accept: "text/event-stream", ...headers } },
      (response) => {
        receivedResponse = true;
        let buffered = "";
        let snapshotResolved = false;
        let resolveSnapshot: (received: boolean) => void = () => {};
        let resolveClosed: () => void = () => {};
        const snapshot = new Promise<boolean>((done) => {
          resolveSnapshot = done;
        });
        const closed = new Promise<void>((done) => {
          resolveClosed = done;
        });
        const finish = (): void => {
          if (!snapshotResolved) {
            snapshotResolved = true;
            resolveSnapshot(false);
          }
          resolveClosed();
        };
        response.on("data", (chunk: Buffer) => {
          if (snapshotResolved) return;
          buffered += chunk.toString("utf8");
          if (buffered.includes("event: snapshot\n")) {
            snapshotResolved = true;
            resolveSnapshot(true);
          }
        });
        response.once("end", finish);
        response.once("aborted", finish);
        response.once("close", finish);
        response.once("error", finish);
        resolve({ status: response.statusCode ?? 0, snapshot, closed });
      },
    );
    outgoing.once("error", (error) => {
      if (!receivedResponse) reject(error);
    });
    outgoing.end();
  });
}

async function within<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out after ${milliseconds} ms.`)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

test("HTTPS authority configuration changes take effect only after restart", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-access-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await configure(root);
  let host = await startHost({ port: 0, dataDir: root });
  t.after(() => host.close());
  const next = "https://changed.example.ts.net";
  const replacement = { ...remote, Host: new URL(next).host, Origin: next };
  await configure(root, next);
  assert.equal((await send(host.url, remote)).status, 200);
  assert.equal((await send(host.url, replacement)).status, 403);
  await host.close();
  host = await startHost({ port: 0, dataDir: root });
  assert.equal((await send(host.url, replacement)).status, 200);
  assert.equal((await send(host.url, remote)).status, 403);
});

test("host/origin trust is explicit, forwarding headers cannot enable it, and development stays local", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-access-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let host = await startHost({ port: 0, dataDir: root });
  t.after(() => host.close());
  assert.equal((await send(host.url, remote)).status, 403);
  await host.close();
  await configure(root);
  host = await startHost({ port: 0, dataDir: root });
  for (const headers of [
    { Host: "wrong.example", "X-Forwarded-Host": remote.Host, "X-Forwarded-Proto": "https" },
    { Host: "wrong.example", Forwarded: `host=${remote.Host};proto=https` },
    { ...remote, Origin: host.url },
    { Host: new URL(host.url).host, Origin: origin },
    {
      Host: new URL(host.url).host,
      "X-Forwarded-Host": new URL(host.url).host,
      "X-Forwarded-Proto": "https",
    },
    { Host: new URL(host.url).host, Forwarded: `host=${remote.Host};proto=https` },
    { ...remote, Origin: "null" },
    { ...remote, Origin: `${origin}/` },
  ])
    assert.equal((await send(host.url, headers)).status, 403);
  assert.equal(
    (
      await send(host.url, {
        Host: remote.Host,
        "X-Forwarded-Host": "wrong.example",
        "X-Forwarded-Proto": "https",
      })
    ).status,
    200,
    "forwarded fields never select an origin",
  );
  await host.close();
  host = await startHost({ port: 0, dataDir: root, mode: "development" });
  assert.equal((await send(host.url, remote)).status, 403);
  assert.equal((await send(host.url)).status, 200);
  await host.close();
  await rm(join(root, "access.json"));
  host = await startHost({ port: 0, dataDir: root });
  assert.equal((await send(host.url, remote)).status, 403);
});

test("invalid or unsafe access configuration fails startup without rewriting it or holding the port", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-access-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const initial = await startHost({ port: 0, dataDir: root });
  const port = Number(new URL(initial.url).port);
  await initial.close();
  const path = join(root, "access.json");
  const invalid = [
    "{",
    "null",
    "[]",
    "{}",
    JSON.stringify({ version: 2, browserOrigin: origin }),
    JSON.stringify({ version: 1, browserOrigin: origin, extra: true }),
    ...[
      "http://dwell.example.ts.net",
      `${origin}/`,
      `${origin}/app`,
      `${origin}?`,
      `${origin}#`,
      "https://user:pass@dwell.example.ts.net",
      "https://*.example.ts.net",
      " https://example.com",
      "https://example.com\n",
      "https://example.com:443",
      "https://EXAMPLE.com",
      `https://127.0.0.1:${port}`,
    ].map((browserOrigin) => JSON.stringify({ version: 1, browserOrigin })),
  ];
  for (const content of invalid) {
    await writeFile(path, content, { mode: 0o600 });
    await assert.rejects(
      startHost({ port, dataDir: root }).then((host) => host.close()),
      /access|origin/i,
    );
    assert.equal(await readFile(path, "utf8"), content);
  }
  await configure(root);
  await chmod(path, 0o644);
  await assert.rejects(
    startHost({ port, dataDir: root }).then((host) => host.close()),
    /permissions/i,
  );
  await rm(path);
  const target = join(root, "target.json");
  await writeFile(target, JSON.stringify({ version: 1, browserOrigin: origin }), { mode: 0o600 });
  await symlink(target, path);
  await assert.rejects(startHost({ port, dataDir: root }).then((host) => host.close()));
  await rm(path);
  const recovered = await startHost({ port, dataDir: root });
  await recovered.close();
});

test("configured HTTPS-origin SSE requires the browser request marker and closes on host shutdown", async (t) => {
  const environment = await createPiEnvironment();
  t.after(() => environment.cleanup());
  await configure(environment.root);
  const host = await startHost({
    port: 0,
    dataDir: environment.root,
    eventHeartbeatMs: 30_000,
    sessions: { env: environment.env, extensions: [environment.extensionPath] },
  });
  t.after(() => host.close());
  const token = (await readFile(join(environment.root, "auth-token"), "utf8")).trim();
  const cli = { Authorization: `Bearer ${token}` };
  const configured = await send(`${host.url}/api/v1/runtime`, cli, {
    executable: process.execPath,
    entryPoint: fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry")),
  });
  assert.equal(configured.status, 200);
  const created = await send(`${host.url}/api/v1/sessions`, cli, {
    requestId: randomUUID(),
    directory: environment.cwd,
    provider: "dwell-test",
    model: "dwell-test",
  });
  assert.equal(created.status, 201);
  const session: unknown = JSON.parse(created.text);
  assert.ok(isSessionInfo(session));

  const eventsUrl = `${host.url}/api/v1/sessions/${session.id}/events`;
  assert.equal(
    (
      await send(eventsUrl, {
        Host: remote.Host,
        Origin: origin,
        "X-Forwarded-Proto": "https",
        Accept: "text/event-stream",
      })
    ).status,
    403,
    "a browser event stream needs the request marker",
  );
  const stream = await openEventStream(eventsUrl, remote);
  assert.equal(stream.status, 200);
  assert.equal(
    await within(stream.snapshot, 5000),
    true,
    "the remote stream receives its snapshot",
  );

  await host.close();
  assert.equal(await within(stream.closed, 1000).then(() => true), true);
});
