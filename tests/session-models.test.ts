import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { startHost } from "../src/server/http.ts";
import { isSessionModelsResponse } from "../src/shared/discovery.ts";
import { isSessionInfo } from "../src/shared/sessions.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

test("session model discovery uses loaded extensions without switching models or reopening closed sessions", async (t) => {
  const env = await createPiEnvironment();
  const dataDir = join(env.root, "host");
  const host = await startHost({
    port: 0,
    dataDir,
    sessions: { env: env.env, extensions: [env.extensionPath] },
  });
  t.after(async () => {
    await host.close();
    await env.cleanup();
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
  assert.equal(
    (
      await request("/runtime", {
        executable: process.execPath,
        entryPoint: fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry")),
      })
    ).status,
    200,
  );
  const create = await request("/sessions", { requestId: randomUUID(), directory: env.cwd });
  assert.equal(create.status, 201);
  const session: unknown = await create.json();
  assert.ok(isSessionInfo(session));
  const endpoint = `/sessions/${session.id}/models`;
  const response = await request(endpoint);
  assert.equal(response.status, 200);
  const result: unknown = await response.json();
  assert.ok(isSessionModelsResponse(result));
  assert.equal(result.sessionId, session.id);
  const custom = result.models.find((model) => model.id === "dwell-test-reasoning");
  assert.deepEqual(custom?.thinkingLevels, ["low", "medium", "high", "xhigh"]);
  assert.equal(custom?.supportsImages, true);
  assert.equal(JSON.stringify(result).includes("fixture-only-no-secret"), false);
  const capability = await request(`/sessions/${session.id}/model-capabilities`, {
    provider: "dwell-test",
    model: "dwell-test-reasoning",
  });
  assert.equal(capability.status, 200);
  assert.deepEqual(await capability.json(), {
    provider: "dwell-test",
    model: "dwell-test-reasoning",
    supportsImages: true,
    thinkingLevels: custom?.thinkingLevels,
  });
  const after: unknown = await (await request(`/sessions/${session.id}`)).json();
  assert.ok(isSessionInfo(after));
  assert.equal(after.model, session.model);
  assert.equal(after.thinkingLevel, session.thinkingLevel);
  assert.equal((await fetch(`${host.url}/api/v1${endpoint}`)).status, 401);
  assert.equal(
    (
      await request(`/sessions/${session.id}/model-capabilities`, {
        provider: "missing",
        model: "missing",
      })
    ).status,
    404,
  );
  assert.equal((await request(`/sessions/${session.id}/close`, {})).status, 200);
  assert.equal((await request(endpoint)).status, 409);
  const closed: unknown = await (await request(`/sessions/${session.id}`)).json();
  assert.ok(isSessionInfo(closed));
  assert.equal(closed.runtimeState, "closed");
});
