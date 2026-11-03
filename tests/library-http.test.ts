import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { startHost } from "../src/server/http.ts";
import { SessionCatalog } from "../src/storage/catalog.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

const currentModule = process.env.DWELL_TEST_CURRENT_MODULE;

test("authenticated library routes search and read an exact saved Current version", async (t) => {
  if (!currentModule) {
    t.skip("Set DWELL_TEST_CURRENT_MODULE to the installed Current library entry.");
    return;
  }
  const environment = await createPiEnvironment();
  let closeHost: (() => Promise<void>) | undefined;
  let closeWriter: (() => Promise<void>) | undefined;
  t.after(async () => {
    try {
      await closeHost?.();
    } finally {
      try {
        await closeWriter?.();
      } finally {
        await environment.cleanup();
      }
    }
  });
  const root = join(environment.root, "current-library");
  const current = await import(pathToFileURL(currentModule).href);
  const writer = current.openContentLibrary({ root });
  closeWriter = () => writer.close();
  const itemId = await saveVersion(writer, "Original version text.", "Original fixture title.");
  const oldVersion = (await writer.latest("test-source")).items[0];
  assert.ok(oldVersion);
  await saveVersion(writer, "Updated version text for search.", "Updated fixture title.");
  const dataDir = join(environment.root, "dwell-library");
  await writeCurrentConfiguration(dataDir, currentModule, root, "current-test");
  const sessionId = randomUUID();
  const catalog = await SessionCatalog.open(dataDir);
  catalog.insert({
    id: sessionId,
    displayName: null,
    metadataRevision: 0,
    requestId: randomUUID(),
    payloadIdentity: "a".repeat(64),
    directory: environment.cwd,
    provider: null,
    model: null,
    thinkingLevel: null,
    piSessionId: randomUUID(),
    piSessionFile: null,
    historyExpected: false,
    historyCheck: null,
    status: "failed",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    error: "Synthetic session for library reference routes.",
  });
  catalog.close();
  const host = await startHost({ port: 0, dataDir });
  closeHost = () => host.close();
  assert.equal((await stat(join(dataDir, "integrations.json"))).mode & 0o777, 0o600);
  const token = (await readFile(join(dataDir, "auth-token"), "utf8")).trim();
  const headers = { Authorization: `Bearer ${token}` };
  const search = await fetch(`${host.url}/api/v1/library/search`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "Updated version text", source: "test-source" }),
  });
  assert.equal(search.status, 200);
  const searched = await search.json();
  assert.equal(searched.binding, "current-test");
  assert.equal(searched.items[0]?.title, "Updated fixture title.");

  const latest = await fetch(`${host.url}/api/v1/library/latest?source=test-source`, { headers });
  assert.equal(latest.status, 200);
  const newest = await latest.json();
  assert.equal(newest.items[0]?.title, "Updated fixture title.");

  const exact = await fetch(
    `${host.url}/api/v1/library/current-test/items/${itemId}/versions/${oldVersion.versionId}`,
    { headers },
  );
  assert.equal(exact.status, 200);
  const read = await exact.json();
  assert.equal(read.reference.binding, "current-test");
  assert.equal(read.reference.itemId, itemId);
  assert.equal(read.reference.versionId, oldVersion.versionId);
  assert.equal(read.title, "Original fixture title.");
  assert.equal(read.text, "Original version text.");

  const reference = {
    binding: "current-test",
    itemId,
    versionId: oldVersion.versionId,
  };
  const referencesPath = `${host.url}/api/v1/sessions/${sessionId}/library-references`;
  const unauthorized = await fetch(referencesPath);
  assert.equal(unauthorized.status, 401);
  const added = await fetch(referencesPath, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(reference),
  });
  assert.equal(added.status, 200);
  assert.deepEqual(await added.json(), { references: [reference] });
  const listed = await fetch(referencesPath, { headers });
  assert.deepEqual(await listed.json(), { references: [reference] });
  const removedReference = await fetch(
    `${referencesPath}/current-test/items/${itemId}/versions/${oldVersion.versionId}`,
    { method: "DELETE", headers },
  );
  assert.equal(removedReference.status, 200);
  assert.deepEqual(await removedReference.json(), { references: [] });

  const wrongBinding = await fetch(
    `${host.url}/api/v1/library/another-library/items/${itemId}/versions/${oldVersion.versionId}`,
    { headers },
  );
  assert.equal(wrongBinding.status, 409);
  await writer.remove(itemId);
  const removed = await fetch(
    `${host.url}/api/v1/library/current-test/items/${itemId}/versions/${oldVersion.versionId}`,
    { headers },
  );
  assert.equal(removed.status, 404);

  assert.equal(
    (
      await fetch(`${host.url}/api/v1/library/search`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "invalid", extra: true }),
      })
    ).status,
    400,
  );
  assert.equal(
    (await fetch(`${host.url}/api/v1/library/latest?limit=1&limit=2`, { headers })).status,
    400,
  );
  assert.equal((await fetch(`${host.url}/api/v1/library/latest`)).status, 401);
});

test("authenticated library routes report when the optional library is absent", async (t) => {
  const environment = await createPiEnvironment();
  let closeHost: (() => Promise<void>) | undefined;
  t.after(async () => {
    try {
      await closeHost?.();
    } finally {
      await environment.cleanup();
    }
  });
  const dataDir = join(environment.root, "dwell-without-library");
  const host = await startHost({ port: 0, dataDir });
  closeHost = () => host.close();
  const token = (await readFile(join(dataDir, "auth-token"), "utf8")).trim();
  const response = await fetch(`${host.url}/api/v1/library/latest`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: {
      code: "library_unavailable",
      message: "The configured Current library is unavailable.",
    },
  });
});

test("an unavailable configured Current module leaves Dwell running", async (t) => {
  const environment = await createPiEnvironment();
  let closeHost: (() => Promise<void>) | undefined;
  t.after(async () => {
    try {
      await closeHost?.();
    } finally {
      await environment.cleanup();
    }
  });
  const dataDir = join(environment.root, "dwell-unavailable-current");
  await writeCurrentConfiguration(
    dataDir,
    join(environment.root, "missing-current-library.mjs"),
    join(environment.root, "current-library"),
    "current-test",
  );
  const host = await startHost({ port: 0, dataDir });
  closeHost = () => host.close();

  assert.equal((await fetch(`${host.url}/healthz`)).status, 200);
  const token = (await readFile(join(dataDir, "auth-token"), "utf8")).trim();
  const response = await fetch(`${host.url}/api/v1/library/latest`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "library_unavailable");
});

test("malformed integration configuration prevents host startup", async (t) => {
  const environment = await createPiEnvironment();
  t.after(environment.cleanup);
  const dataDir = join(environment.root, "dwell-invalid-integrations");
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await writeFile(join(dataDir, "integrations.json"), "{invalid", { mode: 0o600 });
  let host: Awaited<ReturnType<typeof startHost>> | undefined;
  try {
    host = await startHost({ port: 0, dataDir });
  } catch (error) {
    assert.match(error instanceof Error ? error.message : "", /Invalid integrations\.json/);
  }
  if (host) await host.close();
  assert.equal(host, undefined);
});

test("a Current close failure still closes the host listener", async (t) => {
  const environment = await createPiEnvironment();
  let closeHost: (() => Promise<void>) | undefined;
  t.after(async () => {
    try {
      await closeHost?.();
    } catch {
      // The fixture intentionally rejects its close operation.
    } finally {
      await environment.cleanup();
    }
  });
  const module = join(environment.root, "current-close-fails.mjs");
  await writeFile(
    module,
    [
      "export const contentLibraryApiVersion = 1;",
      "export function openContentLibrary() {",
      "  return {",
      "    apiVersion: 1,",
      "    search: async () => [],",
      "    latest: async () => undefined,",
      "    read: async () => undefined,",
      "    close: async () => { throw new Error('fixture close failed'); },",
      "  };",
      "}",
    ].join("\n"),
    { mode: 0o600 },
  );
  const dataDir = join(environment.root, "dwell-close-failure");
  await writeCurrentConfiguration(
    dataDir,
    module,
    join(environment.root, "current-library"),
    "current-test",
  );
  const host = await startHost({ port: 0, dataDir });
  closeHost = () => host.close();

  await assert.rejects(host.close(), /configured Current library is unavailable/i);
  await assert.rejects(fetch(`${host.url}/healthz`), TypeError);
});

async function writeCurrentConfiguration(
  dataDir: string,
  module: string,
  root: string,
  binding: string,
): Promise<void> {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await writeFile(
    join(dataDir, "integrations.json"),
    JSON.stringify({ version: 1, current: { module, root, binding } }),
    { mode: 0o600 },
  );
}

async function saveVersion(
  library: {
    save(request: unknown): Promise<{ items: { itemId: string }[] }>;
  },
  text: string,
  title: string,
): Promise<string> {
  const now = new Date().toISOString();
  const batch = {
    id: randomUUID(),
    sourceId: "test-source",
    collectedAt: now,
    items: [
      {
        sourceId: "test-source",
        externalId: "fixture-article",
        url: "https://example.test/library-fixture",
        title,
        author: "Fixture Author",
        summary: "Synthetic Current library fixture.",
        text,
        retrievedAt: now,
        discoveredAt: now,
        sourceCompleteness: "unknown",
        truncated: false,
      },
    ],
    failures: [],
    stopReason: "complete",
  };
  const saved = await library.save({ batch, requestedCount: 1, startedAt: now });
  const item = saved.items[0];
  assert.ok(item);
  return item.itemId;
}
