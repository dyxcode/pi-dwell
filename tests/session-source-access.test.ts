import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { openDistill } from "../src/integrations/distill.ts";
import { SessionSourceAccess } from "../src/sessions/source-access.ts";

const module = process.env.DWELL_TEST_DISTILL_MODULE;

test("source reads hold only a short gate and release it on success and error", {
  skip: !module,
}, async (t) => {
  assert.ok(module);
  const root = await mkdtemp(join(tmpdir(), "dwell-source-access-"));
  const storage = await openDistill({ module, database: join(root, "memory.sqlite") });
  t.after(() => {
    storage.close();
    return rm(root, { recursive: true, force: true });
  });
  const access = new SessionSourceAccess(storage);
  const source = {
    piSessionId: randomUUID(),
    directory: root,
    piSessionFile: join(root, "session.jsonl"),
  };
  const ref = { sessionId: source.piSessionId, sessionFile: source.piSessionFile, cwd: root };
  let finish!: () => void;
  const pending = access.read(source, source.piSessionFile, async () => {
    assert.equal(storage.acquireSourceRead(ref), undefined);
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return "read";
  });
  finish();
  assert.equal(await pending, "read");
  await assert.rejects(
    access.read(source, source.piSessionFile, async () => {
      throw new Error("read failed");
    }),
    /read failed/,
  );
  const lease = storage.acquireSourceRead(ref);
  assert.ok(lease);
  lease.release();
  await access.drain();
});

test("fresh session use is reserved before spawn and released only after child close", {
  skip: !module,
}, async (t) => {
  assert.ok(module);
  const root = await mkdtemp(join(tmpdir(), "dwell-source-opening-"));
  const storage = await openDistill({ module, database: join(root, "memory.sqlite") });
  t.after(() => {
    storage.close();
    return rm(root, { recursive: true, force: true });
  });
  const access = new SessionSourceAccess(storage);
  const source = { piSessionId: randomUUID(), directory: root, piSessionFile: null };
  const opening = access.begin(source);
  assert.ok(opening);
  const reserved = storage.listPendingHostUses();
  assert.equal(reserved.length, 1);
  assert.equal(reserved[0]?.sessionId, source.piSessionId);
  assert.equal(reserved[0]?.sessionFile, null);
  assert.equal(reserved[0]?.state, "opening");
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  t.after(async () => {
    child.kill();
    await closed;
    await access.drain();
  });
  assert.ok(child.pid);
  opening.onSpawn(child.pid, closed);
  opening.abandon();
  assert.equal(storage.listPendingHostUses()[0]?.state, "attached");
  const lease = storage.acquireSourceRead({
    sessionId: source.piSessionId,
    sessionFile: join(root, "future.jsonl"),
    cwd: root,
  });
  assert.ok(lease, "long use must not hold the global read gate");
  lease.release();
  child.kill();
  await closed;
  await access.drain();
  assert.deepEqual(storage.listPendingHostUses(), []);
});

test("only a known unspawned opening is abandoned automatically", { skip: !module }, async (t) => {
  assert.ok(module);
  const root = await mkdtemp(join(tmpdir(), "dwell-source-recovery-"));
  const storage = await openDistill({ module, database: join(root, "memory.sqlite") });
  t.after(() => {
    storage.close();
    return rm(root, { recursive: true, force: true });
  });
  const source = { piSessionId: randomUUID(), directory: root, piSessionFile: null };
  const access = new SessionSourceAccess(storage);
  const uncertain = access.begin(source);
  assert.ok(uncertain);
  const restored = new SessionSourceAccess(storage);
  assert.equal(storage.listPendingHostUses().length, 1);
  const opening = restored.begin({ ...source, piSessionId: randomUUID() });
  assert.ok(opening);
  opening.abandon();
  assert.equal(storage.listPendingHostUses().length, 1);
  uncertain.abandon();
  assert.deepEqual(storage.listPendingHostUses(), []);
  await access.drain();
  await restored.drain();
});

test("a refused child release remains available for shutdown retry", {
  skip: !module,
}, async (t) => {
  assert.ok(module);
  const root = await mkdtemp(join(tmpdir(), "dwell-source-release-retry-"));
  const databasePath = join(root, "memory.sqlite");
  const storage = await openDistill({ module, database: databasePath });
  const access = new SessionSourceAccess(storage);
  const source = { piSessionId: randomUUID(), directory: root, piSessionFile: null };
  const opening = access.begin(source);
  assert.ok(opening);
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  const database = new DatabaseSync(databasePath);
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await closed;
    const pending = storage
      .listPendingHostUses()
      .find((use) => use.sessionId === source.piSessionId);
    if (pending?.child)
      storage.recoverHostUse(pending.id, { kind: "child-exited", child: pending.child });
    else if (pending?.state === "opening")
      storage.recoverHostUse(pending.id, { kind: "opening-abandoned" });
    await access.drain();
    database.close();
    storage.close();
    await rm(root, { recursive: true, force: true });
  });

  await once(child, "spawn");
  assert.ok(child.pid);
  opening.onSpawn(child.pid, closed);
  const pending = storage.listPendingHostUses()[0];
  assert.ok(pending?.child);
  database
    .prepare("UPDATE host_session_uses SET child_token = ? WHERE id = ?")
    .run("mismatched-child-token", pending.id);
  child.kill("SIGTERM");
  await closed;

  await assert.rejects(access.drain(), AggregateError);
  assert.equal(storage.listPendingHostUses().length, 1);

  const recordedChild = storage.listPendingHostUses()[0]?.child;
  assert.ok(recordedChild);
  storage.recoverHostUse(pending.id, { kind: "child-exited", child: recordedChild });
  await access.drain();
  assert.deepEqual(storage.listPendingHostUses(), []);
});

test("drain attempts pending host-use releases after a SQLite read-release failure", {
  skip: !module,
}, async (t) => {
  assert.ok(module);
  const root = await mkdtemp(join(tmpdir(), "dwell-source-drain-"));
  const databasePath = join(root, "memory.sqlite");
  const storage = await openDistill({ module, database: databasePath });
  const access = new SessionSourceAccess(storage);
  const source = { piSessionId: randomUUID(), directory: root, piSessionFile: null };
  const opening = access.begin(source);
  assert.ok(opening);
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  const database = new DatabaseSync(databasePath);
  const readReleaseTrigger = "fail_source_access_release";
  const useReleaseTrigger = "fail_host_use_release";
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await closed;
    database.exec(`DROP TRIGGER IF EXISTS ${readReleaseTrigger}`);
    database.exec(`DROP TRIGGER IF EXISTS ${useReleaseTrigger}`);
    await access.drain();
    const pending = storage
      .listPendingHostUses()
      .find((use) => use.sessionId === source.piSessionId);
    if (pending?.child)
      storage.recoverHostUse(pending.id, { kind: "child-exited", child: pending.child });
    else if (pending?.state === "opening")
      storage.recoverHostUse(pending.id, { kind: "opening-abandoned" });
    await access.drain();
    database.close();
    storage.close();
    await rm(root, { recursive: true, force: true });
  });

  await once(child, "spawn");
  assert.ok(child.pid);
  opening.onSpawn(child.pid, closed);
  let startRead!: () => void;
  let finishRead!: () => void;
  const readStarted = new Promise<void>((resolve) => {
    startRead = resolve;
  });
  const readFinished = new Promise<void>((resolve) => {
    finishRead = resolve;
  });
  const reading = access.read(source, join(root, "session.jsonl"), async () => {
    startRead();
    await readFinished;
  });
  await readStarted;
  database.exec(`
    CREATE TRIGGER ${readReleaseTrigger} BEFORE DELETE ON source_access
    BEGIN SELECT RAISE(ABORT, 'test source-read release failure'); END;
    CREATE TRIGGER ${useReleaseTrigger} BEFORE DELETE ON host_session_uses
    BEGIN SELECT RAISE(ABORT, 'test host-use release failure'); END;
  `);
  finishRead();
  await assert.rejects(reading, /test source-read release failure/);
  child.kill("SIGTERM");
  await closed;
  database.exec(`DROP TRIGGER ${useReleaseTrigger}`);

  await assert.rejects(access.drain(), AggregateError);
  assert.deepEqual(storage.listPendingHostUses(), []);

  database.exec(`DROP TRIGGER ${readReleaseTrigger}`);
  await access.drain();
});
