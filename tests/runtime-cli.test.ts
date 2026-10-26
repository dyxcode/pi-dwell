import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseCommand } from "../src/clients/cli/arguments.ts";
import { readCredential } from "../src/local/files.ts";
import { startHost } from "../src/server/http.ts";

const exec = promisify(execFile);
const fixture = fileURLToPath(new URL("./fixtures/cli.ts", import.meta.url));
interface RecordedRequest {
  method: string | undefined;
  path: string | undefined;
  authorization: string | undefined;
  body: unknown;
}

interface SyntheticServer {
  port: number;
  requests: RecordedRequest[];
}

async function createDataDirectory(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "dwell-runtime-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const host = await startHost({ port: 0, dataDir: directory });
  await host.close();
  return directory;
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return text.length === 0 ? undefined : JSON.parse(text);
}

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function startSyntheticServer(
  t: TestContext,
  dataDir: string,
  responseFor: (request: RecordedRequest) => { status: number; value: unknown },
): Promise<SyntheticServer> {
  const token = await readCredential(dataDir);
  const requests: RecordedRequest[] = [];
  const server = createServer((incoming, response) => {
    void (async () => {
      const recorded: RecordedRequest = {
        method: incoming.method,
        path: incoming.url,
        authorization: incoming.headers.authorization,
        body: incoming.method === "POST" ? await requestBody(incoming) : undefined,
      };
      requests.push(recorded);
      if (recorded.authorization !== `Bearer ${token}`) {
        send(response, 401, { error: { code: "unauthorized", message: "Credential rejected." } });
        return;
      }
      const result = responseFor(recorded);
      send(response, result.status, result.value);
    })().catch(() => {
      send(response, 500, { error: { code: "test_error", message: "Synthetic server failed." } });
    });
  });
  const listening = once(server, "listening");
  server.listen(0, "127.0.0.1");
  await listening;
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  t.after(
    () =>
      new Promise<void>((resolveClose, rejectClose) =>
        server.close((error) => (error ? rejectClose(error) : resolveClose())),
      ),
  );
  return { port: address.port, requests };
}

test("CLI parser validates runtime configuration and preserves foreground defaults", () => {
  assert.deepEqual(parseCommand([]), { kind: "serve", mode: "production" });
  assert.deepEqual(
    parseCommand([
      "pi",
      "configure",
      "--executable",
      "/opt/node",
      "--entry-point",
      "/opt/pi-cli.js",
      "--dev",
    ]),
    {
      kind: "configure",
      mode: "development",
      executable: "/opt/node",
      entryPoint: "/opt/pi-cli.js",
    },
  );
  assert.throws(() => parseCommand(["pi", "configure", "--executable", "pi"]), /absolute path/);
  assert.throws(() => parseCommand(["pi", "configure"]), /Missing required option/);
  assert.throws(
    () => parseCommand(["pi", "configure", "--executable", "/opt/pi", "--directory", "."]),
    /Unsupported option/,
  );
});

test("runtime configuration CLI uses authenticated HTTP and validates the response", async (t) => {
  const dataDir = await createDataDirectory(t);
  const configured = { executable: "/opt/node", entryPoint: "/opt/pi-cli.js" };
  const records = await startSyntheticServer(t, dataDir, () => ({
    status: 200,
    value: configured,
  }));
  const output = await exec(process.execPath, [
    fixture,
    dataDir,
    String(records.port),
    "pi",
    "configure",
    "--executable",
    configured.executable,
    "--entry-point",
    configured.entryPoint,
  ]);
  assert.deepEqual(JSON.parse(output.stdout), configured);
  assert.equal(output.stderr, "");
  assert.deepEqual(records.requests, [
    {
      method: "POST",
      path: "/api/v1/runtime",
      authorization: `Bearer ${await readCredential(dataDir)}`,
      body: configured,
    },
  ]);
});

test("runtime configuration CLI reports server errors and rejects malformed responses", async (t) => {
  const dataDir = await createDataDirectory(t);
  let fail = true;
  const records = await startSyntheticServer(t, dataDir, () =>
    fail
      ? { status: 409, value: { error: { code: "busy", message: "Close open runtimes first." } } }
      : { status: 200, value: { unexpected: true } },
  );
  const args = [
    fixture,
    dataDir,
    String(records.port),
    "pi",
    "configure",
    "--executable",
    "/opt/pi",
  ];
  await assert.rejects(exec(process.execPath, args), (error: unknown) => {
    assert.ok(error instanceof Error && "stderr" in error);
    assert.match(String(error.stderr), /HTTP 409: Close open runtimes first/);
    return true;
  });
  fail = false;
  await assert.rejects(exec(process.execPath, args), (error: unknown) => {
    assert.ok(error instanceof Error && "stderr" in error);
    assert.match(String(error.stderr), /Incompatible pi-dwell runtime configuration response/);
    return true;
  });
  assert.equal(records.requests.length, 2);
});
