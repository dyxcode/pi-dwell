import { runCli } from "./clients/cli/main.ts";

try {
  await runCli(process.argv.slice(2));
} catch (error: unknown) {
  console.error(`pi-dwell: ${error instanceof Error ? error.message : "Unexpected failure."}`);
  process.exitCode = 1;
}
