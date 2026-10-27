import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function registerHandledInputFixture(pi: ExtensionAPI): void {
  pi.on("input", async (event) => {
    if (event.source !== "rpc") return { action: "continue" };
    if (event.text === "handled-noop") return { action: "handled" };
    if (event.text === "handled-custom") {
      pi.sendMessage({
        customType: "dwell-test-handled",
        content: [{ type: "text", text: "The extension handled this input." }],
        display: true,
      });
      return { action: "handled" };
    }
    if (event.text === "handled-followup-before") {
      const started = new Promise<void>((resolve) => {
        const unsubscribe = pi.on("agent_start", () => {
          unsubscribe();
          resolve();
        });
        pi.sendUserMessage("slow");
      });
      await started;
      return { action: "handled" };
    }
    if (event.text === "handled-followup-after") {
      setTimeout(() => pi.sendUserMessage("slow"), 250);
      return { action: "handled" };
    }
    if (event.text === "handled-followup-error") {
      setTimeout(() => pi.sendUserMessage("fail"), 250);
      return { action: "handled" };
    }
    return { action: "continue" };
  });
}
