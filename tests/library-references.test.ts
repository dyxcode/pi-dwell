import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CurrentLibrary } from "../src/integrations/current.ts";
import { SessionService } from "../src/sessions/service.ts";
import type { LibraryReference } from "../src/shared/library.ts";
import { SessionCatalog } from "../src/storage/catalog.ts";
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

test("catalog schema v6 migrates to v7 without dropping existing session rows", async (t) => {
  const environment = await createPiEnvironment();
  t.after(environment.cleanup);
  const dataDir = join(environment.root, "schema-migration");
  const session = {
    id: randomUUID(),
    displayName: null,
    metadataRevision: 0,
    requestId: randomUUID(),
    payloadIdentity: "a".repeat(64),
    directory: environment.cwd,
    provider: null,
    model: null,
    thinkingLevel: null,
    piSessionId: randomUUID(),
    piSessionFile: null,
    historyExpected: false,
    historyCheck: null,
    status: "failed" as const,
    createdAt: 1,
    updatedAt: 1,
    error: "Synthetic migration fixture.",
  };
  const original = await SessionCatalog.open(dataDir);
  original.insert(session);
  original.close();

  const path = join(dataDir, "catalog.sqlite");
  const database = new DatabaseSync(path);
  try {
    const tables = database
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
      .all()
      .map((row) => row.name);
    if (tables.includes("session_library_references"))
      database.exec("DROP TABLE session_library_references");
    if (tables.includes("library_bindings")) database.exec("DROP TABLE library_bindings");
    database.exec("PRAGMA user_version = 6");
  } finally {
    database.close();
  }

  const migrated = await SessionCatalog.open(dataDir);
  try {
    const check = new DatabaseSync(path, { readOnly: true });
    try {
      assert.equal(check.prepare("PRAGMA user_version").get()?.user_version, 7);
    } finally {
      check.close();
    }
    assert.deepEqual(migrated.list(), [session]);
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
