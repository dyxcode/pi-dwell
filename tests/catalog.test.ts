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
    thinkingLevel: null,
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

function createV2Catalog(path: string, orphanTurn = false): void {
  const database = new DatabaseSync(path, { enableForeignKeyConstraints: false });
  database.exec(
    "CREATE TABLE runtime_configuration (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), executable TEXT NOT NULL CHECK (length(executable) > 0), entry_point TEXT CHECK (entry_point IS NULL OR length(entry_point) > 0)) STRICT;" +
      "CREATE TABLE sessions (id TEXT NOT NULL PRIMARY KEY CHECK (length(id) > 0), request_id TEXT NOT NULL UNIQUE CHECK (length(request_id) > 0), payload_identity TEXT NOT NULL CHECK (length(payload_identity) > 0), directory TEXT NOT NULL CHECK (length(directory) > 0), provider TEXT NOT NULL CHECK (length(provider) > 0), model TEXT NOT NULL CHECK (length(model) > 0), pi_session_id TEXT NOT NULL CHECK (length(pi_session_id) > 0), pi_session_file TEXT CHECK (pi_session_file IS NULL OR length(pi_session_file) > 0), history_expected INTEGER NOT NULL CHECK (history_expected IN (0, 1)), status TEXT NOT NULL CHECK (status IN ('creating', 'ready', 'failed', 'interrupted')), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error TEXT) STRICT;" +
      "CREATE TABLE turns (run_id TEXT NOT NULL PRIMARY KEY CHECK (length(run_id) > 0), session_id TEXT NOT NULL REFERENCES sessions(id), request_id TEXT NOT NULL CHECK (length(request_id) > 0), payload_identity TEXT NOT NULL CHECK (length(payload_identity) = 64), status TEXT NOT NULL CHECK (status IN ('accepted', 'dispatching', 'running', 'completed', 'failed', 'aborted', 'interrupted')), cancellation_requested INTEGER NOT NULL CHECK (cancellation_requested IN (0, 1)), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error_code TEXT, error_message TEXT, entry_ids TEXT NOT NULL CHECK (json_valid(entry_ids)), UNIQUE (session_id, request_id), CHECK ((error_code IS NULL AND error_message IS NULL) OR (length(error_code) > 0 AND length(error_message) > 0))) STRICT;" +
      "CREATE UNIQUE INDEX one_active_turn_per_session ON turns(session_id) WHERE status IN ('accepted', 'dispatching', 'running');" +
      "INSERT INTO runtime_configuration VALUES (1, '/opt/pi/bin/pi', NULL);" +
      "INSERT INTO sessions VALUES ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'payload-v2', '/tmp/project-v2', 'test-provider', 'test-model', '33333333-3333-4333-8333-333333333333', NULL, 0, 'ready', 1000, 1100, NULL);" +
      `INSERT INTO turns VALUES ('44444444-4444-4444-8444-444444444444', '${orphanTurn ? "missing-session" : "11111111-1111-4111-8111-111111111111"}', '55555555-5555-4555-8555-555555555555', '${"a".repeat(64)}', 'completed', 0, 1000, 1100, NULL, NULL, '[]');` +
      "PRAGMA user_version = 2;",
  );
  database.close();
}

function createV3Catalog(path: string): void {
  const database = new DatabaseSync(path, { enableForeignKeyConstraints: false });
  database.exec(
    "CREATE TABLE runtime_configuration (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), executable TEXT NOT NULL CHECK (length(executable) > 0), entry_point TEXT CHECK (entry_point IS NULL OR length(entry_point) > 0)) STRICT;" +
      "CREATE TABLE sessions (id TEXT NOT NULL PRIMARY KEY CHECK (length(id) > 0), request_id TEXT NOT NULL UNIQUE CHECK (length(request_id) > 0), payload_identity TEXT NOT NULL CHECK (length(payload_identity) > 0), directory TEXT NOT NULL CHECK (length(directory) > 0), provider TEXT CHECK (provider IS NULL OR length(provider) > 0), model TEXT CHECK (model IS NULL OR length(model) > 0), pi_session_id TEXT NOT NULL CHECK (length(pi_session_id) > 0), pi_session_file TEXT CHECK (pi_session_file IS NULL OR length(pi_session_file) > 0), history_expected INTEGER NOT NULL CHECK (history_expected IN (0, 1)), status TEXT NOT NULL CHECK (status IN ('creating', 'ready', 'failed', 'interrupted')), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error TEXT, CHECK ((provider IS NULL) = (model IS NULL)), CHECK (status != 'ready' OR provider IS NOT NULL)) STRICT;" +
      "CREATE TABLE turns (run_id TEXT NOT NULL PRIMARY KEY CHECK (length(run_id) > 0), session_id TEXT NOT NULL REFERENCES sessions(id), request_id TEXT NOT NULL CHECK (length(request_id) > 0), payload_identity TEXT NOT NULL CHECK (length(payload_identity) = 64), status TEXT NOT NULL CHECK (status IN ('accepted', 'dispatching', 'running', 'completed', 'failed', 'aborted', 'interrupted')), cancellation_requested INTEGER NOT NULL CHECK (cancellation_requested IN (0, 1)), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error_code TEXT, error_message TEXT, entry_ids TEXT NOT NULL CHECK (json_valid(entry_ids)), UNIQUE (session_id, request_id), CHECK ((error_code IS NULL AND error_message IS NULL) OR (length(error_code) > 0 AND length(error_message) > 0))) STRICT;" +
      "CREATE UNIQUE INDEX one_active_turn_per_session ON turns(session_id) WHERE status IN ('accepted', 'dispatching', 'running');" +
      "INSERT INTO runtime_configuration VALUES (1, '/opt/pi/bin/pi', NULL);" +
      "INSERT INTO sessions VALUES ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'payload-v3', '/tmp/project-v3', 'test-provider', 'test-model', '33333333-3333-4333-8333-333333333333', '/tmp/pi-session-v3.jsonl', 1, 'ready', 1000, 1100, NULL);" +
      `INSERT INTO turns VALUES ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', '${"a".repeat(64)}', 'completed', 0, 1000, 1100, NULL, NULL, '["entry-user","entry-assistant"]');` +
      "PRAGMA user_version = 3;",
  );
  database.close();
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

test("version-one catalogs migrate transactionally while preserving sessions and configuration", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-catalog-v1-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, "data");
  await mkdir(dataDir, { mode: 0o700 });
  const path = join(dataDir, "catalog.sqlite");
  const database = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  database.exec(
    "CREATE TABLE runtime_configuration (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), executable TEXT NOT NULL CHECK (length(executable) > 0), entry_point TEXT CHECK (entry_point IS NULL OR length(entry_point) > 0)) STRICT;" +
      "CREATE TABLE sessions (id TEXT NOT NULL PRIMARY KEY CHECK (length(id) > 0), request_id TEXT NOT NULL UNIQUE CHECK (length(request_id) > 0), payload_identity TEXT NOT NULL CHECK (length(payload_identity) > 0), directory TEXT NOT NULL CHECK (length(directory) > 0), provider TEXT NOT NULL CHECK (length(provider) > 0), model TEXT NOT NULL CHECK (length(model) > 0), pi_session_id TEXT NOT NULL CHECK (length(pi_session_id) > 0), pi_session_file TEXT CHECK (pi_session_file IS NULL OR length(pi_session_file) > 0), history_expected INTEGER NOT NULL CHECK (history_expected IN (0, 1)), status TEXT NOT NULL CHECK (status IN ('creating', 'ready', 'failed', 'interrupted')), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error TEXT) STRICT;" +
      "INSERT INTO runtime_configuration VALUES (1, '/opt/pi/bin/pi', NULL);" +
      "INSERT INTO sessions VALUES ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'payload-v1', '/tmp/project-v1', 'test-provider', 'test-model', '33333333-3333-4333-8333-333333333333', NULL, 1, 'ready', 1000, 1100, NULL);" +
      "PRAGMA user_version = 1;",
  );
  database.close();
  await chmod(path, 0o600);

  const catalog = await SessionCatalog.open(dataDir);
  t.after(() => catalog.close());
  assert.deepEqual(catalog.configuration(), { executable: "/opt/pi/bin/pi" });
  assert.deepEqual(catalog.list(), [
    {
      id: "11111111-1111-4111-8111-111111111111",
      requestId: "22222222-2222-4222-8222-222222222222",
      payloadIdentity: "payload-v1",
      directory: "/tmp/project-v1",
      provider: "test-provider",
      model: "test-model",
      thinkingLevel: null,
      piSessionId: "33333333-3333-4333-8333-333333333333",
      piSessionFile: null,
      historyExpected: true,
      status: "ready",
      createdAt: 1000,
      updatedAt: 1100,
      error: null,
    },
  ]);
  catalog.close();

  const migrated = new DatabaseSync(path, { readOnly: true, readBigInts: true });
  assert.equal(migrated.prepare("PRAGMA user_version").get()?.user_version, 4n);
  assert.equal(
    migrated.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE name = 'turns'").get()
      ?.count,
    1n,
  );
  migrated.close();
});

test("version-two migration preserves sessions, turns, indexes, and foreign keys", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-catalog-v2-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, "data");
  await mkdir(dataDir, { mode: 0o700 });
  const path = join(dataDir, "catalog.sqlite");
  createV2Catalog(path);
  await chmod(path, 0o600);

  const catalog = await SessionCatalog.open(dataDir);
  t.after(() => catalog.close());
  assert.equal(catalog.configuration()?.executable, "/opt/pi/bin/pi");
  assert.deepEqual(catalog.get("11111111-1111-4111-8111-111111111111"), {
    id: "11111111-1111-4111-8111-111111111111",
    requestId: "22222222-2222-4222-8222-222222222222",
    payloadIdentity: "payload-v2",
    directory: "/tmp/project-v2",
    provider: "test-provider",
    model: "test-model",
    thinkingLevel: null,
    piSessionId: "33333333-3333-4333-8333-333333333333",
    piSessionFile: null,
    historyExpected: false,
    status: "ready",
    createdAt: 1000,
    updatedAt: 1100,
    error: null,
  });
  assert.equal(catalog.listTurns()[0]?.runId, "44444444-4444-4444-8444-444444444444");
  catalog.insert(
    session({
      id: "66666666-6666-4666-8666-666666666666",
      requestId: "77777777-7777-4777-8777-777777777777",
      piSessionId: "88888888-8888-4888-8888-888888888888",
      provider: null,
      model: null,
    }),
  );
  assert.equal(catalog.get("66666666-6666-4666-8666-666666666666")?.provider, null);
  assert.equal(catalog.get("66666666-6666-4666-8666-666666666666")?.model, null);
  assert.throws(
    () =>
      catalog.insert(
        session({
          id: "99999999-9999-4999-8999-999999999999",
          requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          model: null,
        }),
      ),
    /Invalid stored session/i,
  );
  catalog.close();

  const migrated = new DatabaseSync(path, { readOnly: true, readBigInts: true });
  assert.equal(migrated.prepare("PRAGMA user_version").get()?.user_version, 4n);
  assert.deepEqual(migrated.prepare("PRAGMA foreign_key_check").all(), []);
  const index = migrated
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?")
    .get("one_active_turn_per_session");
  assert.ok(index);
  migrated.close();
});

test("version-three migration preserves sessions and turns while adding thinking level", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-catalog-v3-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, "data");
  await mkdir(dataDir, { mode: 0o700 });
  const path = join(dataDir, "catalog.sqlite");
  createV3Catalog(path);
  await chmod(path, 0o600);

  const catalog = await SessionCatalog.open(dataDir);
  t.after(() => catalog.close());
  assert.deepEqual(catalog.get("11111111-1111-4111-8111-111111111111"), {
    id: "11111111-1111-4111-8111-111111111111",
    requestId: "22222222-2222-4222-8222-222222222222",
    payloadIdentity: "payload-v3",
    directory: "/tmp/project-v3",
    provider: "test-provider",
    model: "test-model",
    thinkingLevel: null,
    piSessionId: "33333333-3333-4333-8333-333333333333",
    piSessionFile: "/tmp/pi-session-v3.jsonl",
    historyExpected: true,
    status: "ready",
    createdAt: 1000,
    updatedAt: 1100,
    error: null,
  });
  assert.deepEqual(catalog.listTurns(), [
    {
      runId: "44444444-4444-4444-8444-444444444444",
      sessionId: "11111111-1111-4111-8111-111111111111",
      requestId: "55555555-5555-4555-8555-555555555555",
      payloadIdentity: "a".repeat(64),
      status: "completed",
      cancellationRequested: false,
      createdAt: 1000,
      updatedAt: 1100,
      error: null,
      entryIds: ["entry-user", "entry-assistant"],
    },
  ]);
  catalog.close();

  const migrated = new DatabaseSync(path, { readOnly: true, readBigInts: true });
  assert.equal(migrated.prepare("PRAGMA user_version").get()?.user_version, 4n);
  assert.deepEqual(migrated.prepare("PRAGMA foreign_key_check").all(), []);
  assert.ok(
    migrated
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?")
      .get("one_active_turn_per_session"),
  );
  migrated.close();
});

test("version-two migration rolls back if preserved turns violate the session foreign key", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-catalog-v2-corrupt-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, "data");
  await mkdir(dataDir, { mode: 0o700 });
  const path = join(dataDir, "catalog.sqlite");
  createV2Catalog(path, true);
  await chmod(path, 0o600);

  await assert.rejects(SessionCatalog.open(dataDir), /foreign key|invalid/i);
  const unchanged = new DatabaseSync(path, { readOnly: true, readBigInts: true });
  assert.equal(unchanged.prepare("PRAGMA user_version").get()?.user_version, 2n);
  assert.equal(
    unchanged.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE name = 'sessions'").get()
      ?.count,
    1n,
  );
  assert.equal(
    unchanged
      .prepare("SELECT count(*) AS count FROM sqlite_schema WHERE name = 'sessions_v2'")
      .get()?.count,
    0n,
  );
  assert.equal(
    unchanged.prepare("SELECT run_id FROM turns").get()?.run_id,
    "44444444-4444-4444-8444-444444444444",
  );
  unchanged.close();
});

test("version-one schema rejection leaves the original catalog version and tables intact", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-catalog-v1-invalid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, "data");
  await mkdir(dataDir, { mode: 0o700 });
  const path = join(dataDir, "catalog.sqlite");
  const database = new DatabaseSync(path);
  database.exec(
    "CREATE TABLE runtime_configuration (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), executable TEXT NOT NULL CHECK (length(executable) > 0), entry_point TEXT CHECK (entry_point IS NULL OR length(entry_point) > 0)) STRICT;" +
      "CREATE TABLE sessions (id TEXT NOT NULL PRIMARY KEY CHECK (length(id) > 0), request_id TEXT NOT NULL UNIQUE CHECK (length(request_id) > 0), payload_identity TEXT NOT NULL CHECK (length(payload_identity) > 0), directory TEXT NOT NULL CHECK (length(directory) > 0), provider TEXT NOT NULL CHECK (length(provider) > 0), model TEXT NOT NULL CHECK (length(model) > 0), pi_session_id TEXT NOT NULL CHECK (length(pi_session_id) > 0), pi_session_file TEXT CHECK (pi_session_file IS NULL OR length(pi_session_file) > 0), history_expected INTEGER NOT NULL CHECK (history_expected IN (0, 1)), status TEXT NOT NULL CHECK (status IN ('creating', 'ready', 'failed', 'interrupted')), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error TEXT) STRICT;" +
      "CREATE TABLE unexpected (value TEXT) STRICT; PRAGMA user_version = 1;",
  );
  database.close();
  await chmod(path, 0o600);

  await assert.rejects(SessionCatalog.open(dataDir), /schema|version|unsupported/i);
  const unchanged = new DatabaseSync(path, { readOnly: true, readBigInts: true });
  assert.equal(unchanged.prepare("PRAGMA user_version").get()?.user_version, 1n);
  assert.equal(
    unchanged.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE name = 'turns'").get()
      ?.count,
    0n,
  );
  assert.equal(
    unchanged.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE name = 'unexpected'").get()
      ?.count,
    1n,
  );
  unchanged.close();
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
