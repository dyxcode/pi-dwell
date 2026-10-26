import assert from "node:assert/strict";
import { link, mkdir, mkdtemp, rename, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import {
  type HistoryPrefix,
  HistoryReadError,
  readSavedHistory,
} from "../src/runtime/pi-history.ts";
import type { PiEntry } from "../src/runtime/pi-process.ts";

const PI_SESSION_ID = "11111111-1111-4111-8111-111111111111";
const DIRECTORY_NAME = "synthetic-project";
const TIMESTAMP = "2026-10-26T02:00:00.000Z";
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_RECORD_BYTES = 1024 * 1024;

interface Fixture {
  root: string;
  file: string;
  directory: string;
  cleanup(): Promise<void>;
}

async function fixture(t: TestContext): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "pi-dwell-history-"));
  const file = join(root, "session.jsonl");
  const directory = join(root, DIRECTORY_NAME);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const cleanup = async () => rm(root, { recursive: true, force: true });
  t.after(cleanup);
  return { root, file, directory, cleanup };
}

function header(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "session",
    version: 3,
    id: PI_SESSION_ID,
    timestamp: TIMESTAMP,
    cwd: `/tmp/${DIRECTORY_NAME}`,
    ...fields,
  };
}

function entry(id: string, parentId: string | null, fields: Record<string, unknown> = {}): PiEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: TIMESTAMP,
    ...fields,
  };
}

function jsonLines(records: readonly unknown[], trailing = true): Buffer {
  const content = records.map((record) => JSON.stringify(record)).join("\n");
  return Buffer.from(`${content}${trailing ? "\n" : ""}`, "utf8");
}

function readOptions(value: Fixture) {
  return { file: value.file, piSessionId: PI_SESSION_ID, directory: `/tmp/${DIRECTORY_NAME}` };
}

async function expectHistoryError(
  operation: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof HistoryReadError);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

function prefixOf(history: { bytes: number; revision: string }): HistoryPrefix {
  return { bytes: history.bytes, revision: history.revision };
}

test("reads complete native entries as raw Pi data and keeps the persisted branch leaf", async (t) => {
  const value = await fixture(t);
  const user = entry("a1b2c3d4", null, {
    message: { role: "user", content: "你好 🌿", timestamp: Date.parse(TIMESTAMP) },
  });
  const assistant = entry("b2c3d4e5", user.id, {
    message: {
      role: "assistant",
      content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "你好.md" } }],
      timestamp: Date.parse(TIMESTAMP),
    },
  });
  const branch = {
    type: "custom",
    id: "c3d4e5f6",
    parentId: user.id,
    timestamp: TIMESTAMP,
    customType: "synthetic-extension-state",
    data: { selected: "別枝" },
  } satisfies PiEntry;
  const content = Buffer.concat([
    Buffer.from("\n", "utf8"),
    jsonLines([header(), user, assistant, branch]),
    Buffer.from("\n", "utf8"),
  ]);
  await writeFile(value.file, content, { mode: 0o644 });

  const history = await readSavedHistory(readOptions(value));

  assert.deepEqual(history.entries, [user, assistant, branch]);
  assert.equal(history.leafId, branch.id);
  assert.equal(history.bytes, content.byteLength);
  assert.equal(history.incompleteTail, false);
  assert.match(history.revision, /^[a-f0-9]{64}$/);
  assert.equal(history.revision.length, 64);
});

test("returns an immutable pinned prefix across appends", async (t) => {
  const value = await fixture(t);
  const first = entry("first000", null, { message: { role: "user", content: "one" } });
  const original = jsonLines([header(), first]);
  await writeFile(value.file, original);
  const initial = await readSavedHistory(readOptions(value));

  const appended = entry("second00", first.id, {
    message: { role: "assistant", content: "two" },
  });
  await writeFile(
    value.file,
    Buffer.concat([original, jsonLines([appended]), Buffer.from("partial")]),
  );

  const pinned = await readSavedHistory({ ...readOptions(value), prefix: prefixOf(initial) });
  const latest = await readSavedHistory(readOptions(value));

  assert.deepEqual(pinned.entries, initial.entries);
  assert.equal(pinned.leafId, initial.leafId);
  assert.equal(pinned.bytes, initial.bytes);
  assert.equal(pinned.revision, initial.revision);
  assert.equal(pinned.incompleteTail, false);
  assert.deepEqual(latest.entries, [first, appended]);
  assert.notEqual(latest.revision, initial.revision);
  assert.equal(latest.incompleteTail, true);
});

test("ignores an unterminated final record but rejects malformed complete records", async (t) => {
  const value = await fixture(t);
  const saved = entry("saved000", null, { message: { role: "user", content: "saved" } });
  const complete = jsonLines([header(), saved]);
  await writeFile(value.file, Buffer.concat([complete, Buffer.from("{not-json", "utf8")]));

  const history = await readSavedHistory(readOptions(value));

  assert.deepEqual(history.entries, [saved]);
  assert.equal(history.leafId, saved.id);
  assert.equal(history.bytes, complete.byteLength);
  assert.equal(history.incompleteTail, true);

  await writeFile(value.file, Buffer.concat([complete, Buffer.from("{not-json\n", "utf8")]));
  await expectHistoryError(readSavedHistory(readOptions(value)), 409, "invalid_history");
});

test("rejects absent, mismatched, duplicate, or structurally invalid history", async (t) => {
  const value = await fixture(t);
  await writeFile(value.file, "");
  await expectHistoryError(readSavedHistory(readOptions(value)), 409, "invalid_history");

  await writeFile(value.file, jsonLines([header({ id: "another-session" })]));
  await expectHistoryError(readSavedHistory(readOptions(value)), 409, "invalid_history");

  await writeFile(value.file, jsonLines([header({ cwd: "/tmp/elsewhere" })]));
  await expectHistoryError(readSavedHistory(readOptions(value)), 409, "invalid_history");

  const first = entry("duplicate", null);
  await writeFile(value.file, jsonLines([header(), first, entry("duplicate", first.id)]));
  await expectHistoryError(readSavedHistory(readOptions(value)), 409, "invalid_history");

  await writeFile(value.file, jsonLines([header(), entry("orphan", "missing00")]));
  await expectHistoryError(readSavedHistory(readOptions(value)), 409, "invalid_history");

  await writeFile(value.file, jsonLines([header(), header()]));
  await expectHistoryError(readSavedHistory(readOptions(value)), 409, "invalid_history");

  await writeFile(
    value.file,
    jsonLines([header(), { ...entry("bad-time", null), timestamp: "soon" }]),
  );
  await expectHistoryError(readSavedHistory(readOptions(value)), 409, "invalid_history");

  await writeFile(value.file, jsonLines([header()], false));
  await expectHistoryError(readSavedHistory(readOptions(value)), 409, "invalid_history");
});

test("detects changed, truncated, and replaced sources for a pinned prefix", async (t) => {
  const value = await fixture(t);
  const saved = entry("saved000", null, { data: "before" });
  const original = jsonLines([header(), saved]);
  await writeFile(value.file, original);
  const snapshot = await readSavedHistory(readOptions(value));
  const prefix = prefixOf(snapshot);

  await writeFile(value.file, original.toString("utf8").replace("before", "after!"));
  await expectHistoryError(
    readSavedHistory({ ...readOptions(value), prefix }),
    409,
    "history_changed",
  );

  await writeFile(value.file, original);
  await expectHistoryError(
    (async () => {
      await truncate(value.file, original.byteLength - 1);
      return readSavedHistory({ ...readOptions(value), prefix });
    })(),
    409,
    "history_changed",
  );

  const replacement = join(value.root, "replacement.jsonl");
  await writeFile(value.file, original);
  await writeFile(replacement, original);
  await rename(replacement, value.file);
  await expectHistoryError(
    readSavedHistory({ ...readOptions(value), prefix }),
    409,
    "history_changed",
  );
});

test("caps file, record, and entry counts without reading an oversized sparse tail", async (t) => {
  const value = await fixture(t);
  const validHeader = jsonLines([header()]);
  await writeFile(value.file, validHeader);
  const pinnedHeader = await readSavedHistory(readOptions(value));
  await truncate(value.file, MAX_SOURCE_BYTES + 1);
  await expectHistoryError(readSavedHistory(readOptions(value)), 413, "history_limit");

  const pinned = await readSavedHistory({ ...readOptions(value), prefix: prefixOf(pinnedHeader) });
  assert.deepEqual(pinned.entries, []);
  assert.equal(pinned.bytes, pinnedHeader.bytes);
  assert.equal(pinned.revision, pinnedHeader.revision);

  await writeFile(value.file, jsonLines([header({ extra: "x".repeat(MAX_RECORD_BYTES) })]));
  await expectHistoryError(readSavedHistory(readOptions(value)), 413, "history_limit");

  await writeFile(
    value.file,
    jsonLines([header(), { ...entry("large000", null), data: "x".repeat(MAX_RECORD_BYTES) }]),
  );
  await expectHistoryError(readSavedHistory(readOptions(value)), 413, "history_limit");

  const lines: unknown[] = [header()];
  for (let index = 0; index <= 100_000; index++)
    lines.push(entry(`id-${index}`, null, { type: "custom" }));
  await writeFile(value.file, jsonLines(lines));
  await expectHistoryError(readSavedHistory(readOptions(value)), 413, "history_limit");
});

test("allows Pi's ordinary 0644 JSONL mode in a private session directory", async (t) => {
  const value = await fixture(t);
  const saved = entry("saved000", null);
  await writeFile(value.file, jsonLines([header(), saved]), { mode: 0o644 });

  const history = await readSavedHistory(readOptions(value));

  assert.equal(history.entries.length, 1);
  assert.equal(history.leafId, saved.id);
});

test("rejects symlinks and multiply-linked history files", async (t) => {
  const value = await fixture(t);
  const target = join(value.root, "target.jsonl");
  await writeFile(target, jsonLines([header()]));
  await symlink(target, value.file);
  await expectHistoryError(readSavedHistory(readOptions(value)), 409, "invalid_history");

  await rm(value.file);
  await writeFile(value.file, jsonLines([header()]));
  const secondLink = join(value.root, "session-copy.jsonl");
  await link(value.file, secondLink);
  await expectHistoryError(readSavedHistory(readOptions(value)), 409, "invalid_history");
});

test("returns history unavailable for a missing saved file", async (t) => {
  const value = await fixture(t);
  await expectHistoryError(readSavedHistory(readOptions(value)), 410, "history_unavailable");
});
