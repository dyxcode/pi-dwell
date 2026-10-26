import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, unlink } from "node:fs/promises";
import { createInterface } from "node:readline";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PiProcess } from "../src/runtime/pi-process.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

const piEntry = import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry");

async function runtime(t: TestContext, resumeFile?: string) {
  const environment = await createPiEnvironment();
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
