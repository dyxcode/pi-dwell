import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import { startHost } from "../src/server/http.ts";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

test("help works without a running host", async () => {
  const result = await exec(process.execPath, [cli, "--help"]);
  assert.match(result.stdout, /serve/);
  assert.match(result.stdout, /status/);
  assert.equal(result.stderr, "");
});

test("CLI status connects to the host through HTTP", async (t) => {
  const host = await startHost({ port: 0 });
  t.after(() => host.close());
  const result = await exec(process.execPath, [cli, "status", "--port", new URL(host.url).port]);
  const output: unknown = JSON.parse(result.stdout);
  assert.ok(output && typeof output === "object" && "service" in output);
  assert.equal(output.service, "pi-dwell");
  assert.equal(result.stderr, "");
});

test("CLI status explains how to start an unavailable host", async () => {
  const host = await startHost({ port: 0 });
  const port = new URL(host.url).port;
  await host.close();
  await assert.rejects(
    exec(process.execPath, [cli, "status", "--port", port]),
    (error: unknown) => {
      assert.ok(error instanceof Error && "code" in error && "stderr" in error);
      assert.equal(error.code, 1);
      assert.ok(String(error.stderr).includes(`Cannot reach pi-dwell at http://127.0.0.1:${port}`));
      assert.ok(String(error.stderr).includes(`npm start -- --port ${port}`));
      return true;
    },
  );
});

test("invalid CLI arguments fail clearly before starting a server", async () => {
  for (const args of [
    ["unknown"],
    ["serve", "--host", "0.0.0.0"],
    ["serve", "--port", "0"],
    ["serve", "--port", "65536"],
    ["serve", "--port", "12junk"],
    ["serve", "--port"],
    ["serve", "--port", "9000", "--port", "9001"],
  ]) {
    await assert.rejects(
      exec(process.execPath, [cli, ...args], { timeout: 3000 }),
      (error: unknown) => {
        assert.ok(error instanceof Error && "code" in error && "stderr" in error);
        assert.equal(error.code, 1);
        assert.match(String(error.stderr), /pi-dwell:/);
        return true;
      },
    );
  }
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  test(`CLI serve releases its port on ${signal}`, async (t) => {
    const reservation = await startHost({ port: 0 });
    const port = new URL(reservation.url).port;
    await reservation.close();

    const child = spawn(process.execPath, [cli, "serve", "--port", port], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exited = once(child, "exit");
    const deadline = setTimeout(() => child.kill("SIGKILL"), 5000);
    t.after(() => {
      clearTimeout(deadline);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    });
    let ready = false;
    for await (const line of createInterface({ input: child.stdout })) {
      if (line.includes(`listening on http://127.0.0.1:${port}`)) {
        ready = true;
        break;
      }
    }
    assert.ok(ready, "CLI must report successful startup");
    assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 200);
    child.kill(signal);
    const [code, exitSignal] = await exited;
    assert.equal(code, 0);
    assert.equal(exitSignal, null);
    await assert.rejects(fetch(`http://127.0.0.1:${port}/healthz`));
  });
}
