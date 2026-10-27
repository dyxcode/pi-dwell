let sequence = 0;

function nextId() {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

function block(type, text = "", callId = null, name = null, extra = {}) {
  return { type, text, callId, name, ...extra };
}

function entry(role, blocks, parentId = null, extra = {}) {
  return {
    id: nextId(),
    parentId,
    timestamp: "2026-10-27T00:00:00.000Z",
    type: role === "toolResult" || role === "bashExecution" ? role : "message",
    role,
    blocks,
    toolCallId: null,
    toolName: null,
    targetId: null,
    truncated: false,
    ...extra,
  };
}

export function createTextEntry(role, text, parentId = null) {
  return entry(role, [block("text", text)], parentId);
}

export function createUserEntry(parts, parentId = null) {
  const id = nextId();
  const blocks = [];
  const images = [];
  for (const part of parts) {
    if (part.type === "text") blocks.push(block("text", part.text));
    else {
      const imageIndex = images.length;
      images.push(part.image);
      blocks.push(
        block("image", "", null, null, {
          imageIndex,
          mimeType: part.image.type,
        }),
      );
    }
  }
  return {
    entry: {
      id,
      parentId,
      timestamp: new Date().toISOString(),
      type: "message",
      role: "user",
      blocks,
      toolCallId: null,
      toolName: null,
      targetId: null,
      truncated: false,
    },
    images,
  };
}

export const SAMPLE_CONTEXT = [
  {
    path: "~/AGENTS.md",
    content: "# Home layout\n\nUse `~/Projects/` for repositories and `~/Work/` for experiments.",
    truncated: false,
  },
  {
    path: "~/Projects/example/AGENTS.md",
    content:
      "# Project guidance\n\n- Keep changes focused.\n- Follow the existing code style.\n- Verify the behavior you change.",
    truncated: false,
  },
];

export function createSampleHistory() {
  const user = createTextEntry("user", "Run the tests and tell me if this is ready to review.");
  const callId = "dwell-preview-call-1";
  const toolCall = entry(
    "assistant",
    [
      block(
        "thinking",
        "## Clarifying the contents\n\nThe request covers the message layout and command output. I’ll check them together.",
      ),
      block("text", "I’ll check the test suite."),
      block("tool_call", JSON.stringify({ command: "npm test" }), callId, "bash"),
    ],
    user.id,
  );
  const toolResult = entry("toolResult", [block("text", "24 tests passed\n0 failed · 1.2s")], toolCall.id, {
    toolCallId: callId,
    toolName: "bash",
  });
  const completed = createTextEntry(
    "assistant",
    "All 24 tests passed. The changes are ready to review.",
    toolResult.id,
  );
  const followup = createTextEntry("user", "What changed?", completed.id);
  const response = createTextEntry(
    "assistant",
    "Your messages sit on the right. Pi replies stay on the page, with commands and output tucked into the same response.",
    followup.id,
  );
  return [user, toolCall, toolResult, completed, followup, response];
}

export function createMultilineHistory() {
  const user = createTextEntry("user", "Run the checks in this directory.");
  const callId = "dwell-preview-call-multiline";
  const command = [
    "cd ~/Projects/pi-dwell",
    "npm run lint",
    "npm run typecheck",
    "npm test",
    "git diff --check",
  ].join("\n");
  const execution = entry(
    "bashExecution",
    [block("tool_call", command, callId, "bash"), block("text", "All checks passed.")],
    user.id,
  );
  const response = createTextEntry(
    "assistant",
    "The checks passed. The changes are ready to review.",
    execution.id,
  );
  return [user, execution, response];
}

export function createMarkdownHistory(userText, assistantText) {
  const user = createTextEntry("user", userText);
  return [user, createTextEntry("assistant", assistantText, user.id)];
}
