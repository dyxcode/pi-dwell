import { runCli } from "../../src/clients/cli/main.ts";

const [dataDir, rawPort, ...args] = process.argv.slice(2);
if (!dataDir || !rawPort) throw new Error("Test fixture requires a data directory and port.");
try {
  await runCli(args, { dataDir, port: Number(rawPort) });
} catch (error) {
  console.error(`pi-dwell: ${error instanceof Error ? error.message : "Unexpected failure."}`);
  process.exitCode = 1;
}
