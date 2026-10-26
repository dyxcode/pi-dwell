import assert from "node:assert/strict";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PiProcess } from "../src/runtime/pi-process.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

async function options(t: TestContext, mode: string) {
  const environment = await createPiEnvironment();
  t.after(() => environment.cleanup());
  return {
    executable: process.execPath,
    entryPoint: fileURLToPath(new URL("./fixtures/pi-fault.ts", import.meta.url)),
    cwd: environment.cwd,
    env: { ...environment.env, DWELL_PI_FAULT: mode },
    sessionDirectory: environment.sessionDir,
    provider: "dwell-test",
    model: "dwell-test",
    requestTimeoutMs: 500,
    shutdownTimeoutMs: 50,
  };
}

for (const mode of ["malformed", "oversized", "truncated", "invalid-state", "version"]) {
  test(`startup rejects ${mode} Pi output and cleans up the subprocess`, async (t) => {
    await assert.rejects(
      PiProcess.start(await options(t, mode)),
      /invalid|exceed|incomplete|unexpectedly|version/i,
    );
  });
}

test("readiness waits for a response and JSONL preserves fragmented Unicode and response identity", async (t) => {
  const pi = await PiProcess.start(await options(t, "delayed"));
  t.after(() => pi.stop());
  assert.equal(pi.state, "ready");
  const [messages, state] = await Promise.all([pi.getMessages(), pi.getState()]);
  assert.equal(messages[0]?.content, "你好\u2028world");
  assert.equal(state.sessionId, "synthetic-session");
  assert.equal((await pi.run("hello")).outcome, "completed");
});

for (const mode of ["timeout", "crash"]) {
  test(`a ${mode} rejects the active run, does not replay, and leaves the owner alive`, async (t) => {
    const pi = await PiProcess.start(await options(t, mode));
    t.after(() => pi.stop());
    await assert.rejects(pi.run("hello"), /unknown|exited/i);
    assert.equal(pi.state, "failed");
    await assert.rejects(pi.run("hello"), /unknown|exited/i);
    await pi.stop();
  });
}

test("shutdown escalates for an unresponsive Pi and observes its actual exit", async (t) => {
  const pi = await PiProcess.start(await options(t, "stubborn"));
  await Promise.all([pi.stop(), pi.stop()]);
  assert.equal(pi.state, "exited");
  assert.ok(pi.pid);
  assert.throws(() => process.kill(pi.pid ?? 0, 0), /ESRCH/);
});

test("private stderr diagnostics are bounded and excluded from ordinary errors", async (t) => {
  const pi = await PiProcess.start(await options(t, "stderr"));
  t.after(() => pi.stop());
  assert.ok(pi.stderrTail.length > 0 && pi.stderrTail.length <= 16 * 1024);
  await pi.stop();
  await assert.rejects(
    pi.getState(),
    (error: unknown) => error instanceof Error && !error.message.includes("private-diagnostic"),
  );
});

test("missing executable and directory errors do not launch a runtime", async (t) => {
  const opts = await options(t, "normal");
  await assert.rejects(
    PiProcess.start({ ...opts, executable: "/missing/dwell-pi" }),
    /Cannot read/,
  );
  await assert.rejects(PiProcess.start({ ...opts, cwd: "/missing/dwell-project" }), /ENOENT/);
});

test("a recovered provider attempt is completed only after final settlement", async (t) => {
  const pi = await PiProcess.start(await options(t, "recovered"));
  t.after(() => pi.stop());
  assert.equal((await pi.run("hello")).outcome, "completed");
});

test("oversized prompts reject before dispatch and leave the session usable", async (t) => {
  const pi = await PiProcess.start(await options(t, "normal"));
  t.after(() => pi.stop());
  await assert.rejects(pi.run("x".repeat(1024 * 1024 + 1)), /prompt.*1 MiB/i);
  assert.equal(pi.state, "ready");
  assert.equal((await pi.run("hello")).outcome, "completed");
});

test("pending RPC requests are bounded without disrupting admitted queries", async (t) => {
  const pi = await PiProcess.start(await options(t, "delayed"));
  t.after(() => pi.stop());
  const results = await Promise.allSettled(Array.from({ length: 33 }, () => pi.getState()));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 32);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected" && rejected.reason instanceof Error);
  assert.match(rejected.reason.message, /Too many pending/);
  assert.equal(pi.state, "ready");
});
