import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface PiEnvironment {
  root: string;
  cwd: string;
  agentDir: string;
  sessionDir: string;
  env: Record<string, string>;
  extensionPath: string;
  cleanup(): Promise<void>;
}

export async function createPiEnvironment(): Promise<PiEnvironment> {
  const root = await mkdtemp(join(tmpdir(), "pi-dwell-rpc-"));
  const home = join(root, "home");
  const cwd = join(root, "cwd");
  const agentDir = join(root, "agent");
  const sessionDir = join(root, "sessions");
  const scratch = join(root, "tmp");

  try {
    await Promise.all(
      [home, cwd, agentDir, sessionDir, scratch].map((path) =>
        mkdir(path, { recursive: true, mode: 0o700 }),
      ),
    );
    await writeFile(
      join(agentDir, "settings.json"),
      `${JSON.stringify(
        {
          defaultProvider: "dwell-test",
          defaultModel: "dwell-test",
          defaultTools: [],
          enableInstallTelemetry: false,
          retry: { enabled: false, provider: { maxRetries: 0 } },
          compaction: { enabled: false },
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );

    let cleaned = false;
    const cleanup = async (): Promise<void> => {
      if (cleaned) return;
      cleaned = true;
      await rm(root, { recursive: true, force: true });
    };

    return {
      root,
      cwd,
      agentDir,
      sessionDir,
      env: {
        HOME: home,
        PATH: "/usr/bin:/bin",
        TMPDIR: scratch,
        PI_CODING_AGENT_DIR: agentDir,
        PI_CODING_AGENT_SESSION_DIR: sessionDir,
        PI_OFFLINE: "1",
        NO_COLOR: "1",
      },
      extensionPath: fileURLToPath(new URL("./pi-extension.ts", import.meta.url)),
      cleanup,
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
