import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openDistill } from "../src/integrations/distill.ts";
import { prepareDataDirectory } from "../src/local/files.ts";
import { startHost } from "../src/server/http.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

const module = process.env.DWELL_TEST_DISTILL_MODULE;

test("host loads configured Distill and closes children before its adapter", {
  skip: !module,
}, async (t) => {
  assert.ok(module);
  const env = await createPiEnvironment();
  const dataDir = await prepareDataDirectory(join(env.root, "dwell"));
  const configuration = { module, database: join(env.root, "memories.sqlite") };
  await writeFile(
    join(dataDir, "integrations.json"),
    JSON.stringify({ version: 1, distill: configuration }),
    { mode: 0o600 },
  );
  const inspector = await openDistill(configuration);
  const host = await startHost({
    port: 0,
    dataDir,
    sessions: { env: env.env, extensions: [env.extensionPath] },
  });
  t.after(async () => {
    await host.close();
    inspector.close();
    await env.cleanup();
  });
  const token = (await readFile(join(dataDir, "auth-token"), "utf8")).trim();
  const request = (path: string, body: unknown) =>
    fetch(`${host.url}/api/v1${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
  assert.equal(
    (
      await request("/sessions", {
        requestId: randomUUID(),
        directory: env.cwd,
        provider: "dwell-test",
        model: "dwell-test",
      })
    ).status,
    201,
  );
  assert.equal(inspector.listPendingHostUses().length, 1);
  await host.close();
  assert.deepEqual(inspector.listPendingHostUses(), []);
});

test("invalid configured integration fails host startup explicitly", async (t) => {
  const env = await createPiEnvironment();
  t.after(() => env.cleanup());
  const dataDir = await prepareDataDirectory(join(env.root, "dwell"));
  await writeFile(
    join(dataDir, "integrations.json"),
    JSON.stringify({
      version: 1,
      distill: {
        module: join(env.root, "missing.js"),
        database: join(env.root, "memories.sqlite"),
      },
    }),
    { mode: 0o600 },
  );
  let unexpected: Awaited<ReturnType<typeof startHost>> | undefined;
  try {
    await assert.rejects(async () => {
      unexpected = await startHost({ port: 0, dataDir });
    }, /missing\.js/);
  } finally {
    await unexpected?.close();
  }
});
