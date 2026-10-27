import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  open,
  lstat,
  mkdir,
  realpath,
  unlink,
  rename,
  rm,
  type FileHandle,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { validateDataDirectory } from "../local/paths.ts";
import { DEFAULT_PORT } from "../shared/protocol.ts";
import { readHostStatus } from "../clients/cli/status.ts";

const SERVICE_LABEL = "io.pi-dwell.host";
const SYSTEMD_UNIT = "pi-dwell.service";
const DATA_DIRECTORY_SEGMENTS = [".local", "share", "pi-dwell"];
const STARTUP_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 150;
const COMMAND_TIMEOUT_MS = 5_000;
const MAX_COMMAND_OUTPUT_BYTES = 128 * 1024;
const MAX_REGISTRATION_BYTES = 64 * 1024;

export const SERVICE_ACTIONS = [
  "install",
  "uninstall",
  "start",
  "stop",
  "restart",
  "status",
] as const;
export type ServiceAction = (typeof SERVICE_ACTIONS)[number];

export interface ServiceCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ServiceReadiness {
  processId: number;
  instanceId: string;
  mode: "production" | "development";
}

export type ServiceCommandRunner = (
  command: string,
  args: string[],
) => Promise<ServiceCommandResult>;

export interface ServiceCommandOptions {
  platform?: NodeJS.Platform;
  homeDirectory?: string;
  executablePath?: string;
  entryPath?: string;
  userId?: number;
  runner?: ServiceCommandRunner;
  readiness?: (expectedProcessId: number, timeoutMs: number) => Promise<ServiceReadiness>;
  startupTimeoutMs?: number;
  pollIntervalMs?: number;
}

interface ServicePaths {
  platform: "darwin" | "linux";
  homeDirectory: string;
  userId: number;
  executablePath: string;
  entryPath: string;
  dataDirectory: string;
  registrationPath: string;
  logDirectory: string;
  managerTarget: string;
  runner: ServiceCommandRunner;
  readiness: (expectedProcessId: number, timeoutMs: number) => Promise<ServiceReadiness>;
  startupTimeoutMs: number;
  pollIntervalMs: number;
}

interface ManagerState {
  processId: number;
  state: string;
}

interface DirectoryCheck {
  create: boolean;
  private: boolean;
}

function defaultRunner(command: string, args: string[]): Promise<ServiceCommandResult> {
  return new Promise((resolveResult) => {
    execFile(
      command,
      args,
      {
        encoding: "utf8",
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolveResult({ code: 0, stdout, stderr });
          return;
        }
        const code = typeof error.code === "number" ? error.code : 1;
        resolveResult({ code, stdout, stderr: stderr || error.message });
      },
    );
  });
}

function validatePath(value: string, label: string): string {
  const containsControlCharacter = [...value].some((character) => {
    const code = character.codePointAt(0);
    return code !== undefined && (code < 0x20 || code === 0x7f);
  });
  if (!isAbsolute(value) || containsControlCharacter) {
    throw new Error(`${label} must be an absolute path without control characters.`);
  }
  return resolve(value);
}

async function resolvePaths(options: ServiceCommandOptions): Promise<ServicePaths> {
  const platform = options.platform ?? process.platform;
  if (platform !== "darwin" && platform !== "linux") {
    throw new Error(
      "Service management supports macOS launchd and Linux systemd user services only.",
    );
  }
  const configuredHome = validatePath(options.homeDirectory ?? homedir(), "Home directory");
  const homeDirectory = await realpath(configuredHome);
  const homeStats = await lstat(homeDirectory);
  const detectedUserId = options.userId ?? process.getuid?.();
  if (detectedUserId === undefined || !Number.isSafeInteger(detectedUserId) || detectedUserId < 0) {
    throw new Error("Cannot determine the current user ID.");
  }
  const userId = detectedUserId;
  if (!homeStats.isDirectory() || homeStats.uid !== userId) {
    throw new Error("The service home directory must be a directory owned by the current user.");
  }

  const executablePath = validatePath(
    options.executablePath ?? process.execPath,
    "Node executable",
  );
  const entryPath = validatePath(
    options.entryPath ?? fileURLToPath(new URL("../cli.ts", import.meta.url)),
    "pi-dwell entry point",
  );
  const dataDirectory = join(homeDirectory, ...DATA_DIRECTORY_SEGMENTS);
  const registrationPath =
    platform === "darwin"
      ? join(homeDirectory, "Library", "Application Support", "Pi Dwell", `${SERVICE_LABEL}.plist`)
      : join(homeDirectory, ".config", "systemd", "user", SYSTEMD_UNIT);
  const logDirectory = join(homeDirectory, "Library", "Logs", "Pi Dwell");
  await validateDataDirectory(dataDirectory);
  await validateDataDirectory(dirname(registrationPath));
  if (platform === "darwin") await validateDataDirectory(logDirectory);
  const domain = `gui/${userId}`;
  const managerTarget = platform === "darwin" ? `${domain}/${SERVICE_LABEL}` : SYSTEMD_UNIT;
  const startupTimeoutMs = options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  if (!Number.isInteger(startupTimeoutMs) || startupTimeoutMs < 1) {
    throw new Error("Startup timeout must be a positive integer.");
  }
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 1) {
    throw new Error("Polling interval must be a positive integer.");
  }

  return {
    platform,
    homeDirectory,
    userId,
    executablePath,
    entryPath,
    dataDirectory,
    registrationPath,
    logDirectory,
    managerTarget,
    runner: options.runner ?? defaultRunner,
    readiness:
      options.readiness ??
      (async (_expectedProcessId, timeoutMs) =>
        readHostStatus({ port: DEFAULT_PORT, dataDir: dataDirectory, timeoutMs })),
    startupTimeoutMs,
    pollIntervalMs,
  };
}

async function ensureDirectories(
  homeDirectory: string,
  userId: number,
  segments: string[],
  { create, private: requirePrivate }: DirectoryCheck,
): Promise<string | undefined> {
  let current = homeDirectory;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined) throw new Error("Service path is incomplete.");
    current = join(current, segment);
    try {
      const currentStats = await lstat(current);
      if (currentStats.isSymbolicLink()) {
        throw new Error(`Refusing to use a symbolic link in the service path: ${current}`);
      }
      if (!currentStats.isDirectory() || currentStats.uid !== userId) {
        throw new Error(`Service path must be a directory owned by the current user: ${current}`);
      }
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT" && create) {
        try {
          await mkdir(current, { mode: 0o700 });
        } catch (mkdirError: unknown) {
          if (
            !(mkdirError instanceof Error && "code" in mkdirError && mkdirError.code === "EEXIST")
          ) {
            throw mkdirError;
          }
        }
        const currentStats = await lstat(current);
        if (
          currentStats.isSymbolicLink() ||
          !currentStats.isDirectory() ||
          currentStats.uid !== userId
        ) {
          throw new Error(`Service path must be a directory owned by the current user: ${current}`);
        }
      } else if (error instanceof Error && "code" in error && error.code === "ENOENT" && !create) {
        return undefined;
      } else {
        throw error;
      }
    }
    const stats = await lstat(current);
    if ((stats.mode & 0o700) !== 0o700) {
      throw new Error(
        `Service directory must allow owner read, write, and search access: ${current}`,
      );
    }
    const isLast = index === segments.length - 1;
    if (isLast && requirePrivate && (stats.mode & 0o077) !== 0) {
      throw new Error(`Service directory permissions must be private (0700): ${current}`);
    }
  }
  return current;
}

async function ensureServiceDirectories(paths: ServicePaths, create: boolean): Promise<void> {
  if (paths.platform === "darwin") {
    await ensureDirectories(
      paths.homeDirectory,
      paths.userId,
      ["Library", "Application Support", "Pi Dwell"],
      { create, private: true },
    );
    await ensureDirectories(paths.homeDirectory, paths.userId, ["Library", "Logs", "Pi Dwell"], {
      create,
      private: true,
    });
  } else {
    await ensureDirectories(paths.homeDirectory, paths.userId, [".config", "systemd", "user"], {
      create,
      private: false,
    });
  }
}

function plistEscape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function systemdQuote(value: string, escapeCommandVariables = false): string {
  let escaped = value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%");
  if (escapeCommandVariables) escaped = escaped.replaceAll("$", () => "$$");
  return `"${escaped}"`;
}

function launchAgentContent(paths: ServicePaths): string {
  const programArguments = [paths.executablePath, paths.entryPath, "serve"]
    .map((argument) => `      <string>${plistEscape(argument)}</string>`)
    .join("\n");
  const standardOutput = join(paths.logDirectory, "host.stdout.log");
  const standardError = join(paths.logDirectory, "host.stderr.log");
  const workingDirectory = dirname(paths.entryPath);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    `  <string>${SERVICE_LABEL}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    programArguments,
    "  </array>",
    "  <key>WorkingDirectory</key>",
    `  <string>${plistEscape(workingDirectory)}</string>`,
    "  <key>EnvironmentVariables</key>",
    "  <dict>",
    "    <key>HOME</key>",
    `    <string>${plistEscape(paths.homeDirectory)}</string>`,
    "  </dict>",
    "  <key>StandardOutPath</key>",
    `  <string>${plistEscape(standardOutput)}</string>`,
    "  <key>StandardErrorPath</key>",
    `  <string>${plistEscape(standardError)}</string>`,
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>KeepAlive</key>",
    "  <dict>",
    "    <key>SuccessfulExit</key>",
    "    <false/>",
    "  </dict>",
    "  <key>ThrottleInterval</key>",
    "  <integer>5</integer>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

function systemdUnitContent(paths: ServicePaths, legacy?: "ordered" | "quoted"): string {
  const command = [paths.executablePath, paths.entryPath, "serve"]
    .map((argument) => systemdQuote(argument, true))
    .join(" ");
  return [
    "# Managed by pi-dwell. Installation does not enable login startup.",
    "[Unit]",
    "Description=Pi Dwell local host",
    "StartLimitIntervalSec=60s",
    "StartLimitBurst=5",
    ...(legacy === "ordered" ? ["After=default.target"] : []),
    "",
    "[Service]",
    "Type=simple",
    // This scalar directive does not unquote or C-unescape. The final /. keeps
    // trailing spaces and backslashes out of the unit file's line grammar.
    `WorkingDirectory=${legacy ? systemdQuote(dirname(paths.entryPath)) : `${dirname(paths.entryPath).replaceAll("%", "%%")}/.`}`,
    `Environment=${systemdQuote(`HOME=${paths.homeDirectory}`)}`,
    `ExecStart=${command}`,
    "Restart=on-failure",
    "RestartSec=5s",
    "TimeoutStopSec=10s",
    "StandardOutput=journal",
    "StandardError=journal",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

function registrationContent(paths: ServicePaths): string {
  return paths.platform === "darwin" ? launchAgentContent(paths) : systemdUnitContent(paths);
}

function isLegacyRegistration(paths: ServicePaths, content: string): boolean {
  return (
    paths.platform === "linux" &&
    (content === systemdUnitContent(paths, "ordered") ||
      content === systemdUnitContent(paths, "quoted"))
  );
}

function fileOpenFlags(): number {
  return fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK | fsConstants.O_RDONLY;
}

async function readPrivateRegistration(path: string, userId: number): Promise<string | undefined> {
  let handle: FileHandle;
  try {
    handle = await open(path, fileOpenFlags());
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
  try {
    const stats = await handle.stat();
    if (
      !stats.isFile() ||
      stats.uid !== userId ||
      stats.nlink !== 1 ||
      (stats.mode & 0o077) !== 0 ||
      (stats.mode & 0o400) === 0
    ) {
      throw new Error(
        `Service registration must be a private single-link regular file owned by the current user: ${path}`,
      );
    }
    if (stats.size > MAX_REGISTRATION_BYTES) {
      throw new Error(`Service registration exceeds ${MAX_REGISTRATION_BYTES} bytes: ${path}`);
    }
    const buffer = Buffer.allocUnsafe(MAX_REGISTRATION_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const result = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (result.bytesRead === 0) break;
      bytesRead += result.bytesRead;
    }
    if (bytesRead > MAX_REGISTRATION_BYTES) {
      throw new Error(`Service registration exceeds ${MAX_REGISTRATION_BYTES} bytes: ${path}`);
    }
    return buffer.toString("utf8", 0, bytesRead);
  } finally {
    await handle.close();
  }
}

type RegistrationChange = "created" | "updated" | "unchanged";

async function upgradeRegistration(
  paths: ServicePaths,
  previous: string,
  content: string,
): Promise<void> {
  const temporary = `${paths.registrationPath}.${randomUUID()}.tmp`;
  try {
    const handle = await open(
      temporary,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    if ((await readPrivateRegistration(paths.registrationPath, paths.userId)) !== previous)
      throw new Error("Service registration changed during upgrade; refusing to replace it.");
    await rename(temporary, paths.registrationPath);
    const directory = await open(dirname(paths.registrationPath), fsConstants.O_RDONLY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

async function writePrivateRegistration(
  paths: ServicePaths,
  content: string,
): Promise<RegistrationChange> {
  const current = await readPrivateRegistration(paths.registrationPath, paths.userId);
  if (current !== undefined) {
    const legacy = isLegacyRegistration(paths, current);
    if (current !== content && !legacy) {
      throw new Error(
        `Refusing to replace existing service registration: ${paths.registrationPath}`,
      );
    }
    // A matching file must not authorize reloading a different manager unit.
    if (paths.platform === "linux") await inspectLinux(paths, legacy);
    if (legacy) {
      await upgradeRegistration(paths, current, content);
      return "updated";
    }
    return "unchanged";
  }

  // First install must check that systemd has not already loaded this name
  // from a different unit file before creating the local registration.
  if (paths.platform === "linux") await inspectLinux(paths);

  let handle: FileHandle;
  try {
    handle = await open(
      paths.registrationPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600,
    );
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      const raced = await readPrivateRegistration(paths.registrationPath, paths.userId);
      if (raced === content) {
        // Another installer may have created this exact file after preflight.
        // Verify the manager again before install proceeds to daemon-reload.
        if (paths.platform === "linux") await inspectLinux(paths);
        return "unchanged";
      }
      throw new Error(
        `Refusing to replace existing service registration: ${paths.registrationPath}`,
      );
    }
    throw error;
  }
  try {
    await handle.writeFile(content, { encoding: "utf8" });
  } finally {
    await handle.close();
  }
  await readPrivateRegistration(paths.registrationPath, paths.userId);
  return "created";
}

async function verifyRegistration(
  paths: ServicePaths,
  allowLegacy = false,
): Promise<"current" | "legacy" | undefined> {
  await ensureServiceDirectories(paths, false);
  const actual = await readPrivateRegistration(paths.registrationPath, paths.userId);
  if (actual === undefined) return undefined;
  if (isLegacyRegistration(paths, actual)) {
    if (allowLegacy) return "legacy";
    throw new Error(
      "Run npm run dwell -- service install to upgrade the legacy Linux unit before starting it.",
    );
  }
  if (actual !== registrationContent(paths)) {
    throw new Error(
      `Service registration does not match this pi-dwell installation: ${paths.registrationPath}`,
    );
  }
  return "current";
}

async function run(
  paths: ServicePaths,
  command: string,
  args: string[],
): Promise<ServiceCommandResult> {
  return paths.runner(command, args);
}

function commandError(command: string, args: string[], result: ServiceCommandResult): Error {
  const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
  return new Error(
    `Service manager command failed (${basename(command)} ${args.join(" ")}): ${detail}`,
  );
}

async function runRequired(
  paths: ServicePaths,
  command: string,
  args: string[],
): Promise<ServiceCommandResult> {
  const result = await run(paths, command, args);
  if (result.code !== 0) throw commandError(command, args, result);
  return result;
}

async function reloadLinuxManager(paths: ServicePaths): Promise<void> {
  if (paths.platform === "linux")
    await runRequired(paths, "/usr/bin/systemctl", ["--user", "daemon-reload"]);
}

function unknownSetting(error: unknown): string {
  const reason = error instanceof Error ? error.message : "Query failed.";
  return `unknown (${reason.replace(/\s+/g, " ").slice(0, 500)})`;
}

async function linuxAutostart(paths: ServicePaths): Promise<string> {
  try {
    const result = await runRequired(paths, "/usr/bin/systemctl", [
      "--user",
      "show",
      SYSTEMD_UNIT,
      "--property=UnitFileState",
      "--value",
    ]);
    const state = result.stdout.trim();
    if (state === "enabled" || state === "disabled") return state;
    if (state === "enabled-runtime") return "enabled-runtime (until reboot)";
    if (
      [
        "linked",
        "linked-runtime",
        "alias",
        "masked",
        "masked-runtime",
        "static",
        "indirect",
        "generated",
        "transient",
        "bad",
        "not-found",
      ].includes(state)
    )
      return `${state} (not persistent autostart)`;
    throw new Error("systemd returned an invalid UnitFileState.");
  } catch (error) {
    return unknownSetting(error);
  }
}

async function linuxLingering(paths: ServicePaths): Promise<string> {
  try {
    const result = await runRequired(paths, "/usr/bin/loginctl", [
      "show-user",
      String(paths.userId),
      "--property=Linger",
      "--value",
    ]);
    const state = result.stdout.trim();
    if (state === "yes") return "enabled";
    if (state === "no") return "disabled";
    throw new Error("logind returned an invalid Linger value.");
  } catch (error) {
    return unknownSetting(error);
  }
}

async function linuxBootStatus(paths: ServicePaths): Promise<string> {
  const [autostart, lingering] = await Promise.all([linuxAutostart(paths), linuxLingering(paths)]);
  return `Autostart: ${autostart}\nUser lingering: ${lingering}`;
}

async function inspectLinux(
  paths: ServicePaths,
  repairingLegacy = false,
): Promise<ManagerState | undefined> {
  const command = "/usr/bin/systemctl";
  const args = [
    "--user",
    "show",
    SYSTEMD_UNIT,
    "--property=LoadState",
    "--property=FragmentPath",
    "--property=MainPID",
    "--property=ActiveState",
  ];
  const result = await run(paths, command, args);
  if (result.code !== 0) throw commandError(command, args, result);
  const fields = new Map<string, string>();
  for (const line of result.stdout.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator);
    if (fields.has(key)) throw new Error(`systemd returned duplicate ${key} properties.`);
    fields.set(key, line.slice(separator + 1));
  }
  const loadState = fields.get("LoadState");
  if (loadState === "not-found") return undefined;
  const fragmentPath = fields.get("FragmentPath");
  const processIdText = fields.get("MainPID");
  const activeState = fields.get("ActiveState");
  if (
    (loadState !== "loaded" && !(repairingLegacy && loadState === "bad-setting")) ||
    fragmentPath === undefined ||
    processIdText === undefined ||
    activeState === undefined
  ) {
    throw new Error("Could not verify the installed pi-dwell systemd unit.");
  }
  if (fragmentPath !== paths.registrationPath) {
    throw new Error(`Refusing to manage a different systemd unit file: ${fragmentPath}`);
  }
  if (!/^\d+$/.test(processIdText)) {
    throw new Error("systemd returned an invalid pi-dwell main process ID.");
  }
  const processId = Number(processIdText);
  if (loadState === "bad-setting" && (processId !== 0 || activeState !== "inactive"))
    throw new Error("Refusing to replace an invalid systemd unit with unexpected runtime state.");
  return { processId, state: activeState };
}

interface LaunchdRegistration {
  path: string;
  program: string;
  arguments: string[];
  processId: number;
  state: string;
}

function parseLaunchdRegistration(output: string): LaunchdRegistration {
  const value = (key: string): string | undefined => {
    const match = output.match(new RegExp(`^\\s*${key} = (.*)$`, "m"));
    return match?.[1]?.trim();
  };
  const registrationPath = value("path");
  const program = value("program");
  const pidText = value("pid") ?? "0";
  const state = value("state");
  const argumentBlock = output.match(/^\s*arguments = \{\s*\n([\s\S]*?)^\s*\}/m)?.[1];
  if (!registrationPath || !program || !/^\d+$/.test(pidText) || argumentBlock === undefined) {
    throw new Error("Could not verify the loaded pi-dwell LaunchAgent identity.");
  }
  return {
    path: registrationPath,
    program,
    arguments: argumentBlock
      .split(/\r?\n/)
      .map((argument) => argument.trim())
      .filter(Boolean),
    processId: Number(pidText),
    state: state ?? (Number(pidText) > 0 ? "running" : "idle"),
  };
}

function validateLaunchdIdentity(paths: ServicePaths, registration: LaunchdRegistration): void {
  const expectedArguments = [paths.executablePath, paths.entryPath, "serve"];
  if (
    registration.path !== paths.registrationPath ||
    registration.program !== paths.executablePath ||
    registration.arguments.length !== expectedArguments.length ||
    registration.arguments.some((argument, index) => argument !== expectedArguments[index])
  ) {
    throw new Error(
      "Refusing to manage a LaunchAgent with a different registration path or command.",
    );
  }
}

async function inspectMac(paths: ServicePaths): Promise<ManagerState | undefined> {
  const command = "/bin/launchctl";
  const args = ["print", paths.managerTarget];
  const result = await run(paths, command, args);
  if (result.code !== 0) {
    if (/could not find service/i.test(`${result.stdout}\n${result.stderr}`)) return undefined;
    throw commandError(command, args, result);
  }
  const registration = parseLaunchdRegistration(result.stdout);
  validateLaunchdIdentity(paths, registration);
  return { processId: registration.processId, state: registration.state };
}

function managerProcessIsRunning(paths: ServicePaths, state: ManagerState): boolean {
  const expectedState = paths.platform === "darwin" ? "running" : "active";
  return state.processId > 0 && state.state.toLowerCase() === expectedState;
}

async function inspectManager(paths: ServicePaths): Promise<ManagerState | undefined> {
  return paths.platform === "darwin" ? inspectMac(paths) : inspectLinux(paths);
}

async function readReadiness(
  paths: ServicePaths,
  processId: number,
  timeoutMs: number,
): Promise<ServiceReadiness> {
  return paths.readiness(processId, timeoutMs);
}

function validateReadyIdentity(status: ServiceReadiness, expectedProcessId: number): void {
  if (
    status.processId !== expectedProcessId ||
    status.mode !== "production" ||
    typeof status.instanceId !== "string" ||
    status.instanceId.trim().length === 0
  ) {
    throw new Error(
      `Host readiness identity does not match service PID ${expectedProcessId} in production mode.`,
    );
  }
}

async function waitForReady(paths: ServicePaths, deadline: number): Promise<ServiceReadiness> {
  let lastIssue = "The service manager has not reported a running process.";
  while (Date.now() < deadline) {
    const state = await inspectManager(paths);
    if (Date.now() >= deadline) break;
    if (state && managerProcessIsRunning(paths, state)) {
      try {
        const readiness = await readReadiness(
          paths,
          state.processId,
          Math.max(1, deadline - Date.now()),
        );
        validateReadyIdentity(readiness, state.processId);
        return readiness;
      } catch (error: unknown) {
        lastIssue = error instanceof Error ? error.message : "Host readiness failed.";
      }
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await delay(Math.min(paths.pollIntervalMs, remaining));
  }
  throw new Error(
    `pi-dwell service did not become ready within ${paths.startupTimeoutMs} ms: ${lastIssue}`,
  );
}

async function startService(paths: ServicePaths): Promise<string> {
  if (!(await verifyRegistration(paths)))
    throw new Error("Install the pi-dwell service before starting it.");
  await ensureServiceDirectories(paths, true);
  const deadline = Date.now() + paths.startupTimeoutMs;
  if (paths.platform === "linux") await reloadLinuxManager(paths);
  const state = await inspectManager(paths);
  const alreadyRunning = state !== undefined && managerProcessIsRunning(paths, state);
  let startedByCommand = false;
  try {
    if (paths.platform === "darwin") {
      if (state === undefined) {
        await runRequired(paths, "/bin/launchctl", [
          "bootstrap",
          `gui/${paths.userId}`,
          paths.registrationPath,
        ]);
        startedByCommand = true;
      } else if (!alreadyRunning) {
        await runRequired(paths, "/bin/launchctl", ["kickstart", paths.managerTarget]);
        startedByCommand = true;
      }
    } else if (!alreadyRunning) {
      await runRequired(paths, "/usr/bin/systemctl", ["--user", "start", SYSTEMD_UNIT]);
      startedByCommand = true;
    }
    const status = await waitForReady(paths, deadline);
    return alreadyRunning
      ? `pi-dwell service is already running and ready (PID ${status.processId}, instance ${status.instanceId}).`
      : `Started pi-dwell service (PID ${status.processId}, instance ${status.instanceId}).`;
  } catch (startupError: unknown) {
    if (startedByCommand) {
      try {
        await stopService(paths);
      } catch (cleanupError: unknown) {
        const startupMessage =
          startupError instanceof Error ? startupError.message : "Service startup failed.";
        const cleanupMessage =
          cleanupError instanceof Error ? cleanupError.message : "Unknown cleanup failure.";
        throw new Error(`${startupMessage}. Cleanup failed: ${cleanupMessage}`, {
          cause: cleanupError,
        });
      }
    }
    throw startupError;
  }
}

async function waitForStopped(paths: ServicePaths): Promise<void> {
  const deadline = Date.now() + paths.startupTimeoutMs;
  while (Date.now() <= deadline) {
    const state = await inspectManager(paths);
    if (
      state === undefined ||
      (paths.platform === "linux" &&
        state.processId === 0 &&
        (state.state === "inactive" || state.state === "failed"))
    ) {
      return;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await delay(Math.min(paths.pollIntervalMs, remaining));
  }
  throw new Error(`pi-dwell service did not stop within ${paths.startupTimeoutMs} ms.`);
}

async function stopService(paths: ServicePaths): Promise<boolean> {
  if (!(await verifyRegistration(paths, true)))
    throw new Error("pi-dwell service is not installed; refusing to stop an unmanaged process.");
  if (paths.platform === "linux") await reloadLinuxManager(paths);
  const state = await inspectManager(paths);
  if (state === undefined) return false;
  if (paths.platform === "darwin") {
    await runRequired(paths, "/bin/launchctl", ["bootout", paths.managerTarget]);
  } else {
    await runRequired(paths, "/usr/bin/systemctl", ["--user", "stop", SYSTEMD_UNIT]);
  }
  await waitForStopped(paths);
  return true;
}

async function removeRegistration(paths: ServicePaths): Promise<void> {
  const content = await readPrivateRegistration(paths.registrationPath, paths.userId);
  if (content === undefined) return;
  if (content !== registrationContent(paths) && !isLegacyRegistration(paths, content)) {
    throw new Error(
      `Refusing to remove an unrelated service registration: ${paths.registrationPath}`,
    );
  }
  await unlink(paths.registrationPath);
}

async function install(paths: ServicePaths): Promise<string> {
  // Validate all injected executable paths before creating any user directories.
  const content = registrationContent(paths);
  await ensureServiceDirectories(paths, true);
  const change = await writePrivateRegistration(paths, content);
  try {
    await reloadLinuxManager(paths);
  } catch (error) {
    throw new Error(
      `Service registration is saved, but manager reload failed. Retry service install. ${error instanceof Error ? error.message : "Unknown error."}`,
      { cause: error },
    );
  }
  if (paths.platform === "linux") {
    const result =
      change === "created"
        ? "Installed pi-dwell service."
        : change === "updated"
          ? "Updated pi-dwell service registration; running processes were not restarted."
          : "pi-dwell service is already installed.";
    return `${result}\n${await linuxBootStatus(paths)}`;
  }
  return change === "created"
    ? "Installed pi-dwell service; it is not enabled for login startup."
    : "pi-dwell service is already installed; login startup remains disabled.";
}

async function uninstall(paths: ServicePaths): Promise<string> {
  if (!(await verifyRegistration(paths, true))) return "pi-dwell service is not installed.";
  const stopped = await stopService(paths);
  if (paths.platform === "linux") {
    // Recheck after the asynchronous stop before modifying unit enablement.
    if (!(await verifyRegistration(paths, true)))
      throw new Error("Service registration disappeared after stop; uninstall is incomplete.");
    try {
      await runRequired(paths, "/usr/bin/systemctl", ["--user", "disable", SYSTEMD_UNIT]);
    } catch (error) {
      throw new Error(
        `Service is stopped, but disabling autostart failed; registration and data were retained. ${error instanceof Error ? error.message : "Unknown error."}`,
        { cause: error },
      );
    }
  }
  try {
    await removeRegistration(paths);
  } catch (error) {
    throw new Error(
      `Service is stopped${paths.platform === "linux" ? " and autostart is disabled" : ""}, but registration removal failed. ${error instanceof Error ? error.message : "Unknown error."}`,
      { cause: error },
    );
  }
  try {
    await reloadLinuxManager(paths);
  } catch (error) {
    throw new Error(
      `Service registration was removed, but manager reload failed. ${error instanceof Error ? error.message : "Unknown error."}`,
      { cause: error },
    );
  }
  return stopped ? "Stopped and uninstalled pi-dwell service." : "Uninstalled pi-dwell service.";
}

async function runtimeStatus(paths: ServicePaths): Promise<string> {
  const state = await inspectManager(paths);
  if (state === undefined) {
    return paths.platform === "darwin"
      ? "pi-dwell service is installed but not loaded by launchd."
      : "pi-dwell service is installed but not loaded by systemd.";
  }
  if (!managerProcessIsRunning(paths, state)) {
    if (paths.platform === "linux") {
      if (state.state === "inactive" && state.processId === 0) {
        return "pi-dwell service is installed and stopped.";
      }
      if (state.state === "failed") {
        return "pi-dwell service has failed (systemd ActiveState=failed).";
      }
      if (state.state === "activating") {
        return "pi-dwell service is starting (systemd ActiveState=activating).";
      }
      if (state.state === "deactivating") {
        return "pi-dwell service is stopping (systemd ActiveState=deactivating).";
      }
      return `pi-dwell service is not ready (systemd ActiveState=${state.state}, PID ${state.processId}).`;
    }
    return `pi-dwell service is not ready (launchd state=${state.state}, PID ${state.processId}).`;
  }
  try {
    const readiness = await readReadiness(paths, state.processId, 3_000);
    validateReadyIdentity(readiness, state.processId);
    return `pi-dwell service is running and ready (PID ${state.processId}, instance ${readiness.instanceId}).`;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "readiness check failed";
    return `pi-dwell service process is running (PID ${state.processId}), but host readiness failed: ${reason}`;
  }
}

async function status(paths: ServicePaths): Promise<string> {
  const registration = await verifyRegistration(paths, true);
  if (!registration) return "pi-dwell service is not installed.";
  const runtime = await runtimeStatus(paths);
  return paths.platform === "linux"
    ? `Runtime: ${runtime}\n${await linuxBootStatus(paths)}${registration === "legacy" ? "\nRegistration: legacy; run npm run dwell -- service install to upgrade." : ""}`
    : runtime;
}

export async function runServiceCommand(
  action: ServiceAction,
  options: ServiceCommandOptions = {},
): Promise<string> {
  if (!(SERVICE_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(`Unsupported service action: ${String(action)}`);
  }
  const paths = await resolvePaths(options);
  if (action === "install") return install(paths);
  if (action === "uninstall") return uninstall(paths);
  if (action === "start") return startService(paths);
  if (action === "stop") {
    const stopped = await stopService(paths);
    return stopped ? "Stopped pi-dwell service." : "pi-dwell service is already stopped.";
  }
  if (action === "restart") {
    if (!(await verifyRegistration(paths)))
      throw new Error("Install the pi-dwell service before restarting it.");
    await stopService(paths);
    return startService(paths).then((result) => result.replace(/^Started/, "Restarted"));
  }
  return status(paths);
}
