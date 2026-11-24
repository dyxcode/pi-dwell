import assert from "node:assert/strict";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { startHost } from "../src/server/http.ts";

test("the private local CLI credential survives a restart and invalid bearers cannot fall back", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-auth-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, "data");
  const host = await startHost({ port: 0, dataDir });
  t.after(() => host.close());
  const token = (await readFile(join(dataDir, "auth-token"), "utf8")).trim();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal((await stat(dataDir)).mode & 0o777, 0o700);
  assert.equal((await stat(join(dataDir, "auth-token"))).mode & 0o777, 0o600);
  assert.equal(
    (await fetch(`${host.url}/api/v1/status`, { headers: { Authorization: `Bearer ${token}` } }))
      .status,
    200,
  );
  assert.equal(
    (
      await fetch(`${host.url}/api/v1/status`, {
        headers: { Authorization: "Bearer invalid", "X-Dwell-Request": "1" },
      })
    ).status,
    401,
  );
  await host.close();
  const restarted = await startHost({ port: 0, dataDir });
  t.after(() => restarted.close());
  assert.equal((await readFile(join(dataDir, "auth-token"), "utf8")).trim(), token);
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

test("startup ignores legacy pairing storage without deleting or rewriting it", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-legacy-browser-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "browser-sessions.json");
  await writeFile(path, "{", { mode: 0o600 });
  const host = await startHost({ port: 0, dataDir: root });
  t.after(() => host.close());
  assert.equal(await readFile(path, "utf8"), "{");
});
