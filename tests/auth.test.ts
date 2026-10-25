import assert from "node:assert/strict";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
  mkdir,
  symlink,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { startHost } from "../src/server/http.ts";

test("initialization is private, persistent, and status requires a credential", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-auth-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, "data");
  const host = await startHost({ port: 0, dataDir });
  t.after(() => host.close());
  assert.equal((await fetch(`${host.url}/api/v1/status`)).status, 401);
  const token = (await readFile(join(dataDir, "auth-token"), "utf8")).trim();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal((await stat(dataDir)).mode & 0o777, 0o700);
  assert.equal((await stat(join(dataDir, "auth-token"))).mode & 0o777, 0o600);
  assert.equal(
    (await fetch(`${host.url}/api/v1/status`, { headers: { Authorization: `Bearer ${token}` } }))
      .status,
    200,
  );
  await host.close();
  const restarted = await startHost({ port: 0, dataDir });
  t.after(() => restarted.close());
  assert.equal((await readFile(join(dataDir, "auth-token"), "utf8")).trim(), token);
});

test("pair once, survive restart, forget and revoke browser sessions", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-pair-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, "data");
  let now = Date.now();
  let host = await startHost({ port: 0, dataDir, now: () => now });
  t.after(() => host.close());
  const token = (await readFile(join(dataDir, "auth-token"), "utf8")).trim();
  const cli = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const browser = () => ({
    Origin: host.url,
    "X-Dwell-Request": "1",
    "X-Dwell-Browser": "a".repeat(64),
    "Content-Type": "application/json",
  });
  const create = async () => {
    const response = await fetch(`${host.url}/api/v1/auth/pairings`, {
      method: "POST",
      headers: cli,
      body: "{}",
    });
    assert.equal(response.status, 201);
    const value: unknown = await response.json();
    assert.ok(
      value && typeof value === "object" && "code" in value && typeof value.code === "string",
    );
    return value.code;
  };
  const redeem = (code: string) =>
    fetch(`${host.url}/api/v1/auth/pair`, {
      method: "POST",
      headers: browser(),
      body: JSON.stringify({ code, browserKey: "a".repeat(64) }),
    });
  const code = await create();
  const attempts = await Promise.all([redeem(code), redeem(code)]);
  assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 401]);
  const response = attempts.find((r) => r.status === 200);
  const cookieHeader = response?.headers.get("set-cookie");
  assert.ok(cookieHeader);
  assert.match(cookieHeader, /HttpOnly/);
  assert.match(cookieHeader, /SameSite=Strict/);
  assert.match(cookieHeader, /Max-Age=2592000/);
  const cookie = cookieHeader.split(";")[0];
  assert.ok(cookie);
  const persisted = await readFile(join(dataDir, "browser-sessions.json"), "utf8");
  assert.ok(!persisted.includes(cookie.split("=")[1] ?? "missing"));
  assert.ok(!persisted.includes("a".repeat(64)));
  assert.equal(
    (await fetch(`${host.url}/api/v1/status`, { headers: { Cookie: cookie } })).status,
    401,
    "an ambient cookie alone cannot authorize another local origin",
  );
  assert.equal(
    (
      await fetch(`${host.url}/api/v1/status`, {
        headers: { Cookie: cookie, "X-Dwell-Browser": "b".repeat(64) },
      })
    ).status,
    401,
    "a mismatched binding cannot authorize a stolen cookie",
  );
  await host.close();
  host = await startHost({ port: 0, dataDir, now: () => now });
  assert.equal(
    (
      await fetch(`${host.url}/api/v1/status`, {
        headers: { Cookie: cookie, "X-Dwell-Browser": "a".repeat(64) },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${host.url}/api/v1/auth/logout`, {
        method: "POST",
        headers: { ...browser(), Cookie: cookie },
        body: "{}",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${host.url}/api/v1/status`, {
        headers: { Cookie: cookie, "X-Dwell-Browser": "a".repeat(64) },
      })
    ).status,
    401,
  );
  const second = await redeem(await create());
  const secondCookie = second.headers.get("set-cookie")?.split(";")[0];
  assert.ok(secondCookie);
  assert.equal(
    (await fetch(`${host.url}/api/v1/auth/revoke`, { method: "POST", headers: cli, body: "{}" }))
      .status,
    200,
  );
  assert.equal(
    (
      await fetch(`${host.url}/api/v1/status`, {
        headers: { Cookie: secondCookie, "X-Dwell-Browser": "a".repeat(64) },
      })
    ).status,
    401,
  );
  const expiring = await create();
  now += 5 * 60 * 1000;
  assert.equal((await redeem(expiring)).status, 401);
  const third = await redeem(await create());
  const thirdCookie = third.headers.get("set-cookie")?.split(";")[0];
  assert.ok(thirdCookie);
  now += 30 * 24 * 60 * 60 * 1000;
  assert.equal(
    (
      await fetch(`${host.url}/api/v1/status`, {
        headers: { Cookie: thirdCookie, "X-Dwell-Browser": "a".repeat(64) },
      })
    ).status,
    401,
  );
  assert.equal((await fetch(`${host.url}/api/v1/status`, { headers: cli })).status, 200);
});

test("unsafe credentials are rejected without resetting them", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-private-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const host = await startHost({ port: 0, dataDir: root });
  await host.close();
  await chmod(join(root, "auth-token"), 0o644);
  await assert.rejects(startHost({ port: 0, dataDir: root }), /permissions/i);
  await chmod(join(root, "auth-token"), 0o600);
  await writeFile(join(root, "auth-token"), "broken", { mode: 0o600 });
  await assert.rejects(startHost({ port: 0, dataDir: root }), /credential/i);
  assert.equal(await readFile(join(root, "auth-token"), "utf8"), "broken");
});

test("pairing storage failure never issues a browser cookie or resets durable state", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-write-failure-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const host = await startHost({ port: 0, dataDir: root });
  t.after(() => host.close());
  const token = (await readFile(join(root, "auth-token"), "utf8")).trim();
  const response = await fetch(`${host.url}/api/v1/auth/pairings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const value: unknown = await response.json();
  assert.ok(
    value && typeof value === "object" && "code" in value && typeof value.code === "string",
  );
  const path = join(root, "browser-sessions.json");
  const original = await readFile(path, "utf8");
  await chmod(path, 0o644);
  const failed = await fetch(`${host.url}/api/v1/auth/pair`, {
    method: "POST",
    headers: { Origin: host.url, "X-Dwell-Request": "1", "Content-Type": "application/json" },
    body: JSON.stringify({ code: value.code, browserKey: "a".repeat(64) }),
  });
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("set-cookie"), null);
  assert.equal(await readFile(path, "utf8"), original);
  assert.ok(!(await failed.text()).includes(token));
});

test("data initialization rejects repository and vault destinations, including aliases", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-paths-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const marker of [".git", ".obsidian"]) {
    const protectedRoot = join(root, marker === ".git" ? "repository" : "vault");
    await mkdir(protectedRoot);
    await mkdir(join(protectedRoot, marker));
    const alias = `${protectedRoot}-alias`;
    await symlink(protectedRoot, alias);
    for (const base of [protectedRoot, alias]) {
      await assert.rejects(
        startHost({ port: 0, dataDir: join(base, "data") }),
        /outside repositories and Obsidian/,
      );
      await assert.rejects(access(join(base, "data")));
    }
  }
});

test("corrupt and unsupported browser-session records fail startup without overwriting files", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-state-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const host = await startHost({ port: 0, dataDir: root });
  const port = Number(new URL(host.url).port);
  await host.close();
  const path = join(root, "browser-sessions.json");
  for (const content of [
    "{",
    '{"version":2,"sessions":[]}',
    '{"version":1,"sessions":[{"hash":"bad","expiresAt":1}]}',
  ]) {
    await writeFile(path, content, { mode: 0o600 });
    await assert.rejects(startHost({ port, dataDir: root }), /browser-session state/);
    assert.equal(await readFile(path, "utf8"), content);
  }
  await writeFile(path, '{"version":1,"sessions":[]}', { mode: 0o600 });
  const restarted = await startHost({ port, dataDir: root });
  await restarted.close();
});
