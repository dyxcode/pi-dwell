import { dataDirectory } from "../../local/paths.ts";
import type { HostOptions } from "../../server/http.ts";
import { runServiceCommand } from "../../service/service.ts";
import { parseCommand } from "./arguments.ts";
import { configureRuntime } from "./runtime.ts";
import { readHostStatus } from "./status.ts";

/** Overrides are an internal subprocess-test seam, never CLI options or environment settings. */
export async function runCli(
  args: string[],
  overrides: Pick<HostOptions, "dataDir" | "port"> = {},
): Promise<void> {
  const command = parseCommand(args);
  if (command.kind === "help") {
    console.log(`pi-dwell — a persistent home for Pi

Usage: npm run dwell -- <command>

  serve [--dev]       Start the foreground host at 127.0.0.1:8787
  status [--dev]      Read authenticated host status
  pi configure --executable <absolute> [--entry-point <absolute>] [--dev]
                      Configure the Pi executable for this host
  service install    Register the production user service (no login autostart)
  service start      Start the background service and wait for readiness
  service stop       Stop the registered service
  service restart    Restart the registered service and wait for readiness
  service status     Check the service manager and authenticated host
  service uninstall  Stop and remove the service registration; preserve data
  --help             Show this help

npm run dev watches the development host. Stop production before development.
No project folder or model configuration is required to start.`);
    return;
  }
  if (command.kind === "service") {
    console.log(await runServiceCommand(command.action));
    return;
  }
  const options = { dataDir: dataDirectory(command.mode), ...overrides };
  if (command.kind === "status") {
    console.log(JSON.stringify(await readHostStatus(options), null, 2));
    return;
  }
  if (command.kind === "configure") {
    const configuration = await configureRuntime(options, {
      executable: command.executable,
      ...(command.entryPoint === undefined ? {} : { entryPoint: command.entryPoint }),
    });
    console.log(JSON.stringify(configuration, null, 2));
    return;
  }
  let stopRequested = false;
  const { startHost } = await import("../../server/http.ts");
  let host: Awaited<ReturnType<typeof startHost>> | undefined;
  const shutdown = () => {
    stopRequested = true;
    if (!host) return;
    void host
      .close()
      .catch(() => {
        console.error("pi-dwell: Shutdown failed.");
        process.exitCode = 1;
      })
      .finally(() => {
        process.off("SIGINT", shutdown);
        process.off("SIGTERM", shutdown);
      });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  try {
    host = await startHost({ ...options, mode: command.mode });
    if (stopRequested) {
      shutdown();
      return;
    }
    console.log(`pi-dwell listening on ${host.url} (${command.mode})`);
  } catch (error) {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    if (error instanceof Error && "code" in error && error.code === "EADDRINUSE")
      throw new Error(
        "Port 8787 is occupied. Dwell may already be running; check service status or stop the foreground host before switching modes.",
      );
    throw error;
  }
}
