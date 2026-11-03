import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { openDistill } from "../src/integrations/distill.ts";
import { SessionError, SessionService } from "../src/sessions/service.ts";
import { SessionSourceAccess } from "../src/sessions/source-access.ts";
import { SessionCatalog, type StoredSession } from "../src/storage/catalog.ts";

const distillModulePath = process.env.DWELL_TEST_DISTILL_MODULE;

interface SourceRef {
  sessionId: string;
  sessionFile: string;
  cwd: string;
}

interface PlannedSource extends SourceRef {
  id: string;
  leafId: string | null;
  sourceKeys: readonly string[];
  lineageSessionIds?: readonly string[];
  sourceTime?: string;
  branchAnchor?: string;
  evidence: readonly unknown[];
  context: readonly unknown[];
}

interface MemoryStore {
  readonly sources: {
    register(source: SourceRef): void;
    get(
      sessionFile: string,
      sessionId: string,
    ): { generation: string; deleted: boolean } | undefined;
  };
  enqueueConsolidation(job: Omit<PlannedSource, "evidence" | "context">): void;
  claimConsolidation(id: string, owner: string, now: number, leaseMs: number): boolean;
  commitConsolidation(input: {
    jobId: string;
    owner: string;
    now: number;
    creates: readonly [];
    updates: readonly [];
    deletes: readonly [];
  }): void;
  releaseConsolidation(id: string, owner: string): void;
  saveSessionUsage(input: {
    ownerId: string;
    processToken: string;
    ownerPid: number;
    state: "active" | "closing" | "released";
    sessionId: string;
    sessionFile: string;
    cwd: string;
    leafId: string | null;
  }): void;
  enqueueCleanTask(input: {
    sessionId: string;
    sessionFile: string;
    leafId: string | null;
    cwd: string;
    reason: "close";
    intentId: string;
  }): void;
  close(): void;
}

interface CleanupCoordinator {
  wake(): void;
  whenIdle(): Promise<void>;
  close(): void;
}

interface DistillInternals {
  SQLiteMemoryStore: new (path: string) => MemoryStore;
  CleanupCoordinator: new (options: {
    openStore(): MemoryStore;
    retryDelayMs: number;
  }) => CleanupCoordinator;
  loadSnapshot(path: string): Promise<unknown>;
  planSources(snapshot: unknown, excluded: Set<string>): Iterable<PlannedSource>;
}

function isDistillInternals(value: unknown): value is DistillInternals {
  return (
    typeof value === "object" &&
    value !== null &&
    "SQLiteMemoryStore" in value &&
    typeof value.SQLiteMemoryStore === "function" &&
    "CleanupCoordinator" in value &&
    typeof value.CleanupCoordinator === "function" &&
    "loadSnapshot" in value &&
    typeof value.loadSnapshot === "function" &&
    "planSources" in value &&
    typeof value.planSources === "function"
  );
}

function sessionRecord(input: {
  id: string;
  piSessionId: string;
  directory: string;
  sessionFile: string;
  now: number;
}): StoredSession {
  return {
    id: input.id,
    displayName: "Synthetic retirement session",
    metadataRevision: 4,
    requestId: randomUUID(),
    payloadIdentity: "b".repeat(64),
    directory: input.directory,
    provider: "synthetic-provider",
    model: "synthetic-model",
    thinkingLevel: null,
    piSessionId: input.piSessionId,
    piSessionFile: input.sessionFile,
    historyExpected: true,
    historyCheck: null,
    status: "ready",
    createdAt: input.now,
    updatedAt: input.now,
    error: null,
  };
}

test("actual Distill cleanup retires the exact cached source and restored files clear retirement", {
  skip: !distillModulePath,
}, async (t) => {
  assert.ok(distillModulePath);
  const root = await realpath(await mkdtemp(join(tmpdir(), "dwell-history-retirement-")));
  const dataDir = join(root, "dwell");
  const projectDir = join(root, "project");
  const dwellSessionId = randomUUID();
  const sessionsDir = join(dataDir, "sessions", dwellSessionId);
  await mkdir(projectDir, { recursive: true, mode: 0o700 });
  await mkdir(sessionsDir, { recursive: true, mode: 0o700 });

  const manager = SessionManager.inMemory(projectDir);
  for (let index = 0; index < 105; index++)
    manager.appendMessage({
      role: "user",
      content: `Synthetic retirement entry ${index}.`,
      timestamp: index + 1,
    });
  const sessionFile = join(sessionsDir, `1_${manager.getSessionId()}.jsonl`);
  const originalBytes = [manager.getHeader(), ...manager.getEntries()]
    .map((entry) => JSON.stringify(entry))
    .join("\n")
    .concat("\n");
  await writeFile(sessionFile, originalBytes, { mode: 0o600 });

  const databasePath = join(root, "memory.sqlite");
  const host = await openDistill({ module: distillModulePath, database: databasePath });
  let service: SessionService | undefined;
  let cleanup: CleanupCoordinator | undefined;
  let memoryStore: MemoryStore | undefined;
  let blockNextReadableCheck = false;
  let releaseReadableCheck!: () => void;
  let announceReadableCheck!: () => void;
  const readableCheckEntered = new Promise<void>((resolve) => {
    announceReadableCheck = resolve;
  });
  const readableCheckReleased = new Promise<void>((resolve) => {
    releaseReadableCheck = resolve;
  });
  t.after(async () => {
    releaseReadableCheck();
    await service?.shutdown();
    cleanup?.close();
    memoryStore?.close();
    host.close();
    await rm(root, { recursive: true, force: true });
  });

  const distillSourceRoot = resolve(dirname(distillModulePath), "../src");
  const internal = async (path: string): Promise<unknown> =>
    import(pathToFileURL(resolve(distillSourceRoot, path)).href);
  const [storeModule, snapshotModule, preparationModule, cleanupModule] = await Promise.all([
    internal("storage/store.ts"),
    internal("sources/snapshot.ts"),
    internal("distill/preparation.ts"),
    internal("retention/coordinator.ts"),
  ]);
  const combinedModules = Object.assign(
    {},
    storeModule,
    snapshotModule,
    preparationModule,
    cleanupModule,
  );
  assert.ok(isDistillInternals(combinedModules), "Distill checkout must expose cleanup internals");
  const { SQLiteMemoryStore, loadSnapshot, planSources } = combinedModules;
  const { CleanupCoordinator: Cleanup } = combinedModules;
  memoryStore = new SQLiteMemoryStore(databasePath);
  const source: SourceRef = {
    sessionId: manager.getSessionId(),
    sessionFile,
    cwd: projectDir,
  };
  memoryStore.sources.register(source);
  for (const { evidence: _evidence, context: _context, ...job } of planSources(
    await loadSnapshot(sessionFile),
    new Set(),
  )) {
    memoryStore.enqueueConsolidation(job);
    assert.equal(
      memoryStore.claimConsolidation(job.id, "retirement-test", Date.now(), 60_000),
      true,
    );
    memoryStore.commitConsolidation({
      jobId: job.id,
      owner: "retirement-test",
      now: Date.now(),
      creates: [],
      updates: [],
      deletes: [],
    });
    memoryStore.releaseConsolidation(job.id, "retirement-test");
  }
  const usage = {
    ownerId: "retirement-test",
    processToken: "retirement-test",
    ownerPid: process.pid,
    state: "active" as const,
    ...source,
    leafId: manager.getLeafId(),
  };
  memoryStore.saveSessionUsage(usage);
  memoryStore.saveSessionUsage({ ...usage, state: "closing" });
  memoryStore.saveSessionUsage({ ...usage, state: "released" });
  const deletionIntent = randomUUID();
  memoryStore.enqueueCleanTask({
    ...source,
    leafId: manager.getLeafId(),
    reason: "close",
    intentId: deletionIntent,
  });
  cleanup = new Cleanup({
    openStore: () => new SQLiteMemoryStore(databasePath),
    retryDelayMs: 100_000,
  });

  const catalog = await SessionCatalog.open(dataDir);
  const now = Date.now();
  catalog.configure({ executable: "/usr/bin/false" });
  catalog.insert(
    sessionRecord({
      id: dwellSessionId,
      piSessionId: manager.getSessionId(),
      directory: projectDir,
      sessionFile,
      now,
    }),
  );
  const finalEntry = manager.getEntries().at(-1);
  assert.ok(finalEntry && typeof finalEntry.id === "string");
  const turnId = randomUUID();
  catalog.insertTurn({
    runId: turnId,
    sessionId: dwellSessionId,
    requestId: randomUUID(),
    status: "completed",
    cancellationRequested: false,
    createdAt: now,
    updatedAt: now,
    error: null,
    entryIds: [finalEntry.id],
    payloadIdentity: "c".repeat(64),
  });
  catalog.close();
  service = await SessionService.create({
    dataDir,
    distill: host,
    historyCheckCheckpoint: async (state) => {
      if (!blockNextReadableCheck || state !== "readable") return;
      blockNextReadableCheck = false;
      announceReadableCheck();
      await readableCheckReleased;
    },
  });

  const before = await service.getHistory(dwellSessionId);
  assert.equal(before.status, "available");
  assert.ok(before.nextCursor, "fixture should capture a cursor before retirement");
  const readLease = host.acquireSourceRead(source);
  assert.ok(readLease?.sourceGeneration);
  const cachedGeneration = readLease.sourceGeneration;
  readLease.release();
  assert.equal(
    memoryStore.sources.get(sessionFile, source.sessionId)?.generation,
    cachedGeneration,
  );

  blockNextReadableCheck = true;
  const olderHistoryRead = service.getHistory(dwellSessionId);
  await readableCheckEntered;

  const access = new SessionSourceAccess(host);
  const checkedRead = await access.read(
    {
      piSessionId: manager.getSessionId(),
      piSessionFile: sessionFile,
      directory: projectDir,
    },
    sessionFile,
    async () => {
      const contents = await readFile(sessionFile, "utf8");
      cleanup?.wake();
      await cleanup?.whenIdle();
      return contents;
    },
    cachedGeneration,
  );
  assert.ok(checkedRead.value.length > 0);
  assert.equal(checkedRead.completedDeletion, undefined);
  assert.ok(await readFile(sessionFile), "cleanup waited for the checked read lease");

  cleanup.wake();
  await cleanup.whenIdle();
  await access.drain();
  await assert.rejects(readFile(sessionFile), { code: "ENOENT" });
  assert.equal(
    host.getCompletedDeletion({ ...source, sourceGeneration: cachedGeneration })?.intentId,
    deletionIntent,
  );

  // Simulate registry metadata collection after real cleanup; the completed receipt remains.
  const raw = new DatabaseSync(databasePath);
  raw
    .prepare("DELETE FROM managed_sources WHERE session_file = ? AND session_id = ?")
    .run(sessionFile, source.sessionId);
  raw.close();

  await assert.rejects(service.getHistory(dwellSessionId), (error: unknown) => {
    assert.ok(error instanceof SessionError);
    assert.equal(error.code, "history_retired");
    return true;
  });
  releaseReadableCheck();
  await assert.rejects(olderHistoryRead, (error: unknown) => {
    assert.ok(error instanceof SessionError);
    assert.equal(error.code, "history_retired");
    return true;
  });
  const retiredSession = service.getSession(dwellSessionId);
  assert.equal(retiredSession.historyCheck?.state, "retired");
  assert.equal(retiredSession.displayName, "Synthetic retirement session");
  assert.equal(retiredSession.metadataRevision, 4);
  assert.equal(service.getTurn(dwellSessionId, turnId).runId, turnId);
  await assert.rejects(service.getTurnResult(dwellSessionId, turnId), (error: unknown) => {
    assert.ok(error instanceof SessionError);
    assert.equal(error.code, "history_retired");
    return true;
  });
  await assert.rejects(service.getHistory(dwellSessionId, before.nextCursor), (error: unknown) => {
    assert.ok(error instanceof SessionError);
    assert.equal(error.code, "history_retired");
    return true;
  });
  await assert.rejects(service.openSession(dwellSessionId), (error: unknown) => {
    assert.ok(error instanceof SessionError);
    assert.equal(error.code, "history_retired");
    return true;
  });

  await service.shutdown();
  service = await SessionService.create({ dataDir });
  await assert.rejects(service.getHistory(dwellSessionId), (error: unknown) => {
    assert.ok(error instanceof SessionError);
    assert.equal(error.code, "history_retired");
    return true;
  });

  // A newly registered source generation cannot inherit the old generation's
  // retired state when the replacement disappears before Dwell reads it.
  await service.shutdown();
  await writeFile(sessionFile, originalBytes, { mode: 0o600 });
  memoryStore.sources.register(source);
  const retirementReplacementGeneration = memoryStore.sources.get(
    sessionFile,
    source.sessionId,
  )?.generation;
  assert.ok(retirementReplacementGeneration);
  assert.notEqual(retirementReplacementGeneration, cachedGeneration);
  await rm(sessionFile);
  service = await SessionService.create({ dataDir, distill: host });
  await assert.rejects(service.openSession(dwellSessionId), (error: unknown) => {
    assert.ok(error instanceof SessionError);
    assert.equal(error.code, "history_unavailable");
    return true;
  });
  assert.equal(service.runtimeCount, 0);
  assert.equal(service.getSession(dwellSessionId).historyCheck?.state, "missing");
  await assert.rejects(service.getHistory(dwellSessionId), (error: unknown) => {
    assert.ok(error instanceof SessionError);
    assert.equal(error.code, "history_unavailable");
    return true;
  });
  assert.equal(service.getSession(dwellSessionId).historyCheck?.state, "missing");

  await service.shutdown();
  service = await SessionService.create({ dataDir });

  // A restored, readable file clears retirement even while Distill is unavailable.
  await writeFile(sessionFile, originalBytes, { mode: 0o600 });
  const restored = await service.getHistory(dwellSessionId);
  assert.equal(restored.status, "available");
  assert.equal(service.getSession(dwellSessionId).historyCheck?.state, "readable");
  await assert.rejects(service.getHistory(dwellSessionId, before.nextCursor), (error: unknown) => {
    assert.ok(error instanceof SessionError);
    assert.equal(error.code, "invalid_cursor");
    return true;
  });

  await rm(sessionFile);
  await service.shutdown();
  service = await SessionService.create({ dataDir, distill: host });
  await assert.rejects(service.getHistory(dwellSessionId), (error: unknown) => {
    assert.ok(error instanceof SessionError);
    assert.equal(error.code, "history_unavailable");
    return true;
  });
  assert.equal(service.getSession(dwellSessionId).historyCheck?.state, "missing");

  // A different observed generation cannot inherit the earlier deletion receipt.
  await writeFile(sessionFile, originalBytes, { mode: 0o600 });
  memoryStore.sources.register(source);
  const replacementGeneration = memoryStore.sources.get(sessionFile, source.sessionId)?.generation;
  assert.ok(replacementGeneration);
  assert.notEqual(replacementGeneration, cachedGeneration);
  assert.equal((await service.getHistory(dwellSessionId)).status, "available");
  await rm(sessionFile);
  await assert.rejects(service.getHistory(dwellSessionId), (error: unknown) => {
    assert.ok(error instanceof SessionError);
    assert.equal(error.code, "history_unavailable");
    return true;
  });
  assert.equal(service.getSession(dwellSessionId).historyCheck?.state, "missing");
});

test("concurrent history reads settle and manual removal remains missing without a receipt", async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "dwell-manual-history-removal-")));
  const dataDir = join(root, "dwell");
  const projectDir = join(root, "project");
  const id = randomUUID();
  const sessionDirectory = join(dataDir, "sessions", id);
  await mkdir(projectDir, { recursive: true, mode: 0o700 });
  await mkdir(sessionDirectory, { recursive: true, mode: 0o700 });
  const manager = SessionManager.inMemory(projectDir);
  const piSessionId = manager.getSessionId();
  manager.appendMessage({ role: "user", content: "Synthetic manual removal.", timestamp: 1 });
  const sessionFile = join(sessionDirectory, `1_${piSessionId}.jsonl`);
  await writeFile(
    sessionFile,
    [manager.getHeader(), ...manager.getEntries()]
      .map((entry) => JSON.stringify(entry))
      .join("\n")
      .concat("\n"),
    { mode: 0o600 },
  );
  const catalog = await SessionCatalog.open(dataDir);
  const now = Date.now();
  catalog.insert(sessionRecord({ id, piSessionId, directory: projectDir, sessionFile, now }));
  catalog.close();
  let readableChecks = 0;
  let enteredPair!: () => void;
  let releasePair!: () => void;
  let missingChecks = 0;
  let enteredMissingPair!: () => void;
  let releaseMissingPair!: () => void;
  const pairEntered = new Promise<void>((resolve) => {
    enteredPair = resolve;
  });
  const pairReleased = new Promise<void>((resolve) => {
    releasePair = resolve;
  });
  const missingPairEntered = new Promise<void>((resolve) => {
    enteredMissingPair = resolve;
  });
  const missingPairReleased = new Promise<void>((resolve) => {
    releaseMissingPair = resolve;
  });
  const service = await SessionService.create({
    dataDir,
    historyCheckCheckpoint: async (state) => {
      if (state === "readable") {
        readableChecks++;
        if (readableChecks > 8) throw new Error("Concurrent readable checks kept retrying.");
        if (readableChecks <= 2) {
          if (readableChecks === 2) enteredPair();
          await pairReleased;
        }
      } else if (state === "missing") {
        missingChecks++;
        if (missingChecks > 8) throw new Error("Concurrent missing checks kept retrying.");
        if (missingChecks <= 2) {
          if (missingChecks === 2) enteredMissingPair();
          await missingPairReleased;
        }
      }
    },
  });
  t.after(async () => {
    releasePair();
    releaseMissingPair();
    await service.shutdown();
    await rm(root, { recursive: true, force: true });
  });

  const pages = Promise.all([service.getHistory(id), service.getHistory(id)]);
  await pairEntered;
  releasePair();
  const [first, second] = await pages;
  assert.equal(readableChecks, 2);
  assert.equal(first.status, "available");
  assert.equal(second.status, "available");
  await rm(sessionFile);
  const missingPages = Promise.allSettled([service.getHistory(id), service.getHistory(id)]);
  await missingPairEntered;
  releaseMissingPair();
  const missingResults = await missingPages;
  assert.equal(missingChecks, 2);
  for (const result of missingResults) {
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.ok(result.reason instanceof SessionError);
      assert.equal(result.reason.code, "history_unavailable");
    }
  }
  assert.equal(service.getSession(id).historyCheck?.state, "missing");
});
