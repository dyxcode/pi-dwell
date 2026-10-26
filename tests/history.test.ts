import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { HistoryPages } from "../src/sessions/history.ts";
import { isHistoryPage } from "../src/shared/history.ts";

async function fixture(t: TestContext, count: number) {
  const directory = await mkdtemp(join(tmpdir(), "dwell-history-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "session.jsonl");
  const piSessionId = randomUUID();
  const sessionId = randomUUID();
  const header = {
    type: "session",
    version: 3,
    id: piSessionId,
    cwd: directory,
    timestamp: new Date(0).toISOString(),
  };
  const entries = Array.from({ length: count }, (_, index) => ({
    id: `entry-${index}`,
    parentId: index ? `entry-${index - 1}` : null,
    timestamp: new Date(0).toISOString(),
    type: "message",
    message: { role: index % 2 ? "assistant" : "user", content: `message ${index}` },
  }));
  await writeFile(
    file,
    `${[header, ...entries].map((value) => JSON.stringify(value)).join("\n")}\n`,
  );
  return { file, directory, piSessionId, sessionId, entries };
}

test("history pages retain their saved revision across appends and paginate without repeats", async (t) => {
  const source = await fixture(t, 130);
  const pages = new HistoryPages();
  const first = await pages.read(source);
  assert.equal(first.entries.length, 100);
  assert.equal(first.entries[0]?.id, "entry-30");
  assert.ok(first.nextCursor);
  await appendFile(
    source.file,
    `${JSON.stringify({ ...source.entries[0], id: "new", parentId: "entry-129" })}\n`,
  );
  const older = await pages.read({ ...source, cursor: first.nextCursor });
  assert.equal(older.entries.length, 30);
  assert.equal(older.entries[0]?.id, "entry-0");
  assert.equal(older.nextCursor, null);
  assert.equal(older.history.revision, first.history.revision);
  assert.equal((await pages.read(source)).history.leafId, "new");
  await assert.rejects(
    pages.read({ ...source, sessionId: randomUUID(), cursor: first.nextCursor }),
    /cursor/i,
  );
  await assert.rejects(pages.read({ ...source, cursor: `${first.nextCursor}x` }), /cursor/i);
  await writeFile(
    source.file,
    (await readFile(source.file, "utf8")).replace("message 0", "changed 0"),
  );
  await assert.rejects(pages.read({ ...source, cursor: first.nextCursor }), /changed|revision/i);
});

test("saved branch projection preserves old text, hides private state and explains context edits", async (t) => {
  const source = await fixture(t, 2);
  const stamp = new Date(0).toISOString();
  const extra = [
    {
      id: "hidden",
      parentId: "entry-1",
      timestamp: stamp,
      type: "custom_message",
      display: false,
      content: "hidden payload",
    },
    {
      id: "other",
      parentId: "entry-1",
      timestamp: stamp,
      type: "message",
      message: { role: "assistant", content: "abandoned branch" },
    },
    {
      id: "edit",
      parentId: "entry-1",
      timestamp: stamp,
      type: "context_edit",
      targetId: "entry-0",
      replacement: null,
    },
    {
      id: "summary",
      parentId: "edit",
      timestamp: stamp,
      type: "compaction",
      summary: "compact summary",
      firstKeptEntryId: "entry-1",
    },
    {
      id: "state",
      parentId: "summary",
      timestamp: stamp,
      type: "custom",
      customType: "private",
      data: "not for display",
    },
    {
      id: "visible",
      parentId: "state",
      timestamp: stamp,
      type: "custom_message",
      display: true,
      content: "visible notice",
      details: "private details",
    },
    {
      id: "future",
      parentId: "visible",
      timestamp: stamp,
      type: "future_entry",
      data: "unknown secret",
    },
  ];
  await appendFile(source.file, `${extra.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  const page = await new HistoryPages().read(source);
  const text = JSON.stringify(page.entries);
  assert.match(text, /message 0/);
  assert.match(text, /compact summary/);
  assert.match(text, /visible notice/);
  assert.doesNotMatch(
    text,
    /abandoned branch|hidden payload|not for display|private details|unknown secret/,
  );
  assert.ok(
    page.entries.some((entry) => entry.type === "context_edit" && entry.targetId === "entry-0"),
  );
  assert.ok(
    page.entries.some((entry) => entry.blocks.some((block) => block.type === "unsupported")),
  );
});

test("tool references survive projection while images and oversized text remain bounded", async (t) => {
  const source = await fixture(t, 1);
  const stamp = new Date(0).toISOString();
  await appendFile(
    source.file,
    `${[
      {
        id: "call",
        parentId: "entry-0",
        timestamp: stamp,
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "toolCall", id: "call-1", name: "echo", arguments: { text: "hello" } }],
        },
      },
      {
        id: "result",
        parentId: "call",
        timestamp: stamp,
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: "call-1",
          toolName: "echo",
          content: [
            { type: "text", text: '"😀'.repeat(60000) },
            { type: "image", data: "private-image", mimeType: "image/png" },
          ],
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n")}\n`,
  );
  const page = await new HistoryPages().read(source);
  const result = page.entries.find((entry) => entry.id === "result");
  assert.equal(result?.toolCallId, "call-1");
  assert.equal(result?.truncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 64 * 1024);
  assert.doesNotMatch(JSON.stringify(page.entries), /private-image/);
  assert.ok(Buffer.byteLength(JSON.stringify(page.entries)) <= 256 * 1024);
});

test("history page validation rejects untrusted or inconsistent protocol values", () => {
  const page = {
    sessionId: randomUUID(),
    status: "empty",
    revision: null,
    leafId: null,
    entries: [],
    nextCursor: null,
    incompleteTail: false,
    activeTurnId: null,
    latestTurnId: null,
    coveredTurnId: null,
  };
  assert.equal(isHistoryPage(page), true);
  assert.equal(isHistoryPage({ ...page, status: "made-up" }), false);
  assert.equal(isHistoryPage({ ...page, entries: [{ id: "bad" }] }), false);
  assert.equal(isHistoryPage({ ...page, nextCursor: 1 }), false);
  assert.equal(isHistoryPage({ ...page, activeTurnId: "invalid" }), false);
  assert.equal(
    isHistoryPage({
      ...page,
      status: "available",
      revision: "a".repeat(64),
      entries: new Array(1),
    }),
    false,
  );
});

test("oversized tool metadata is explicitly marked as truncated", async (t) => {
  const source = await fixture(t, 1);
  await appendFile(
    source.file,
    `${JSON.stringify({ id: "tool", parentId: "entry-0", timestamp: new Date(0).toISOString(), type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "x".repeat(2048), name: "echo", arguments: {} }] } })}\n`,
  );
  const entry = (await new HistoryPages().read(source)).entries.find((item) => item.id === "tool");
  assert.equal(entry?.truncated, true);
});

test("deep saved tool input gets a bounded placeholder instead of failing history", async (t) => {
  const source = await fixture(t, 1);
  const prefix = JSON.stringify({
    id: "deep",
    parentId: "entry-0",
    timestamp: new Date(0).toISOString(),
    type: "message",
    message: {
      role: "assistant",
      content: [{ type: "toolCall", id: "call", name: "echo", arguments: null }],
    },
  });
  const argumentsJson = `${"[".repeat(10000)}0${"]".repeat(10000)}`;
  await appendFile(
    source.file,
    `${prefix.replace('"arguments":null', `"arguments":${argumentsJson}`)}\n`,
  );
  const result = (await new HistoryPages().read(source)).entries.find((item) => item.id === "deep");
  assert.equal(result?.truncated, true);
  assert.match(JSON.stringify(result), /display.*limit/i);
});
