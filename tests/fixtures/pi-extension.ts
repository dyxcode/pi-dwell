import { access, appendFile, writeFile } from "node:fs/promises";
import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  createAssistantMessageEventStream,
  type Message,
  type Model,
  type SimpleStreamOptions,
  type TextContent,
  type ThinkingContent,
  type ToolCall,
  type TranscriptContext,
  Type,
  uuidv7,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROVIDER = "dwell-test";
const MODEL = "dwell-test";
const ALT_MODEL = "dwell-test-alt";
const API: Api = "dwell-test";
const TOOL_NAME = "echo";
const SLOW_DELAY_MS = 30_000;

const zeroUsage: AssistantMessage["usage"] = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function createMessage(model: Model<Api>): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: { ...zeroUsage, cost: { ...zeroUsage.cost } },
    stopReason: "pending",
    timestamp: Date.now(),
  };
}

function contentText(content: Message["content"]): string {
  if (typeof content === "string") return content;
  return content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
}

function latestUserText(context: TranscriptContext): string {
  for (let index = context.messages.length - 1; index >= 0; index -= 1) {
    const message = context.messages[index];
    if (message?.role === "user") return contentText(message.content).trim().toLowerCase();
  }
  return "";
}

function latestEchoResult(context: TranscriptContext): string | undefined {
  for (let index = context.messages.length - 1; index >= 0; index -= 1) {
    const message = context.messages[index];
    if (message?.role === "toolResult" && message.toolName === TOOL_NAME) {
      return contentText(message.content);
    }
  }
  return undefined;
}

function emitText(
  stream: AssistantMessageEventStream,
  message: AssistantMessage,
  text: string,
  chunks: readonly string[],
): void {
  const block: TextContent = { type: "text", text: "" };
  const contentIndex = message.content.length;
  // Snapshot the first event before later stream pushes mutate this message.
  stream.push({ type: "start", partial: structuredClone(message) });
  message.content.push(block);
  stream.push({ type: "text_start", contentIndex, partial: message });
  for (const chunk of chunks) {
    if (chunk.length === 0) continue;
    block.text += chunk;
    stream.push({ type: "text_delta", contentIndex, delta: chunk, partial: message });
  }
  block.text = text;
  stream.push({ type: "text_end", contentIndex, content: text, partial: message });
  message.stopReason = "stop";
  stream.push({ type: "done", reason: "stop", message });
  stream.end();
}

function emitToolCall(
  stream: AssistantMessageEventStream,
  message: AssistantMessage,
  text = "dwell-test-echo",
): void {
  const toolCall: ToolCall = {
    type: "toolCall",
    id: uuidv7(),
    name: TOOL_NAME,
    arguments: { text },
  };
  const contentIndex = message.content.length;
  stream.push({ type: "start", partial: structuredClone(message) });
  message.content.push(toolCall);
  stream.push({ type: "toolcall_start", contentIndex, partial: message });
  stream.push({ type: "toolcall_end", contentIndex, toolCall, partial: message });
  message.stopReason = "toolUse";
  stream.push({ type: "done", reason: "toolUse", message });
  stream.end();
}

function emitError(
  stream: AssistantMessageEventStream,
  message: AssistantMessage,
  reason: "aborted" | "error",
  errorMessage: string,
): void {
  message.stopReason = reason;
  message.errorMessage = errorMessage;
  stream.push({ type: "error", reason, error: message });
  stream.end();
}

function waitForAbortOrTimeout(signal: AbortSignal | undefined, delayMs: number): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (aborted: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(aborted);
    };
    const onAbort = () => finish(true);
    const timer = setTimeout(() => finish(false), delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function waitForRelease(
  signal: AbortSignal | undefined,
  releasePath: string,
): Promise<boolean> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (signal?.aborted) return false;
    try {
      await access(releasePath);
      return true;
    } catch {
      if (await waitForAbortOrTimeout(signal, 25)) return false;
    }
  }
  return true;
}

async function emitGatedText(
  stream: AssistantMessageEventStream,
  message: AssistantMessage,
  options?: SimpleStreamOptions,
): Promise<void> {
  const first = "stream-first-";
  const second = "stream-second";
  const block: TextContent = { type: "text", text: "" };
  const contentIndex = message.content.length;
  stream.push({ type: "start", partial: structuredClone(message) });
  message.content.push(block);
  stream.push({ type: "text_start", contentIndex, partial: message });
  block.text = first;
  stream.push({ type: "text_delta", contentIndex, delta: first, partial: message });

  const startedPath = process.env.DWELL_TEST_STREAM_STARTED;
  if (startedPath) await appendFile(startedPath, "first-chunk\n", { mode: 0o600 });
  const releasePath = process.env.DWELL_TEST_STREAM_RELEASE;
  if (releasePath && !(await waitForRelease(options?.signal, releasePath))) {
    emitError(stream, message, "aborted", "Scripted response aborted.");
    return;
  }
  if (options?.signal?.aborted) {
    emitError(stream, message, "aborted", "Scripted response aborted.");
    return;
  }

  block.text += second;
  stream.push({ type: "text_delta", contentIndex, delta: second, partial: message });
  stream.push({ type: "text_end", contentIndex, content: block.text, partial: message });
  message.stopReason = "stop";
  stream.push({ type: "done", reason: "stop", message });
  stream.end();
}

async function emitGatedThinking(
  stream: AssistantMessageEventStream,
  message: AssistantMessage,
  options?: SimpleStreamOptions,
): Promise<void> {
  const first = "## Checking the response\n\nThe reasoning is still";
  const second = " in progress, then it finishes.";
  const answer = "Thinking complete; final answer is visible.";
  const thinking: ThinkingContent = { type: "thinking", thinking: first };
  const thinkingIndex = message.content.length;
  stream.push({ type: "start", partial: structuredClone(message) });
  message.content.push(thinking);
  // This fixture deliberately includes the first prefix in the start partial;
  // the matching delta below reproduces providers that echo that prefix.
  stream.push({ type: "thinking_start", contentIndex: thinkingIndex, partial: message });
  stream.push({
    type: "thinking_delta",
    contentIndex: thinkingIndex,
    delta: first,
    partial: message,
  });

  const startedPath = process.env.DWELL_TEST_STREAM_STARTED;
  if (startedPath) await appendFile(startedPath, "thinking-first-chunk\n", { mode: 0o600 });
  const releasePath = process.env.DWELL_TEST_STREAM_RELEASE;
  if (releasePath && !(await waitForRelease(options?.signal, releasePath))) {
    emitError(stream, message, "aborted", "Scripted response aborted.");
    return;
  }
  if (options?.signal?.aborted) {
    emitError(stream, message, "aborted", "Scripted response aborted.");
    return;
  }

  thinking.thinking += second;
  stream.push({
    type: "thinking_delta",
    contentIndex: thinkingIndex,
    delta: second,
    partial: message,
  });
  stream.push({
    type: "thinking_end",
    contentIndex: thinkingIndex,
    content: thinking.thinking,
    partial: message,
  });

  const text: TextContent = { type: "text", text: "" };
  const textIndex = message.content.length;
  message.content.push(text);
  stream.push({ type: "text_start", contentIndex: textIndex, partial: message });
  for (const chunk of ["Thinking complete; ", "final answer is visible."]) {
    text.text += chunk;
    stream.push({ type: "text_delta", contentIndex: textIndex, delta: chunk, partial: message });
  }
  stream.push({ type: "text_end", contentIndex: textIndex, content: answer, partial: message });
  message.stopReason = "stop";
  stream.push({ type: "done", reason: "stop", message });
  stream.end();
}

function scriptedStream(
  model: Model<Api>,
  context: TranscriptContext,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();
  const message = createMessage(model);

  const run = async (): Promise<void> => {
    if (options?.signal?.aborted) {
      emitError(stream, message, "aborted", "Scripted response aborted.");
      return;
    }

    const prompt = latestUserText(context);
    const lastUser = [...context.messages].reverse().find((item) => item.role === "user");
    const attached =
      lastUser && Array.isArray(lastUser.content)
        ? lastUser.content.filter((part) => part.type === "image")
        : [];
    if (attached.length) {
      const response = `Received ${attached.length} image(s): ${attached.map((part) => part.mimeType).join(", ")}. Text: ${prompt}`;
      emitText(stream, message, response, [response]);
      return;
    }
    if (prompt === "markdown") {
      const response =
        "# Review\n\n**Bold**, *italic*, ~~old~~ and `code`.\n\n- First\n  - Nested\n\n1. Ordered\n\n- [x] Done\n- [ ] Pending\n\n> A quoted paragraph.\n\n```text\nproject/\n  src/\n    client.ts\n```\n\n| Name | State |\n| :--- | ---: |\n| Web | Ready |\n\n---\n\n[Example](https://example.com)\n\n<img src=x onerror=alert(1)>";
      emitText(stream, message, response, [response]);
      return;
    }

    const turnLog = process.env.DWELL_TEST_TURN_LOG;
    if (turnLog) await appendFile(turnLog, `${prompt}\n`, { mode: 0o600 });
    if (prompt === "tool" || prompt === "tool-stream") {
      const echoResult = latestEchoResult(context);
      if (echoResult === undefined) {
        emitToolCall(stream, message);
      } else {
        if (prompt === "tool-stream") {
          await emitGatedText(stream, message, options);
          return;
        }
        const response = `Echo complete: ${echoResult}`;
        emitText(stream, message, response, ["Echo ", "complete: ", echoResult]);
      }
      return;
    }

    if (prompt === "stream") {
      await emitGatedText(stream, message, options);
      return;
    }

    if (prompt === "thinking-stream") {
      await emitGatedThinking(stream, message, options);
      return;
    }

    if (prompt === "burst") {
      const echoResult = latestEchoResult(context);
      if (echoResult === undefined) {
        emitToolCall(stream, message, "dwell-test-burst");
      } else {
        const response = `Echo complete: ${echoResult}`;
        emitText(stream, message, response, ["Echo ", "complete: ", echoResult]);
      }
      return;
    }

    if (prompt === "slow") {
      const marker = "dwell-slow-start";
      const block: TextContent = { type: "text", text: "" };
      const contentIndex = message.content.length;
      stream.push({ type: "start", partial: structuredClone(message) });
      message.content.push(block);
      stream.push({ type: "text_start", contentIndex, partial: message });
      block.text = marker;
      stream.push({ type: "text_delta", contentIndex, delta: marker, partial: message });
      const aborted = await waitForAbortOrTimeout(options?.signal, SLOW_DELAY_MS);
      if (aborted || options?.signal?.aborted) {
        emitError(stream, message, "aborted", "Scripted response aborted.");
        return;
      }
      block.text = `${marker} complete`;
      stream.push({
        type: "text_delta",
        contentIndex,
        delta: " complete",
        partial: message,
      });
      stream.push({
        type: "text_end",
        contentIndex,
        content: block.text,
        partial: message,
      });
      message.stopReason = "stop";
      stream.push({ type: "done", reason: "stop", message });
      stream.end();
      return;
    }

    if (prompt === "fail") {
      stream.push({ type: "start", partial: structuredClone(message) });
      emitError(stream, message, "error", "Synthetic scripted provider failure.");
      return;
    }

    const response =
      prompt === "hello" ? "Hello from the offline Pi fixture." : `Received: ${prompt}`;
    emitText(stream, message, response, [
      response.slice(0, 6),
      response.slice(6, 18),
      response.slice(18),
    ]);
  };

  void run().catch((error: unknown) => {
    const description =
      error instanceof Error ? error.message : "Synthetic scripted provider failure.";
    emitError(stream, message, "error", description);
  });
  return stream;
}

export default function registerDwellFixture(pi: ExtensionAPI): void {
  let nativePromptSent = false;
  pi.on("agent_settled", () => {
    const prompt = process.env.DWELL_TEST_NATIVE_PROMPT;
    if (prompt === undefined || nativePromptSent) return;
    nativePromptSent = true;
    pi.sendUserMessage(prompt);
  });
  pi.on("before_agent_start", async (event) => {
    const report = process.env.DWELL_TEST_SYSTEM_PROMPT;
    if (report) await writeFile(report, event.systemPrompt, { mode: 0o600 });
  });
  pi.on("input", async (event) =>
    event.text === "handled" ? { action: "handled" } : { action: "continue" },
  );
  pi.on("session_start", async () => {
    const log = process.env.DWELL_TEST_START_LOG;
    if (log) await appendFile(log, `${process.pid}\n`, { mode: 0o600 });
    const nativePrompt = process.env.DWELL_TEST_NATIVE_ON_START;
    if (nativePrompt) pi.sendUserMessage(nativePrompt);
  });
  pi.registerProvider(PROVIDER, {
    name: "Dwell Offline Fixture",
    api: API,
    baseUrl: "http://127.0.0.1",
    apiKey: "fixture-only-no-secret",
    models: [
      {
        id: MODEL,
        name: "Dwell Offline Fixture",
        api: API,
        baseUrl: "http://127.0.0.1",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        reasoning: false,
        contextWindow: 4096,
        maxTokens: 256,
      },
      {
        id: ALT_MODEL,
        name: "Dwell Offline Fixture Alternate",
        api: API,
        baseUrl: "http://127.0.0.1",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        reasoning: false,
        contextWindow: 4096,
        maxTokens: 256,
      },
      {
        id: "dwell-test-image",
        name: "Dwell Image Fixture",
        api: API,
        baseUrl: "http://127.0.0.1",
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        reasoning: false,
        contextWindow: 8192,
        maxTokens: 1024,
      },
      {
        id: "dwell-test-reasoning",
        name: "Dwell Thinking Fixture",
        api: API,
        baseUrl: "http://127.0.0.1",
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        reasoning: true,
        thinkingLevelMap: {
          off: null,
          minimal: null,
          low: "low",
          medium: "medium",
          high: "high",
          xhigh: "xhigh",
        },
        contextWindow: 8192,
        maxTokens: 1024,
      },
    ],
    streamSimple: scriptedStream,
  });

  pi.registerTool({
    name: TOOL_NAME,
    label: "Echo",
    description: "Return the provided text unchanged for the local Dwell runtime fixture.",
    parameters: Type.Object({ text: Type.String() }),
    async execute(_toolCallId, params, signal, onUpdate) {
      const burst = params.text === "dwell-test-burst";
      const updateCount = burst ? 128 : 1;
      for (let index = 0; index < updateCount; index += 1) {
        if (signal?.aborted) throw new Error("Echo tool aborted.");
        const text = burst
          ? `burst-${String(index + 1).padStart(3, "0")}: ${"x".repeat(24 * 1024)}`
          : `Echoing ${params.text}`;
        onUpdate?.({
          content: [{ type: "text", text }],
          details: { echoed: params.text },
        });
        if (burst && index + 1 < updateCount)
          await new Promise<void>((resolve) => setImmediate(resolve));
      }
      return {
        content: [{ type: "text", text: params.text }],
        details: { echoed: params.text },
      };
    },
  });

  pi.registerCommand("dwell-confirm", {
    description: "Ask a short test confirmation through the Pi extension UI.",
    handler: async (_args, context) => {
      const confirmed = await context.ui.confirm(
        "Dwell confirmation",
        "Confirm this fixture action?",
        {
          timeout: 500,
        },
      );
      context.ui.notify(
        confirmed ? "dwell-confirm: confirmed" : "dwell-confirm: cancelled",
        confirmed ? "info" : "warning",
      );
    },
  });

  pi.registerCommand("dwell-notify", {
    description: "Send a test notification through the Pi extension UI.",
    handler: async (_args, context) => {
      context.ui.notify("dwell-notify: notification", "info");
    },
  });

  pi.registerCommand("dwell-custom", {
    description: "Report whether custom terminal UI is available through the Pi extension UI.",
    handler: async (_args, context) => {
      const result = await context.ui.custom<string | undefined>(
        (_tui, _theme, _keybindings, done) => {
          done("available");
          return { render: () => [], invalidate: () => {} };
        },
      );
      context.ui.notify(
        result === undefined ? "dwell-custom: unavailable" : "dwell-custom: available",
        "info",
      );
    },
  });
}
