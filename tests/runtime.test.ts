import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, readFile, unlink, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { type TestContext, test } from "node:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PiProcess } from "../src/runtime/pi-process.ts";
import { isRecord } from "../src/runtime/pi-rpc.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

const piEntry = import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function waitForFile(path: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  assert.fail(`Timed out waiting for ${path}.`);
}

async function runtime(
  t: TestContext,
  resumeFile?: string,
  configureEnvironment?: (environment: Awaited<ReturnType<typeof createPiEnvironment>>) => void,
) {
  const environment = await createPiEnvironment();
  configureEnvironment?.(environment);
  const options = {
    executable: process.env.DWELL_TEST_PI_EXECUTABLE ?? process.execPath,
    ...(process.env.DWELL_TEST_PI_EXECUTABLE
      ? process.env.DWELL_TEST_PI_ENTRY
        ? { entryPoint: process.env.DWELL_TEST_PI_ENTRY }
        : {}
      : { entryPoint: fileURLToPath(piEntry) }),
    cwd: environment.cwd,
    env: environment.env,
    sessionDirectory: environment.sessionDir,
    extensions: [environment.extensionPath],
    provider: "dwell-test",
    model: "dwell-test",
    ...(resumeFile ? { resumeFile } : {}),
  };
  let pi: PiProcess;
  try {
    pi = await PiProcess.start(options);
  } catch (error) {
    await environment.cleanup();
    throw error;
  }
  t.after(async () => {
    await pi.stop();
    await environment.cleanup();
  });
  return { pi, environment, options };
}

test("native defaults and model changes work without changing global Pi settings", async (t) => {
  const { pi, environment, options } = await runtime(t);
  await pi.stop();
  const { provider, model, ...nativeOptions } = options;
  const before = await readFile(join(environment.agentDir, "settings.json"), "utf8");
  const native = await PiProcess.start(nativeOptions);
  t.after(() => native.stop());
  const initial = await native.getState();
  assert.equal(initial.model?.provider, provider);
  assert.equal(initial.model?.id, model);
  await native.setModel(provider, "dwell-test-alt");
  const changed = await native.getState();
  assert.equal(changed.model?.provider, provider);
  assert.equal(changed.model?.id, "dwell-test-alt");
  assert.equal(await readFile(join(environment.agentDir, "settings.json"), "utf8"), before);
  await native.stop();
});

test("real Pi performs a tool turn, saves history, and reopens the same session", async (t) => {
  const { pi, options } = await runtime(t);
  const initial = await pi.getState();
  assert.equal(pi.state, "ready");
  assert.equal(initial.messageCount, 0);
  assert.ok(initial.sessionFile);
  const initialEntries = await pi.getEntries();
  assert.ok(initialEntries.entries.length > 0);
  assert.equal(initialEntries.leafId, initialEntries.entries.at(-1)?.id);
  await assert.rejects(access(initial.sessionFile));
  const events: string[] = [];
  pi.subscribe((event) => {
    events.push(event.type);
  });
  const result = await pi.run("tool");
  assert.equal(result.outcome, "completed");
  assert.ok(events.includes("tool_execution_end"));
  assert.equal(events.at(-1), "agent_settled");
  const before = await pi.getMessages();
  assert.ok(before.some((message) => message.role === "toolResult"));
  const history = await pi.getEntries();
  assert.ok(history.entries.length > 0);
  assert.ok(history.entries.length > initialEntries.entries.length);
  assert.deepEqual(history.entries.slice(0, initialEntries.entries.length), initialEntries.entries);
  assert.ok(history.entries.every((entry) => entry.id.length > 0 && entry.type.length > 0));
  assert.equal(history.leafId, history.entries.at(-1)?.id);
  await pi.stop();
  assert.equal(pi.state, "exited");
  const reopened = await PiProcess.start({ ...options, resumeFile: initial.sessionFile });
  t.after(() => reopened.stop());
  assert.equal((await reopened.getState()).sessionId, initial.sessionId);
  assert.deepEqual(await reopened.getMessages(), before);
  assert.deepEqual(await reopened.getEntries(), history);
  await reopened.stop();
  await unlink(initial.sessionFile);
  await assert.rejects(
    PiProcess.start({ ...options, resumeFile: initial.sessionFile }),
    /session|ENOENT/i,
  );
});

test("startRun exposes prompt acceptance separately from settled outcome", async (t) => {
  const { pi } = await runtime(t);
  let streaming!: () => void;
  const started = new Promise<void>((resolve) => {
    streaming = resolve;
  });
  const unsubscribe = pi.subscribe((event) => {
    if (event.type === "message_update") streaming();
  });

  const run = pi.startRun("slow");
  assert.equal(pi.state, "running");
  await started;
  assert.equal(await run.accepted, "started");
  assert.equal(pi.state, "running");
  unsubscribe();
  await pi.abort();
  assert.equal((await run.settled).outcome, "aborted");
});

test("real Pi observers detach without stopping work, busy runs reject, and abort settles", async (t) => {
  const { pi } = await runtime(t);
  let started!: () => void;
  const streaming = new Promise<void>((resolve) => {
    started = resolve;
  });
  const unsubscribe = pi.subscribe((event) => {
    if (event.type === "message_update") started();
  });
  const run = pi.run("slow");
  await streaming;
  unsubscribe();
  assert.equal(pi.state, "running");
  assert.equal((await pi.getState()).isStreaming, true);
  await assert.rejects(pi.run("hello"), /busy/i);
  pi.subscribe(() => {
    throw new Error("observer failure");
  });
  pi.subscribe(async () => {
    throw new Error("async observer failure");
  });
  await pi.abort();
  assert.equal((await run).outcome, "aborted");
  assert.equal(pi.state, "ready");
  assert.equal((await pi.run("hello")).outcome, "completed");
});

test("runtime state subscribers receive initial state and child lifecycle transitions", async (t) => {
  const { pi } = await runtime(t);
  const states: string[] = [];
  const unsubscribe = pi.subscribeState((state) => {
    states.push(state);
  });
  pi.subscribeState(async (state) => {
    if (state === "running") throw new Error("async state observer failure");
  });
  assert.deepEqual(states, ["ready"]);

  const run = pi.startRun("hello");
  assert.deepEqual(states, ["ready", "running"]);
  assert.equal(await run.accepted, "started");
  assert.equal((await run.settled).outcome, "completed");
  assert.deepEqual(states, ["ready", "running", "ready"]);

  await pi.stop();
  assert.deepEqual(states, ["ready", "running", "ready", "stopping", "exited"]);
  unsubscribe();
});

test("runtime state subscribers observe an unexpected real Pi child exit", async (t) => {
  const { pi } = await runtime(t);
  const failed = deferred<void>();
  const unsubscribe = pi.subscribeState((state) => {
    if (state === "failed") failed.resolve();
  });
  const pid = pi.pid;
  assert.ok(pid);
  process.kill(pid, "SIGKILL");
  await failed.promise;
  assert.equal(pi.state, "failed");
  await pi.stop();
  unsubscribe();
});

test("passive Pi observers do not keep dialogs open without an interactive observer", async (t) => {
  const { pi } = await runtime(t);
  const passiveCancelled = deferred<number>();
  const requestStarted = { at: 0, id: "" };
  const passive = pi.subscribe(
    (event) => {
      if (event.type !== "extension_ui_request") return;
      if (event.method === "confirm") {
        requestStarted.at = performance.now();
        requestStarted.id = String(event.id);
      }
      if (event.method === "notify" && event.message === "dwell-confirm: cancelled")
        passiveCancelled.resolve(performance.now() - requestStarted.at);
    },
    { interactive: false },
  );

  assert.equal((await pi.run("/dwell-confirm")).outcome, "handled");
  const passiveDelay = await passiveCancelled.promise;
  assert.ok(passiveDelay < 500, `passive-only confirmation took ${passiveDelay}ms`);
  await assert.rejects(
    pi.respondToUi({ id: requestStarted.id, confirmed: true }),
    /Unknown or already answered/,
  );
  passive();

  const activeRequest = deferred<void>();
  const passiveActiveRequest = deferred<void>();
  const confirmedNotice = deferred<void>();
  const active = pi.subscribe((event) => {
    if (event.type !== "extension_ui_request") return;
    if (event.method === "confirm") {
      activeRequest.resolve();
      void pi.respondToUi({ id: String(event.id), confirmed: true }).catch(() => {});
    }
    if (event.method === "notify" && event.message === "dwell-confirm: confirmed")
      confirmedNotice.resolve();
  });
  const observingPassive = pi.subscribe(
    (event) => {
      if (event.type === "extension_ui_request" && event.method === "confirm")
        passiveActiveRequest.resolve();
    },
    { interactive: false },
  );
  assert.equal((await pi.run("/dwell-confirm")).outcome, "handled");
  await Promise.all([activeRequest.promise, passiveActiveRequest.promise, confirmedNotice.promise]);
  active();
  observingPassive();

  const detachingRequest = deferred<void>();
  const detachedNotice = deferred<number>();
  let detachedRequestId = "";
  let unsubscribeLastInteractive = () => {};
  unsubscribeLastInteractive = pi.subscribe((event) => {
    if (event.type === "extension_ui_request" && event.method === "confirm") {
      unsubscribeLastInteractive();
      detachingRequest.resolve();
    }
  });
  const remainingPassive = pi.subscribe(
    (event) => {
      if (event.type !== "extension_ui_request") return;
      if (event.method === "confirm") {
        detachedRequestId = String(event.id);
        requestStarted.at = performance.now();
      }
      if (event.method === "notify" && event.message === "dwell-confirm: cancelled")
        detachedNotice.resolve(performance.now() - requestStarted.at);
    },
    { interactive: false },
  );
  assert.equal((await pi.run("/dwell-confirm")).outcome, "handled");
  await detachingRequest.promise;
  const detachedDelay = await detachedNotice.promise;
  assert.ok(detachedDelay < 500, `last-interactive removal took ${detachedDelay}ms`);
  await assert.rejects(
    pi.respondToUi({ id: detachedRequestId, confirmed: true }),
    /Unknown or already answered/,
  );
  remainingPassive();
});

test("real Pi stream fixture waits for a release barrier and aborts while waiting", async (t) => {
  let releasePath = "";
  let startedPath = "";
  const { pi } = await runtime(t, undefined, (value) => {
    releasePath = join(value.root, "stream-release");
    startedPath = join(value.root, "stream-started");
    value.env.DWELL_TEST_STREAM_RELEASE = releasePath;
    value.env.DWELL_TEST_STREAM_STARTED = startedPath;
  });
  const deltas: string[] = [];
  const firstChunk = deferred<void>();
  const unsubscribe = pi.subscribe((event) => {
    if (event.type !== "message_update" || !isRecord(event.assistantMessageEvent)) return;
    const update = event.assistantMessageEvent;
    if (update.type !== "text_delta" || typeof update.delta !== "string") return;
    deltas.push(update.delta);
    if (update.delta === "stream-first-") firstChunk.resolve();
  });

  const run = pi.startRun("stream");
  await firstChunk.promise;
  assert.equal(await run.accepted, "started");
  assert.equal(deltas.includes("stream-second"), false);
  await waitForFile(startedPath);
  await writeFile(releasePath, "release\n", { mode: 0o600 });
  assert.equal((await run.settled).outcome, "completed");
  assert.ok(deltas.includes("stream-second"));

  await unlink(releasePath);
  await unlink(startedPath);
  const secondFirstChunk = deferred<void>();
  const unsubscribeAbortObserver = pi.subscribe((event) => {
    if (
      event.type === "message_update" &&
      isRecord(event.assistantMessageEvent) &&
      event.assistantMessageEvent.type === "text_delta" &&
      event.assistantMessageEvent.delta === "stream-first-"
    )
      secondFirstChunk.resolve();
  });
  const abortingRun = pi.startRun("stream");
  await secondFirstChunk.promise;
  await abortingRun.accepted;
  await pi.abort();
  assert.equal((await abortingRun.settled).outcome, "aborted");
  unsubscribeAbortObserver();
  unsubscribe();
});

test("real Pi burst fixture streams large tool updates with a bounded final message", async (t) => {
  const { pi } = await runtime(t);
  let updateBytes = 0;
  let updateCount = 0;
  const unsubscribe = pi.subscribe((event) => {
    if (event.type !== "tool_execution_update" || !isRecord(event.partialResult)) return;
    const content = event.partialResult.content;
    if (!Array.isArray(content)) return;
    for (const item of content) {
      if (isRecord(item) && item.type === "text" && typeof item.text === "string") {
        updateBytes += Buffer.byteLength(item.text);
        updateCount += 1;
      }
    }
  });

  const result = await pi.run("burst");
  assert.equal(result.outcome, "completed");
  assert.equal(updateCount, 128);
  assert.ok(updateBytes > 2 * 1024 * 1024);
  const messages = await pi.getMessages();
  const latestAssistant = messages
    .slice()
    .reverse()
    .find((message) => message.role === "assistant");
  assert.ok(latestAssistant);
  assert.ok(Buffer.byteLength(JSON.stringify(latestAssistant)) < 1024);
  unsubscribe();
});

test("real Pi reports provider failures rather than successful settlement", async (t) => {
  const { pi } = await runtime(t);
  const result = await pi.run("fail");
  assert.equal(result.outcome, "failed");
  assert.match(result.error ?? "", /scripted|synthetic|failure/i);
  assert.equal(pi.state, "ready");
});

test("real Pi extension commands handle confirmation, cancellation, timeout and notification", async (t) => {
  const { pi } = await runtime(t);
  const notices: string[] = [];
  let answer = true;
  const unsubscribe = pi.subscribe((event) => {
    if (event.type !== "extension_ui_request") return;
    if (event.method === "notify" && typeof event.message === "string") notices.push(event.message);
    if (event.method === "confirm") {
      void pi.respondToUi({ id: String(event.id), confirmed: answer }).catch(() => {});
    }
  });
  assert.equal((await pi.run("/dwell-confirm")).outcome, "handled");
  assert.ok(notices.some((message) => /confirmed/i.test(message)));
  answer = false;
  await pi.run("/dwell-confirm");
  assert.ok(notices.some((message) => /cancelled/i.test(message)));
  unsubscribe();
  const timeoutNotices: string[] = [];
  const silent = pi.subscribe((event) => {
    if (event.type === "extension_ui_request" && typeof event.message === "string")
      timeoutNotices.push(event.message);
  });
  assert.equal((await pi.run("/dwell-confirm")).outcome, "handled");
  assert.ok(timeoutNotices.includes("dwell-confirm: cancelled"));
  silent();
  assert.equal((await pi.run("/dwell-confirm")).outcome, "handled");
  await assert.rejects(pi.respondToUi({ id: "missing", confirmed: true }), /Unknown/);
  const custom = pi.subscribe((event) => {
    if (event.type === "extension_ui_request" && typeof event.message === "string")
      timeoutNotices.push(event.message);
  });
  await pi.run("/dwell-custom");
  assert.ok(timeoutNotices.includes("dwell-custom: unavailable"));
  custom();
  assert.equal((await pi.run("/dwell-notify")).outcome, "handled");
});

test("real Pi closes after its owner disappears and receives stdin EOF", {
  timeout: 15_000,
}, async (t) => {
  const environment = await createPiEnvironment();
  t.after(() => environment.cleanup());
  const owner = spawn(
    process.execPath,
    [fileURLToPath(new URL("./fixtures/pi-owner.ts", import.meta.url)), environment.root],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...environment.env,
        DWELL_TEST_PI_EXECUTABLE: process.env.DWELL_TEST_PI_EXECUTABLE ?? process.execPath,
        DWELL_TEST_PI_ENTRY: process.env.DWELL_TEST_PI_EXECUTABLE
          ? (process.env.DWELL_TEST_PI_ENTRY ?? "")
          : fileURLToPath(piEntry),
      },
    },
  );
  let piPid: number | undefined;
  t.after(() => {
    owner.kill("SIGKILL");
    if (piPid) {
      try {
        process.kill(piPid, "SIGKILL");
      } catch {}
    }
  });
  const lines = createInterface({ input: owner.stdout });
  const ownerExit = once(owner, "exit");
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  const readiness = new Promise<never>((_resolve, reject) => {
    readyTimer = setTimeout(() => reject(new Error("Pi owner readiness timed out.")), 5000);
  });
  let line: unknown;
  try {
    [line] = await Promise.race([
      once(lines, "line"),
      ownerExit.then(() => {
        throw new Error("Pi owner exited before readiness.");
      }),
      readiness,
    ]);
  } finally {
    clearTimeout(readyTimer);
    lines.close();
  }
  assert.equal(typeof line, "string");
  piPid = Number(line);
  assert.ok(Number.isSafeInteger(piPid) && piPid > 0);
  owner.kill("SIGKILL");
  await ownerExit;
  // Poll the OS exit state with a deadline; no timing assumption about Pi cleanup.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      process.kill(piPid, 0);
    } catch (error) {
      assert.ok(error instanceof Error && "code" in error && error.code === "ESRCH");
      piPid = undefined;
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail("Pi remained alive after its owner disappeared.");
});
