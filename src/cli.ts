import { parseCommand } from "./clients/cli/arguments.ts";
import { readHostStatus } from "./clients/cli/status.ts";
import { startHost } from "./server/http.ts";

async function main(): Promise<void> {
  const command = parseCommand(process.argv.slice(2));
  if (command.kind === "help") {
    console.log(`pi-dwell — a persistent home for Pi

Usage: npm run dwell -- [serve|status] [--port <1-65535>]

  serve    Start the loopback status host (default port: 8787)
  status   Read and validate status from a running host
  --help   Show this help

This scaffold does not yet host Pi sessions or background tasks.`);
    return;
  }
  if (command.kind === "status") {
    console.log(JSON.stringify(await readHostStatus(command.port), null, 2));
    return;
  }

  const host = await startHost({ port: command.port });
  const shutdown = () => {
    void host
      .close()
      .catch((error: unknown) => {
        console.error(`pi-dwell: ${error instanceof Error ? error.message : "Shutdown failed."}`);
        process.exitCode = 1;
      })
      .finally(() => {
        process.off("SIGINT", shutdown);
        process.off("SIGTERM", shutdown);
      });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  console.log(`pi-dwell listening on ${host.url}`);
}

try {
  await main();
} catch (error: unknown) {
  console.error(`pi-dwell: ${error instanceof Error ? error.message : "Unexpected failure."}`);
  process.exitCode = 1;
}
