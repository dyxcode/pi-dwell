import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { startHost } from "../src/server/http.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

test("authenticated memory routes page search and revision-pinned reads", async (t) => {
  const environment = await createPiEnvironment();
  let closeHost: (() => Promise<void>) | undefined;
  t.after(async () => {
    try {
      await closeHost?.();
    } finally {
      await environment.cleanup();
    }
  });
  const { dataDir, database } = await configureMemory(environment.root);
  const host = await startHost({ port: 0, dataDir });
  closeHost = () => host.close();
  const token = (await readFile(join(dataDir, "auth-token"), "utf8")).trim();
  const cliHeaders = { Authorization: `Bearer ${token}` };

  assert.equal((await fetch(`${host.url}/api/v1/client-capabilities`)).status, 403);
  assert.deepEqual(
    await (await fetch(`${host.url}/api/v1/client-capabilities`, { headers: cliHeaders })).json(),
    {
      memory: { configured: true, state: "ready" },
      library: { configured: false, state: "disabled" },
    },
  );

  const list = (body: unknown, authenticated = true) =>
    fetch(`${host.url}/api/v1/memory/list`, {
      method: "POST",
      headers: { ...(authenticated ? cliHeaders : {}), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal((await list({}, false)).status, 403);
  const recent = await list({ limit: 1 });
  assert.equal(recent.status, 200);
  assert.deepEqual(await recent.json(), {
    items: [
      { id: "memory-a", revision: 7, preview: "recent", updatedAt: "2026-11-17T00:00:00.000Z" },
    ],
    nextCursor: "opaque/list-next",
  });
  assert.deepEqual(await (await list({ cursor: "opaque/list-next" })).json(), { items: [] });
  for (const [body, status, code] of [
    [{ limit: 21 }, 400, "invalid_input"],
    [{ cursor: "tampered" }, 400, "invalid_cursor"],
    [{ cursor: "malformed-response" }, 503, "memory_unavailable"],
  ] as const) {
    const response = await list(body);
    assert.equal(response.status, status);
    assert.equal(responseErrorCode(await response.json()), code);
  }

  const search = await fetch(`${host.url}/api/v1/memory/search`, {
    method: "POST",
    headers: { ...cliHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "literal phrase", cursor: "opaque/search", limit: 2 }),
  });
  assert.equal(search.status, 200);
  assert.deepEqual(await search.json(), {
    items: [{ id: "memory-a", revision: 7, preview: "literal phrase" }],
    nextCursor: "opaque/search-next",
  });

  for (const [query, status, code] of [
    ["missing", 404, "memory_not_found"],
    ["changed", 409, "memory_changed"],
    ["bad-cursor", 400, "invalid_cursor"],
  ] as const) {
    const response = await fetch(`${host.url}/api/v1/memory/search`, {
      method: "POST",
      headers: { ...cliHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    assert.equal(response.status, status);
    assert.equal((await response.json()).error.code, code);
  }

  const read = await fetch(`${host.url}/api/v1/memory/read`, {
    method: "POST",
    headers: { ...cliHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ id: "memory-a", expectedRevision: 7 }),
  });
  assert.equal(read.status, 200);
  const firstPage = await read.json();
  assert.equal(firstPage.id, "memory-a");
  assert.equal(firstPage.revision, 7);
  assert.equal(Array.from(firstPage.text).length, 8_000);
  assert.equal(firstPage.text.includes("\0"), true);
  assert.equal(firstPage.nextCursor, "opaque/read-next");

  const nextPage = await fetch(`${host.url}/api/v1/memory/read`, {
    method: "POST",
    headers: { ...cliHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ id: "memory-a", expectedRevision: 7, cursor: "opaque/read-next" }),
  });
  assert.deepEqual(await nextPage.json(), {
    id: "memory-a",
    revision: 7,
    text: "last page",
  });

  await host.close();
  closeHost = undefined;
  assert.equal(await readFile(`${database}.closed`, "utf8"), "closed");
});

test("memory routes use browser authentication and validate request and reader results", async (t) => {
  const environment = await createPiEnvironment();
  let closeHost: (() => Promise<void>) | undefined;
  t.after(async () => {
    try {
      await closeHost?.();
    } finally {
      await environment.cleanup();
    }
  });
  const { dataDir } = await configureMemory(environment.root);
  const host = await startHost({ port: 0, dataDir });
  closeHost = () => host.close();
  const browserHeaders = { "X-Dwell-Request": "1" };

  const capabilities = await fetch(`${host.url}/api/v1/client-capabilities`, {
    headers: browserHeaders,
  });
  assert.equal(capabilities.status, 200);
  const search = await fetch(`${host.url}/api/v1/memory/search`, {
    method: "POST",
    headers: {
      ...browserHeaders,
      Origin: host.url,
      "X-Dwell-Request": "1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: "browser query" }),
  });
  assert.equal(search.status, 200);

  const tooLong = await fetch(`${host.url}/api/v1/memory/search`, {
    method: "POST",
    headers: {
      ...browserHeaders,
      Origin: host.url,
      "X-Dwell-Request": "1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: "🙂".repeat(129) }),
  });
  assert.equal(tooLong.status, 400);
  assert.equal((await tooLong.json()).error.code, "invalid_input");

  for (const [path, requestBody] of [
    ["search", { query: "over limit", limit: 21 }],
    ["search", { query: "unexpected field", extra: true }],
    ["read", { id: "memory-a", expectedRevision: 0 }],
  ]) {
    const invalid = await fetch(`${host.url}/api/v1/memory/${path}`, {
      method: "POST",
      headers: {
        ...browserHeaders,
        Origin: host.url,
        "X-Dwell-Request": "1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, "invalid_input");
  }

  const nulPreview = await fetch(`${host.url}/api/v1/memory/search`, {
    method: "POST",
    headers: {
      ...browserHeaders,
      Origin: host.url,
      "X-Dwell-Request": "1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: "nul" }),
  });
  assert.equal(nulPreview.status, 200);
  assert.equal((await nulPreview.json()).items[0].preview, "nul\0preview");

  const corrupt = await fetch(`${host.url}/api/v1/memory/search`, {
    method: "POST",
    headers: {
      ...browserHeaders,
      Origin: host.url,
      "X-Dwell-Request": "1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: "corrupt" }),
  });
  assert.equal(corrupt.status, 503);
  assert.equal((await corrupt.json()).error.code, "memory_unavailable");
});

test("reader opening failures are nonfatal and capabilities retain configured state", async (t) => {
  const environment = await createPiEnvironment();
  let closeHost: (() => Promise<void>) | undefined;
  t.after(async () => {
    try {
      await closeHost?.();
    } finally {
      await environment.cleanup();
    }
  });
  const { dataDir } = await configureMemory(environment.root, "unavailable");
  const host = await startHost({ port: 0, dataDir });
  closeHost = () => host.close();
  const token = (await readFile(join(dataDir, "auth-token"), "utf8")).trim();
  const headers = { Authorization: `Bearer ${token}` };

  assert.equal((await fetch(`${host.url}/healthz`)).status, 200);
  assert.deepEqual(
    await (await fetch(`${host.url}/api/v1/client-capabilities`, { headers })).json(),
    {
      memory: { configured: true, state: "unavailable" },
      library: { configured: false, state: "disabled" },
    },
  );
  const search = await fetch(`${host.url}/api/v1/memory/search`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "a search" }),
  });
  assert.equal(search.status, 503);
  assert.equal((await search.json()).error.code, "memory_unavailable");
});

test("the actual Distill reader preserves partial search pages, NUL text, revisions, and errors", {
  skip: !process.env.DWELL_TEST_DISTILL_MODULE,
}, async (t) => {
  const module = process.env.DWELL_TEST_DISTILL_MODULE;
  assert.ok(module);
  const environment = await createPiEnvironment();
  let writer: DistillMemoryWriter | undefined;
  let closeHost: (() => Promise<void>) | undefined;
  t.after(async () => {
    try {
      await closeHost?.();
    } finally {
      try {
        writer?.close();
      } finally {
        await environment.cleanup();
      }
    }
  });

  const dataDir = join(environment.root, "dwell-actual-distill");
  const database = join(environment.root, "actual-distill.sqlite");
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  writer = await openDistillMemoryWriter(module, database);
  const createdAt = "2026-11-17T00:00:00.000Z";
  for (let index = 0; index < 128; index += 1) {
    writer.save({
      id: `a-noise-${String(index).padStart(3, "0")}`,
      content: "unrelated synthetic content",
      createdAt,
    });
  }
  const content = `\0🙂${"x".repeat(8_100)}\0🙂 target phrase ${"tail".repeat(500)}`;
  writer.save({ id: "z-reader", content, createdAt });
  const escapedId = `y${"\u0001".repeat(511)}`;
  writer.save({ id: escapedId, content: "special match", createdAt });
  writer.save({ id: "z-special", content: "special match", createdAt });
  await writeFile(
    join(dataDir, "integrations.json"),
    JSON.stringify({ version: 1, distill: { module, database } }),
    { mode: 0o600 },
  );
  const host = await startHost({ port: 0, dataDir });
  closeHost = () => host.close();
  const token = (await readFile(join(dataDir, "auth-token"), "utf8")).trim();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const search = async (body: unknown) => {
    const response = await fetch(`${host.url}/api/v1/memory/search`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return { response, body: await response.json() };
  };

  const emptyPage = await search({ query: " target phrase " });
  assert.equal(emptyPage.response.status, 200);
  const emptyResult = objectValue(emptyPage.body);
  assert.deepEqual(emptyResult.items, []);
  const cursor = stringValue(emptyResult.nextCursor);
  const matchedPage = await search({ query: " target phrase ", cursor });
  assert.equal(matchedPage.response.status, 200);
  const matchedResult = objectValue(matchedPage.body);
  const matchedItems = arrayValue(matchedResult.items);
  assert.equal(matchedItems.length, 1);
  const firstItem = objectValue(matchedItems[0]);
  assert.equal(firstItem.id, "z-reader");
  assert.equal(firstItem.revision, 1);
  assert.equal(stringValue(firstItem.preview).includes("\0"), true);

  const firstRead = await fetch(`${host.url}/api/v1/memory/read`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: "z-reader", expectedRevision: 1 }),
  });
  assert.equal(firstRead.status, 200);
  const firstReadResult = objectValue(await firstRead.json());
  const firstText = stringValue(firstReadResult.text);
  assert.equal(Array.from(firstText).length, 8_000);
  assert.equal(firstText.includes("\0"), true);
  const readCursor = stringValue(firstReadResult.nextCursor);

  const secondRead = await fetch(`${host.url}/api/v1/memory/read`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: "z-reader",
      expectedRevision: 1,
      cursor: readCursor,
    }),
  });
  assert.equal(secondRead.status, 200);
  const secondReadResult = objectValue(await secondRead.json());
  assert.equal(typeof secondReadResult.text, "string");
  assert.equal(Object.hasOwn(secondReadResult, "nextCursor"), false);

  const escapedFirst = await search({ query: "special", limit: 1 });
  assert.equal(escapedFirst.response.status, 200);
  const escapedFirstResult = objectValue(escapedFirst.body);
  assert.deepEqual(escapedFirstResult.items, []);
  const escapedSearchCursor = stringValue(escapedFirstResult.nextCursor);
  const escapedSecond = await search({ query: "special", cursor: escapedSearchCursor, limit: 1 });
  assert.equal(escapedSecond.response.status, 200);
  const escapedSecondResult = objectValue(escapedSecond.body);
  const escapedItems = arrayValue(escapedSecondResult.items);
  assert.equal(escapedItems.length, 1);
  assert.equal(objectValue(escapedItems[0]).id, escapedId);
  const escapedCursor = stringValue(escapedSecondResult.nextCursor);
  assert.ok(escapedCursor.length > 4_096);
  const escapedThird = await search({ query: "special", cursor: escapedCursor, limit: 1 });
  assert.equal(escapedThird.response.status, 200);
  assert.equal(objectValue(arrayValue(objectValue(escapedThird.body).items)[0]).id, "z-special");

  const escapedRead = await fetch(`${host.url}/api/v1/memory/read`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: escapedId, expectedRevision: 1 }),
  });
  assert.equal(escapedRead.status, 200);
  assert.equal(stringValue(objectValue(await escapedRead.json()).text), "special match");

  const invalidCursor = await search({ query: "target phrase", cursor: "not-a-distill-cursor" });
  assert.equal(invalidCursor.response.status, 400);
  assert.equal(responseErrorCode(invalidCursor.body), "invalid_cursor");

  const missing = await fetch(`${host.url}/api/v1/memory/read`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: "missing-memory", expectedRevision: 1 }),
  });
  assert.equal(missing.status, 404);
  assert.equal(responseErrorCode(await missing.json()), "memory_not_found");

  writer.update({
    id: "z-reader",
    expectedRevision: 1,
    content: `${content} updated`,
    updatedAt: "2026-11-17T00:01:00.000Z",
  });
  const recent = await fetch(`${host.url}/api/v1/memory/list`, {
    method: "POST",
    headers,
    body: JSON.stringify({ limit: 1 }),
  });
  assert.equal(recent.status, 200);
  const recentPage = objectValue(await recent.json());
  const newest = objectValue(arrayValue(recentPage.items)[0]);
  assert.equal(newest.id, "z-reader");
  assert.equal(newest.revision, 2);
  assert.equal(newest.updatedAt, "2026-11-17T00:01:00.000Z");
  const nextRecent = await fetch(`${host.url}/api/v1/memory/list`, {
    method: "POST",
    headers,
    body: JSON.stringify({ limit: 1, cursor: stringValue(recentPage.nextCursor) }),
  });
  assert.equal(nextRecent.status, 200);
  assert.equal(
    objectValue(arrayValue(objectValue(await nextRecent.json()).items)[0]).id,
    "a-noise-000",
  );
  const changed = await fetch(`${host.url}/api/v1/memory/read`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: "z-reader", expectedRevision: 1 }),
  });
  assert.equal(changed.status, 409);
  assert.equal(responseErrorCode(await changed.json()), "memory_changed");
});

async function configureMemory(
  root: string,
  mode: "ready" | "unavailable" = "ready",
): Promise<{ dataDir: string; database: string }> {
  const dataDir = join(root, `dwell-memory-${mode}`);
  const module = join(root, "memory-fixture.mjs");
  const database = join(root, `memory-${mode}.sqlite`);
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await writeFile(database, "synthetic database", { mode: 0o600 });
  await writeFile(
    module,
    [
      "import { writeFileSync } from 'node:fs';",
      "export function openHostStorageV1() {",
      "  return {",
      "    version: 1,",
      "    acquireSourceRead: () => undefined,",
      "    beginHostUse: () => undefined,",
      "    listPendingHostUses: () => [],",
      "    recoverHostUse: () => false,",
      "    getCompletedDeletion: () => undefined,",
      "    close() {},",
      "  };",
      "}",
      "export function openMemoryReaderV1(databasePath) {",
      "  if (databasePath.includes('unavailable')) throw new Error('reader unavailable');",
      "  return {",
      "    version: 1,",
      "    list({ cursor }) {",
      "      if (cursor === 'opaque/list-next') return { items: [] };",
      "      if (cursor === 'tampered') throw Object.assign(new Error('cursor'), { code: 'invalid_cursor' });",
      "      return { items: [{ id: 'memory-a', revision: 7, preview: 'recent', updatedAt: cursor ? 'not a date' : '2026-11-17T00:00:00.000Z' }], nextCursor: 'opaque/list-next' };",
      "    },",
      "    search({ query, cursor }) {",
      "      if (query === 'corrupt') return { items: [{ id: '', revision: -1, preview: 4 }] };",
      "      if (query === 'nul') return { items: [{ id: 'memory-a', revision: 7, preview: 'nul\\0preview' }] };",
      "      if (query === 'missing') throw Object.assign(new Error('missing'), { code: 'memory_not_found' });",
      "      if (query === 'changed') throw Object.assign(new Error('changed'), { code: 'memory_changed' });",
      "      if (query === 'bad-cursor') throw Object.assign(new Error('cursor'), { code: 'invalid_cursor' });",
      "      return { items: [{ id: 'memory-a', revision: 7, preview: query }], nextCursor: 'opaque/search-next' };",
      "    },",
      "    read({ id, expectedRevision, cursor }) {",
      "      if (id === 'missing') throw Object.assign(new Error('missing'), { code: 'memory_not_found' });",
      "      if (expectedRevision !== 7) throw Object.assign(new Error('changed'), { code: 'memory_changed' });",
      "      return cursor ? { id, revision: 7, text: 'last page' } : { id, revision: 7, text: '🙂\\0'.repeat(4000), nextCursor: 'opaque/read-next' };",
      "    },",
      "    close() { writeFileSync(databasePath + '.closed', 'closed'); },",
      "  };",
      "}",
    ].join("\n"),
    { mode: 0o600 },
  );
  await writeFile(
    join(dataDir, "integrations.json"),
    JSON.stringify({ version: 1, distill: { module, database } }),
    { mode: 0o600 },
  );
  return { dataDir, database };
}

interface DistillMemoryWriter {
  save(memory: { id: string; content: string; createdAt: string }): void;
  update(memory: {
    id: string;
    expectedRevision: number;
    content: string;
    updatedAt: string;
  }): unknown;
  close(): void;
}

function isDistillMemoryWriter(value: unknown): value is DistillMemoryWriter {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "save" in value &&
    typeof value.save === "function" &&
    "update" in value &&
    typeof value.update === "function" &&
    "close" in value &&
    typeof value.close === "function"
  );
}

async function openDistillMemoryWriter(
  module: string,
  database: string,
): Promise<DistillMemoryWriter> {
  const storeModulePath = join(dirname(module), "storage", "store.js");
  const storeModule: unknown = await import(pathToFileURL(storeModulePath).href);
  if (
    typeof storeModule !== "object" ||
    storeModule === null ||
    !("SQLiteMemoryStore" in storeModule) ||
    typeof storeModule.SQLiteMemoryStore !== "function"
  )
    throw new Error("Distill build must provide SQLiteMemoryStore for the host fixture.");
  const writer: unknown = Reflect.construct(storeModule.SQLiteMemoryStore, [database]);
  if (!isDistillMemoryWriter(writer))
    throw new Error("Distill SQLiteMemoryStore does not provide the memory fixture methods.");
  return writer;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError("Expected an object response.");
  const object: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) object[key] = entry;
  return object;
}

function arrayValue(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new TypeError("Expected an array response.");
  return value;
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Expected a string response field.");
  return value;
}

function responseErrorCode(value: unknown): unknown {
  return objectValue(objectValue(value).error).code;
}
