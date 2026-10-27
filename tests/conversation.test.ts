import assert from "node:assert/strict";
import { test } from "node:test";
import {
  groupConversationEntries,
  pairToolResults,
  thinkingDisclosureKey,
  thinkingPresentation,
} from "../src/clients/web/conversation.ts";
import { commandPresentation } from "../src/clients/web/tool-command.ts";
import type { HistoryEntry } from "../src/shared/history.ts";

test("command presentation previews the first meaningful line and counts physical lines", () => {
  assert.deepEqual(commandPresentation("npm test"), {
    preview: "$ npm test",
    lineCount: 1,
    multiline: false,
  });
  assert.deepEqual(
    commandPresentation(
      "\n  npm run build \\\r\n    --verbose \\\r\n    --mode production \\\r\n    --watch\r\n",
    ),
    {
      preview: "$ npm run build \\",
      lineCount: 5,
      multiline: true,
    },
  );
  assert.deepEqual(commandPresentation("one\n\n"), {
    preview: "$ one",
    lineCount: 2,
    multiline: true,
  });
  assert.deepEqual(commandPresentation("\n  \t\n"), {
    preview: "$ ",
    lineCount: 2,
    multiline: true,
  });
});

test("thinking uses a short existing heading without repeating it in the body", () => {
  assert.deepEqual(thinkingPresentation("## Checking the output\n\nDetails."), {
    title: "Checking the output",
    text: "Details.",
  });
  assert.deepEqual(thinkingPresentation("**Checking the output**\n\nDetails."), {
    title: "Checking the output",
    text: "Details.",
  });
  assert.deepEqual(thinkingPresentation("## Code example\n\n    const value = 1;"), {
    title: "Code example",
    text: "    const value = 1;",
  });
  for (const text of [
    "",
    "Plain thinking.",
    "**Inline** explanation",
    `## ${"x".repeat(73)}\nBody`,
  ])
    assert.deepEqual(thinkingPresentation(text), { title: "Thinking", text });
});

test("live and saved thinking share the native message and content-index disclosure key", () => {
  const nativeKey = `${"a".repeat(64)}:1`;
  const live = thinkingDisclosureKey(nativeKey, 3);
  const saved = thinkingDisclosureKey(nativeKey, 3);
  assert.equal(live, `thinking:${nativeKey}:3`);
  assert.equal(saved, live);
});

function saved(
  id: string,
  role: HistoryEntry["role"],
  blocks: HistoryEntry["blocks"] = [],
  fields: Partial<HistoryEntry> = {},
): HistoryEntry {
  return {
    id,
    parentId: null,
    timestamp: new Date(0).toISOString(),
    type: "message",
    role,
    blocks,
    toolCallId: null,
    toolName: null,
    targetId: null,
    truncated: false,
    ...fields,
  };
}

test("assistant text and tool results stay in one group until the next user message", () => {
  const entries = [
    saved("user-1", "user"),
    saved("assistant-1", "assistant"),
    saved("result-1", "toolResult"),
    saved("assistant-2", "assistant"),
    saved("user-2", "user"),
    saved("assistant-3", "assistant"),
  ];
  const groups = groupConversationEntries(entries);
  assert.deepEqual(
    groups.map((group) =>
      group.kind === "assistant"
        ? [group.kind, ...group.entries.map((entry) => entry.id)]
        : [group.kind, group.entry.id],
    ),
    [
      ["user", "user-1"],
      ["assistant", "assistant-1", "result-1", "assistant-2"],
      ["user", "user-2"],
      ["assistant", "assistant-3"],
    ],
  );
});

test("tool results pair by call id across intervening messages and leave orphans visible", () => {
  const call = saved("call-entry", "assistant", [
    { type: "tool_call", callId: "call-1", name: "read", text: '{"path":"a.ts"}' },
    { type: "tool_call", callId: "call-2", name: "bash", text: '{"command":"pwd"}' },
  ]);
  const middle = saved("middle", "assistant", [
    { type: "text", callId: null, name: null, text: "While those run…" },
  ]);
  const duplicateCall = saved("duplicate-call", "assistant", [
    { type: "tool_call", callId: "call-1", name: "read", text: '{"path":"b.ts"}' },
  ]);
  const matched = saved(
    "matched",
    "toolResult",
    [{ type: "text", callId: null, name: null, text: "file contents" }],
    { toolCallId: "call-1", toolName: "read" },
  );
  const orphan = saved(
    "orphan",
    "toolResult",
    [{ type: "text", callId: null, name: null, text: "detached result" }],
    { toolCallId: "missing-call", toolName: "grep" },
  );

  const paired = pairToolResults([call, middle, duplicateCall, matched, orphan]);
  assert.equal(paired.byCall.get("call-entry:0"), matched);
  assert.equal(paired.byCall.has("call-entry:1"), false);
  assert.equal(paired.byCall.has("duplicate-call:0"), false);
  assert.deepEqual([...paired.matchedResultIds], ["matched"]);
  assert.equal(paired.orphanResults[0], orphan);
});

test("context and diagnostic blocks do not split a response before the next user", () => {
  const groups = groupConversationEntries([
    saved("assistant", "assistant"),
    saved("diagnostic", "diagnostic"),
    saved("context", "context"),
    saved("bash", "bashExecution"),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.kind, "assistant");
  if (groups[0]?.kind === "assistant")
    assert.deepEqual(
      groups[0].entries.map((entry) => entry.id),
      ["assistant", "diagnostic", "context", "bash"],
    );
});
