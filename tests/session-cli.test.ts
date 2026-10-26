import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseCommand } from "../src/clients/cli/arguments.ts";
import { readCredential } from "../src/local/files.ts";
import { startHost } from "../src/server/http.ts";
import { SESSION_ID, type SessionInfo } from "../src/shared/sessions.ts";

const exec = promisify(execFile);
const fixture = fileURLToPath(new URL("./fixtures/cli.ts", import.meta.url));
const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const piSessionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const session: SessionInfo = {
  id: sessionId,
  directory: "/Users/example/project",
  provider: "openai",
  model: "gpt-test",
  piSessionId,
  createdAt: 1_790_000_000_000,
  updatedAt: 1_790_000_000_001,
  status: "ready",
  runtimeState: "closed",
  historyState: "empty",
  error: null,
};

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
  const directory = await mkdtemp(join(tmpdir(), "dwell-session-cli-"));
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

test("CLI parser resolves session inputs, generates request IDs, and rejects malformed options", () => {
  const configured = parseCommand([
    "pi",
    "configure",
    "--executable",
    "/opt/pi",
    "--entry-point",
    "/opt/pi-cli.js",
    "--dev",
  ]);
  assert.deepEqual(configured, {
    kind: "configure",
    mode: "development",
    executable: "/opt/pi",
    entryPoint: "/opt/pi-cli.js",
  });

  const created = parseCommand([
    "new",
    "--directory",
    "~/project",
    "--provider",
    "openai",
    "--model",
    "gpt-test",
  ]);
  assert.equal(created.kind, "new");
  if (created.kind !== "new") throw new Error("Expected a session creation command.");
  assert.equal(created.directory, resolve(homedir(), "project"));
  assert.ok(SESSION_ID.test(created.requestId));

  assert.deepEqual(parseCommand(["sessions", "open", sessionId, "--dev"]), {
    kind: "session-open",
    mode: "development",
    sessionId,
  });
  assert.throws(() => parseCommand(["pi", "configure", "--executable", "pi"]), /absolute path/);
  assert.throws(
    () => parseCommand(["new", "--directory", ".", "--provider", "openai"]),
    /Missing required option --model/,
  );
  assert.throws(
    () =>
      parseCommand([
        "new",
        "--directory",
        ".",
        "--provider",
        "openai",
        "--model",
        "gpt-test",
        "--request-id",
        "nope",
      ]),
    /UUID/,
  );
  assert.throws(() => parseCommand(["sessions", "close", "not-a-uuid"]), /UUID/);
});

test("session CLI uses authenticated local HTTP, sends validated inputs, and prints validated JSON", async (t) => {
  const dataDir = await createDataDirectory(t);
  const configured = { executable: "/opt/pi", entryPoint: "/opt/pi-cli.js" };
  const records = await startSyntheticServer(t, dataDir, (request) => {
    if (request.method === "POST" && request.path === "/api/v1/runtime")
      return { status: 200, value: configured };
    if (request.method === "POST" && request.path === "/api/v1/sessions") {
      if (isRecord(request.body) && request.body.provider === "conflict")
        return {
          status: 409,
          value: {
            error: { code: "request_conflict", message: "Request ID has a different payload." },
          },
        };
      return { status: 201, value: session };
    }
    if (request.method === "GET" && request.path === "/api/v1/sessions")
      return { status: 200, value: [session] };
    if (request.method === "GET" && request.path === `/api/v1/sessions/${sessionId}`)
      return { status: 200, value: session };
    if (request.method === "POST" && request.path === `/api/v1/sessions/${sessionId}/open`)
      return { status: 200, value: { ...session, runtimeState: "ready" } };
    if (request.method === "POST" && request.path === `/api/v1/sessions/${sessionId}/close`)
      return { status: 200, value: session };
    return { status: 404, value: { error: { code: "not_found", message: "No route." } } };
  });
  const prefix = [fixture, dataDir, String(records.port)];

  const configuredOutput = await exec(process.execPath, [
    ...prefix,
    "pi",
    "configure",
    "--executable",
    configured.executable,
    "--entry-point",
    configured.entryPoint,
  ]);
  assert.deepEqual(JSON.parse(configuredOutput.stdout), configured);

  const createOutput = await exec(process.execPath, [
    ...prefix,
    "new",
    "--directory",
    "~/project",
    "--provider",
    "openai",
    "--model",
    "gpt-test",
  ]);
  assert.deepEqual(JSON.parse(createOutput.stdout), session);
  const createRequest = records.requests.find(
    (request) => request.method === "POST" && request.path === "/api/v1/sessions",
  );
  assert.ok(createRequest && isRecord(createRequest.body));
  if (!createRequest || !isRecord(createRequest.body))
    throw new Error("Expected a session request body.");
  const createBody = createRequest.body;
  assert.ok(typeof createBody.requestId === "string" && SESSION_ID.test(createBody.requestId));
  assert.deepEqual(createBody, {
    requestId: createBody.requestId,
    directory: resolve(homedir(), "project"),
    provider: "openai",
    model: "gpt-test",
  });

  const listOutput = await exec(process.execPath, [...prefix, "sessions"]);
  assert.deepEqual(JSON.parse(listOutput.stdout), [session]);
  const showOutput = await exec(process.execPath, [...prefix, "sessions", "show", sessionId]);
  assert.deepEqual(JSON.parse(showOutput.stdout), session);
  const openOutput = await exec(process.execPath, [...prefix, "sessions", "open", sessionId]);
  assert.deepEqual(JSON.parse(openOutput.stdout), { ...session, runtimeState: "ready" });
  const closeOutput = await exec(process.execPath, [...prefix, "sessions", "close", sessionId]);
  assert.deepEqual(JSON.parse(closeOutput.stdout), session);

  assert.equal(records.requests.length, 6);
  assert.ok(records.requests.every((request) => request.authorization?.startsWith("Bearer ")));
  assert.equal(records.requests[2]?.path, "/api/v1/sessions");
  assert.equal(records.requests[3]?.path, `/api/v1/sessions/${sessionId}`);
  assert.deepEqual(records.requests[4]?.body, {});
  assert.deepEqual(records.requests[5]?.body, {});
});

test("session CLI reports server error envelopes and rejects malformed responses", async (t) => {
  const dataDir = await createDataDirectory(t);
  const records = await startSyntheticServer(t, dataDir, (request) => {
    if (request.method === "POST" && request.path === "/api/v1/sessions")
      return {
        status: 409,
        value: {
          error: { code: "request_conflict", message: "Request ID has a different payload." },
        },
      };
    return { status: 200, value: { unexpected: true } };
  });
  const prefix = [fixture, dataDir, String(records.port)];

  await assert.rejects(
    exec(process.execPath, [
      ...prefix,
      "new",
      "--directory",
      ".",
      "--provider",
      "openai",
      "--model",
      "gpt-test",
    ]),
    (error: unknown) => {
      assert.ok(error instanceof Error && "stderr" in error);
      assert.match(String(error.stderr), /HTTP 409: Request ID has a different payload/);
      return true;
    },
  );
  await assert.rejects(exec(process.execPath, [...prefix, "sessions"]), (error: unknown) => {
    assert.ok(error instanceof Error && "stderr" in error);
    assert.match(String(error.stderr), /Incompatible pi-dwell session list response/);
    return true;
  });
  assert.equal(records.requests.length, 2);
});

test("an interrupted create transport exposes its request key for a safe retry", async (t) => {
  const dataDir = await createDataDirectory(t);
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.destroy();
  });
  const listening = once(server, "listening");
  server.listen(0, "127.0.0.1");
  await listening;
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const requestId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await assert.rejects(
    exec(process.execPath, [
      fixture,
      dataDir,
      String(address.port),
      "new",
      "--directory",
      dataDir,
      "--provider",
      "test",
      "--model",
      "test",
      "--request-id",
      requestId,
    ]),
    (error: unknown) => {
      assert.ok(error instanceof Error && "stderr" in error);
      assert.match(String(error.stderr), /Creation may already be admitted/);
      assert.ok(String(error.stderr).includes(`--request-id ${requestId}`));
      return true;
    },
  );
  assert.equal(requests, 1);
});
