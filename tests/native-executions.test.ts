import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { isRecord } from "../src/runtime/pi-rpc.ts";
import { startHost } from "../src/server/http.ts";
import { SessionError, SessionService } from "../src/sessions/service.ts";
import type { StreamFrame } from "../src/shared/events.ts";
import { isSessionInfo } from "../src/shared/sessions.ts";
import { isTurnInfo, type TurnInfo } from "../src/shared/turns.ts";
import { SessionCatalog } from "../src/storage/catalog.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

interface NativeExecutionView {
  id: string;
  status: string;
  error: string | null;
}

function nativeExecution(value: unknown): NativeExecutionView | undefined {
  if (!isRecord(value) || !isRecord(value.nativeExecution)) return undefined;
  const candidate = value.nativeExecution;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.status !== "string" ||
    (candidate.error !== null && typeof candidate.error !== "string")
  )
    return undefined;
  return { id: candidate.id, status: candidate.status, error: candidate.error };
}

function asTurn(value: unknown): TurnInfo {
  if (!isTurnInfo(value)) throw new Error("Response did not contain a valid Dwell turn.");
  return value;
}

async function waitFor<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  description: string,
): Promise<T> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function serviceWithNativePrompt(t: TestContext, prompt: string, onStart = false) {
  const environment = await createPiEnvironment();
  const service = await SessionService.create({
    dataDir: join(environment.root, "dwell"),
    env: {
      ...environment.env,
      ...(onStart ? { DWELL_TEST_NATIVE_ON_START: prompt } : { DWELL_TEST_NATIVE_PROMPT: prompt }),
    },
    extensions: [environment.extensionPath],
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
  return { environment, service, session };
}

test("a native extension execution during session startup is observed without rejecting Pi", {
  timeout: 20_000,
}, async (t) => {
  const { service, session } = await serviceWithNativePrompt(t, "startup native", true);
  assert.equal(session.status, "ready");
  const native = await waitFor(
    () => Promise.resolve(nativeExecution(service.getSession(session.id))),
    (value) => value?.status === "completed",
    "the startup native execution to complete",
  );
  assert.ok(native);
  assert.equal(service.getSession(session.id).activeTurnId, null);
  await assert.rejects(
    Promise.resolve().then(() => service.getTurn(session.id, native.id)),
    (error: unknown) => error instanceof SessionError && error.code === "turn_not_found",
  );
  const history = await service.getHistory(session.id);
  assert.equal(history.coveredNativeExecutionId, native.id);
});

test("startup native execution preserves Pi thinking when the saved Dwell setting differs", {
  timeout: 20_000,
}, async (t) => {
  const environment = await createPiEnvironment();
  const dataDir = join(environment.root, "dwell");
  const service = await SessionService.create({
    dataDir,
    env: environment.env,
    extensions: [environment.extensionPath],
  });
  let nativeService: SessionService | undefined;
  t.after(async () => {
    await service.shutdown();
    await nativeService?.shutdown();
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
  const selected = await service.setSessionModel(session.id, {
    provider: "dwell-test",
    model: "dwell-test-reasoning",
    thinkingLevel: "high",
  });
  assert.equal(selected.thinkingLevel, "high");
  await service.closeSession(session.id);
  await service.shutdown();

  const catalog = await SessionCatalog.open(dataDir);
  try {
    const stored = catalog.get(session.id);
    assert.ok(stored);
    catalog.update({ ...stored, thinkingLevel: "low" });
  } finally {
    catalog.close();
  }

  nativeService = await SessionService.create({
    dataDir,
    env: { ...environment.env, DWELL_TEST_NATIVE_ON_START: "slow" },
    extensions: [environment.extensionPath],
  });
  const reopened = await nativeService.openSession(session.id);
  assert.equal(reopened.status, "ready");
  assert.equal(reopened.thinkingLevel, "medium");
  const native = await waitFor(
    () => Promise.resolve(nativeExecution(nativeService.getSession(session.id))),
    (value) => value?.status === "running",
    "the startup native execution to remain active",
  );
  assert.ok(native);
  assert.equal(nativeService.getSession(session.id).thinkingLevel, "medium");
  await nativeService.abortNativeExecution(session.id, native.id);
  await waitFor(
    () => Promise.resolve(nativeExecution(nativeService.getSession(session.id))),
    (value) => value?.status === "aborted",
    "the startup native execution to abort",
  );
});

test("native extension model and thinking changes refresh the session catalog after settlement", {
  timeout: 20_000,
}, async (t) => {
  const environment = await createPiEnvironment();
  const dataDir = join(environment.root, "dwell");
  const nativeStateReport = join(environment.root, "native-state.txt");
  const stateExtension = fileURLToPath(new URL("./fixtures/pi-native-state.ts", import.meta.url));
  const service = await SessionService.create({
    dataDir,
    env: {
      ...environment.env,
      DWELL_TEST_NATIVE_PROMPT: "hello",
      DWELL_TEST_NATIVE_STATE_CHANGE: "1",
      DWELL_TEST_NATIVE_STATE_REPORT: nativeStateReport,
    },
    extensions: [environment.extensionPath, stateExtension],
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
  const frames: StreamFrame[] = [];
  const subscription = service.subscribeEvents(session.id, undefined, (frame) => {
    frames.push(frame);
  });
  t.after(subscription.unsubscribe);

  const { turn } = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "hello",
  });
  await waitFor(
    () => Promise.resolve(service.getTurn(session.id, turn.runId)),
    (value) => value.status === "completed",
    "the initiating Dwell turn to complete",
  );

  const native = await waitFor(
    () => Promise.resolve(nativeExecution(service.getSession(session.id))),
    (value) => value?.status === "completed",
    "the extension follow-up execution to complete",
  );
  assert.ok(native);
  assert.equal(await readFile(nativeStateReport, "utf8"), "changed\n");
  const refreshed = await waitFor(
    () => Promise.resolve(service.getSession(session.id)),
    (value) =>
      isSessionInfo(value) &&
      value.provider === "dwell-test" &&
      value.model === "dwell-test-reasoning" &&
      value.thinkingLevel === "high",
    "the catalog to reflect Pi's native model and thinking state",
  );
  assert.ok(isSessionInfo(refreshed));
  assert.ok(
    frames.some(
      (frame) =>
        frame.type === "session.updated" &&
        isSessionInfo(frame.payload) &&
        frame.payload.model === "dwell-test-reasoning" &&
        frame.payload.thinkingLevel === "high",
    ),
  );
});

test("host restart reconciles stale session model metadata from the saved Pi transcript", {
  timeout: 20_000,
}, async (t) => {
  const environment = await createPiEnvironment();
  const dataDir = join(environment.root, "dwell");
  let service: SessionService | undefined;
  let reopenedService: SessionService | undefined;
  t.after(async () => {
    await service?.shutdown();
    await reopenedService?.shutdown();
    await environment.cleanup();
  });

  service = await SessionService.create({
    dataDir,
    env: environment.env,
    extensions: [environment.extensionPath],
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
  const selected = await service.setSessionModel(session.id, {
    provider: "dwell-test",
    model: "dwell-test-reasoning",
    thinkingLevel: "high",
  });
  assert.equal(selected.status, "ready");
  const { turn } = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "hello",
  });
  const completed = await waitFor(
    () => Promise.resolve(service?.getTurn(session.id, turn.runId)),
    (value) => value?.status === "completed",
    "the transcript-backed turn to complete",
  );
  assert.ok(completed);
  await service.closeSession(session.id);
  await service.shutdown();
  service = undefined;

  const catalog = await SessionCatalog.open(dataDir);
  try {
    const stored = catalog.get(session.id);
    assert.ok(stored);
    catalog.update({
      ...stored,
      provider: "dwell-test",
      model: "dwell-test",
      thinkingLevel: "low",
    });
  } finally {
    catalog.close();
  }

  reopenedService = await SessionService.create({
    dataDir,
    env: { ...environment.env, DWELL_TEST_NATIVE_ON_START: "slow" },
    extensions: [environment.extensionPath],
  });
  const reopened = await reopenedService.openSession(session.id);
  assert.equal(reopened.status, "ready");
  assert.equal(reopened.provider, "dwell-test");
  assert.equal(reopened.model, "dwell-test-reasoning");
  assert.equal(reopened.thinkingLevel, "high");
  const native = await waitFor(
    () => Promise.resolve(nativeExecution(reopenedService?.getSession(session.id))),
    (value) => value?.status === "running",
    "the startup native follow-up to remain active",
  );
  assert.ok(native);
  await reopenedService.abortNativeExecution(session.id, native.id);
});

test("native extension runs stay outside the turn ledger and reconcile live events with saved history", {
  timeout: 20_000,
}, async (t) => {
  const { environment, service, session } = await serviceWithNativePrompt(t, "tool");
  const frames: StreamFrame[] = [];
  const subscription = service.subscribeEvents(session.id, undefined, (frame) => {
    frames.push(frame);
  });
  t.after(subscription.unsubscribe);

  const { turn } = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "hello",
  });
  await waitFor(
    () => Promise.resolve(service.getTurn(session.id, turn.runId)),
    (value) => value.status === "completed",
    "the initiating Dwell turn to complete",
  );
  const native = await waitFor(
    () => Promise.resolve(nativeExecution(service.getSession(session.id))),
    (value) => value?.status === "completed",
    "the native execution to complete",
  );
  assert.ok(native);
  const nativeSession = service.getSession(session.id);
  assert.ok(isSessionInfo(nativeSession));
  assert.deepEqual(Object.keys(nativeExecution(nativeSession) ?? {}).sort(), [
    "error",
    "id",
    "status",
  ]);
  assert.equal(nativeExecution(nativeSession)?.id, native.id);
  assert.equal(nativeSession.activeTurnId, null);
  await assert.rejects(
    Promise.resolve().then(() => service.getTurn(session.id, native.id)),
    (error: unknown) => error instanceof SessionError && error.code === "turn_not_found",
  );

  const nativeFrames = frames.filter((frame) => "runId" in frame && frame.runId === native.id);
  assert.ok(nativeFrames.some((frame) => frame.type === "message.delta"));
  const liveMessage = [...nativeFrames]
    .reverse()
    .find((frame) => frame.type === "message.finished");
  assert.ok(liveMessage?.type === "message.finished" && liveMessage.payload.nativeKey);

  const historyDirectory = join(environment.root, "dwell", "sessions", session.id);
  const fileName = (await readdir(historyDirectory)).find((name) =>
    name.endsWith(`_${session.piSessionId}.jsonl`),
  );
  assert.ok(fileName);
  const historyFile = join(historyDirectory, fileName);
  const original = await readFile(historyFile);
  const completeLines = original.toString("utf8").trimEnd().split(/\r?\n/u);
  const assistantLines = completeLines.flatMap((line, index) => {
    const entry: unknown = JSON.parse(line);
    return isRecord(entry) &&
      entry.type === "message" &&
      isRecord(entry.message) &&
      entry.message.role === "assistant"
      ? [index]
      : [];
  });
  assert.ok(
    assistantLines.length >= 3,
    "the native tool turn should save multiple assistant messages",
  );
  const lastAssistantLine = assistantLines.at(-1);
  assert.ok(lastAssistantLine !== undefined);
  const earlierNativeOutput = Buffer.from(
    `${completeLines.slice(0, lastAssistantLine).join("\n")}\n`,
  );
  await writeFile(historyFile, earlierNativeOutput);
  const partialHistory = await service.getHistory(session.id);
  assert.equal(partialHistory.incompleteTail, false);
  assert.equal(partialHistory.coveredNativeExecutionId, undefined);

  await writeFile(historyFile, Buffer.concat([earlierNativeOutput, Buffer.from("{")]));
  const incompleteTail = await service.getHistory(session.id);
  assert.equal(incompleteTail.incompleteTail, true);
  assert.equal(incompleteTail.coveredNativeExecutionId, undefined);
  await writeFile(historyFile, original);

  const completeHistory = await service.getHistory(session.id);
  assert.equal(completeHistory.coveredNativeExecutionId, native.id);
  const history = completeHistory;
  assert.equal(history.coveredTurnId, turn.runId);
  assert.ok(history.entries.some((entry) => entry.nativeKey === liveMessage.payload.nativeKey));
  assert.ok(
    nativeFrames.some(
      (frame) =>
        frame.type === "session.updated" && nativeExecution(frame.payload)?.id === native.id,
    ),
  );
});

test("native execution abort requires its current execution ID and preserves RPC until settlement", {
  timeout: 20_000,
}, async (t) => {
  const environment = await createPiEnvironment();
  const dataDir = join(environment.root, "dwell");
  const host = await startHost({
    port: 0,
    dataDir,
    sessions: {
      env: { ...environment.env, DWELL_TEST_NATIVE_PROMPT: "slow" },
      extensions: [environment.extensionPath],
    },
  });
  t.after(async () => {
    await host.close();
    await environment.cleanup();
  });
  const token = (await readFile(join(dataDir, "auth-token"), "utf8")).trim();
  const request = (path: string, body?: unknown) =>
    fetch(`${host.url}/api/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const configure = await request("/runtime", {
    executable: process.execPath,
    entryPoint: fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry")),
  });
  assert.equal(configure.status, 200);
  const created = await request("/sessions", {
    requestId: randomUUID(),
    directory: environment.cwd,
    provider: "dwell-test",
    model: "dwell-test",
  });
  assert.equal(created.status, 201);
  const session: unknown = await created.json();
  assert.ok(isSessionInfo(session));

  const accepted = await request(`/sessions/${session.id}/turns`, {
    requestId: randomUUID(),
    message: "hello",
  });
  assert.equal(accepted.status, 202);
  const turn = asTurn(await accepted.json());
  await waitFor(
    async () => {
      const turnResponse = await request(`/sessions/${session.id}/turns/${turn.runId}`);
      const sessionResponse = await request(`/sessions/${session.id}`);
      assert.equal(turnResponse.status, 200);
      assert.equal(sessionResponse.status, 200);
      return {
        turn: asTurn(await turnResponse.json()),
        session: await sessionResponse.json(),
      };
    },
    (value) =>
      value.turn.status === "completed" &&
      isRecord(value.session) &&
      value.session.activeTurnId === null,
    "the initiating Dwell turn to release its active slot",
  );
  const active = await waitFor(
    async () => {
      const response = await request(`/sessions/${session.id}`);
      assert.equal(response.status, 200);
      return nativeExecution(await response.json());
    },
    (value) => value?.status === "running",
    "the native execution to start",
  );
  assert.ok(active);
  const competingTurn = await request(`/sessions/${session.id}/turns`, {
    requestId: randomUUID(),
    message: "competing prompt",
  });
  assert.equal(competingTurn.status, 409);

  const unauthenticated = await fetch(
    `${host.url}/api/v1/sessions/${session.id}/native-executions/${active.id}/abort`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
  assert.equal(unauthenticated.status, 401);
  const stale = await request(
    `/sessions/${session.id}/native-executions/${randomUUID()}/abort`,
    {},
  );
  assert.equal(stale.status, 409);
  assert.equal(
    nativeExecution(await (await request(`/sessions/${session.id}`)).json())?.status,
    "running",
  );

  const aborted = await request(`/sessions/${session.id}/native-executions/${active.id}/abort`, {});
  assert.equal(aborted.status, 200);
  const completed = await waitFor(
    async () => {
      const response = await request(`/sessions/${session.id}`);
      assert.equal(response.status, 200);
      return nativeExecution(await response.json());
    },
    (value) => value?.id === active.id && value.status === "aborted",
    "the native abort to settle",
  );
  assert.ok(completed);
  assert.equal(completed.id, active.id);
  assert.equal(completed.error, null);
  const turnStatus = await request(`/sessions/${session.id}/turns/${turn.runId}`);
  assert.equal(turnStatus.status, 200);
  assert.equal(asTurn(await turnStatus.json()).status, "completed");
});
