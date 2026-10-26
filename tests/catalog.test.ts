import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SessionCatalog, type StoredSession } from "../src/storage/catalog.ts";

function session(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    id: "session-a",
    requestId: "request-a",
    payloadIdentity: "payload-a",
    directory: "/tmp/project-a",
    provider: "test-provider",
    model: "test-model",
    piSessionId: "pi-session-a",
    piSessionFile: null,
    historyExpected: false,
    status: "creating",
    createdAt: 1000,
    updatedAt: 1000,
    error: null,
    ...overrides,
  };
}

test("catalog configuration and private SQLite storage survive reopening", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-catalog-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, "data");
  let active: SessionCatalog | undefined;
  t.after(() => active?.close());

  const first = await SessionCatalog.open(dataDir);
  active = first;
  assert.equal(first.configuration(), undefined);
  first.configure({ executable: "/opt/pi/bin/pi", entryPoint: "/opt/pi/pi-cli.js" });
  assert.deepEqual(first.configuration(), {
    executable: "/opt/pi/bin/pi",
    entryPoint: "/opt/pi/pi-cli.js",
  });

  const dataInfo = await stat(dataDir);
  const databaseInfo = await lstat(join(dataDir, "catalog.sqlite"));
  assert.equal(dataInfo.mode & 0o777, 0o700);
  assert.ok(databaseInfo.isFile());
  assert.equal(databaseInfo.mode & 0o777, 0o600);
  assert.equal(databaseInfo.nlink, 1);
  assert.equal(databaseInfo.uid, process.getuid?.());

  first.close();
  active = undefined;
  assert.deepEqual(await readdir(dataDir), ["catalog.sqlite"]);
  const reopened = await SessionCatalog.open(dataDir);
  active = reopened;
  assert.deepEqual(reopened.configuration(), {
    executable: "/opt/pi/bin/pi",
    entryPoint: "/opt/pi/pi-cli.js",
  });
});

test("catalog enforces request uniqueness and reopens deterministic list and updates", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-catalog-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, "data");
  let active: SessionCatalog | undefined;
  t.after(() => active?.close());
  const catalog = await SessionCatalog.open(dataDir);
  active = catalog;

  const later = session({ id: "session-z", requestId: "request-z", createdAt: 2000 });
  const first = session({ id: "session-a", requestId: "request-a", createdAt: 1000 });
  const tied = session({ id: "session-b", requestId: "request-b", createdAt: 1000 });
  catalog.insert(later);
  catalog.insert(tied);
  catalog.insert(first);
  assert.throws(
    () => catalog.insert(session({ id: "session-duplicate", requestId: "request-a" })),
    /unique|request/i,
  );

  const ready: StoredSession = {
    ...first,
    piSessionId: "pi-session-ready",
    piSessionFile: "/tmp/pi-session.jsonl",
    historyExpected: true,
    status: "ready",
    updatedAt: 1500,
  };
  catalog.update(ready);
  assert.deepEqual(catalog.list(), [ready, tied, later]);
  assert.deepEqual(catalog.get(first.id), ready);
  assert.deepEqual(catalog.findRequest(first.requestId), ready);
  assert.equal(catalog.get("missing"), undefined);
  assert.equal(catalog.findRequest("missing"), undefined);

  catalog.close();
  active = undefined;
  const reopened = await SessionCatalog.open(dataDir);
  active = reopened;
  assert.deepEqual(reopened.list(), [ready, tied, later]);
});

test("startup marks only creating sessions interrupted and persists the recovery", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-catalog-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, "data");
  let active: SessionCatalog | undefined;
  t.after(() => active?.close());

  const catalog = await SessionCatalog.open(dataDir);
  active = catalog;
  const creating = session();
  const ready = session({ id: "session-ready", requestId: "request-ready", status: "ready" });
  const failed = session({ id: "session-failed", requestId: "request-failed", status: "failed" });
  catalog.insert(creating);
  catalog.insert(ready);
  catalog.insert(failed);
  catalog.interruptCreating(4000);

  const interrupted = catalog.get(creating.id);
  assert.ok(interrupted);
  assert.equal(interrupted.status, "interrupted");
  assert.equal(interrupted.updatedAt, 4000);
  assert.match(interrupted.error ?? "", /interrupted/i);
  assert.equal(catalog.get(ready.id)?.updatedAt, ready.updatedAt);
  assert.equal(catalog.get(failed.id)?.updatedAt, failed.updatedAt);

  catalog.close();
  active = undefined;
  const reopened = await SessionCatalog.open(dataDir);
  active = reopened;
  assert.deepEqual(reopened.get(creating.id), interrupted);
});

test("corrupt, unversioned, and future catalog files fail closed without resetting bytes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-catalog-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const corruptDir = join(root, "corrupt");
  const corruptCatalog = await SessionCatalog.open(corruptDir);
  corruptCatalog.close();
  const corruptPath = join(corruptDir, "catalog.sqlite");
  const corruptBytes = "not a SQLite database";
  await writeFile(corruptPath, corruptBytes, { mode: 0o600 });
  await assert.rejects(SessionCatalog.open(corruptDir), /database|sqlite|corrupt/i);
  assert.equal(await readFile(corruptPath, "utf8"), corruptBytes);

  const unversionedDir = join(root, "unversioned");
  await mkdir(unversionedDir, { mode: 0o700 });
  const unversionedPath = join(unversionedDir, "catalog.sqlite");
  const unversionedDatabase = new DatabaseSync(unversionedPath);
  unversionedDatabase.exec("CREATE TABLE unrelated (value TEXT) STRICT;");
  unversionedDatabase.close();
  await chmod(unversionedPath, 0o600);
  const unversionedBytes = await readFile(unversionedPath);
  await assert.rejects(SessionCatalog.open(unversionedDir), /schema|unversioned/i);
  assert.deepEqual(await readFile(unversionedPath), unversionedBytes);

  const futureDir = join(root, "future");
  await mkdir(futureDir, { mode: 0o700 });
  const futurePath = join(futureDir, "catalog.sqlite");
  const futureDatabase = new DatabaseSync(futurePath);
  futureDatabase.exec("CREATE TABLE future_marker (value TEXT) STRICT; PRAGMA user_version = 77;");
  futureDatabase.close();
  await chmod(futurePath, 0o600);
  const futureBytes = await readFile(futurePath);
  await assert.rejects(SessionCatalog.open(futureDir), /schema|version|unsupported/i);
  assert.deepEqual(await readFile(futurePath), futureBytes);
});

test("catalog refuses database symlinks, hard links, and unsafe permissions", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-catalog-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const symlinkDir = join(root, "symlink");
  const symlinkTarget = join(root, "symlink-target");
  await mkdir(symlinkDir, { mode: 0o700 });
  await writeFile(symlinkTarget, "preserve symlink target", { mode: 0o600 });
  await symlink(symlinkTarget, join(symlinkDir, "catalog.sqlite"));
  await assert.rejects(
    SessionCatalog.open(symlinkDir),
    /unsafe|regular|file|permission|symbolic|ELOOP/i,
  );
  assert.equal(await readFile(symlinkTarget, "utf8"), "preserve symlink target");

  const hardlinkDir = join(root, "hardlink");
  const hardlinkSource = join(root, "hardlink-source");
  await mkdir(hardlinkDir, { mode: 0o700 });
  await writeFile(hardlinkSource, "preserve hard-link target", { mode: 0o600 });
  await link(hardlinkSource, join(hardlinkDir, "catalog.sqlite"));
  await assert.rejects(SessionCatalog.open(hardlinkDir), /unsafe|regular|file|permission/i);
  assert.equal(await readFile(hardlinkSource, "utf8"), "preserve hard-link target");

  const modeDir = join(root, "mode");
  const modePath = join(modeDir, "catalog.sqlite");
  await mkdir(modeDir, { mode: 0o700 });
  await writeFile(modePath, "preserve unsafe-mode file", { mode: 0o600 });
  await chmod(modePath, 0o644);
  await assert.rejects(SessionCatalog.open(modeDir), /unsafe|regular|file|permission/i);
  assert.equal(await readFile(modePath, "utf8"), "preserve unsafe-mode file");

  const fifoDir = join(root, "fifo");
  await mkdir(fifoDir, { mode: 0o700 });
  const fifoPath = join(fifoDir, "catalog.sqlite");
  execFileSync("mkfifo", [fifoPath]);
  await assert.rejects(SessionCatalog.open(fifoDir), /unsafe|regular|file|permission/i);
});
