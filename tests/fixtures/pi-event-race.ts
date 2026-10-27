const output = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);

if (process.argv.includes("--version")) {
  console.log("1.4.0");
  process.exit(0);
}

const state = {
  sessionId: "synthetic-race-session",
  isStreaming: false,
  isCompacting: false,
  messageCount: 0,
  pendingMessageCount: 0,
  thinkingLevel: "off",
  model: { provider: "dwell-test", id: "dwell-test" },
};

let buffered = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  buffered += chunk;
  for (;;) {
    const end = buffered.indexOf("\n");
    if (end < 0) return;
    const command: unknown = JSON.parse(buffered.slice(0, end));
    buffered = buffered.slice(end + 1);
    if (
      typeof command !== "object" ||
      command === null ||
      !("type" in command) ||
      typeof command.type !== "string" ||
      !("id" in command) ||
      typeof command.id !== "string"
    )
      continue;

    const response = {
      type: "response",
      id: command.id,
      command: command.type,
      success: true,
    };
    if (command.type === "get_state") {
      output({ ...response, data: state });
    } else if (command.type === "prompt") {
      output({ type: "agent_start" });
      output({
        type: "message_end",
        message: { role: "assistant", stopReason: "stop", content: [] },
      });
      output({ type: "agent_settled", aborted: false });
      output({ type: "agent_start" });
      output({ ...response, data: { disposition: "started" } });
    } else if (command.type === "abort") {
      output(response);
      output({
        type: "message_end",
        message: { role: "assistant", stopReason: "aborted", content: [] },
      });
      output({ type: "agent_settled", aborted: true });
    } else {
      output({ ...response, data: {} });
    }
  }
});

process.stdin.on("end", () => process.exit(0));
