import { writeFile } from "node:fs/promises";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MODEL: Model<Api> = {
  id: "dwell-test-reasoning",
  name: "Dwell Thinking Fixture",
  api: "dwell-test",
  provider: "dwell-test",
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
};

export default function registerPiNativeStateFixture(pi: ExtensionAPI): void {
  let changed = false;
  let settledCount = 0;
  pi.on("agent_settled", async () => {
    settledCount += 1;
    if (changed || process.env.DWELL_TEST_NATIVE_STATE_CHANGE !== "1" || settledCount < 2) return;
    changed = true;
    const reportPath = process.env.DWELL_TEST_NATIVE_STATE_REPORT;
    try {
      if (!(await pi.setModel(MODEL)))
        throw new Error("The scripted native state change could not select its model.");
      pi.setThinkingLevel("high");
      if (reportPath) await writeFile(reportPath, "changed\n", { mode: 0o600 });
    } catch (error) {
      if (reportPath)
        await writeFile(
          reportPath,
          `failed: ${error instanceof Error ? error.message : String(error)}\n`,
          { mode: 0o600 },
        );
      throw error;
    }
  });
}
