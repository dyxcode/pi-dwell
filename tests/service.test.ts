import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, link, readFile, realpath, rm, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test, type TestContext } from "node:test";
import { promisify } from "node:util";
import {
  runServiceCommand,
  type ServiceCommandOptions,
  type ServiceCommandResult,
} from "../src/service/service.ts";

const executablePath = "/opt/node bin/node";
const exec = promisify(execFile);
type ServiceTestOptions = ServiceCommandOptions & {
  platform: "darwin" | "linux";
  homeDirectory: string;
  executablePath: string;
  entryPath: string;
  userId: number;
};

async function createOptions(
  platform: "darwin" | "linux",
  t: TestContext,
  overrides: Omit<Partial<ServiceCommandOptions>, "platform" | "userId"> = {},
): Promise<ServiceTestOptions> {
  const userId = process.getuid?.();
  if (userId === undefined) throw new Error("Service tests require a Unix user ID.");
  const homeDirectory = await mkdtemp(join(tmpdir(), "pi-dwell-service-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  const canonicalHome = await realpath(homeDirectory);
  return {
    platform,
    homeDirectory: canonicalHome,
    executablePath,
    entryPath: join(canonicalHome, "app source", "cli.ts"),
    userId,
    ...overrides,
  };
}

function success(stdout = ""): ServiceCommandResult {
  return { code: 0, stdout, stderr: "" };
}

type SystemdProperty = "LoadState" | "FragmentPath" | "MainPID" | "ActiveState";

function systemdState(
  options: ServiceTestOptions,
  processId: number,
  activeState: "active" | "inactive" | "failed" | "activating" | "deactivating",
  order: SystemdProperty[] = ["FragmentPath", "LoadState", "ActiveState", "MainPID"],
): ServiceCommandResult {
  const values: Record<SystemdProperty, string> = {
    LoadState: "loaded",
    FragmentPath: join(options.homeDirectory, ".config", "systemd", "user", "pi-dwell.service"),
    MainPID: String(processId),
    ActiveState: activeState,
  };
  return success(`${order.map((property) => `${property}=${values[property]}`).join("\n")}\n`);
}

test("macOS install writes a private, non-login-autoload LaunchAgent with a fixed production command", async (t) => {
  const options = await createOptions("darwin", t, {
    runner: async () => success(),
  });
  const result = await runServiceCommand("install", options);
  const registration = join(
    options.homeDirectory,
    "Library",
    "Application Support",
    "Pi Dwell",
    "io.pi-dwell.host.plist",
  );
  const plist = await readFile(registration, "utf8");
  const registrationStats = await stat(registration);

  assert.match(result, /installed/i);
  assert.match(result, /not enabled for login startup/i);
  assert.match(plist, /<key>Label<\/key>\s*<string>io\.pi-dwell\.host<\/string>/);
  assert.match(plist, /<key>ProgramArguments<\/key>/);
  assert.match(plist, /<string>\/opt\/node bin\/node<\/string>/);
  assert.match(plist, /<string>serve<\/string>/);
  assert.match(plist, /<key>HOME<\/key>/);
  assert.ok(!plist.includes("PI_DWELL_MODE"));
  assert.ok(!plist.includes("PI_DWELL_DATA_DIR"));
  assert.match(plist, /<key>SuccessfulExit<\/key>\s*<false\/>/);
  assert.match(plist, /<key>ThrottleInterval<\/key>\s*<integer>5<\/integer>/);
  assert.ok(plist.includes(join(options.homeDirectory, "Library", "Logs", "Pi Dwell")));
  assert.ok(!registration.includes(join("Library", "LaunchAgents")));
  assert.equal(registrationStats.mode & 0o077, 0);
  await assert.rejects(stat(join(options.homeDirectory, ".local", "share", "pi-dwell")), {
    code: "ENOENT",
  });
});

test("Linux install writes a private systemd user unit without enabling login startup", async (t) => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const options = await createOptions("linux", t, {
    entryPath: "/home/example/app source/cli.ts",
    runner: async (command, args) => {
      calls.push({ command, args });
      return success();
    },
  });
  const result = await runServiceCommand("install", options);
  const unitPath = join(options.homeDirectory, ".config", "systemd", "user", "pi-dwell.service");
  const unit = await readFile(unitPath, "utf8");
  const unitStats = await stat(unitPath);

  assert.match(result, /not enabled for login startup/i);
  assert.match(
    unit,
    /ExecStart="\/opt\/node bin\/node" "\/home\/example\/app source\/cli\.ts" "serve"/,
  );
  assert.match(unit, /Environment="HOME=/);
  assert.ok(!unit.includes("PI_DWELL_MODE"));
  assert.ok(!unit.includes("PI_DWELL_DATA_DIR"));
  assert.match(unit, /Restart=on-failure/);
  assert.match(unit, /RestartSec=5s/);
  assert.match(unit, /StartLimitIntervalSec=60s/);
  assert.match(unit, /StartLimitBurst=5/);
  assert.ok(!calls.some(({ args }) => args.includes("enable")));
  assert.ok(calls.some(({ args }) => args[0] === "--user" && args[1] === "daemon-reload"));
  assert.equal(unitStats.mode & 0o077, 0);
  await assert.rejects(stat(join(options.homeDirectory, ".local", "share", "pi-dwell")), {
    code: "ENOENT",
  });
});

test("systemd serialization preserves literal path characters without shell or specifier expansion", async (t) => {
  const unusualHome = await mkdtemp(join(tmpdir(), 'pi dwell $home % "quote" '));
  t.after(() => rm(unusualHome, { recursive: true, force: true }));
  const options = await createOptions("linux", t, {
    homeDirectory: await realpath(unusualHome),
    entryPath: '/home/example/100% "$HOME"/app source/cli.ts',
    runner: async () => success(),
  });
  await runServiceCommand("install", options);
  const unit = await readFile(
    join(options.homeDirectory, ".config", "systemd", "user", "pi-dwell.service"),
    "utf8",
  );

  assert.ok(
    unit.includes(
      'ExecStart="/opt/node bin/node" "/home/example/100%% \\"$$HOME\\"/app source/cli.ts" "serve"',
    ),
  );
  const escapedHome = options.homeDirectory
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("%", "%%");
  assert.ok(unit.includes(`Environment="HOME=${escapedHome}"`));
});

test("service installation rejects repository and vault destinations before writing registrations", async (t) => {
  const options = await createOptions("linux", t, {
    homeDirectory: process.cwd(),
    runner: async () => success(),
  });

  await assert.rejects(runServiceCommand("install", options), /outside repositories and Obsidian/i);
});

test("install is idempotent for its own registration and refuses to overwrite unrelated content", async (t) => {
  const options = await createOptions("linux", t, { runner: async () => success() });
  const registration = join(
    options.homeDirectory,
    ".config",
    "systemd",
    "user",
    "pi-dwell.service",
  );
  await runServiceCommand("install", options);
  const original = await readFile(registration, "utf8");
  await runServiceCommand("install", options);
  assert.equal(await readFile(registration, "utf8"), original);

  await writeFile(registration, "[Unit]\nDescription=another user's service\n", { mode: 0o600 });
  await assert.rejects(runServiceCommand("install", options), /refusing to replace/i);
  assert.equal(
    await readFile(registration, "utf8"),
    "[Unit]\nDescription=another user's service\n",
  );
});

test("service registration reads reject hard links and oversized files", async (t) => {
  const options = await createOptions("linux", t, { runner: async () => success() });
  const registration = join(
    options.homeDirectory,
    ".config",
    "systemd",
    "user",
    "pi-dwell.service",
  );
  await runServiceCommand("install", options);
  const alias = join(options.homeDirectory, "registration-copy");
  await link(registration, alias);
  await assert.rejects(runServiceCommand("status", options), /single-link regular file/i);
  await unlink(alias);

  await writeFile(registration, Buffer.alloc(64 * 1024 + 1, 120));
  await assert.rejects(runServiceCommand("status", options), /exceeds 65536 bytes/i);
});

test("service status reports a failed systemd unit distinctly from a stopped unit", async (t) => {
  const options = await createOptions("linux", t, { runner: async () => success() });
  options.runner = async (_command, args) =>
    args[0] === "--user" && args[1] === "show"
      ? systemdState(options, 0, "failed", ["ActiveState", "FragmentPath", "MainPID", "LoadState"])
      : success();
  await runServiceCommand("install", options);

  const result = await runServiceCommand("status", options);

  assert.match(result, /has failed.*ActiveState=failed/i);
});

test("service status reports a systemd activation transition", async (t) => {
  const options = await createOptions("linux", t, { runner: async () => success() });
  options.runner = async (_command, args) =>
    args[0] === "--user" && args[1] === "show"
      ? systemdState(options, 0, "activating", [
          "MainPID",
          "LoadState",
          "FragmentPath",
          "ActiveState",
        ])
      : success();
  await runServiceCommand("install", options);

  const result = await runServiceCommand("status", options);

  assert.match(result, /starting.*ActiveState=activating/i);
});

test("FIFO registration is rejected promptly instead of blocking the CLI", async (t) => {
  const options = await createOptions("linux", t, { runner: async () => success() });
  const registration = join(
    options.homeDirectory,
    ".config",
    "systemd",
    "user",
    "pi-dwell.service",
  );
  await runServiceCommand("install", options);
  await unlink(registration);
  await exec("mkfifo", [registration]);

  const moduleUrl = new URL("../src/service/service.ts", import.meta.url).href;
  const scriptPath = join(options.homeDirectory, "inspect-fifo.mjs");
  const script = [
    `import { runServiceCommand } from ${JSON.stringify(moduleUrl)};`,
    `await runServiceCommand("status", { platform: "linux", homeDirectory: ${JSON.stringify(options.homeDirectory)}, executablePath: ${JSON.stringify(options.executablePath)}, entryPath: ${JSON.stringify(options.entryPath)}, userId: process.getuid() });`,
    "",
  ].join("\n");
  await writeFile(scriptPath, script, { mode: 0o600 });
  await assert.rejects(
    exec(process.execPath, [scriptPath], { timeout: 1500 }),
    (error: unknown) => {
      assert.ok(error instanceof Error && "stderr" in error);
      assert.match(String(error.stderr), /single-link regular file/i);
      return true;
    },
  );
});

test("start waits for production host readiness and matches the service manager PID", async (t) => {
  const options = await createOptions("linux", t, {
    startupTimeoutMs: 100,
    pollIntervalMs: 1,
    runner: async () => success(),
    readiness: async (processId) => ({ processId, instanceId: "instance-a", mode: "production" }),
  });
  const calls: string[][] = [];
  let started = false;
  options.runner = async (_command, args) => {
    calls.push(args);
    if (args[0] === "--user" && args[1] === "show") {
      return systemdState(options, started ? 4242 : 0, started ? "active" : "inactive", [
        "ActiveState",
        "MainPID",
        "FragmentPath",
        "LoadState",
      ]);
    }
    if (args[0] === "--user" && args[1] === "start") started = true;
    return success();
  };
  await runServiceCommand("install", options);

  const result = await runServiceCommand("start", options);

  assert.match(result, /started/i);
  assert.match(result, /4242/);
  assert.ok(calls.some((args) => args[0] === "--user" && args[1] === "start"));
  assert.ok(!calls.some((args) => args[0] === "kill" || args[0] === "-TERM"));

  const secondStart = await runServiceCommand("start", options);

  assert.match(secondStart, /already running and ready/i);
  assert.equal(calls.filter((args) => args[0] === "--user" && args[1] === "start").length, 1);
});

test("start rejects a running listener whose host identity does not match the service PID", async (t) => {
  const options = await createOptions("linux", t, {
    startupTimeoutMs: 10,
    pollIntervalMs: 1,
    runner: async () => success(),
    readiness: async () => ({ processId: 1234, instanceId: "other-instance", mode: "production" }),
  });
  let started = false;
  const calls: string[][] = [];
  options.runner = async (_command, args) => {
    calls.push(args);
    if (args[0] === "--user" && args[1] === "show") {
      return systemdState(options, started ? 4242 : 0, started ? "active" : "inactive", [
        "ActiveState",
        "MainPID",
        "FragmentPath",
        "LoadState",
      ]);
    }
    if (args[0] === "--user" && args[1] === "start") started = true;
    if (args[0] === "--user" && args[1] === "stop") started = false;
    return success();
  };
  await runServiceCommand("install", options);

  await assert.rejects(runServiceCommand("start", options), /readiness.*PID|PID.*readiness/i);
  assert.ok(
    calls.some(
      (args) => args[0] === "--user" && args[1] === "stop" && args[2] === "pi-dwell.service",
    ),
  );
  assert.equal(started, false);
});

test("start reports manager cleanup failure after readiness times out", async (t) => {
  const options = await createOptions("linux", t, {
    startupTimeoutMs: 10,
    pollIntervalMs: 1,
    runner: async () => success(),
    readiness: async () => {
      throw new Error("authenticated readiness is unavailable");
    },
  });
  let started = false;
  options.runner = async (_command, args) => {
    if (args[0] === "--user" && args[1] === "show") {
      return systemdState(options, started ? 4242 : 0, started ? "active" : "inactive");
    }
    if (args[0] === "--user" && args[1] === "start") started = true;
    if (args[0] === "--user" && args[1] === "stop") {
      return { code: 1, stdout: "", stderr: "mock stop denied" };
    }
    return success();
  };
  await runServiceCommand("install", options);

  await assert.rejects(runServiceCommand("start", options), (error: unknown) => {
    assert.ok(error instanceof Error && "cause" in error);
    assert.match(error.message, /readiness is unavailable/i);
    assert.match(error.message, /Cleanup failed:.*mock stop denied/i);
    assert.ok(error.cause instanceof Error);
    return true;
  });
});

test("macOS start bootstraps and stop unloads only the matching LaunchAgent", async (t) => {
  const options = await createOptions("darwin", t, {
    startupTimeoutMs: 100,
    pollIntervalMs: 1,
    runner: async () => success(),
    readiness: async (processId) => ({ processId, instanceId: "instance-mac", mode: "production" }),
  });
  const calls: string[][] = [];
  let loaded = false;
  const managerOutput = () =>
    [
      `gui/${options.userId}/io.pi-dwell.host = {`,
      `\tpath = ${join(options.homeDirectory, "Library", "Application Support", "Pi Dwell", "io.pi-dwell.host.plist")}`,
      "\tstate = running",
      `\tprogram = ${executablePath}`,
      "\targuments = {",
      `\t\t${executablePath}`,
      `\t\t${options.entryPath}`,
      "\t\tserve",
      "\t}",
      "\tpid = 4243",
      "}",
    ].join("\n");
  options.runner = async (_command, args) => {
    calls.push(args);
    if (args[0] === "print") {
      return loaded
        ? success(managerOutput())
        : { code: 113, stdout: "", stderr: 'Could not find service "io.pi-dwell.host" in domain.' };
    }
    if (args[0] === "bootstrap") loaded = true;
    if (args[0] === "bootout") loaded = false;
    return success();
  };
  await runServiceCommand("install", options);

  assert.match(await runServiceCommand("start", options), /PID 4243/);
  assert.ok(calls.some((args) => args[0] === "bootstrap"));
  assert.match(await runServiceCommand("stop", options), /stopped/i);
  assert.ok(calls.some((args) => args[0] === "bootout"));
  assert.ok(!calls.some((args) => args[0] === "kill"));
});

test("stop refuses a conflicting launchd label with a different registration", async (t) => {
  const options = await createOptions("darwin", t, { runner: async () => success() });
  const calls: string[][] = [];
  options.runner = async (_command, args) => {
    calls.push(args);
    if (args[0] === "print") {
      return success(
        [
          `gui/${options.userId}/io.pi-dwell.host = {`,
          "\tpath = /tmp/other-job.plist",
          "\tprogram = /tmp/other-node",
          "\targuments = {",
          "\t\t/tmp/other-node",
          "\t\tserve",
          "\t}",
          "\tpid = 8123",
          "}",
        ].join("\n"),
      );
    }
    return success();
  };
  await runServiceCommand("install", options);

  await assert.rejects(
    runServiceCommand("stop", options),
    /different registration path or command/i,
  );
  assert.ok(!calls.some((args) => args[0] === "bootout"));
});

test("stop unloads an installed LaunchAgent even when its process is already idle", async (t) => {
  const options = await createOptions("darwin", t, { runner: async () => success() });
  const calls: string[][] = [];
  let loaded = true;
  options.runner = async (_command, args) => {
    calls.push(args);
    if (args[0] === "print") {
      return loaded
        ? success(
            [
              `gui/${options.userId}/io.pi-dwell.host = {`,
              `\tpath = ${join(options.homeDirectory, "Library", "Application Support", "Pi Dwell", "io.pi-dwell.host.plist")}`,
              `\tprogram = ${executablePath}`,
              "\targuments = {",
              `\t\t${executablePath}`,
              `\t\t${options.entryPath}`,
              "\t\tserve",
              "\t}",
              "\tpid = 0",
              "}",
            ].join("\n"),
          )
        : { code: 113, stdout: "", stderr: "Could not find service" };
    }
    if (args[0] === "bootout") loaded = false;
    return success();
  };
  await runServiceCommand("install", options);

  assert.match(await runServiceCommand("stop", options), /stopped/i);
  assert.ok(calls.some((args) => args[0] === "bootout"));
});

test("launchd waiting state is reported without claiming the host is stopped", async (t) => {
  const options = await createOptions("darwin", t, { runner: async () => success() });
  options.runner = async (_command, args) =>
    args[0] === "print"
      ? success(
          [
            `gui/${options.userId}/io.pi-dwell.host = {`,
            `\tpath = ${join(options.homeDirectory, "Library", "Application Support", "Pi Dwell", "io.pi-dwell.host.plist")}`,
            "\tstate = waiting",
            `\tprogram = ${executablePath}`,
            "\targuments = {",
            `\t\t${executablePath}`,
            `\t\t${options.entryPath}`,
            "\t\tserve",
            "\t}",
            "\tpid = 0",
            "}",
          ].join("\n"),
        )
      : success();
  await runServiceCommand("install", options);

  const result = await runServiceCommand("status", options);

  assert.match(result, /launchd state=waiting/i);
  assert.doesNotMatch(result, /stopped/i);
});

test("stop and uninstall target only the registered service manager unit", async (t) => {
  const options = await createOptions("linux", t, { runner: async () => success() });
  const calls: string[][] = [];
  let active = true;
  options.runner = async (_command, args) => {
    calls.push(args);
    if (args[0] === "--user" && args[1] === "show") {
      return systemdState(options, active ? 4242 : 0, active ? "active" : "inactive", [
        "MainPID",
        "FragmentPath",
        "ActiveState",
        "LoadState",
      ]);
    }
    if (args[0] === "--user" && args[1] === "stop") active = false;
    return success();
  };
  await runServiceCommand("install", options);

  const result = await runServiceCommand("stop", options);

  assert.match(result, /stopped/i);
  assert.ok(
    calls.some(
      (args) => args[0] === "--user" && args[1] === "stop" && args[2] === "pi-dwell.service",
    ),
  );
  assert.ok(!calls.some((args) => args[0] === "kill" || args[0] === "-TERM"));

  await runServiceCommand("uninstall", options);
  await assert.rejects(
    readFile(join(options.homeDirectory, ".config", "systemd", "user", "pi-dwell.service")),
  );
});

test("registration paths and executable arguments reject newline injection", async (t) => {
  const options = await createOptions("darwin", t, {
    entryPath: "/tmp/cli.ts\n<key>KeepAlive</key>",
    runner: async () => success(),
  });
  await assert.rejects(runServiceCommand("install", options), /control characters|invalid.*path/i);
  await assert.rejects(
    stat(join(options.homeDirectory, "Library", "Application Support", "Pi Dwell")),
    {
      code: "ENOENT",
    },
  );
});
