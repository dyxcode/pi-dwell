import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PiProcess } from "../src/runtime/pi-process.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

const piEntry = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry"));

async function options() {
  const environment = await createPiEnvironment();
  return {
    environment,
    pi: {
      executable: process.execPath,
      entryPoint: piEntry,
      cwd: environment.cwd,
      env: environment.env,
      sessionDirectory: environment.sessionDir,
      extensions: [environment.extensionPath],
      provider: "dwell-test",
      model: "dwell-test",
    },
  };
}

test("onSpawn receives the live Pi PID and its close promise resolves after stop", async (t) => {
  const fixture = await options();
  t.after(() => fixture.environment.cleanup());
  const children: { pid: number; closed: Promise<void> }[] = [];
  const pi = await PiProcess.start({
    ...fixture.pi,
    onSpawn: (pid, closed) => children.push({ pid, closed }),
  });
  t.after(() => pi.stop());

  assert.equal(children.length, 1);
  const child = children[0];
  assert.ok(child);
  assert.equal(child.pid, pi.pid);
  assert.doesNotThrow(() => process.kill(child.pid, 0));

  let closed = false;
  void child.closed.then(() => {
    closed = true;
  });
  await Promise.resolve();
  assert.equal(closed, false);

  await pi.stop();
  await child.closed;
  assert.equal(closed, true);
  assert.throws(() => process.kill(child.pid, 0), /ESRCH/);
});

test("an onSpawn failure rejects startup after stopping and closing the child", async (t) => {
  const fixture = await options();
  t.after(() => fixture.environment.cleanup());
  const failure = new Error("synthetic registration failure");
  let child: { pid: number; closed: Promise<void> } | undefined;
  let started: PiProcess | undefined;

  try {
    await assert.rejects(
      (async () => {
        started = await PiProcess.start({
          ...fixture.pi,
          onSpawn: (pid, closed) => {
            child = { pid, closed };
            throw failure;
          },
        });
      })(),
      (error: unknown) => error === failure,
    );
  } finally {
    await started?.stop();
  }

  const registeredChild = child;
  assert.ok(registeredChild);
  await registeredChild.closed;
  assert.throws(() => process.kill(registeredChild.pid, 0), /ESRCH/);
});
