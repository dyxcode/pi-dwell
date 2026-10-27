import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { startHost } from "../src/server/http.ts";
import { type HistoryPage, isHistoryPage } from "../src/shared/history.ts";
import type { ImageContent } from "../src/shared/images.ts";
import { isSessionInfo, type SessionInfo } from "../src/shared/sessions.ts";
import { isTurnInfo, type TurnInfo } from "../src/shared/turns.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

const IMAGE_MODEL = { provider: "dwell-test", model: "dwell-test-image" };
const PNG: ImageContent = {
  type: "image",
  mimeType: "image/png",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
};
function pngCrc32(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      value = (value >>> 1) ^ ((value & 1) === 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length);
  chunk.write(type, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(pngCrc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

function createLargePng(): ImageContent {
  const width = 1024;
  const height = 300;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  const bytes = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels, { level: 0 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return { type: "image", mimeType: "image/png", data: bytes.toString("base64") };
}

const LARGE_PNG = createLargePng();
const PI_ENTRY_POINT = fileURLToPath(
  import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry"),
);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function setup(t: TestContext) {
  const environment = await createPiEnvironment();
  await writeFile(
    join(environment.agentDir, "models.json"),
    JSON.stringify({
      providers: {
        "dwell-test": {
          name: "Dwell Offline Fixture",
          baseUrl: "http://127.0.0.1",
          api: "openai-completions",
          apiKey: "fixture-only-no-secret",
          models: [
            {
              id: "dwell-test",
              name: "Text Fixture",
              input: ["text"],
              reasoning: false,
              contextWindow: 4096,
              maxTokens: 256,
            },
            {
              id: "dwell-test-image",
              name: "Image Fixture",
              input: ["text", "image"],
              reasoning: false,
              contextWindow: 8192,
              maxTokens: 1024,
            },
          ],
        },
      },
    }),
    { mode: 0o600 },
  );
  const dataDir = join(environment.root, "dwell");
  const host = await startHost({
    port: 0,
    dataDir,
    sessions: { env: environment.env, extensions: [environment.extensionPath] },
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
  const postRaw = (path: string, body: string) =>
    fetch(`${host.url}/api/v1${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    });
  const configure = async (): Promise<void> => {
    const response = await request("/runtime", {
      executable: process.execPath,
      entryPoint: PI_ENTRY_POINT,
    });
    assert.equal(response.status, 200);
  };
  const createSession = async (): Promise<SessionInfo> => {
    const response = await request("/sessions", {
      requestId: randomUUID(),
      directory: environment.cwd,
      ...IMAGE_MODEL,
    });
    assert.equal(response.status, 201);
    const value: unknown = await response.json();
    assert.ok(isSessionInfo(value));
    return value;
  };
  return { environment, host, token, request, postRaw, configure, createSession };
}

function asTurnInfo(value: unknown): TurnInfo {
  if (!isTurnInfo(value)) throw new Error("Response did not contain valid turn metadata.");
  return value;
}

function asHistoryPage(value: unknown, sessionId: string): HistoryPage {
  assert.ok(isHistoryPage(value));
  assert.equal(value.sessionId, sessionId);
  return value;
}

async function waitForTurn(
  request: (path: string, body?: unknown) => Promise<Response>,
  sessionId: string,
  runId: string,
): Promise<TurnInfo> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await request(`/sessions/${sessionId}/turns/${runId}`);
    assert.equal(response.status, 200);
    const turn = asTurnInfo(await response.json());
    if (!["accepted", "dispatching", "running"].includes(turn.status)) return turn;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Turn ${runId} did not settle before the deadline.`);
}

async function imageEntry(
  request: (path: string, body?: unknown) => Promise<Response>,
  sessionId: string,
  expectedImage: ImageContent = PNG,
): Promise<{ id: string; imageIndex: number }> {
  const historyResponse = await request(`/sessions/${sessionId}/history`);
  assert.equal(historyResponse.status, 200);
  const page = asHistoryPage(await historyResponse.json(), sessionId);
  const serialized = JSON.stringify(page);
  assert.ok(
    !serialized.includes(expectedImage.data),
    "history projection must not inline image bytes",
  );
  const entry = page.entries.find(
    (candidate) =>
      candidate.role === "user" && candidate.blocks.some((item) => item.type === "image"),
  );
  assert.ok(entry);
  const image = entry.blocks.find((item) => item.type === "image");
  assert.ok(image);
  assert.equal(image.mimeType, "image/png");
  assert.equal(image.imageIndex, 0);
  return { id: entry.id, imageIndex: image.imageIndex };
}

async function sendImageTurn(
  request: (path: string, body?: unknown) => Promise<Response>,
  sessionId: string,
  message: string,
  image: ImageContent = PNG,
): Promise<TurnInfo> {
  const response = await request(`/sessions/${sessionId}/turns`, {
    requestId: randomUUID(),
    message,
    images: [image],
  });
  assert.equal(response.status, 202);
  const accepted = asTurnInfo(await response.json());
  const settled = await waitForTurn(request, sessionId, accepted.runId);
  assert.equal(settled.status, "completed");
  return settled;
}

function jsonBodyOfSize(size: number): string {
  const prefix = `{"requestId":"${randomUUID()}","message":"ok","extra":"`;
  const suffix = '"}';
  const padding = size - Buffer.byteLength(prefix) - Buffer.byteLength(suffix);
  assert.ok(padding >= 0);
  return `${prefix}${"x".repeat(padding)}${suffix}`;
}

async function postDeclaredLength(
  url: string,
  path: string,
  token: string,
  contentLength: number,
): Promise<{ status: number; body: string }> {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: target.hostname, port: Number(target.port) });
    let response = Buffer.alloc(0);
    const timer = setTimeout(() => {
      socket.destroy(new Error("Timed out waiting for the body-limit response."));
    }, 5000);
    socket.once("connect", () => {
      socket.write(
        [
          `POST /api/v1${path} HTTP/1.1`,
          `Host: ${target.host}`,
          `Authorization: Bearer ${token}`,
          "Content-Type: application/json",
          `Content-Length: ${contentLength}`,
          "Connection: close",
          "",
          "",
        ].join("\r\n"),
      );
    });
    socket.on("data", (chunk: Buffer) => {
      response = Buffer.concat([response, chunk]);
    });
    socket.once("end", () => {
      clearTimeout(timer);
      const wire = response.toString("utf8");
      const statusLine = wire.slice(0, wire.indexOf("\r\n"));
      const status = Number(statusLine.split(" ")[1]);
      resolve({ status, body: wire.slice(wire.indexOf("\r\n\r\n") + 4) });
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

test("authenticated image turns save images natively and retrieve them by scoped history reference", async (t) => {
  const { host, request, configure, createSession } = await setup(t);
  await configure();

  const modelResponse = await request("/models");
  assert.equal(modelResponse.status, 200);
  const modelBody: unknown = await modelResponse.json();
  assert.ok(record(modelBody) && Array.isArray(modelBody.models));
  const imageModel = modelBody.models.find(
    (item) =>
      record(item) && item.provider === IMAGE_MODEL.provider && item.id === IMAGE_MODEL.model,
  );
  assert.ok(record(imageModel));
  assert.equal(imageModel.supportsImages, true);
  const textModel = modelBody.models.find(
    (item) => record(item) && item.provider === "dwell-test" && item.id === "dwell-test",
  );
  assert.ok(record(textModel));
  assert.equal(textModel.supportsImages, false);

  const capabilities = await request("/model-capabilities", IMAGE_MODEL);
  assert.equal(capabilities.status, 200);
  const capabilityBody: unknown = await capabilities.json();
  assert.ok(record(capabilityBody));
  assert.equal(capabilityBody.supportsImages, true);
  const textCapabilities = await request("/model-capabilities", {
    provider: "dwell-test",
    model: "dwell-test",
  });
  assert.equal(textCapabilities.status, 200);
  const textCapabilityBody: unknown = await textCapabilities.json();
  assert.ok(record(textCapabilityBody));
  assert.equal(textCapabilityBody.supportsImages, false);

  const firstSession = await createSession();
  const largeImageBytes = Buffer.from(LARGE_PNG.data, "base64");
  assert.ok(largeImageBytes.length > 1024 * 1024);
  const firstTurn = await sendImageTurn(request, firstSession.id, "Describe image one", LARGE_PNG);
  assert.ok(firstTurn.entryIds.length > 0);
  const firstImage = await imageEntry(request, firstSession.id, LARGE_PNG);
  const imagePath = `/sessions/${firstSession.id}/history/${encodeURIComponent(firstImage.id)}/images/${firstImage.imageIndex}`;

  const unauthenticated = await fetch(`${host.url}/api/v1${imagePath}`);
  assert.equal(unauthenticated.status, 401);

  const downloaded = await request(imagePath);
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers.get("content-type"), "image/png");
  assert.equal(downloaded.headers.get("content-disposition"), "inline");
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), largeImageBytes);

  const secondSession = await createSession();
  await sendImageTurn(request, secondSession.id, "Describe image two");
  const secondImage = await imageEntry(request, secondSession.id);
  const crossSession = await request(
    `/sessions/${firstSession.id}/history/${encodeURIComponent(secondImage.id)}/images/0`,
  );
  assert.equal(crossSession.status, 404);
  const nonexistentIndex = await request(
    `/sessions/${firstSession.id}/history/${encodeURIComponent(firstImage.id)}/images/1`,
  );
  assert.equal(nonexistentIndex.status, 404);
});

test("the 8 MiB request body limit is scoped to turn creation", async (t) => {
  const { host, token, postRaw, configure, createSession } = await setup(t);
  await configure();
  const session = await createSession();
  const limit = 8 * 1024 * 1024;

  const atLimit = await postRaw(`/sessions/${session.id}/turns`, jsonBodyOfSize(limit));
  assert.equal(atLimit.status, 400);
  const atLimitBody: unknown = await atLimit.json();
  const errorBody = record(atLimitBody) && record(atLimitBody.error) ? atLimitBody.error : null;
  assert.equal(errorBody?.code, "invalid_input");

  const overLimit = await postDeclaredLength(
    host.url,
    `/sessions/${session.id}/turns`,
    token,
    limit + 1,
  );
  assert.equal(overLimit.status, 413);

  const otherRoute = await postDeclaredLength(host.url, "/sessions", token, 8193);
  assert.equal(otherRoute.status, 413);
});
