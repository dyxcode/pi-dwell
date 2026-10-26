import { StringDecoder } from "node:string_decoder";

const mode = process.env.DWELL_PI_FAULT ?? "normal";
if (process.argv.includes("--version")) {
  if (mode === "slow-version") await new Promise((resolve) => setTimeout(resolve, 5200));
  console.log(mode === "version" ? "9.0.0" : "1.4.0");
  process.exit(0);
}
const state = {
  sessionId: "synthetic-session",
  isStreaming: false,
  isCompacting: false,
  messageCount: 0,
  pendingMessageCount: 0,
};
const output = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);
const decoder = new StringDecoder("utf8");
let buffered = "";
let promptRejectionsRemaining = mode === "reject-prompt" ? 1 : 0;
const keepAlive = mode === "stubborn" ? setInterval(() => {}, 1000) : undefined;
if (mode === "stubborn") process.on("SIGTERM", () => {});
process.stdin.on("end", () => {
  if (!keepAlive) process.exit(0);
});
process.stdin.on("data", (chunk: Buffer) => {
  buffered += decoder.write(chunk);
  for (;;) {
    const end = buffered.indexOf("\n");
    if (end < 0) return;
    const value: unknown = JSON.parse(buffered.slice(0, end));
    buffered = buffered.slice(end + 1);
    if (!value || typeof value !== "object" || !("type" in value) || !("id" in value)) continue;
    const response = { id: value.id, type: "response", command: value.type, success: true };
    if (value.type === "get_state") {
      if (mode === "malformed") {
        process.stdout.write("not-json\n");
        continue;
      }
      if (mode === "oversized") {
        process.stdout.write("x".repeat(9 * 1024 * 1024));
        continue;
      }
      if (mode === "truncated") {
        process.stdout.write('{"type":');
        process.exit(0);
      }
      if (mode === "invalid-state") {
        output({ ...response, data: {} });
        continue;
      }
      if (mode === "stderr") process.stderr.write("private-diagnostic".repeat(100_000));
      setTimeout(() => output({ ...response, data: state }), mode === "delayed" ? 200 : 0);
    } else if (value.type === "get_messages") {
      const record = Buffer.from(
        `${JSON.stringify({ ...response, data: { messages: [{ role: "user", content: "你好\u2028world" }] } })}\r\n`,
      );
      // Split within UTF-8 bytes, then use multiple complete records in later tests.
      const split = record.indexOf(Buffer.from("你")) + 1;
      process.stdout.write(record.subarray(0, split));
      setTimeout(() => process.stdout.write(record.subarray(split)), 5);
    } else if (value.type === "get_entries") {
      output({
        ...response,
        data: {
          entries: mode === "invalid-entries" ? [{ id: "missing-parent", type: "message" }] : [],
          leafId: null,
        },
      });
    } else if (value.type === "prompt") {
      if (mode === "crash") {
        process.exit(23);
      }
      if (mode === "timeout") continue;
      if (promptRejectionsRemaining > 0) {
        promptRejectionsRemaining -= 1;
        output({ ...response, success: false, error: "synthetic prompt rejection" });
        continue;
      }
      if (mode === "settle-before-acceptance") {
        output({
          type: "message_end",
          message: { role: "assistant", stopReason: "stop", content: [] },
        });
        output({ type: "agent_settled", aborted: false });
        output({ ...response, data: { disposition: "started" } });
        continue;
      }
      output({ ...response, data: { disposition: "started" } });
      if (mode === "recovered") {
        output({
          type: "message_end",
          message: {
            role: "assistant",
            stopReason: "error",
            errorMessage: "temporary provider failure",
          },
        });
        output({ type: "agent_end", messages: [], willRetry: true });
      }
      output({
        type: "message_end",
        message: { role: "assistant", stopReason: "stop", content: [] },
      });
      output({ type: "agent_settled", aborted: false });
    }
  }
});
