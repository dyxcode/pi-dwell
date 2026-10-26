import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { isTurnCreateRequest, isTurnInfo, type TurnInfo } from "../src/shared/turns.ts";
import { SessionCatalog, type StoredSession, type StoredTurn } from "../src/storage/catalog.ts";

const SESSION_A = "11111111-1111-4111-8111-111111111111";
const SESSION_B = "22222222-2222-4222-8222-222222222222";
const RUN_A = "33333333-3333-4333-8333-333333333333";
const RUN_B = "44444444-4444-4444-8444-444444444444";
const RUN_C = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REQUEST_A = "55555555-5555-4555-8555-555555555555";
const REQUEST_B = "66666666-6666-4666-8666-666666666666";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function turn(overrides: Partial<StoredTurn> = {}): StoredTurn {
  return {
    runId: RUN_A,
    sessionId: SESSION_A,
    requestId: REQUEST_A,
    status: "accepted",
    cancellationRequested: false,
    createdAt: 1000,
    updatedAt: 1000,
    error: null,
    entryIds: [],
    payloadIdentity: HASH_A,
    ...overrides,
  };
}

function session(id: string, updatedAt = 1000): StoredSession {
  return {
    id,
    requestId: id === SESSION_A ? REQUEST_A : REQUEST_B,
    payloadIdentity: HASH_A,
    directory: "/tmp/project",
    provider: "test-provider",
    model: "test-model",
    piSessionId: id,
    piSessionFile: null,
    historyExpected: false,
    status: "ready",
    createdAt: 500,
    updatedAt,
    error: null,
  };
}

function turnInfo(overrides: Partial<TurnInfo> = {}): TurnInfo {
  return {
    runId: RUN_A,
    sessionId: SESSION_A,
    requestId: REQUEST_A,
    status: "running",
    cancellationRequested: false,
    createdAt: 1000,
    updatedAt: 1000,
    error: null,
    entryIds: ["assistant:message/1", "tool:lookup:result-7"],
    ...overrides,
  };
}

test("turn validators enforce exact request shape, UUIDs, slash-command scope, and byte bounds", () => {
  assert.equal(isTurnCreateRequest({ requestId: REQUEST_A, message: "  hello\nthere " }), true);
  assert.equal(isTurnCreateRequest({ requestId: "not-a-uuid", message: "hello" }), false);
  assert.equal(isTurnCreateRequest({ requestId: REQUEST_A, message: " \t " }), false);
  assert.equal(isTurnCreateRequest({ requestId: REQUEST_A, message: "  /help" }), false);
  assert.equal(isTurnCreateRequest({ requestId: REQUEST_A, message: "a".repeat(8193) }), false);
  assert.equal(
    isTurnCreateRequest({ requestId: REQUEST_A, message: `${"a".repeat(8190)}é` }),
    true,
  );
  assert.equal(
    isTurnCreateRequest({ requestId: REQUEST_A, message: "hello", extra: "ignored?" }),
    false,
  );

  assert.equal(isTurnInfo(turnInfo()), true);
  assert.equal(isTurnInfo(turnInfo({ runId: "not-a-uuid" })), false);
  assert.equal(isTurnInfo(turnInfo({ entryIds: ["valid-native-id", ""] })), false);
  const unexpectedErrorField: unknown = {
    ...turnInfo(),
    error: { code: "outcome_unknown", message: "Unknown outcome", extra: 1 },
  };
  assert.equal(isTurnInfo(unexpectedErrorField), false);
  assert.equal(isTurnInfo({ ...turnInfo(), unexpected: true }), false);
});

test("turn catalog deduplicates per session, reserves one active turn, and orders by admission if the clock regresses", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-turn-catalog-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, "data");
  let active: SessionCatalog | undefined;
  t.after(() => active?.close());
  const catalog = await SessionCatalog.open(dataDir);
  active = catalog;
  catalog.insert(session(SESSION_A));
  catalog.insert(session(SESSION_B));

  const first = turn();
  catalog.insertTurn(first);
  assert.throws(
    () => catalog.insertTurn(turn({ runId: RUN_B, payloadIdentity: HASH_B })),
    /unique|request/i,
  );
  assert.throws(
    () =>
      catalog.insertTurn(
        turn({
          runId: "88888888-8888-4888-8888-888888888888",
          requestId: "99999999-9999-4999-8999-999999999999",
        }),
      ),
    /unique|active/i,
  );

  catalog.updateTurn({ ...first, status: "dispatching", updatedAt: 1050 });
  catalog.updateTurn({ ...first, status: "completed", updatedAt: 1100 });

  const later = turn({
    runId: RUN_B,
    requestId: REQUEST_B,
    createdAt: 1000,
    updatedAt: 1000,
  });
  catalog.insertTurn(later);
  assert.equal(catalog.latestTurn(SESSION_A)?.runId, RUN_B);
  assert.equal(catalog.activeTurn(SESSION_A)?.runId, RUN_B);
  assert.deepEqual(catalog.getTurn(SESSION_A, RUN_B), later);
  assert.deepEqual(catalog.findTurnRequest(SESSION_A, REQUEST_B), later);
  assert.equal(catalog.getTurn(SESSION_B, RUN_B), undefined);
  assert.equal(catalog.findTurnRequest(SESSION_B, REQUEST_B), undefined);
  assert.equal(catalog.latestTurn(SESSION_B), undefined);

  catalog.updateTurn({ ...later, status: "dispatching", updatedAt: 1050 });
  catalog.updateTurn({ ...later, status: "completed", updatedAt: 1100 });
  const afterClockRegression = turn({
    runId: RUN_C,
    requestId: "77777777-7777-4777-8777-777777777777",
    status: "completed",
    createdAt: 900,
    updatedAt: 900,
  });
  catalog.insertTurn(afterClockRegression);
  assert.equal(catalog.latestTurn(SESSION_A)?.runId, RUN_C);

  catalog.insertTurn(
    turn({
      runId: "77777777-7777-4777-8777-777777777777",
      sessionId: SESSION_B,
      requestId: REQUEST_B,
    }),
  );
  assert.equal(catalog.activeTurn(SESSION_B)?.sessionId, SESSION_B);
  assert.deepEqual(
    catalog.listTurns().map((item) => item.runId),
    [RUN_C, RUN_A, RUN_B, "77777777-7777-4777-8777-777777777777"],
  );
});

test("dispatch marking atomically persists history expectation and turn state, and rolls back together", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-turn-dispatch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, "data");
  let active: SessionCatalog | undefined;
  t.after(() => active?.close());
  const catalog = await SessionCatalog.open(dataDir);
  active = catalog;
  const storedSession = session(SESSION_A);
  catalog.insert(storedSession);
  const accepted = turn();
  catalog.insertTurn(accepted);

  const dispatching = turn({ status: "dispatching", updatedAt: 1200 });
  const dispatchSession = { ...storedSession, historyExpected: true, updatedAt: 1200 };
  assert.throws(
    () => catalog.markTurnDispatching({ ...dispatching, payloadIdentity: HASH_B }, dispatchSession),
    /identity|immutable|turn/i,
  );
  assert.equal(catalog.get(SESSION_A)?.historyExpected, false);
  assert.equal(catalog.getTurn(SESSION_A, RUN_A)?.status, "accepted");

  catalog.markTurnDispatching(dispatching, dispatchSession);
  assert.equal(catalog.get(SESSION_A)?.historyExpected, true);
  assert.equal(catalog.getTurn(SESSION_A, RUN_A)?.status, "dispatching");
  assert.equal(catalog.getTurn(SESSION_A, RUN_A)?.updatedAt, 1200);
});

test("turn terminal updates release the active slot; startup interruption records an unknown outcome", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-turn-recovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, "data");
  let active: SessionCatalog | undefined;
  t.after(() => active?.close());
  const catalog = await SessionCatalog.open(dataDir);
  active = catalog;
  catalog.insert(session(SESSION_A));
  catalog.insert(session(SESSION_B));
  catalog.insertTurn(turn());
  catalog.insertTurn(
    turn({
      runId: RUN_B,
      sessionId: SESSION_B,
      requestId: REQUEST_B,
      status: "running",
      updatedAt: 1500,
      entryIds: ["assistant:branch#2"],
    }),
  );

  const failed = turn({
    status: "failed",
    updatedAt: 1100,
    error: { code: "provider_error", message: "Synthetic provider failure" },
    entryIds: ["assistant:branch#1"],
  });
  catalog.updateTurn(failed);
  assert.equal(catalog.activeTurn(SESSION_A), undefined);
  assert.deepEqual(catalog.getTurn(SESSION_A, RUN_A), failed);

  catalog.interruptTurns(2000);
  const interrupted = catalog.getTurn(SESSION_B, RUN_B);
  assert.ok(interrupted);
  assert.equal(interrupted.status, "interrupted");
  assert.equal(interrupted.updatedAt, 2000);
  assert.deepEqual(interrupted.error, {
    code: "outcome_unknown",
    message: "Turn execution was interrupted by host restart; the outcome is unknown.",
  });
  assert.equal(catalog.activeTurn(SESSION_B), undefined);
  assert.deepEqual(catalog.getTurn(SESSION_A, RUN_A), failed);

  catalog.close();
  active = undefined;
  const reopened = await SessionCatalog.open(dataDir);
  active = reopened;
  assert.deepEqual(reopened.listTurns(), [failed, interrupted]);
});

test("turn writes enforce session foreign keys and reopen validates semantic identifiers", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-turn-invalid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, "data");
  let active: SessionCatalog | undefined;
  t.after(() => active?.close());
  const catalog = await SessionCatalog.open(dataDir);
  active = catalog;
  catalog.insert(session(SESSION_A));
  assert.throws(() => catalog.insertTurn(turn({ sessionId: SESSION_B })), /foreign key|session/i);
  assert.throws(() => catalog.insertTurn(turn({ payloadIdentity: "not-a-sha256" })), /invalid/i);

  const valid = turn({ entryIds: ["Pi-native:message/id", "non-uuid-tool-entry"] });
  catalog.insertTurn(valid);
  catalog.close();
  active = undefined;
  const raw = new DatabaseSync(join(dataDir, "catalog.sqlite"));
  raw.exec("UPDATE turns SET request_id = 'not-a-uuid'");
  raw.close();
  await assert.rejects(SessionCatalog.open(dataDir), /invalid|identity|turn/i);
});
