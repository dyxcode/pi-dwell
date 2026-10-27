import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { runWithHistoryReadBudget } from "../src/runtime/pi-history-budget.ts";
import {
  SessionError,
  SessionService,
  type SessionServiceOptions,
} from "../src/sessions/service.ts";
import { isTurnInfo, type TurnInfo } from "../src/shared/turns.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function holdHistoryRead() {
  const entered = deferred<void>();
  const gate = deferred<void>();
  const promise = runWithHistoryReadBudget(async () => {
    entered.resolve(undefined);
    await gate.promise;
  });
  return { entered: entered.promise, release: () => gate.resolve(undefined), promise };
}

async function serviceWithHistory(
  t: TestContext,
  turnCheckpoint?: SessionServiceOptions["turnCheckpoint"],
) {
  const environment = await createPiEnvironment();
  const turnLog = join(environment.root, "turns.log");
  const startLog = join(environment.root, "starts.log");
  const service = await SessionService.create({
    dataDir: join(environment.root, "dwell"),
    env: {
      ...environment.env,
      DWELL_TEST_TURN_LOG: turnLog,
      DWELL_TEST_START_LOG: startLog,
    },
    extensions: [environment.extensionPath],
    ...(turnCheckpoint ? { turnCheckpoint } : {}),
  });
  t.after(async () => {
    await service.shutdown();
    await environment.cleanup();
  });
  await service.configure({
    executable: process.execPath,
    entryPoint: fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry")),
  });
  const session = await service.createSession({
    requestId: randomUUID(),
    directory: environment.cwd,
    provider: "dwell-test",
    model: "dwell-test",
  });
  assert.equal(session.status, "ready");
  const { turn } = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "hello",
  });
  await waitForTurn(service, session.id, turn.runId, (value) => value.status === "completed");
  return { environment, service, session, startLog, turnLog };
}

async function waitForTurn(
  service: SessionService,
  sessionId: string,
  runId: string,
  accept: (turn: TurnInfo) => boolean,
): Promise<TurnInfo> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const value = service.getTurn(sessionId, runId);
    if (!isTurnInfo(value)) throw new Error("Service returned an invalid turn.");
    if (accept(value) && service.getSession(sessionId).activeTurnId === null) return value;
    await delay(10);
  }
  throw new Error("Timed out waiting for the test turn.");
}

type Outcome<T> =
  | { kind: "resolved"; value: T }
  | { kind: "rejected"; error: unknown }
  | { kind: "timeout" };

async function settleWithin<T>(promise: Promise<T>, milliseconds: number): Promise<Outcome<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then<Outcome<T>, Outcome<T>>(
        (value) => ({ kind: "resolved", value }),
        (error: unknown) => ({ kind: "rejected", error }),
      ),
      new Promise<Outcome<T>>((resolve) => {
        timer = setTimeout(() => resolve({ kind: "timeout" }), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

test("aborting an admitted history scan lets it finish and releases its permit", async () => {
  const controller = new AbortController();
  const entered = deferred<void>();
  const gate = deferred<void>();
  const scan = runWithHistoryReadBudget(async () => {
    entered.resolve(undefined);
    await gate.promise;
    return "complete";
  }, controller.signal);

  try {
    await entered.promise;
    controller.abort();
    const pending = await settleWithin(scan, 10);
    assert.equal(pending.kind, "timeout", "an admitted scan is allowed to finish");
    gate.resolve(undefined);
    assert.equal(await scan, "complete");
    assert.equal(await runWithHistoryReadBudget(async () => "next"), "next");
  } finally {
    gate.resolve(undefined);
    await Promise.allSettled([scan]);
  }
});

test("a shutdown-cancelled public read uses a free permit but never joins the wait queue", async () => {
  const controller = new AbortController();
  controller.abort();
  assert.equal(
    await runWithHistoryReadBudget(async () => "admitted", controller.signal, {
      cancelQueuedOnly: true,
    }),
    "admitted",
  );

  const blockers = [holdHistoryRead(), holdHistoryRead()];
  await Promise.all(blockers.map((read) => read.entered));
  let queuedOperationStarted = false;
  try {
    await assert.rejects(
      runWithHistoryReadBudget(
        async () => {
          queuedOperationStarted = true;
        },
        controller.signal,
        { cancelQueuedOnly: true },
      ),
      (error: unknown) => error instanceof Error && error.name === "AbortError",
    );
    assert.equal(queuedOperationStarted, false);
  } finally {
    for (const blocker of blockers) blocker.release();
    await Promise.allSettled(blockers.map((blocker) => blocker.promise));
  }
});

test("aborting a turn cancels its queued baseline scan without replaying the request", {
  timeout: 20_000,
}, async (t) => {
  const accepted = deferred<TurnInfo>();
  const releaseAccepted = deferred<void>();
  let holdNextTurn = false;
  const { service, session, turnLog } = await serviceWithHistory(t, async (point, turn) => {
    if (point === "accepted" && holdNextTurn) {
      holdNextTurn = false;
      accepted.resolve(turn);
      await releaseAccepted.promise;
    }
  });
  const blockers = [holdHistoryRead(), holdHistoryRead()];
  await Promise.all(blockers.map((read) => read.entered));
  const requestId = randomUUID();
  const request = { requestId, message: "must not dispatch" };
  let settled: Outcome<TurnInfo> = { kind: "timeout" };

  try {
    holdNextTurn = true;
    const submitted = await service.submitTurn(session.id, request);
    assert.equal(submitted.created, true);
    assert.equal((await accepted.promise).runId, submitted.turn.runId);
    releaseAccepted.resolve(undefined);
    await delay(50);
    await service.abortTurn(session.id, submitted.turn.runId);
    settled = await settleWithin(
      (async () => {
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
          const state = service.getSession(session.id);
          if (state.activeTurnId === null) return service.getTurn(session.id, submitted.turn.runId);
          await delay(10);
        }
        throw new Error("The aborted turn did not release its execution slot.");
      })(),
      500,
    );
  } finally {
    releaseAccepted.resolve(undefined);
    for (const blocker of blockers) blocker.release();
    await Promise.allSettled(blockers.map((blocker) => blocker.promise));
  }

  assert.equal(settled.kind, "resolved", "the queued baseline scan should cancel promptly");
  if (settled.kind !== "resolved") return;
  assert.equal(settled.value.status, "aborted");
  const retry = await service.submitTurn(session.id, request);
  assert.equal(retry.created, false);
  assert.equal(retry.turn.runId, settled.value.runId);
  assert.equal(retry.turn.status, "aborted");
  assert.equal(await readFile(turnLog, "utf8"), "hello\n");
});

test("aborting a turn cancels queued history identity capture while opening a closed session", {
  timeout: 20_000,
}, async (t) => {
  const accepted = deferred<TurnInfo>();
  let holdNextTurn = false;
  const { service, session, startLog, turnLog } = await serviceWithHistory(
    t,
    async (point, turn) => {
      if (point === "accepted" && holdNextTurn) {
        holdNextTurn = false;
        accepted.resolve(turn);
      }
    },
  );
  await service.closeSession(session.id);
  const startsBeforeAbort = await readFile(startLog, "utf8");
  const blockers = [holdHistoryRead(), holdHistoryRead()];
  await Promise.all(blockers.map((read) => read.entered));
  const requestId = randomUUID();
  const request = { requestId, message: "must not dispatch" };
  let settled: Outcome<TurnInfo> = { kind: "timeout" };

  try {
    holdNextTurn = true;
    const submitted = await service.submitTurn(session.id, request);
    assert.equal(submitted.created, true);
    assert.equal((await accepted.promise).runId, submitted.turn.runId);
    await delay(50);
    await service.abortTurn(session.id, submitted.turn.runId);
    settled = await settleWithin(
      (async () => {
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
          const state = service.getSession(session.id);
          if (state.activeTurnId === null) return service.getTurn(session.id, submitted.turn.runId);
          await delay(10);
        }
        throw new Error("The aborted closed-session turn did not release its execution slot.");
      })(),
      500,
    );
  } finally {
    for (const blocker of blockers) blocker.release();
    await Promise.allSettled(blockers.map((blocker) => blocker.promise));
  }

  assert.equal(settled.kind, "resolved", "the queued history identity scan should cancel promptly");
  if (settled.kind !== "resolved") return;
  assert.equal(settled.value.status, "aborted");
  const retry = await service.submitTurn(session.id, request);
  assert.equal(retry.created, false);
  assert.equal(retry.turn.runId, settled.value.runId);
  assert.equal(retry.turn.status, "aborted");
  assert.equal(await readFile(turnLog, "utf8"), "hello\n");
  assert.equal(await readFile(startLog, "utf8"), startsBeforeAbort);
});

test("shutdown cancels queued public history reads without waiting for unrelated active scans", {
  timeout: 20_000,
}, async (t) => {
  const { service, session } = await serviceWithHistory(t);
  const blockers = [holdHistoryRead(), holdHistoryRead()];
  await Promise.all(blockers.map((read) => read.entered));
  let readOutcome: Outcome<unknown> = { kind: "timeout" };
  let shutdownOutcome: Outcome<void> = { kind: "timeout" };
  let pending: Promise<unknown> | undefined;
  let stopping: Promise<void> | undefined;

  try {
    pending = service.getHistory(session.id);
    await delay(25);
    stopping = service.shutdown();
    readOutcome = await settleWithin(pending, 750);
    shutdownOutcome = await settleWithin(stopping, 750);
  } finally {
    for (const blocker of blockers) blocker.release();
    await Promise.allSettled([
      ...blockers.map((blocker) => blocker.promise),
      ...(pending ? [pending] : []),
      ...(stopping ? [stopping] : []),
    ]);
  }

  assert.equal(readOutcome.kind, "rejected", "the queued request should be cancelled");
  if (readOutcome.kind === "rejected") {
    assert.ok(readOutcome.error instanceof SessionError);
    assert.equal(readOutcome.error.code, "shutting_down");
  }
  assert.equal(shutdownOutcome.kind, "resolved", "shutdown should not wait for queued scans");
});
