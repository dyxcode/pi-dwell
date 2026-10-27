import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import {
  HistoryReadBudgetError,
  runWithHistoryReadBudget,
} from "../src/runtime/pi-history-budget.ts";
import { HistoryReadError, readSavedHistory } from "../src/runtime/pi-history.ts";

const PI_SESSION_ID = "11111111-1111-4111-8111-111111111111";
const DIRECTORY = "/tmp/pi-dwell-history-budget-project";
const TIMESTAMP = "2026-10-26T02:00:00.000Z";

async function historyOptions(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-dwell-history-budget-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, "session.jsonl");
  await writeFile(
    file,
    `${JSON.stringify({
      type: "session",
      version: 3,
      id: PI_SESSION_ID,
      timestamp: TIMESTAMP,
      cwd: DIRECTORY,
    })}\n`,
    { mode: 0o600 },
  );
  return { file, piSessionId: PI_SESSION_ID, directory: DIRECTORY };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

interface ControlledRead {
  promise: Promise<string>;
  started: Promise<void>;
  finish(): void;
  fail(): void;
}

function controlledRead(label: string, starts: string[]): ControlledRead {
  const gate = deferred<string>();
  const entered = deferred<void>();
  const promise = runWithHistoryReadBudget(async () => {
    starts.push(label);
    entered.resolve(undefined);
    return gate.promise;
  });
  return {
    promise,
    started: entered.promise,
    finish: () => gate.resolve(label),
    fail: () => gate.reject(new Error(`${label} failed`)),
  };
}

test("history scan budget caps concurrency, queues fairly, and releases permits after errors", async () => {
  const starts: string[] = [];
  const first = controlledRead("first", starts);
  const second = controlledRead("second", starts);
  const queued = Array.from({ length: 8 }, (_, index) => controlledRead(`queued-${index}`, starts));
  const overflow = runWithHistoryReadBudget(async () => {
    starts.push("overflow");
    return "overflow";
  });
  const allReads = [first, second, ...queued];

  try {
    await Promise.all([first.started, second.started]);
    assert.deepEqual(starts, ["first", "second"]);
    await assert.rejects(overflow, (error: unknown) => error instanceof HistoryReadBudgetError);
    assert.deepEqual(starts, ["first", "second"], "queue overflow must not start a scan");

    first.fail();
    await assert.rejects(first.promise, /first failed/);
    await queued[0]?.started;
    assert.deepEqual(starts, ["first", "second", "queued-0"]);

    second.finish();
    assert.equal(await second.promise, "second");
    await queued[1]?.started;
    assert.deepEqual(starts, ["first", "second", "queued-0", "queued-1"]);

    for (let index = 0; index < queued.length; index += 1) {
      const current = queued[index];
      assert.ok(current);
      current.finish();
      assert.equal(await current.promise, `queued-${index}`);
      const next = queued[index + 2];
      if (next) await next.started;
    }

    assert.deepEqual(starts, [
      "first",
      "second",
      ...queued.map((_read, index) => `queued-${index}`),
    ]);
  } finally {
    for (const read of allReads) read.finish();
    await Promise.allSettled(allReads.map((read) => read.promise));
    await Promise.allSettled([overflow]);
  }
});

test("readSavedHistory permits only two active scans and cancels a queued prefix read", async (t) => {
  const options = await historyOptions(t);
  const initial = await readSavedHistory(options);
  const prefix = { bytes: initial.bytes, revision: initial.revision };
  const first = readSavedHistory(options);
  const second = readSavedHistory(options);
  const controller = new AbortController();
  const queued = readSavedHistory({ ...options, prefix, signal: controller.signal });
  controller.abort();

  await assert.rejects(queued, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.name, "AbortError");
    return true;
  });
  await Promise.all([first, second]);
});

test("readSavedHistory bounds its global wait queue and maps overload to history_busy", {
  timeout: 5_000,
}, async (t) => {
  const options = await historyOptions(t);
  const reads = Array.from({ length: 11 }, () => readSavedHistory(options));
  const overflow = reads.at(-1);
  assert.ok(overflow);

  await assert.rejects(overflow, (error: unknown) => {
    assert.ok(error instanceof HistoryReadError);
    assert.equal(error.status, 429);
    assert.equal(error.code, "history_busy");
    return true;
  });
  await Promise.all(reads.slice(0, -1));
});
