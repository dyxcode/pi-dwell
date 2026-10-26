import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test, type TestContext } from "node:test";
import { startHost } from "../src/server/http.ts";
import { dataDirectory } from "../src/local/paths.ts";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/cli.ts", import.meta.url));
async function directory(t: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "dwell-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("help is read-only and development data is separate", async () => {
  const result = await exec(process.execPath, [cli, "--help"]);
  assert.match(result.stdout, /serve/);
  assert.match(result.stdout, /pair/);
  assert.match(result.stdout, /service/);
  assert.match(result.stdout, /pi configure/);
  assert.doesNotMatch(result.stdout, /^\s+(?:new|sessions)\b/m);
  assert.equal(result.stderr, "");
  assert.notEqual(dataDirectory("production"), dataDirectory("development"));
});

test("removed session commands fail before accessing host state, including help aliases", async (t) => {
  const dataDir = join(await directory(t), "absent");
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  for (const args of [
    ["new", "--directory", ".", "--provider", "test", "--model", "test"],
    ["new", "--help"],
    ["sessions"],
    ["sessions", "--dev"],
    ["sessions", "--help"],
    ...["show", "open", "close"].flatMap((action) => [
      ["sessions", action, id],
      ["sessions", action, "--help"],
    ]),
  ]) {
    await assert.rejects(
      exec(process.execPath, [fixture, dataDir, "1", ...args], { timeout: 3000 }),
      (error: unknown) => {
        assert.ok(error instanceof Error && "code" in error && "stderr" in error);
        assert.equal(error.code, 1);
        assert.match(String(error.stderr), /Unknown command\. Use --help\./);
        return true;
      },
    );
  }
  await assert.rejects(access(dataDir));
});

test("CLI status, pair and revoke use authenticated HTTP and do not print the long-lived credential", async (t) => {
  const dataDir = await directory(t);
  const host = await startHost({ port: 0, dataDir });
  t.after(() => host.close());
  const prefix = [fixture, dataDir, new URL(host.url).port];
  const status = await exec(process.execPath, [...prefix, "status"]);
  const output: unknown = JSON.parse(status.stdout);
  assert.ok(output && typeof output === "object" && "service" in output);
  assert.equal(output.service, "pi-dwell");
  const pairing = await exec(process.execPath, [...prefix, "pair"]);
  assert.match(pairing.stdout, /Pairing code: [a-f0-9]{32}/);
  const token = (await readFile(join(dataDir, "auth-token"), "utf8")).trim();
  assert.ok(!`${status.stdout}${status.stderr}${pairing.stdout}${pairing.stderr}`.includes(token));
  const revoked = await exec(process.execPath, [...prefix, "auth", "revoke"]);
  assert.match(revoked.stdout, /revoked/);
});

test("CLI reports missing credentials and unreachable hosts without writing state", async (t) => {
  const dataDir = join(await directory(t), "absent");
  await assert.rejects(
    exec(process.execPath, [fixture, dataDir, "1", "status"]),
    (error: unknown) => {
      assert.ok(error instanceof Error && "stderr" in error);
      assert.match(String(error.stderr), /credential is missing/);
      return true;
    },
  );
  await assert.rejects(access(dataDir));
  const host = await startHost({ port: 0, dataDir });
  const port = new URL(host.url).port;
  await host.close();
  await assert.rejects(
    exec(process.execPath, [fixture, dataDir, port, "status"]),
    (error: unknown) => {
      assert.ok(error instanceof Error && "stderr" in error);
      assert.match(String(error.stderr), /Cannot reach pi-dwell/);
      return true;
    },
  );
});

test("public CLI rejects multi-instance options and malformed commands", async () => {
  for (const args of [
    ["unknown"],
    ["serve", "--port", "9000"],
    ["serve", "--data-dir", "/tmp/example"],
    ["serve", "--host", "0.0.0.0"],
    ["serve", "--dev", "--dev"],
    ["service", "start", "--dev"],
    ["auth"],
    ["revoke"],
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

for (const signal of ["SIGINT", "SIGTERM", "SIGKILL"] as const) {
  test(`a real server process releases its port after ${signal} and preserves credentials`, async (t) => {
    const dataDir = await directory(t);
    const reservation = await startHost({ port: 0, dataDir });
    const port = new URL(reservation.url).port;
    const before = await readFile(join(dataDir, "auth-token"), "utf8");
    await reservation.close();
    const child = spawn(process.execPath, [fixture, dataDir, port, "serve"], {
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
    assert.ok(ready);
    assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 200);
    // A competing CLI must fail without altering the running host.
    await assert.rejects(exec(process.execPath, [fixture, dataDir, port, "serve"]), /occupied/);
    child.kill(signal);
    const [code, exitSignal] = await exited;
    assert.equal(code, signal === "SIGKILL" ? null : 0);
    assert.equal(exitSignal, signal === "SIGKILL" ? "SIGKILL" : null);
    assert.equal(await readFile(join(dataDir, "auth-token"), "utf8"), before);
    const restarted = await startHost({ port: Number(port), dataDir });
    await restarted.close();
  });
}
