import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  open,
  opendir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { PiProcess, SUPPORTED_PI_VERSION, verifyPiConfiguration } from "../runtime/pi-process.ts";
import type { HostDirectoryListing, PiModelOption } from "../shared/discovery.ts";
import {
  isModelCapabilitiesRequest,
  type ModelCapabilitiesRequest,
  type ModelCapabilitiesResponse,
} from "../shared/thinking.ts";
import type { RuntimeConfiguration as PiConfiguration } from "../shared/sessions.ts";

const MAX_DIRECTORY_ENTRIES = 500;
const MAX_DIRECTORY_SCAN = 10_000;
const MAX_PATH_LENGTH = 4096;
const MAX_MODEL_COUNT = 10_000;
const MAX_MODEL_OUTPUT_BYTES = 1024 * 1024;
const MODEL_DISCOVERY_TIMEOUT_MS = 15_000;
const MAX_CONFIG_FILE_BYTES = 8 * 1024 * 1024;
const MAX_CONFIG_BYTES = 16 * 1024 * 1024;
const PI_CONFIG_FILES = [
  "auth.json",
  "oauth.json",
  "settings.json",
  "models.json",
  "models-store.json",
];
const MODEL_LIST_COLUMNS = ["provider", "model", "context", "max-out", "thinking", "images"];

export class SessionDiscoveryError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function errnoCode(error: unknown): string | undefined {
  if (error instanceof Error && "code" in error && typeof error.code === "string")
    return error.code;
  return undefined;
}

function hostHomeDirectory(env: NodeJS.ProcessEnv): string {
  const home =
    env.HOME ?? (process.platform === "win32" ? env.USERPROFILE : undefined) ?? homedir();
  if (!home || !isAbsolute(home) || home.length > MAX_PATH_LENGTH)
    throw new SessionDiscoveryError(
      503,
      "home_directory_unavailable",
      "Dwell could not determine the host home directory.",
    );
  return resolve(home);
}

function canonicalPathForPiAgentDirectory(env: NodeJS.ProcessEnv, home: string): string {
  const configured = env.PI_CODING_AGENT_DIR;
  if (!configured) return join(home, ".pi", "agent");
  const expanded =
    configured === "~"
      ? home
      : configured.startsWith("~/")
        ? join(home, configured.slice(2))
        : configured;
  if (!isAbsolute(expanded) || expanded.length > MAX_PATH_LENGTH)
    throw new SessionDiscoveryError(
      503,
      "model_discovery_failed",
      "Set PI_CODING_AGENT_DIR to an absolute path to discover Pi models.",
    );
  return resolve(expanded);
}

function directoryError(error: unknown): SessionDiscoveryError {
  if (error instanceof SessionDiscoveryError) return error;
  const code = errnoCode(error);
  if (code === "ENOENT" || code === "ENOTDIR")
    return new SessionDiscoveryError(
      400,
      "invalid_directory",
      "Choose an existing host directory.",
    );
  if (code === "EACCES" || code === "EPERM")
    return new SessionDiscoveryError(
      403,
      "directory_unavailable",
      "Dwell cannot read the selected host directory.",
    );
  return new SessionDiscoveryError(
    500,
    "directory_unavailable",
    "Dwell could not browse the selected host directory.",
  );
}

export async function listHostDirectories(
  requestedPath: string | undefined,
  homeDirectory: string,
): Promise<HostDirectoryListing> {
  const path = requestedPath ?? homeDirectory;
  if (!isAbsolute(path) || path.length === 0 || path.length > MAX_PATH_LENGTH)
    throw new SessionDiscoveryError(
      400,
      "invalid_directory",
      "Choose an absolute host directory path.",
    );

  let canonical: string;
  try {
    canonical = await realpath(path);
    if (!(await stat(canonical)).isDirectory())
      throw new SessionDiscoveryError(
        400,
        "invalid_directory",
        "Choose an existing host directory.",
      );
  } catch (error) {
    throw directoryError(error);
  }

  const directories: HostDirectoryListing["directories"] = [];
  let truncated = false;
  try {
    const directory = await opendir(canonical);
    let scanned = 0;
    for await (const entry of directory) {
      scanned++;
      if (scanned > MAX_DIRECTORY_SCAN) {
        truncated = true;
        break;
      }
      if (entry.name.startsWith(".") || entry.name.length > 255) continue;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

      let childPath: string;
      try {
        const candidate = join(canonical, entry.name);
        if (!(await stat(candidate)).isDirectory()) continue;
        childPath = await realpath(candidate);
      } catch {
        continue;
      }
      directories.push({ name: entry.name, path: childPath });
      if (directories.length >= MAX_DIRECTORY_ENTRIES) {
        truncated = true;
        break;
      }
    }
  } catch (error) {
    throw directoryError(error);
  }

  directories.sort((left, right) => left.name.localeCompare(right.name));
  const parentPath = dirname(canonical);
  return {
    path: canonical,
    parent: parentPath === canonical ? null : parentPath,
    directories,
    truncated,
  };
}

interface DiscoveryWorkspace {
  root: string;
  agentDirectory: string;
  cwd: string;
  packageDirectory: string;
  sessionDirectory: string;
}

async function createDiscoveryWorkspace(): Promise<DiscoveryWorkspace> {
  const root = await mkdtemp(join(tmpdir(), "pi-dwell-model-discovery-"));
  const workspace: DiscoveryWorkspace = {
    root,
    agentDirectory: join(root, "agent"),
    cwd: join(root, "cwd"),
    packageDirectory: join(root, "package"),
    sessionDirectory: join(root, "sessions"),
  };
  try {
    await chmod(root, 0o700);
    await Promise.all(
      [
        workspace.agentDirectory,
        workspace.cwd,
        workspace.packageDirectory,
        workspace.sessionDirectory,
      ].map((path) => mkdir(path, { mode: 0o700 })),
    );
    await writeFile(
      join(workspace.packageDirectory, "package.json"),
      JSON.stringify({
        name: "@earendil-works/pi-coding-agent",
        version: SUPPORTED_PI_VERSION,
        piConfig: { configDir: ".pi" },
      }),
      { flag: "wx", mode: 0o600 },
    );
  } catch {
    await rm(root, { recursive: true, force: true });
    throw new SessionDiscoveryError(
      503,
      "model_discovery_failed",
      "Dwell could not prepare private temporary state for model discovery.",
    );
  }
  return workspace;
}

function isolatedEnvironment(
  env: NodeJS.ProcessEnv,
  workspace: DiscoveryWorkspace,
): NodeJS.ProcessEnv {
  const isolated: Record<string, string | undefined> = {
    ...env,
    PI_CODING_AGENT_DIR: workspace.agentDirectory,
    PI_CODING_AGENT_SESSION_DIR: workspace.sessionDirectory,
    PI_OFFLINE: "1",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    TERM: "dumb",
  };
  delete isolated.PI_MANAGED_INSTALL_ROOT;
  return isolated;
}

function discoveryEnvironment(
  env: NodeJS.ProcessEnv,
  workspace: DiscoveryWorkspace,
): NodeJS.ProcessEnv {
  return { ...isolatedEnvironment(env, workspace), PI_PACKAGE_DIR: workspace.packageDirectory };
}

async function copyPiConfiguration(
  sourceDirectory: string,
  targetDirectory: string,
): Promise<void> {
  let totalBytes = 0;
  for (const name of PI_CONFIG_FILES) {
    let source: Awaited<ReturnType<typeof open>> | undefined;
    try {
      const resolved = await realpath(join(sourceDirectory, name));
      source = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      if (errnoCode(error) === "ENOENT") continue;
      throw new SessionDiscoveryError(
        503,
        "model_discovery_failed",
        "Dwell could not read the local Pi model configuration.",
      );
    }
    try {
      const fileInfo = await source.stat();
      if (!fileInfo.isFile() || fileInfo.size > MAX_CONFIG_FILE_BYTES) {
        throw new SessionDiscoveryError(
          413,
          "model_config_too_large",
          "A local Pi model configuration file exceeds the discovery limit.",
        );
      }
      const contents = await source.readFile();
      totalBytes += contents.byteLength;
      if (contents.byteLength > MAX_CONFIG_FILE_BYTES || totalBytes > MAX_CONFIG_BYTES) {
        throw new SessionDiscoveryError(
          413,
          "model_config_too_large",
          "Local Pi model configuration exceeds the discovery limit.",
        );
      }
      await writeFile(join(targetDirectory, name), contents, { flag: "wx", mode: 0o600 });
    } finally {
      await source.close();
    }
  }
}

function runModelList(
  configuration: PiConfiguration,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const args = [
    ...(configuration.entryPoint ? [configuration.entryPoint] : []),
    "--offline",
    "--no-session",
    "--no-extensions",
    "--no-mcp",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
    "--list-models",
  ];
  return new Promise((resolve, reject) => {
    execFile(
      configuration.executable,
      args,
      {
        cwd,
        env,
        encoding: "utf8",
        timeout: MODEL_DISCOVERY_TIMEOUT_MS,
        killSignal: "SIGKILL",
        maxBuffer: MAX_MODEL_OUTPUT_BYTES,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });
}

function modelColumnPositions(line: string): number[] | undefined {
  const positions: number[] = [];
  let cursor = 0;
  for (const column of MODEL_LIST_COLUMNS) {
    const position = line.indexOf(column, cursor);
    if (position < 0) return undefined;
    positions.push(position);
    cursor = position + column.length;
  }
  return positions;
}

function modelColumns(line: string, positions: readonly number[]): string[] | undefined {
  const columns: string[] = [];
  for (let index = 0; index < positions.length; index++) {
    const start = positions[index];
    const next = positions[index + 1];
    if (start === undefined) return undefined;
    const end = next === undefined ? line.length : next - 2;
    if (end < start) return undefined;
    columns.push(line.slice(start, end).trimEnd());
  }
  return columns;
}

function parseModelList(output: string): PiModelOption[] {
  const plain = stripVTControlCharacters(output);
  const lines = plain.replace(/\r\n?/gu, "\n").split("\n");
  if (lines.some((line) => line.trimStart().startsWith("No models available."))) return [];

  const header = lines.findIndex((line) => {
    const positions = modelColumnPositions(line);
    const columns = positions ? modelColumns(line, positions) : undefined;
    return (
      columns?.length === MODEL_LIST_COLUMNS.length &&
      columns.every((column, index) => column.trim() === MODEL_LIST_COLUMNS[index])
    );
  });
  if (header < 0)
    throw new SessionDiscoveryError(
      503,
      "model_discovery_failed",
      "Pi returned an unsupported model list. Check the configured Pi version.",
    );

  const headerLine = lines[header];
  const positions = headerLine ? modelColumnPositions(headerLine) : undefined;
  if (!positions)
    throw new SessionDiscoveryError(
      503,
      "model_discovery_failed",
      "Pi returned an unsupported model list. Check the configured Pi version.",
    );

  const models: PiModelOption[] = [];
  const seen = new Set<string>();
  for (const line of lines.slice(header + 1)) {
    if (line.trim().length === 0) continue;
    const columns = modelColumns(line, positions);
    if (!columns)
      throw new SessionDiscoveryError(
        503,
        "model_discovery_failed",
        "Pi returned an invalid model list. Check the configured Pi version.",
      );
    const provider = columns[0];
    const id = columns[1];
    if (
      columns.length !== MODEL_LIST_COLUMNS.length ||
      !provider ||
      provider.length > 200 ||
      !id ||
      id.length > 300 ||
      !columns[2] ||
      !columns[3] ||
      !["yes", "no"].includes(columns[4] ?? "") ||
      !["yes", "no"].includes(columns[5] ?? "")
    ) {
      throw new SessionDiscoveryError(
        503,
        "model_discovery_failed",
        "Pi returned an invalid model list. Check the configured Pi version.",
      );
    }
    const key = `${provider}\u0000${id}`;
    if (seen.has(key))
      throw new SessionDiscoveryError(
        503,
        "model_discovery_failed",
        "Pi returned duplicate models. Check the local model configuration.",
      );
    seen.add(key);
    models.push({ provider, id, supportsImages: columns[5] === "yes" });
    if (models.length > MAX_MODEL_COUNT)
      throw new SessionDiscoveryError(
        413,
        "model_catalog_too_large",
        "The available Pi model list exceeds the discovery limit.",
      );
  }
  return models;
}

export async function discoverPiModels(
  configuration: PiConfiguration,
  env: NodeJS.ProcessEnv,
): Promise<PiModelOption[]> {
  const workspace = await createDiscoveryWorkspace();
  let models: PiModelOption[] | undefined;
  let failure: SessionDiscoveryError | undefined;
  try {
    const home = hostHomeDirectory(env);
    const sourceAgentDirectory = canonicalPathForPiAgentDirectory(env, home);
    const verificationEnv = isolatedEnvironment(env, workspace);
    const verified = await verifyPiConfiguration(
      configuration,
      workspace.cwd,
      verificationEnv,
      MODEL_DISCOVERY_TIMEOUT_MS,
    );
    const modelCli =
      verified.entryPoint && basename(verified.entryPoint) === "rpc-entry.js"
        ? { ...verified, entryPoint: join(dirname(verified.entryPoint), "cli.js") }
        : verified;
    const verifiedModelCli =
      modelCli.entryPoint === verified.entryPoint
        ? verified
        : await verifyPiConfiguration(
            modelCli,
            workspace.cwd,
            verificationEnv,
            MODEL_DISCOVERY_TIMEOUT_MS,
          );
    await copyPiConfiguration(sourceAgentDirectory, workspace.agentDirectory);
    const modelEnvironment = discoveryEnvironment(env, workspace);
    models = parseModelList(await runModelList(verifiedModelCli, workspace.cwd, modelEnvironment));
  } catch (error) {
    if (error instanceof SessionDiscoveryError) {
      failure = error;
    } else if (error instanceof Error && error.message.startsWith("Unsupported Pi version ")) {
      failure = new SessionDiscoveryError(
        503,
        "unsupported_pi_version",
        `The configured Pi version is unsupported. Model discovery requires Pi ${SUPPORTED_PI_VERSION}.`,
      );
    } else {
      failure = new SessionDiscoveryError(
        503,
        "model_discovery_failed",
        "Pi could not list available models. Check its executable and local model configuration.",
      );
    }
  }
  try {
    await rm(workspace.root, { recursive: true, force: true });
  } catch {
    throw new SessionDiscoveryError(
      503,
      "discovery_cleanup_failed",
      "Dwell could not remove private temporary model discovery state.",
    );
  }
  if (failure) throw failure;
  if (!models)
    throw new SessionDiscoveryError(
      503,
      "model_discovery_failed",
      "Pi model discovery returned no result.",
    );
  return models;
}

export async function discoverPiModelCapabilities(
  configuration: PiConfiguration,
  env: NodeJS.ProcessEnv,
  request: ModelCapabilitiesRequest,
): Promise<ModelCapabilitiesResponse> {
  if (!isModelCapabilitiesRequest(request))
    throw new SessionDiscoveryError(400, "invalid_model", "Provide a valid Pi provider and model.");

  const workspace = await createDiscoveryWorkspace();
  let runtime: PiProcess | undefined;
  let capabilities: ModelCapabilitiesResponse | undefined;
  let failure: SessionDiscoveryError | undefined;
  let stopFailed = false;
  try {
    const home = hostHomeDirectory(env);
    const sourceAgentDirectory = canonicalPathForPiAgentDirectory(env, home);
    const verificationEnv = isolatedEnvironment(env, workspace);
    const verified = await verifyPiConfiguration(
      configuration,
      workspace.cwd,
      verificationEnv,
      MODEL_DISCOVERY_TIMEOUT_MS,
    );
    await copyPiConfiguration(sourceAgentDirectory, workspace.agentDirectory);
    runtime = await PiProcess.start({
      ...verified,
      cwd: workspace.cwd,
      env: discoveryEnvironment(env, workspace),
      sessionDirectory: workspace.sessionDirectory,
      resourcePolicy: "isolated",
      provider: request.provider,
      model: request.model,
    });
    const state = await runtime.getState();
    if (
      !state.model ||
      state.model.provider !== request.provider ||
      state.model.id !== request.model
    )
      throw new Error("Pi did not select the requested model for capability discovery.");
    const [thinkingLevels, supportsImages] = await Promise.all([
      runtime.getAvailableThinkingLevels(),
      runtime.supportsImages(),
    ]);
    capabilities = {
      provider: request.provider,
      model: request.model,
      thinkingLevels,
      supportsImages,
    };
  } catch (error) {
    if (error instanceof SessionDiscoveryError) {
      failure = error;
    } else if (error instanceof Error && error.message.startsWith("Unsupported Pi version ")) {
      failure = new SessionDiscoveryError(
        503,
        "unsupported_pi_version",
        `The configured Pi version is unsupported. Model capabilities require Pi ${SUPPORTED_PI_VERSION}.`,
      );
    } else {
      failure = new SessionDiscoveryError(
        503,
        "model_capabilities_failed",
        "Pi could not read capabilities for the selected model. Check its executable and local model configuration.",
      );
    }
  }
  if (runtime) {
    try {
      await runtime.stop();
    } catch {
      stopFailed = true;
    }
  }
  try {
    await rm(workspace.root, { recursive: true, force: true });
  } catch {
    throw new SessionDiscoveryError(
      503,
      "discovery_cleanup_failed",
      "Dwell could not remove private temporary model capability state.",
    );
  }
  if (stopFailed)
    throw new SessionDiscoveryError(
      503,
      "discovery_cleanup_failed",
      "Dwell could not stop the temporary Pi model capability process.",
    );
  if (failure) throw failure;
  if (!capabilities)
    throw new SessionDiscoveryError(
      503,
      "model_capabilities_failed",
      "Pi model capability discovery returned no result.",
    );
  return capabilities;
}
