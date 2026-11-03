import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  type DistillDeletionReceipt,
  type DistillStorage,
  openDistill,
} from "../src/integrations/distill.ts";

const distillModule = process.env.DWELL_TEST_DISTILL_MODULE;

test("the built Distill API coordinates Dwell reads and durable child use", async (t) => {
  if (distillModule === undefined) {
    t.skip(
      "Set DWELL_TEST_DISTILL_MODULE to Distill's built host-storage.js for integration coverage.",
    );
    return;
  }

  const directory = await mkdtemp(join(tmpdir(), "pi-dwell-distill-adapter-"));
  const configuration = {
    module: distillModule,
    database: join(directory, "memory.sqlite"),
  };
  const source = {
    sessionId: "synthetic-dwell-session",
    sessionFile: join(directory, "unmanaged-session.jsonl"),
    cwd: directory,
  };
  const openingSource = { sessionId: source.sessionId, cwd: source.cwd };
  let storage: DistillStorage = await openDistill(configuration);
  t.after(async () => {
    storage.close();
    await rm(directory, { recursive: true, force: true });
  });
  assert.equal(storage.version, 1);

  const read = storage.acquireSourceRead(source);
  assert.ok(read);
  assert.equal(read.sourceGeneration, null);
  assert.equal(storage.beginHostUse(source), undefined);
  assert.throws(() => storage.close(), /Release source-read leases/);
  read.release();
  read.release();

  const opening = storage.beginHostUse(openingSource);
  assert.ok(opening);
  assert.equal(opening.sourceGeneration, null);
  assert.deepEqual(
    storage
      .listPendingHostUses()
      .map(({ id, state, child, sessionFile }) => ({ id, state, child, sessionFile })),
    [{ id: opening.id, state: "opening", child: null, sessionFile: null }],
  );
  const receipt: DistillDeletionReceipt | undefined = storage.getCompletedDeletion(source);
  assert.equal(receipt, undefined);

  storage.close();
  storage = await openDistill(configuration);
  assert.equal(storage.listPendingHostUses()[0]?.id, opening.id);
  assert.equal(storage.recoverHostUse(opening.id, { kind: "opening-abandoned" }), true);
  assert.equal(storage.recoverHostUse(opening.id, { kind: "opening-abandoned" }), false);

  const use = storage.beginHostUse(openingSource);
  assert.ok(use);
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], {
    stdio: "ignore",
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await once(child, "close");
    }
  });
  await once(child, "spawn");
  const pid = child.pid;
  assert.ok(pid);
  const identity = use.attachChild(pid);
  assert.deepEqual(
    storage.listPendingHostUses().map(({ id, state, child: attached, sessionFile }) => ({
      id,
      state,
      child: attached,
      sessionFile,
    })),
    [{ id: use.id, state: "attached", child: identity, sessionFile: null }],
  );
  assert.equal(use.releaseAfterClose({ ...identity, token: "wrong-token" }), false);
  child.kill("SIGTERM");
  await once(child, "close");
  assert.equal(use.releaseAfterClose(identity), true);
  assert.equal(use.releaseAfterClose(identity), false);
  assert.deepEqual(storage.listPendingHostUses(), []);
  storage.close();
});
