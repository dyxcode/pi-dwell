import { appendFile } from "node:fs/promises";
import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  createAssistantMessageEventStream,
  type Message,
  type Model,
  type SimpleStreamOptions,
  type TextContent,
  type ToolCall,
  type TranscriptContext,
  Type,
  uuidv7,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROVIDER = "dwell-test";
const MODEL = "dwell-test";
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
  stream.push({ type: "start", partial: message });
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

function emitToolCall(stream: AssistantMessageEventStream, message: AssistantMessage): void {
  const toolCall: ToolCall = {
    type: "toolCall",
    id: uuidv7(),
    name: TOOL_NAME,
    arguments: { text: "dwell-test-echo" },
  };
  const contentIndex = message.content.length;
  stream.push({ type: "start", partial: message });
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
    if (prompt === "tool") {
      const echoResult = latestEchoResult(context);
      if (echoResult === undefined) {
        emitToolCall(stream, message);
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
      stream.push({ type: "start", partial: message });
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
      stream.push({ type: "start", partial: message });
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
  pi.on("session_start", async () => {
    const log = process.env.DWELL_TEST_START_LOG;
    if (log) await appendFile(log, `${process.pid}\n`, { mode: 0o600 });
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
    ],
    streamSimple: scriptedStream,
  });

  pi.registerTool({
    name: TOOL_NAME,
    label: "Echo",
    description: "Return the provided text unchanged for the local Dwell runtime fixture.",
    parameters: Type.Object({ text: Type.String() }),
    async execute(_toolCallId, params) {
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
