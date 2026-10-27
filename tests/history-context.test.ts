import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { HistoryPages } from "../src/sessions/history.ts";
import { isHistoryPage } from "../src/shared/history.ts";

async function session(t: TestContext, entries: unknown[]) {
  const directory = await mkdtemp(join(tmpdir(), "dwell-history-context-"));
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
  await writeFile(
    file,
    `${[header, ...entries].map((entry) => JSON.stringify(entry)).join("\n")}\n`,
  );
  return { file, directory, piSessionId, sessionId };
}

function entry(id: string, parentId: string | null, type: string, fields: object = {}) {
  return { id, parentId, timestamp: new Date(0).toISOString(), type, ...fields };
}

function instructions(path: string, content: string) {
  return `<project_context>\nProject-specific instructions and guidelines:\n\n<project_instructions path="${path}">\n${content}\n</project_instructions>\n</project_context>`;
}
function publicPage(slice: Awaited<ReturnType<HistoryPages["read"]>>, sessionId: string) {
  return {
    sessionId,
    status: "available" as const,
    revision: slice.history.revision,
    leafId: slice.history.leafId,
    entries: slice.entries,
    nextCursor: slice.nextCursor,
    incompleteTail: slice.history.incompleteTail,
    activeTurnId: null,
    latestTurnId: null,
    coveredTurnId: null,
    contextSources: slice.contextSources,
    contextSourcesTruncated: slice.contextSourcesTruncated,
  };
}

test("history reports only project instructions persisted in Pi system context", async (t) => {
  const source = await session(t, [
    entry("system", null, "message", {
      message: {
        role: "system",
        content: "private forced system prompt text",
        sections: {
          preamble: "private base instructions",
          project_context: instructions("/home/you/AGENTS.md", "Use Projects for repositories."),
        },
        timestamp: 0,
      },
    }),
    entry("user", "system", "message", { message: { role: "user", content: "Hello" } }),
  ]);

  const page = await new HistoryPages().read(source);
  assert.deepEqual(page.contextSources, [
    {
      path: "/home/you/AGENTS.md",
      content: "Use Projects for repositories.",
      truncated: false,
    },
  ]);
  assert.equal(
    page.entries.some((item) => item.id === "system"),
    false,
  );
  const wire = publicPage(page, source.sessionId);
  assert.equal(JSON.stringify(wire).includes("private forced system prompt"), false);
  assert.equal(JSON.stringify(wire).includes("private base instructions"), false);
  assert.equal(isHistoryPage(wire), true);
});

test("context follows system section replacement, removal, and compaction snapshots", async (t) => {
  const source = await session(t, [
    entry("system", null, "message", {
      message: {
        role: "system",
        content: "",
        sections: { project_context: instructions("/repo/AGENTS.md", "First version.") },
        timestamp: 0,
      },
    }),
    entry("patch", "system", "message", {
      message: {
        role: "system",
        content: "",
        sections: { project_context: instructions("/repo/AGENTS.md", "Updated version.") },
        timestamp: 0,
      },
    }),
    entry("compact", "patch", "compaction", {
      summary: "A compacted summary.",
      firstKeptEntryId: "user",
      tokensBefore: 100,
      systemMessage: {
        role: "system",
        content: "",
        sections: { project_context: instructions("/repo/AGENTS.md", "Snapshot version.") },
        timestamp: 0,
      },
    }),
    entry("user", "compact", "message", { message: { role: "user", content: "Continue" } }),
  ]);

  const page = await new HistoryPages().read(source);
  assert.deepEqual(page.contextSources, [
    { path: "/repo/AGENTS.md", content: "Snapshot version.", truncated: false },
  ]);

  const removed = await session(t, [
    entry("system", null, "message", {
      message: {
        role: "system",
        content: "",
        sections: { project_context: instructions("/repo/AGENTS.md", "Remove me.") },
        timestamp: 0,
      },
    }),
    entry("clear", "system", "message", {
      message: { role: "system", content: "", sections: { project_context: null }, timestamp: 0 },
    }),
    entry("user", "clear", "message", { message: { role: "user", content: "Hi" } }),
  ]);
  assert.deepEqual((await new HistoryPages().read(removed)).contextSources, []);
});

test("routine saved metadata stays out of chat and unknown entries remain diagnostics", async (t) => {
  const source = await session(t, [
    entry("user", null, "message", { message: { role: "user", content: "Hi" } }),
    entry("model", "user", "model_change", { provider: "openai", modelId: "gpt-test" }),
    entry("thinking", "model", "thinking_level_change", { thinkingLevel: "high" }),
    entry("usage", "thinking", "usage", { kind: "request", provider: "openai", model: "gpt-test" }),
    entry("unknown", "usage", "future_entry", { privateField: "preserved natively" }),
  ]);

  const page = await new HistoryPages().read(source);
  assert.deepEqual(
    page.entries.map((item) => item.id),
    ["user", "unknown"],
  );
  assert.equal(page.entries[1]?.role, "diagnostic");
  assert.match(page.entries[1]?.blocks[0]?.text ?? "", /unsupported/i);
  assert.equal(JSON.stringify(page.entries).includes("gpt-test"), false);
});

test("saved unsupported message roles become diagnostics rather than chat messages", async (t) => {
  const source = await session(t, [
    entry("odd-role", null, "message", { message: { role: "critic", content: "opaque" } }),
  ]);
  const item = (await new HistoryPages().read(source)).entries[0];
  assert.equal(item?.role, "diagnostic");
  assert.match(item?.blocks[0]?.text ?? "", /unsupported.*role/i);
  assert.equal(JSON.stringify(item).includes("opaque"), false);
});

test("Pi-native bash and custom messages keep their native display roles", async (t) => {
  const source = await session(t, [
    entry("bash", null, "message", {
      message: {
        role: "bashExecution",
        command: "pwd",
        output: "/repo",
        exitCode: 0,
        cancelled: false,
        truncated: false,
        timestamp: 0,
      },
    }),
    entry("custom", "bash", "message", {
      message: {
        role: "custom",
        customType: "review_note",
        content: [{ type: "text", text: "Review checkpoint." }],
        display: true,
        timestamp: 0,
      },
    }),
    entry("hidden", "custom", "message", {
      message: {
        role: "custom",
        customType: "private_note",
        content: "Must remain hidden.",
        display: false,
        timestamp: 0,
      },
    }),
    entry("summary", "hidden", "message", {
      message: { role: "branchSummary", summary: "Earlier branch details.", fromId: null },
    }),
  ]);

  const projected = (await new HistoryPages().read(source)).entries;
  assert.deepEqual(
    projected.map((item) => [item.id, item.role]),
    [
      ["bash", "bashExecution"],
      ["custom", "custom"],
      ["summary", "context"],
    ],
  );
  assert.deepEqual(projected[0]?.blocks, [
    { type: "tool_call", callId: null, name: "bash", text: "pwd" },
    { type: "text", callId: null, name: null, text: "/repo\nExit code: 0" },
  ]);
  assert.equal(projected[1]?.blocks[0]?.text, "Review checkpoint.");
  assert.equal(projected[2]?.blocks[0]?.text, "Earlier branch details.");
});

test("saved tool errors retain an explicit error marker for expandable output", async (t) => {
  const source = await session(t, [
    entry("error", null, "message", {
      message: {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "bash",
        isError: true,
        content: [{ type: "text", text: "permission denied" }],
        timestamp: 0,
      },
    }),
  ]);
  const result = (await new HistoryPages().read(source)).entries[0];
  assert.equal(result?.error, true);
  assert.equal(result?.blocks[0]?.text, "permission denied");
});

test("saved images are referenced by bounded history and loaded only from the active branch", async (t) => {
  const imageData = Buffer.from([1, 3, 3, 7]).toString("base64");
  const source = await session(t, [
    entry("root", null, "message", {
      message: {
        role: "user",
        content: [
          { type: "text", text: "What is this?" },
          { type: "image", data: imageData, mimeType: "image/png" },
          { type: "text", text: "Check the detail." },
          { type: "image", data: imageData, mimeType: "image/png" },
        ],
      },
    }),
    entry("alternate", null, "message", {
      message: {
        role: "user",
        content: [{ type: "image", data: imageData, mimeType: "image/png" }],
      },
    }),
    entry("leaf", "root", "message", { message: { role: "assistant", content: "A reply." } }),
  ]);

  const pages = new HistoryPages();
  const page = await pages.read(source);
  const user = page.entries.find((item) => item.id === "root");
  assert.deepEqual(
    user?.blocks.filter((block) => block.type === "image"),
    [
      { type: "image", text: "", callId: null, name: null, imageIndex: 0, mimeType: "image/png" },
      { type: "image", text: "", callId: null, name: null, imageIndex: 1, mimeType: "image/png" },
    ],
  );
  assert.equal(JSON.stringify(user).includes(imageData), false);
  const wire = publicPage(page, source.sessionId);
  assert.equal(isHistoryPage(wire), true);
  const imageBlock = user?.blocks.find((block) => block.type === "image");
  assert.ok(imageBlock);
  const withMime = {
    ...wire,
    entries: wire.entries.map((item) =>
      item.id === user?.id
        ? {
            ...item,
            blocks: item.blocks.map((block) =>
              block.type === "image" ? { ...block, mimeType: "text/html" } : block,
            ),
          }
        : item,
    ),
  };
  assert.equal(isHistoryPage(withMime), false);
  const invalidFields = {
    ...wire,
    entries: wire.entries.map((item) =>
      item.id === user?.id
        ? {
            ...item,
            blocks: item.blocks.map((block) =>
              block.type === "text" ? { ...block, imageIndex: 0 } : block,
            ),
          }
        : item,
    ),
  };
  assert.equal(isHistoryPage(invalidFields), false);
  assert.deepEqual(await pages.image({ ...source, entryId: "root", imageIndex: 1 }), {
    mimeType: "image/png",
    data: Buffer.from(imageData, "base64"),
  });
  assert.equal(await pages.image({ ...source, entryId: "alternate", imageIndex: 0 }), null);
  assert.equal(await pages.image({ ...source, entryId: "root", imageIndex: 2 }), null);
});

test("context previews stay within the browser history envelope", async (t) => {
  const source = await session(t, [
    entry("system", null, "message", {
      message: {
        role: "system",
        content: "",
        sections: { project_context: instructions("/repo/AGENTS.md", "long ".repeat(10_000)) },
        timestamp: 0,
      },
    }),
  ]);
  const page = await new HistoryPages().read(source);
  assert.equal(page.contextSources?.[0]?.truncated, true);
  const wire = publicPage(page, source.sessionId);
  assert.equal(new TextEncoder().encode(JSON.stringify(wire)).byteLength <= 256 * 1024, true);
  assert.equal(isHistoryPage(wire), true);
});

test("context marks instruction sources omitted beyond the source count limit", async (t) => {
  const projectContext = [
    "<project_context>",
    "Project-specific instructions and guidelines:",
    "",
    ...Array.from(
      { length: 33 },
      (_, index) =>
        `<project_instructions path="/repo/dir-${String(index).padStart(2, "0")}/AGENTS.md">\nInstruction ${index}.\n</project_instructions>`,
    ),
    "</project_context>",
  ].join("\n");
  const source = await session(t, [
    entry("system", null, "message", {
      message: { role: "system", content: "", sections: { project_context: projectContext } },
    }),
  ]);

  const page = await new HistoryPages().read(source);
  assert.equal(page.contextSources.length, 32);
  assert.equal(page.contextSourcesTruncated, true);
  assert.equal(
    page.contextSources.some((item) => item.path.endsWith("dir-32/AGENTS.md")),
    false,
  );
  assert.equal(isHistoryPage(publicPage(page, source.sessionId)), true);
});

test("context marks sources shortened by the combined preview byte budget", async (t) => {
  const projectContext = [
    "<project_context>",
    "Project-specific instructions and guidelines:",
    "",
    ...[
      "/repo/AGENTS.md",
      "/repo/src/AGENTS.md",
      "/repo/src/lib/AGENTS.md",
      "/repo/src/lib/file/AGENTS.md",
    ].map(
      (path) =>
        `<project_instructions path="${path}">\n${"\u0001".repeat(16_000)}\n</project_instructions>`,
    ),
    "</project_context>",
  ].join("\n");
  const source = await session(t, [
    entry("system", null, "message", {
      message: { role: "system", content: "", sections: { project_context: projectContext } },
    }),
  ]);

  const page = await new HistoryPages().read(source);
  assert.equal(page.contextSourcesTruncated, true);
  assert.ok(page.contextSources.length < 4);
  assert.ok(page.contextSources.some((item) => item.truncated));
  assert.equal(isHistoryPage(publicPage(page, source.sessionId)), true);
});

test("escaped context and conversation entries share the browser page budget", async (t) => {
  const system = entry("system", null, "message", {
    message: {
      role: "system",
      content: "",
      sections: { project_context: instructions("/repo/AGENTS.md", "\u0001".repeat(16_000)) },
      timestamp: 0,
    },
  });
  const entries = [system];
  let parentId = "system";
  for (let index = 0; index < 100; index++) {
    const id = `entry-${index}`;
    entries.push(
      entry(id, parentId, "message", {
        message: { role: "assistant", content: "\\\n\u0001".repeat(2_000) },
      }),
    );
    parentId = id;
  }
  const source = await session(t, entries);
  const page = await new HistoryPages().read(source);
  const wire = publicPage(page, source.sessionId);
  assert.equal(isHistoryPage(wire), true);
  assert.ok(new TextEncoder().encode(JSON.stringify(wire)).byteLength <= 256 * 1024);
  assert.ok(page.entries.length < 100);
  assert.equal(page.contextSources?.[0]?.truncated, false);
});
