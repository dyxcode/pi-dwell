import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CurrentLibrary } from "../src/integrations/current.ts";
import { SessionService } from "../src/sessions/service.ts";
import type { LibraryReference } from "../src/shared/library.ts";
import { SessionCatalog, type StoredSession, type StoredTurn } from "../src/storage/catalog.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

const currentModulePath = process.env.DWELL_TEST_CURRENT_MODULE;
const entryPoint = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry"));

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function turnCount(dataDir: string): number {
  const database = new DatabaseSync(join(dataDir, "catalog.sqlite"), { readOnly: true });
  try {
    const row = database.prepare("SELECT count(*) AS count FROM turns").get();
    return Number(row?.count ?? 0);
  } finally {
    database.close();
  }
}

test("library references persist exact versions without changing turns or Pi context", async (t) => {
  if (!currentModulePath) {
    t.skip("Set DWELL_TEST_CURRENT_MODULE to the built Current API v1 entry.");
    return;
  }
  const environment = await createPiEnvironment();
  const cleanup: Array<() => Promise<void>> = [];
  t.after(async () => {
    for (const close of cleanup.reverse()) await close();
    await environment.cleanup();
  });

  const root = join(environment.root, "current-library");
  const current = await import(pathToFileURL(currentModulePath).href);
  const writer = current.openContentLibrary({ root });
  cleanup.push(() => writer.close());

  const original = await save(writer, "article-one", "Original exact version.", "Original title.");
  const updated = await save(writer, "article-one", "Updated current version.", "Updated title.");
  assert.equal(original.itemId, updated.itemId);
  assert.notEqual(original.versionId, updated.versionId);
  const removedItem = await save(
    writer,
    "article-to-remove",
    "Temporary body.",
    "Temporary title.",
  );

  const library = await CurrentLibrary.open({
    module: currentModulePath,
    root,
    binding: "primary-current",
  });
  assert.ok(library);
  cleanup.push(() => library.close());

  const dataDir = join(environment.root, "dwell");
  const baseOptions = {
    dataDir,
    env: environment.env,
    extensions: [environment.extensionPath],
  };
  const options = { ...baseOptions, library };
  const service = await SessionService.create(options);
  cleanup.push(() => service.shutdown());
  await service.configure({ executable: process.execPath, entryPoint });
  const session = await service.createSession({
    requestId: randomUUID(),
    directory: environment.cwd,
  });
  assert.equal(session.status, "ready");
  const sessionMetadataBefore = {
    displayName: session.displayName,
    metadataRevision: session.metadataRevision,
    updatedAt: session.updatedAt,
  };

  const reference: LibraryReference = {
    binding: library.binding,
    itemId: original.itemId,
    versionId: original.versionId,
  };
  const contextBefore = await service.getContext(session.id);
  const turnsBefore = turnCount(dataDir);

  assert.deepEqual(await service.addLibraryReference(session.id, reference), [reference]);
  assert.deepEqual(await service.addLibraryReference(session.id, reference), [reference]);
  assert.deepEqual(service.listLibraryReferences(session.id), [reference]);
  assert.equal((await library.read(reference)).text, "Original exact version.");
  assert.equal(
    (await library.read({ ...reference, versionId: updated.versionId })).text,
    "Updated current version.",
  );

  const removedReference: LibraryReference = {
    binding: library.binding,
    itemId: removedItem.itemId,
    versionId: removedItem.versionId,
  };
  await service.addLibraryReference(session.id, removedReference);
  assert.deepEqual(
    new Set(service.listLibraryReferences(session.id)),
    new Set([reference, removedReference]),
  );
  assert.equal(await writer.remove(removedItem.itemId), true);
  assert.deepEqual(
    new Set(service.listLibraryReferences(session.id)),
    new Set([reference, removedReference]),
  );
  await assert.rejects(
    service.addLibraryReference(session.id, removedReference),
    (error: unknown) => hasCode(error, "library_not_found"),
  );
  assert.deepEqual(await service.removeLibraryReference(session.id, removedReference), [reference]);

  assert.deepEqual(await service.getContext(session.id), contextBefore);
  const sessionAfterReferences = service.getSession(session.id);
  assert.deepEqual(
    {
      displayName: sessionAfterReferences.displayName,
      metadataRevision: sessionAfterReferences.metadataRevision,
      updatedAt: sessionAfterReferences.updatedAt,
    },
    sessionMetadataBefore,
  );
  assert.equal(turnCount(dataDir), turnsBefore);
  await service.shutdown();

  const restarted = await SessionService.create(options);
  cleanup.push(() => restarted.shutdown());
  assert.deepEqual(restarted.listLibraryReferences(session.id), [reference]);
  assert.deepEqual(await restarted.getContext(session.id), contextBefore);
  assert.equal(turnCount(dataDir), turnsBefore);
  await restarted.shutdown();

  const otherRoot = join(environment.root, "another-current-library");
  const otherLibrary = await CurrentLibrary.open({
    module: currentModulePath,
    root: otherRoot,
    binding: library.binding,
  });
  assert.ok(otherLibrary);
  cleanup.push(() => otherLibrary.close());
  await assert.rejects(
    SessionService.create({ ...baseOptions, library: otherLibrary }),
    (error: unknown) => hasCode(error, "library_binding_mismatch"),
  );

  const offline = await SessionService.create(baseOptions);
  cleanup.push(() => offline.shutdown());
  assert.deepEqual(offline.listLibraryReferences(session.id), [reference]);
  assert.deepEqual(await offline.removeLibraryReference(session.id, reference), []);
  assert.deepEqual(offline.listLibraryReferences(session.id), []);
  await offline.shutdown();
  assert.equal(turnCount(dataDir), turnsBefore);
});

function createSchema6Catalog(path: string, session: StoredSession, turn: StoredTurn): void {
  const database = new DatabaseSync(path);
  try {
    database.exec(
      "CREATE TABLE runtime_configuration (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), executable TEXT NOT NULL CHECK (length(executable) > 0), entry_point TEXT CHECK (entry_point IS NULL OR length(entry_point) > 0)) STRICT",
    );
    database.exec(
      "CREATE TABLE sessions (id TEXT NOT NULL PRIMARY KEY CHECK (length(id) > 0), request_id TEXT NOT NULL UNIQUE CHECK (length(request_id) > 0), payload_identity TEXT NOT NULL CHECK (length(payload_identity) > 0), directory TEXT NOT NULL CHECK (length(directory) > 0), provider TEXT CHECK (provider IS NULL OR length(provider) > 0), model TEXT CHECK (model IS NULL OR length(model) > 0), pi_session_id TEXT NOT NULL CHECK (length(pi_session_id) > 0), pi_session_file TEXT CHECK (pi_session_file IS NULL OR length(pi_session_file) > 0), history_expected INTEGER NOT NULL CHECK (history_expected IN (0, 1)), status TEXT NOT NULL CHECK (status IN ('creating', 'ready', 'failed', 'interrupted')), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error TEXT, thinking_level TEXT CHECK (thinking_level IS NULL OR thinking_level IN ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')), history_check_state TEXT CHECK (history_check_state IS NULL OR history_check_state IN ('not-created', 'readable', 'missing', 'invalid')), history_checked_at INTEGER, display_name TEXT CHECK (display_name IS NULL OR (length(display_name) BETWEEN 1 AND 80 AND instr(display_name, char(0)) = 0)), metadata_revision INTEGER NOT NULL DEFAULT 0 CHECK (metadata_revision >= 0), CHECK ((provider IS NULL) = (model IS NULL)), CHECK (status != 'ready' OR provider IS NOT NULL)) STRICT",
    );
    database.exec(
      "CREATE TABLE turns (run_id TEXT NOT NULL PRIMARY KEY CHECK (length(run_id) > 0), session_id TEXT NOT NULL REFERENCES sessions(id), request_id TEXT NOT NULL CHECK (length(request_id) > 0), payload_identity TEXT NOT NULL CHECK (length(payload_identity) = 64), status TEXT NOT NULL CHECK (status IN ('accepted', 'dispatching', 'running', 'completed', 'failed', 'aborted', 'interrupted')), cancellation_requested INTEGER NOT NULL CHECK (cancellation_requested IN (0, 1)), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error_code TEXT, error_message TEXT, entry_ids TEXT NOT NULL CHECK (json_valid(entry_ids)), UNIQUE (session_id, request_id), CHECK ((error_code IS NULL AND error_message IS NULL) OR (length(error_code) > 0 AND length(error_message) > 0))) STRICT",
    );
    database.exec(
      "CREATE UNIQUE INDEX one_active_turn_per_session ON turns(session_id) WHERE status IN ('accepted', 'dispatching', 'running')",
    );
    database.prepare("INSERT INTO runtime_configuration VALUES (1, ?, NULL)").run("/usr/bin/false");
    database
      .prepare(
        "INSERT INTO sessions (id, request_id, payload_identity, directory, provider, model, pi_session_id, pi_session_file, history_expected, status, created_at, updated_at, error, thinking_level, history_check_state, history_checked_at, display_name, metadata_revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        session.id,
        session.requestId,
        session.payloadIdentity,
        session.directory,
        session.provider,
        session.model,
        session.piSessionId,
        session.piSessionFile,
        session.historyExpected ? 1 : 0,
        session.status,
        session.createdAt,
        session.updatedAt,
        session.error,
        session.thinkingLevel,
        session.historyCheck?.state ?? null,
        session.historyCheck?.checkedAt ?? null,
        session.displayName,
        session.metadataRevision,
      );
    database
      .prepare(
        "INSERT INTO turns (run_id, session_id, request_id, payload_identity, status, cancellation_requested, created_at, updated_at, error_code, error_message, entry_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        turn.runId,
        turn.sessionId,
        turn.requestId,
        turn.payloadIdentity,
        turn.status,
        turn.cancellationRequested ? 1 : 0,
        turn.createdAt,
        turn.updatedAt,
        turn.error?.code ?? null,
        turn.error?.message ?? null,
        JSON.stringify(turn.entryIds),
      );
    database.exec("PRAGMA user_version = 6");
  } finally {
    database.close();
  }
}

test("catalog schema v6 migrates to v8 and keeps names, turns, and usable references", async (t) => {
  const environment = await createPiEnvironment();
  t.after(environment.cleanup);
  const dataDir = join(environment.root, "schema-migration");
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const path = join(dataDir, "catalog.sqlite");
  await writeFile(path, "", { mode: 0o600 });
  const session: StoredSession = {
    id: randomUUID(),
    displayName: "Preserved v6 session name",
    metadataRevision: 4,
    requestId: randomUUID(),
    payloadIdentity: "a".repeat(64),
    directory: environment.cwd,
    provider: "test-provider",
    model: "test-model",
    thinkingLevel: "medium",
    piSessionId: randomUUID(),
    piSessionFile: null,
    historyExpected: true,
    historyCheck: { state: "readable", checkedAt: 2 },
    status: "ready",
    createdAt: 1,
    updatedAt: 3,
    error: null,
  };
  const turn: StoredTurn = {
    runId: randomUUID(),
    sessionId: session.id,
    requestId: randomUUID(),
    payloadIdentity: "b".repeat(64),
    status: "completed",
    cancellationRequested: false,
    createdAt: 4,
    updatedAt: 5,
    error: null,
    entryIds: ["legacy-entry"],
  };
  createSchema6Catalog(path, session, turn);

  const migrated = await SessionCatalog.open(dataDir);
  try {
    const check = new DatabaseSync(path, { readOnly: true });
    try {
      assert.equal(check.prepare("PRAGMA user_version").get()?.user_version, 8);
      assert.deepEqual(check.prepare("PRAGMA foreign_key_check").all(), []);
      assert.ok(
        check
          .prepare(
            "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'source_observations'",
          )
          .get(),
      );
    } finally {
      check.close();
    }
    assert.deepEqual(migrated.list(), [session]);
    assert.deepEqual(migrated.getTurn(session.id, turn.runId), turn);
    assert.equal(migrated.sourceObservation(session.id), undefined);
    assert.deepEqual(migrated.listLibraryReferences(session.id), []);

    const reference: LibraryReference = {
      binding: "migrated-current",
      itemId: "66666666-6666-4666-8666-666666666666",
      versionId: "77777777-7777-4777-8777-777777777777",
    };
    assert.equal(migrated.bindLibrary(reference.binding, join(environment.root, "library")), true);
    migrated.addLibraryReference(session.id, reference);
    assert.deepEqual(migrated.listLibraryReferences(session.id), [reference]);
    migrated.removeLibraryReference(session.id, reference);
    assert.deepEqual(migrated.listLibraryReferences(session.id), []);
  } finally {
    migrated.close();
  }
});

async function save(
  library: {
    save(request: unknown): Promise<{ items: { itemId: string; versionId: string }[] }>;
  },
  externalId: string,
  text: string,
  title: string,
): Promise<{ itemId: string; versionId: string }> {
  const now = new Date().toISOString();
  const batch = {
    id: randomUUID(),
    sourceId: "test-source",
    collectedAt: now,
    items: [
      {
        sourceId: "test-source",
        externalId,
        url: `https://example.test/${externalId}`,
        title,
        text,
        retrievedAt: now,
        discoveredAt: now,
        sourceCompleteness: "unknown",
        truncated: false,
      },
    ],
    failures: [],
    stopReason: "complete",
  };
  const saved = await library.save({ batch, requestedCount: 1, startedAt: now });
  const item = saved.items[0];
  assert.ok(item);
  return item;
}
