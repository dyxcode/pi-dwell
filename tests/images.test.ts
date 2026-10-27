import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { SessionService } from "../src/sessions/service.ts";
import {
  type ImageContent,
  isImageContent,
  isImageContentArray,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_COUNT,
  MAX_IMAGE_TOTAL_BYTES,
} from "../src/shared/images.ts";
import { isTurnCreateRequest } from "../src/shared/turns.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

const REQUEST_ID = "12345678-1234-1234-1234-123456789abc";
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
const piEntryPoint = fileURLToPath(
  import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry"),
);

async function setupService(t: TestContext, model: string) {
  const environment = await createPiEnvironment();
  const dataDir = join(environment.root, "dwell");
  const service = await SessionService.create({
    dataDir,
    env: environment.env,
    extensions: [environment.extensionPath],
  });
  t.after(async () => {
    await service.shutdown();
    await environment.cleanup();
  });
  await service.configure({ executable: process.execPath, entryPoint: piEntryPoint });
  const session = await service.createSession({
    requestId: randomUUID(),
    directory: environment.cwd,
    provider: "dwell-test",
    model,
  });
  return { service, session, dataDir };
}

async function waitForSettledTurn(service: SessionService, sessionId: string, runId: string) {
  const deadline = Date.now() + 8000;
  for (;;) {
    const turn = service.getTurn(sessionId, runId);
    if (!["accepted", "dispatching", "running"].includes(turn.status)) return turn;
    if (Date.now() > deadline) throw new Error("Timed out waiting for image turn.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("turn image content validates supported types, signatures and size limits", () => {
  assert.equal(isImageContent(PNG), true);
  assert.equal(isImageContent({ type: "image", mimeType: "image/jpeg", data: "/9j/AA==" }), true);
  assert.equal(
    isImageContent({ type: "image", mimeType: "image/webp", data: btoa("RIFF1234WEBP") }),
    true,
  );
  assert.equal(
    isImageContent({ type: "image", mimeType: "image/gif", data: btoa("GIF89a") }),
    true,
  );
  assert.equal(isImageContent({ ...PNG, mimeType: "image/jpeg" }), false);
  assert.equal(isImageContent({ ...PNG, mimeType: "image/svg+xml" }), false);
  assert.equal(isImageContent({ ...PNG, type: "text" }), false);
  assert.equal(isImageContent({ ...PNG, data: "%%%" }), false);
  assert.equal(isImageContent({ ...PNG, data: "a".repeat(MAX_IMAGE_BYTES * 2) }), false);
  assert.equal(MAX_IMAGE_COUNT, 4);
  assert.equal(MAX_IMAGE_TOTAL_BYTES, 5 * 1024 * 1024);
});

test("base64 validation handles the exact 5 MiB image boundary without stack overflow", () => {
  const bytes = Buffer.alloc(MAX_IMAGE_BYTES);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const maximum: ImageContent = { ...PNG, data: bytes.toString("base64") };
  assert.equal(isImageContent(maximum), true);
  assert.equal(isImageContentArray([maximum]), true);
  assert.equal(isImageContent({ ...maximum, data: `${maximum.data.slice(0, -3)}!==` }), false);
  const overLimit = Buffer.alloc(MAX_IMAGE_BYTES + 1);
  overLimit.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(isImageContent({ ...PNG, data: overLimit.toString("base64") }), false);
  assert.equal(isImageContent({ ...PNG, data: `${PNG.data.slice(0, -4)}AB==` }), false);
});

test("image lists are bounded by count and total decoded bytes", () => {
  assert.equal(isImageContentArray([PNG]), true);
  assert.equal(isImageContentArray([]), true);
  assert.equal(isImageContentArray([PNG, null]), false);
  assert.equal(isImageContentArray(Array.from({ length: MAX_IMAGE_COUNT + 1 }, () => PNG)), false);
  const largeData = new Uint8Array(2_700_000);
  largeData.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const binary = Array.from(largeData, (byte) => String.fromCharCode(byte)).join("");
  const large: ImageContent = { ...PNG, data: btoa(binary) };
  assert.equal(isImageContentArray([large]), true);
  assert.equal(isImageContentArray([large, large]), false);
});

test("turn requests accept image-only and text with separately ordered image attachments", () => {
  assert.equal(
    isTurnCreateRequest({ requestId: REQUEST_ID, message: "Look at this", images: [PNG] }),
    true,
  );
  assert.equal(isTurnCreateRequest({ requestId: REQUEST_ID, message: "", images: [PNG] }), true);
  assert.equal(isTurnCreateRequest({ requestId: REQUEST_ID, message: "  ", images: [PNG] }), true);
  assert.equal(isTurnCreateRequest({ requestId: REQUEST_ID, message: "" }), false);
  assert.equal(
    isTurnCreateRequest({ requestId: REQUEST_ID, message: "/help", images: [PNG] }),
    false,
  );
  assert.equal(
    isTurnCreateRequest({ requestId: REQUEST_ID, message: "Look", images: [null] }),
    false,
  );
  assert.equal(
    isTurnCreateRequest({ requestId: REQUEST_ID, message: "Look", images: [], extra: true }),
    false,
  );
});

test("Pi RPC receives native image attachments and image-only turns", async (t) => {
  const { service, session } = await setupService(t, "dwell-test-image");
  const request = { requestId: randomUUID(), message: "Describe it", images: [PNG] };
  const created = await service.submitTurn(session.id, request);
  const retry = await service.submitTurn(session.id, {
    ...request,
    images: [{ mimeType: PNG.mimeType, data: PNG.data, type: "image" }],
  });
  assert.equal(created.created, true);
  assert.equal(retry.created, false);
  assert.equal(retry.turn.runId, created.turn.runId);
  await assert.rejects(
    service.submitTurn(session.id, {
      ...request,
      images: [{ ...PNG, data: "iVBORw0KGgo=" }],
    }),
    (error: unknown) => error instanceof Error && error.message.includes("different content"),
  );

  const completed = await waitForSettledTurn(service, session.id, created.turn.runId);
  assert.equal(completed.status, "completed");
  const result = await service.getTurnResult(session.id, created.turn.runId);
  assert.match(
    JSON.stringify(result.entries),
    /Received 1 image\(s\): image\/png\. Text: describe it/,
  );
  assert.ok(JSON.stringify(result.entries).includes(PNG.data));

  const imageOnly = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "",
    images: [PNG],
  });
  const imageOnlyTurn = await waitForSettledTurn(service, session.id, imageOnly.turn.runId);
  assert.equal(imageOnlyTurn.status, "completed");
  const imageOnlyResult = await service.getTurnResult(session.id, imageOnly.turn.runId);
  assert.match(
    JSON.stringify(imageOnlyResult.entries),
    /Received 1 image\(s\): image\/png\. Text: /,
  );
});

test("native Pi RPC and history preserve a valid image record larger than 1 MiB", async (t) => {
  const bytes = Buffer.from(LARGE_PNG.data, "base64");
  assert.ok(bytes.length > 1024 * 1024);
  const { service, session } = await setupService(t, "dwell-test-image");
  const { turn } = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "Describe the large image",
    images: [LARGE_PNG],
  });
  const settled = await waitForSettledTurn(service, session.id, turn.runId);
  assert.equal(settled.status, "completed");

  const result = await service.getTurnResult(session.id, turn.runId);
  assert.ok(JSON.stringify(result.entries).includes(LARGE_PNG.data));
  const userEntry = result.entries.find(
    (entry) =>
      entry.type === "message" &&
      typeof entry.message === "object" &&
      entry.message !== null &&
      "role" in entry.message &&
      entry.message.role === "user",
  );
  assert.ok(userEntry);
  const savedImage = await service.getHistoryImage(session.id, userEntry.id, 0);
  assert.ok(savedImage);
  assert.equal(savedImage.mimeType, "image/png");
  assert.deepEqual(savedImage.data, bytes);
});

test("sessions remain usable after saved image history exceeds Pi's RPC record limit", async (t) => {
  const { service, session, dataDir } = await setupService(t, "dwell-test-image");
  const images = Array.from({ length: 4 }, () => LARGE_PNG);
  for (let index = 0; index < 2; index++) {
    const { turn } = await service.submitTurn(session.id, {
      requestId: randomUUID(),
      message: `Review large image set ${index + 1}`,
      images,
    });
    assert.equal((await waitForSettledTurn(service, session.id, turn.runId)).status, "completed");
  }

  const files = await readdir(join(dataDir, "sessions", session.id));
  const file = files.find((name) => name.endsWith(`_${session.piSessionId}.jsonl`));
  assert.ok(file);
  assert.ok((await stat(join(dataDir, "sessions", session.id, file))).size > 8 * 1024 * 1024);
  const history = await service.getHistory(session.id);
  assert.equal(history.status, "available");
  assert.doesNotMatch(JSON.stringify(history.entries), /iVBORw0KGgo/);

  const { turn } = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "Continue after the image reviews.",
  });
  assert.equal((await waitForSettledTurn(service, session.id, turn.runId)).status, "completed");
});

test("image turns fail before dispatch when the selected model is text-only", async (t) => {
  const { service, session } = await setupService(t, "dwell-test");
  const { turn } = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "Describe it",
    images: [PNG],
  });
  const settled = await waitForSettledTurn(service, session.id, turn.runId);
  assert.equal(settled.status, "failed");
  assert.equal(settled.error?.code, "unsupported_image_model");
  assert.equal(service.getSession(session.id).historyState, "empty");
});
