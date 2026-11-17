import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryPanel } from "../src/clients/web/memory.ts";
import { HOST_PAGE } from "../src/clients/web/page.ts";
import { BROWSER_ASSETS } from "../src/clients/web/script.ts";

function firstMemory(panel: MemoryPanel): { id: string; revision: number; preview: string } {
  const item = panel.state.items[0];
  assert.ok(item);
  return item;
}

test("the browser exposes a real Memory search and reader surface", () => {
  for (const id of [
    "memory-view",
    "memory-capability-status",
    "memory-search-form",
    "memory-query",
    "memory-search",
    "memory-search-more",
    "memory-results",
    "memory-reader",
    "memory-text",
    "memory-read-more",
    "memory-retry",
  ])
    assert.match(HOST_PAGE, new RegExp(`id="${id}"`));
  assert.match(HOST_PAGE, /aria-labelledby="memory-title"/);
  assert.match(HOST_PAGE, /Search saved memories\./);
  assert.doesNotMatch(HOST_PAGE, /not added to Pi context/i);
  assert.ok(HOST_PAGE.indexOf('id="memory-view"') < HOST_PAGE.indexOf("</aside>"));
  assert.ok(HOST_PAGE.indexOf('id="conversation"') > HOST_PAGE.indexOf("<main id="));
  assert.match(HOST_PAGE, /id="composer"/);
});

test("Memory uses the authenticated client API and ships its controller module", () => {
  const client = BROWSER_ASSETS.get("/client.js");
  assert.ok(client);
  assert.ok(BROWSER_ASSETS.has("/memory.js"));
  assert.match(client, /\/api\/v1\/client-capabilities/);
  assert.match(client, /MemoryPanel/);
});

test("Memory search scans continue across empty batches and reads append bounded pages", async () => {
  const requests: { path: string; body: unknown }[] = [];
  const panel = new MemoryPanel(async (path, body) => {
    requests.push({ path, body });
    if (path.endsWith("/search"))
      return requests.length === 1
        ? { items: [], nextCursor: "scan-next" }
        : { items: [{ id: "memory-a", revision: 3, preview: "Found later" }] };
    return requests.length === 3
      ? { id: "memory-a", revision: 3, text: "First page. ", nextCursor: "read-next" }
      : { id: "memory-a", revision: 3, text: "Second page." };
  });

  await panel.search("  literal query  ");
  assert.deepEqual(requests[0], {
    path: "/api/v1/memory/search",
    body: { query: "literal query", limit: 20 },
  });
  assert.equal(panel.state.items.length, 0);
  assert.equal(panel.state.nextCursor, "scan-next");

  await panel.continueSearch();
  const foundState = panel.state;
  assert.equal(foundState.items[0]?.preview, "Found later");
  assert.equal(foundState.nextCursor, null);
  assert.deepEqual(requests[1]?.body, { query: "literal query", cursor: "scan-next", limit: 20 });

  const item = foundState.items[0];
  assert.ok(item);
  await panel.read(item);
  assert.deepEqual(requests[2]?.body, { id: "memory-a", expectedRevision: 3 });
  assert.equal(panel.state.text, "First page. ");
  assert.equal(panel.state.readCursor, "read-next");

  await panel.continueReading();
  assert.deepEqual(requests[3]?.body, {
    id: "memory-a",
    expectedRevision: 3,
    cursor: "read-next",
  });
  assert.equal(panel.state.text, "First page. Second page.");
  assert.equal(panel.state.readCursor, null);
});

test("a newer query and disconnect fence delayed search and read responses", async () => {
  const waiting = new Map<string, (value: unknown) => void>();
  const panel = new MemoryPanel(
    (path, body) =>
      new Promise((resolve) => {
        const key = `${path}:${JSON.stringify(body)}`;
        waiting.set(key, resolve);
      }),
  );

  const oldQuery = panel.search("older query");
  const newQuery = panel.search("newer query");
  const newKey = '/api/v1/memory/search:{"query":"newer query","limit":20}';
  waiting.get(newKey)?.({ items: [{ id: "new", revision: 1, preview: "Current result" }] });
  await newQuery;
  waiting.get('/api/v1/memory/search:{"query":"older query","limit":20}')?.({
    items: [{ id: "old", revision: 1, preview: "Stale result" }],
  });
  await oldQuery;
  assert.deepEqual(
    panel.state.items.map((item) => item.id),
    ["new"],
  );

  const delayedRead = panel.read(firstMemory(panel));
  panel.clear();
  waiting.get('/api/v1/memory/read:{"id":"new","expectedRevision":1}')?.({
    id: "new",
    revision: 1,
    text: "Sensitive memory text",
  });
  await delayedRead;
  assert.equal(panel.state.query, "");
  assert.deepEqual(panel.state.items, []);
  assert.equal(panel.state.text, "");
  assert.equal(panel.state.selected, null);
});

test("a changed memory revision reports that the user should search again", async () => {
  const panel = new MemoryPanel(async (path) => {
    if (path.endsWith("/search"))
      return { items: [{ id: "memory-a", revision: 2, preview: "A saved note" }] };
    throw Object.assign(new Error("The memory changed while it was being read."), {
      code: "memory_changed",
    });
  });

  await panel.search("note");
  await panel.read(firstMemory(panel));
  assert.match(panel.state.readError ?? "", /changed/i);
  assert.match(panel.state.readError ?? "", /search again/i);
  assert.equal(panel.state.text, "");
});

test("invalid search cursors stop offering continuation", async () => {
  let calls = 0;
  const panel = new MemoryPanel(async () => {
    calls++;
    if (calls === 1) return { items: [], nextCursor: "expired-search-page" };
    throw Object.assign(new Error("Search cursor expired."), { code: "invalid_cursor" });
  });

  await panel.search("later item");
  await panel.continueSearch();
  assert.equal(panel.state.nextCursor, null);
  assert.match(panel.state.searchError ?? "", /no longer valid/i);
});

test("changed reading cursors clear partial text and stop offering continuation", async () => {
  let calls = 0;
  const panel = new MemoryPanel(async (path) => {
    if (path.endsWith("/search"))
      return { items: [{ id: "memory-a", revision: 2, preview: "A saved note" }] };
    calls++;
    if (calls === 1)
      return { id: "memory-a", revision: 2, text: "Old first page. ", nextCursor: "old-read-page" };
    throw Object.assign(new Error("The memory changed."), { code: "memory_changed" });
  });

  await panel.search("note");
  await panel.read(firstMemory(panel));
  await panel.continueReading();
  assert.equal(panel.state.readCursor, null);
  assert.equal(panel.state.text, "");
  assert.match(panel.state.readError ?? "", /changed/i);
});

test("invalid reading cursors clear partial text and stop offering continuation", async () => {
  let readPages = 0;
  const panel = new MemoryPanel(async (path) => {
    if (path.endsWith("/search"))
      return { items: [{ id: "memory-a", revision: 2, preview: "A saved note" }] };
    readPages++;
    if (readPages === 1)
      return {
        id: "memory-a",
        revision: 2,
        text: "Partial page.",
        nextCursor: "expired-read-page",
      };
    throw Object.assign(new Error("Reader cursor expired."), { code: "invalid_cursor" });
  });

  await panel.search("note");
  await panel.read(firstMemory(panel));
  await panel.continueReading();
  assert.equal(panel.state.readCursor, null);
  assert.equal(panel.state.text, "");
  assert.match(panel.state.readError ?? "", /no longer valid/i);
});

test("temporary memory failures keep cursors and already read text for retry", async () => {
  let searches = 0;
  const panel = new MemoryPanel(async (path) => {
    if (path.endsWith("/search")) {
      searches++;
      if (searches === 1) return { items: [], nextCursor: "retry-search-page" };
      throw Object.assign(new Error("Storage is temporarily unavailable."), {
        code: "memory_unavailable",
      });
    }
    throw new Error("No read request was expected.");
  });

  await panel.search("note");
  await panel.continueSearch();
  assert.equal(panel.state.nextCursor, "retry-search-page");
  assert.match(panel.state.searchError ?? "", /temporarily unavailable/i);

  let readPages = 0;
  const resultPanel = new MemoryPanel(async (path) => {
    if (path.endsWith("/search"))
      return { items: [{ id: "memory-a", revision: 2, preview: "A saved note" }] };
    readPages++;
    if (readPages === 1)
      return { id: "memory-a", revision: 2, text: "First page.", nextCursor: "retry-read-page" };
    throw Object.assign(new Error("Storage is temporarily unavailable."), {
      code: "memory_unavailable",
    });
  });
  await resultPanel.search("note");
  await resultPanel.read(firstMemory(resultPanel));
  await resultPanel.continueReading();
  assert.equal(resultPanel.state.readCursor, "retry-read-page");
  assert.equal(resultPanel.state.text, "First page.");
  assert.match(resultPanel.state.readError ?? "", /temporarily unavailable/i);
});
