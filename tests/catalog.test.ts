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
    displayName: null,
    metadataRevision: 0,
    requestId: "request-a",
    payloadIdentity: "payload-a",
    directory: "/tmp/project-a",
    provider: "test-provider",
    model: "test-model",
    thinkingLevel: null,
    piSessionId: "pi-session-a",
    piSessionFile: null,
    historyExpected: false,
    historyCheck: null,
    status: "creating",
    createdAt: 1000,
    updatedAt: 1000,
    error: null,
    ...overrides,
  };
}

function createV7Catalog(path: string, stored: StoredSession, libraryRoot: string): void {
  const database = new DatabaseSync(path);
  database.exec(
    "CREATE TABLE runtime_configuration (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), executable TEXT NOT NULL CHECK (length(executable) > 0), entry_point TEXT CHECK (entry_point IS NULL OR length(entry_point) > 0)) STRICT;" +
      "CREATE TABLE sessions (id TEXT NOT NULL PRIMARY KEY CHECK (length(id) > 0), request_id TEXT NOT NULL UNIQUE CHECK (length(request_id) > 0), payload_identity TEXT NOT NULL CHECK (length(payload_identity) > 0), directory TEXT NOT NULL CHECK (length(directory) > 0), provider TEXT CHECK (provider IS NULL OR length(provider) > 0), model TEXT CHECK (model IS NULL OR length(model) > 0), pi_session_id TEXT NOT NULL CHECK (length(pi_session_id) > 0), pi_session_file TEXT CHECK (pi_session_file IS NULL OR length(pi_session_file) > 0), history_expected INTEGER NOT NULL CHECK (history_expected IN (0, 1)), status TEXT NOT NULL CHECK (status IN ('creating', 'ready', 'failed', 'interrupted')), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error TEXT, thinking_level TEXT CHECK (thinking_level IS NULL OR thinking_level IN ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')), history_check_state TEXT CHECK (history_check_state IS NULL OR history_check_state IN ('not-created', 'readable', 'missing', 'invalid')), history_checked_at INTEGER, display_name TEXT CHECK (display_name IS NULL OR (length(display_name) BETWEEN 1 AND 80 AND instr(display_name, char(0)) = 0)), metadata_revision INTEGER NOT NULL DEFAULT 0 CHECK (metadata_revision >= 0), CHECK ((provider IS NULL) = (model IS NULL)), CHECK (status != 'ready' OR provider IS NOT NULL)) STRICT;" +
      "CREATE TABLE turns (run_id TEXT NOT NULL PRIMARY KEY CHECK (length(run_id) > 0), session_id TEXT NOT NULL REFERENCES sessions(id), request_id TEXT NOT NULL CHECK (length(request_id) > 0), payload_identity TEXT NOT NULL CHECK (length(payload_identity) = 64), status TEXT NOT NULL CHECK (status IN ('accepted', 'dispatching', 'running', 'completed', 'failed', 'aborted', 'interrupted')), cancellation_requested INTEGER NOT NULL CHECK (cancellation_requested IN (0, 1)), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error_code TEXT, error_message TEXT, entry_ids TEXT NOT NULL CHECK (json_valid(entry_ids)), UNIQUE (session_id, request_id), CHECK ((error_code IS NULL AND error_message IS NULL) OR (length(error_code) > 0 AND length(error_message) > 0))) STRICT;" +
      "CREATE UNIQUE INDEX one_active_turn_per_session ON turns(session_id) WHERE status IN ('accepted', 'dispatching', 'running');" +
      "CREATE TABLE library_bindings (binding TEXT NOT NULL PRIMARY KEY CHECK (length(binding) BETWEEN 1 AND 64 AND instr(binding, char(0)) = 0), root TEXT NOT NULL CHECK (length(root) > 0 AND instr(root, char(0)) = 0)) STRICT;" +
      "CREATE TABLE session_library_references (session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, binding TEXT NOT NULL REFERENCES library_bindings(binding), item_id TEXT NOT NULL CHECK (length(item_id) = 36), version_id TEXT NOT NULL CHECK (length(version_id) = 36), PRIMARY KEY (session_id, binding, item_id, version_id)) STRICT;",
  );
  database.prepare("INSERT INTO runtime_configuration VALUES (1, ?, NULL)").run("/usr/bin/false");
  database
    .prepare(
      "INSERT INTO sessions (id, request_id, payload_identity, directory, provider, model, pi_session_id, pi_session_file, history_expected, status, created_at, updated_at, error, thinking_level, history_check_state, history_checked_at, display_name, metadata_revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      stored.id,
      stored.requestId,
      stored.payloadIdentity,
      stored.directory,
      stored.provider,
      stored.model,
      stored.piSessionId,
      stored.piSessionFile,
      stored.historyExpected ? 1 : 0,
      stored.status,
      stored.createdAt,
      stored.updatedAt,
      stored.error,
      stored.thinkingLevel,
      stored.historyCheck?.state ?? null,
      stored.historyCheck?.checkedAt ?? null,
      stored.displayName,
      stored.metadataRevision,
    );
  database
    .prepare("INSERT INTO turns VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(
      "44444444-4444-4444-8444-444444444444",
      stored.id,
      "55555555-5555-4555-8555-555555555555",
      "a".repeat(64),
      "completed",
      0,
      1000,
      1100,
      null,
      null,
      '["synthetic-entry"]',
    );
  database
    .prepare("INSERT INTO library_bindings VALUES (?, ?)")
    .run("synthetic-library", libraryRoot);
  database
    .prepare("INSERT INTO session_library_references VALUES (?, ?, ?, ?)")
    .run(
      stored.id,
      "synthetic-library",
      "66666666-6666-4666-8666-666666666666",
      "77777777-7777-4777-8777-777777777777",
    );
  database.exec("PRAGMA user_version = 7");
  database.close();
}

test("schema-seven migration preserves turns and exact library references", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-catalog-v7-retirement-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, "data");
  const libraryRoot = join(root, "library");
  await mkdir(dataDir, { mode: 0o700 });
  await mkdir(libraryRoot);
  const record = session({
    id: "11111111-1111-4111-8111-111111111111",
    requestId: "22222222-2222-4222-8222-222222222222",
    piSessionId: "33333333-3333-4333-8333-333333333333",
    status: "ready",
    provider: "test-provider",
    model: "test-model",
    displayName: "Catalog migration",
    metadataRevision: 7,
  });
  const turn = {
    runId: "44444444-4444-4444-8444-444444444444",
    sessionId: record.id,
    requestId: "55555555-5555-4555-8555-555555555555",
    payloadIdentity: "a".repeat(64),
    status: "completed" as const,
    cancellationRequested: false,
    createdAt: 1000,
    updatedAt: 1100,
    error: null,
    entryIds: ["synthetic-entry"],
  };
  const reference = {
    binding: "synthetic-library",
    itemId: "66666666-6666-4666-8666-666666666666",
    versionId: "77777777-7777-4777-8777-777777777777",
  };
  const databasePath = join(dataDir, "catalog.sqlite");
  createV7Catalog(databasePath, record, libraryRoot);
  await chmod(databasePath, 0o600);
  const before = new DatabaseSync(databasePath);
  assert.equal(before.prepare("PRAGMA user_version").get()?.user_version, 7);
  before.close();
  const migrated = await SessionCatalog.open(dataDir);
  t.after(() => migrated.close());
  const version = new DatabaseSync(databasePath);
  assert.equal(version.prepare("PRAGMA user_version").get()?.user_version, 8);
  assert.ok(
    version
      .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'source_observations'")
      .get(),
  );
  assert.deepEqual(version.prepare("PRAGMA foreign_key_check").all(), []);
  version.close();
  assert.deepEqual(migrated.get(record.id), record);
  assert.deepEqual(migrated.getTurn(record.id, turn.runId), turn);
  assert.deepEqual(migrated.listLibraryReferences(record.id), [reference]);
  assert.equal(migrated.bindLibrary("synthetic-library", libraryRoot), true);
});

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

function createV5Catalog(path: string): void {
  const database = new DatabaseSync(path, { enableForeignKeyConstraints: false });
  database.exec(
    "CREATE TABLE runtime_configuration (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), executable TEXT NOT NULL CHECK (length(executable) > 0), entry_point TEXT CHECK (entry_point IS NULL OR length(entry_point) > 0)) STRICT;" +
      "CREATE TABLE sessions (id TEXT NOT NULL PRIMARY KEY CHECK (length(id) > 0), request_id TEXT NOT NULL UNIQUE CHECK (length(request_id) > 0), payload_identity TEXT NOT NULL CHECK (length(payload_identity) > 0), directory TEXT NOT NULL CHECK (length(directory) > 0), provider TEXT CHECK (provider IS NULL OR length(provider) > 0), model TEXT CHECK (model IS NULL OR length(model) > 0), pi_session_id TEXT NOT NULL CHECK (length(pi_session_id) > 0), pi_session_file TEXT CHECK (pi_session_file IS NULL OR length(pi_session_file) > 0), history_expected INTEGER NOT NULL CHECK (history_expected IN (0, 1)), status TEXT NOT NULL CHECK (status IN ('creating', 'ready', 'failed', 'interrupted')), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error TEXT, thinking_level TEXT CHECK (thinking_level IS NULL OR thinking_level IN ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')), history_check_state TEXT CHECK (history_check_state IS NULL OR history_check_state IN ('not-created', 'readable', 'missing', 'invalid')), history_checked_at INTEGER, CHECK ((provider IS NULL) = (model IS NULL)), CHECK (status != 'ready' OR provider IS NOT NULL)) STRICT;" +
      "CREATE TABLE turns (run_id TEXT NOT NULL PRIMARY KEY CHECK (length(run_id) > 0), session_id TEXT NOT NULL REFERENCES sessions(id), request_id TEXT NOT NULL CHECK (length(request_id) > 0), payload_identity TEXT NOT NULL CHECK (length(payload_identity) = 64), status TEXT NOT NULL CHECK (status IN ('accepted', 'dispatching', 'running', 'completed', 'failed', 'aborted', 'interrupted')), cancellation_requested INTEGER NOT NULL CHECK (cancellation_requested IN (0, 1)), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error_code TEXT, error_message TEXT, entry_ids TEXT NOT NULL CHECK (json_valid(entry_ids)), UNIQUE (session_id, request_id), CHECK ((error_code IS NULL AND error_message IS NULL) OR (length(error_code) > 0 AND length(error_message) > 0))) STRICT;" +
      "CREATE UNIQUE INDEX one_active_turn_per_session ON turns(session_id) WHERE status IN ('accepted', 'dispatching', 'running');" +
      "INSERT INTO runtime_configuration VALUES (1, '/opt/pi/bin/pi', NULL);" +
      "INSERT INTO sessions VALUES ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'payload-v5', '/tmp/project-v5', 'test-provider', 'test-model', '33333333-3333-4333-8333-333333333333', '/tmp/pi-session-v5.jsonl', 1, 'ready', 1000, 1100, NULL, 'high', 'readable', 1050);" +
      `INSERT INTO turns VALUES ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', '${"a".repeat(64)}', 'completed', 0, 1000, 1100, NULL, NULL, '["entry-user","entry-assistant"]');` +
      "PRAGMA user_version = 5;",
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
      displayName: null,
      metadataRevision: 0,
      requestId: "22222222-2222-4222-8222-222222222222",
      payloadIdentity: "payload-v1",
      directory: "/tmp/project-v1",
      provider: "test-provider",
      model: "test-model",
      thinkingLevel: null,
      piSessionId: "33333333-3333-4333-8333-333333333333",
      piSessionFile: null,
      historyExpected: true,
      historyCheck: null,
      status: "ready",
      createdAt: 1000,
      updatedAt: 1100,
      error: null,
    },
  ]);
  catalog.close();

  const migrated = new DatabaseSync(path, { readOnly: true, readBigInts: true });
  assert.equal(migrated.prepare("PRAGMA user_version").get()?.user_version, 8n);
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
    displayName: null,
    metadataRevision: 0,
    requestId: "22222222-2222-4222-8222-222222222222",
    payloadIdentity: "payload-v2",
    directory: "/tmp/project-v2",
    provider: "test-provider",
    model: "test-model",
    thinkingLevel: null,
    piSessionId: "33333333-3333-4333-8333-333333333333",
    piSessionFile: null,
    historyExpected: false,
    historyCheck: null,
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
  assert.equal(migrated.prepare("PRAGMA user_version").get()?.user_version, 8n);
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
    displayName: null,
    metadataRevision: 0,
    requestId: "22222222-2222-4222-8222-222222222222",
    payloadIdentity: "payload-v3",
    directory: "/tmp/project-v3",
    provider: "test-provider",
    model: "test-model",
    thinkingLevel: null,
    piSessionId: "33333333-3333-4333-8333-333333333333",
    piSessionFile: "/tmp/pi-session-v3.jsonl",
    historyExpected: true,
    historyCheck: null,
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
  assert.equal(migrated.prepare("PRAGMA user_version").get()?.user_version, 8n);
  assert.deepEqual(migrated.prepare("PRAGMA foreign_key_check").all(), []);
  assert.ok(
    migrated
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?")
      .get("one_active_turn_per_session"),
  );
  migrated.close();
});

test("version-five migration adds shared names without changing sessions or turns", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-catalog-v5-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, "data");
  await mkdir(dataDir, { mode: 0o700 });
  const path = join(dataDir, "catalog.sqlite");
  createV5Catalog(path);
  await chmod(path, 0o600);

  const catalog = await SessionCatalog.open(dataDir);
  t.after(() => catalog.close());
  const session = catalog.get("11111111-1111-4111-8111-111111111111");
  assert.ok(session);
  assert.equal(Reflect.get(session, "displayName"), null);
  assert.equal(Reflect.get(session, "metadataRevision"), 0);
  assert.equal(session.historyCheck?.state, "readable");
  assert.equal(session.historyCheck?.checkedAt, 1050);
  assert.equal(catalog.listTurns()[0]?.runId, "44444444-4444-4444-8444-444444444444");
  assert.deepEqual(catalog.configuration(), { executable: "/opt/pi/bin/pi" });

  assert.throws(() => catalog.rename(session.id, "Embedded\0null", 0, 1200), /session name/i);
  const staleObservation = catalog.get(session.id);
  assert.ok(staleObservation);
  assert.equal(catalog.rename(session.id, "Shared name", 0, 1200)?.metadataRevision, 1);
  catalog.update({
    ...staleObservation,
    historyCheck: { state: "readable", checkedAt: 1250 },
  });
  assert.equal(catalog.get(session.id)?.displayName, "Shared name");
  assert.equal(catalog.get(session.id)?.metadataRevision, 1);

  const exhausted = {
    ...staleObservation,
    id: "66666666-6666-4666-8666-666666666666",
    requestId: "77777777-7777-4777-8777-777777777777",
    displayName: "At limit",
    metadataRevision: Number.MAX_SAFE_INTEGER,
  };
  catalog.insert(exhausted);
  assert.throws(
    () => catalog.rename(exhausted.id, "Beyond limit", Number.MAX_SAFE_INTEGER, 1300),
    RangeError,
  );
  assert.equal(catalog.get(exhausted.id)?.metadataRevision, Number.MAX_SAFE_INTEGER);
  catalog.close();

  const migrated = new DatabaseSync(path, { readOnly: true, readBigInts: true });
  assert.equal(migrated.prepare("PRAGMA user_version").get()?.user_version, 8n);
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
  const observed = {
    ...ready,
    historyCheck: { state: "readable" as const, checkedAt: 1550 },
  };
  catalog.update(observed);
  assert.deepEqual(catalog.list(), [observed, tied, later]);
  assert.deepEqual(catalog.get(first.id), observed);
  assert.deepEqual(catalog.findRequest(first.requestId), observed);
  assert.equal(catalog.get("missing"), undefined);
  assert.equal(catalog.findRequest("missing"), undefined);

  catalog.close();
  active = undefined;
  const reopened = await SessionCatalog.open(dataDir);
  active = reopened;
  assert.deepEqual(reopened.list(), [observed, tied, later]);
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
