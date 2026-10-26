import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type TestContext, test } from "node:test";
import {
  runServiceCommand,
  type ServiceCommandOptions,
  type ServiceCommandResult,
} from "../src/service/service.ts";

const SYSTEMCTL = "/usr/bin/systemctl";
const LOGINCTL = "/usr/bin/loginctl";
const EXECUTABLE_PATH = "/opt/node bin/node";

type LinuxServiceOptions = ServiceCommandOptions & {
  platform: "linux";
  homeDirectory: string;
  executablePath: string;
  entryPath: string;
  userId: number;
};

interface Call {
  command: string;
  args: string[];
}

async function createLinuxOptions(
  t: TestContext,
  overrides: Omit<Partial<ServiceCommandOptions>, "platform" | "userId"> = {},
): Promise<LinuxServiceOptions> {
  const userId = process.getuid?.();
  if (userId === undefined) throw new Error("Service tests require a Unix user ID.");
  const homeDirectory = await mkdtemp(join(tmpdir(), "pi-dwell-service-boot-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  const canonicalHome = await realpath(homeDirectory);
  return {
    platform: "linux",
    homeDirectory: canonicalHome,
    executablePath: EXECUTABLE_PATH,
    entryPath: join(canonicalHome, "app source", "cli.ts"),
    userId,
    ...overrides,
  };
}

function success(stdout = ""): ServiceCommandResult {
  return { code: 0, stdout, stderr: "" };
}

function failure(stderr = "systemd query unavailable"): ServiceCommandResult {
  return { code: 1, stdout: "", stderr };
}

function unitPath(options: LinuxServiceOptions): string {
  return join(options.homeDirectory, ".config", "systemd", "user", "pi-dwell.service");
}

function recordCalls(calls: Call[], command: string, args: string[]): void {
  calls.push({ command, args: [...args] });
}

function isUnitFileStateQuery(command: string, args: string[]): boolean {
  return (
    command === SYSTEMCTL &&
    args[0] === "--user" &&
    args[1] === "show" &&
    args[2] === "pi-dwell.service" &&
    args.includes("--property=UnitFileState") &&
    args.includes("--value")
  );
}

function isLingerQuery(command: string, args: string[]): boolean {
  return (
    command === LOGINCTL &&
    args[0] === "show-user" &&
    args[1] !== undefined &&
    args[2] === "--property=Linger" &&
    args[3] === "--value"
  );
}

function managerState(
  options: LinuxServiceOptions,
  processId: number,
  activeState: "active" | "inactive" | "failed" | "activating" | "deactivating",
  fragment = unitPath(options),
): ServiceCommandResult {
  return success(
    [
      `LoadState=loaded`,
      `FragmentPath=${fragment}`,
      `MainPID=${processId}`,
      `ActiveState=${activeState}`,
      "",
    ].join("\n"),
  );
}

function managerNotFound(): ServiceCommandResult {
  return success("LoadState=not-found\n");
}

function systemdUnit(options: LinuxServiceOptions, afterDefaultTarget: boolean): string {
  const lines = [
    "# Managed by pi-dwell. Installation does not enable login startup.",
    "[Unit]",
    "Description=Pi Dwell local host",
    "StartLimitIntervalSec=60s",
    "StartLimitBurst=5",
  ];
  if (afterDefaultTarget) lines.push("After=default.target");
  lines.push(
    "",
    "[Service]",
    "Type=simple",
    `WorkingDirectory="${dirname(options.entryPath)}"`,
    `Environment="HOME=${options.homeDirectory}"`,
    `ExecStart="${options.executablePath}" "${options.entryPath}" "serve"`,
    "Restart=on-failure",
    "RestartSec=5s",
    "TimeoutStopSec=10s",
    "StandardOutput=journal",
    "StandardError=journal",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  );
  return lines.join("\n");
}

async function createUnitDirectory(options: LinuxServiceOptions): Promise<void> {
  await mkdir(dirname(unitPath(options)), { recursive: true, mode: 0o700 });
}

async function installCurrentUnit(
  options: LinuxServiceOptions,
  calls: Call[] = [],
): Promise<string> {
  options.runner = async (command, args) => {
    recordCalls(calls, command, args);
    if (isUnitFileStateQuery(command, args)) return success("disabled\n");
    if (isLingerQuery(command, args)) return success("no\n");
    if (command === SYSTEMCTL && args[0] === "--user" && args[1] === "show") {
      return managerNotFound();
    }
    return success();
  };
  return runServiceCommand("install", options);
}

test("Linux user unit leaves ordering to the user manager and retains default.target installation", async (t) => {
  const options = await createLinuxOptions(t);
  await installCurrentUnit(options);

  const unit = await readFile(unitPath(options), "utf8");

  assert.doesNotMatch(unit, /^\s*After\s*=/m);
  assert.match(unit, /^WantedBy=default\.target$/m);
});

test("install atomically upgrades only the exact previous unit and keeps an enabled running service untouched", async (t) => {
  const calls: Call[] = [];
  const options = await createLinuxOptions(t);
  await createUnitDirectory(options);
  const registration = unitPath(options);
  const previousUnit = systemdUnit(options, true);
  await writeFile(registration, previousUnit, { mode: 0o600 });
  const oldFile = await open(registration, "r");
  const oldIdentity = await oldFile.stat();
  const state = { active: "active" as const, processId: 4242 };
  options.runner = async (command, args) => {
    recordCalls(calls, command, args);
    if (isUnitFileStateQuery(command, args)) return success("enabled\n");
    if (isLingerQuery(command, args)) return success("yes\n");
    if (command === SYSTEMCTL && args[0] === "--user" && args[1] === "show") {
      return managerState(options, state.processId, state.active);
    }
    return success();
  };

  try {
    const result = await runServiceCommand("install", options);
    const newUnit = await readFile(registration, "utf8");
    const newIdentity = await stat(registration);

    assert.match(result, /Autostart:\s*enabled/i);
    assert.doesNotMatch(newUnit, /^\s*After\s*=/m);
    assert.match(newUnit, /^WantedBy=default\.target$/m);
    assert.notEqual(newIdentity.ino, oldIdentity.ino, "upgrade should replace the unit atomically");
    assert.equal(newIdentity.mode & 0o777, 0o600);
    assert.equal(await oldFile.readFile("utf8"), previousUnit);
    assert.ok(
      calls.some(
        ({ command, args }) =>
          command === SYSTEMCTL && args[0] === "--user" && args[1] === "daemon-reload",
      ),
    );
    assert.ok(
      !calls.some(
        ({ command, args }) =>
          command === SYSTEMCTL &&
          args[0] === "--user" &&
          ["start", "stop", "restart", "enable", "disable"].some((action) => args.includes(action)),
      ),
      "install must not restart a running service or change its enabled state",
    );
  } finally {
    await oldFile.close();
  }
});

test("install refuses a symlinked Linux unit without changing its target", async (t) => {
  const calls: Call[] = [];
  const options = await createLinuxOptions(t);
  await createUnitDirectory(options);
  const target = join(options.homeDirectory, "custom-unit.service");
  const customUnit = "[Unit]\nDescription=locally managed service\n";
  await writeFile(target, customUnit, { mode: 0o600 });
  await symlink(target, unitPath(options));
  options.runner = async (command, args) => {
    recordCalls(calls, command, args);
    return success();
  };

  await assert.rejects(
    runServiceCommand("install", options),
    /symbolic link|symlink|registration/i,
  );
  assert.equal(await readFile(target, "utf8"), customUnit);
  assert.equal(calls.length, 0);
});

test("known legacy units can be inspected and stopped, but restart requires upgrade before stopping", async (t) => {
  const options = await createLinuxOptions(t);
  await createUnitDirectory(options);
  const legacy = systemdUnit(options, true);
  await writeFile(unitPath(options), legacy, { mode: 0o600 });
  const calls: Call[] = [];
  let active = true;
  options.readiness = async (processId) => ({
    processId,
    instanceId: "legacy",
    mode: "production",
  });
  options.runner = async (command, args) => {
    recordCalls(calls, command, args);
    if (isUnitFileStateQuery(command, args)) return success("enabled\n");
    if (isLingerQuery(command, args)) return success("yes\n");
    if (command === SYSTEMCTL && args[1] === "show")
      return managerState(options, active ? 4242 : 0, active ? "active" : "inactive");
    if (command === SYSTEMCTL && args[1] === "stop") active = false;
    return success();
  };
  const status = await runServiceCommand("status", options);
  assert.match(status, /running and ready/);
  assert.match(status, /legacy|upgrade/i);
  assert.equal(await readFile(unitPath(options), "utf8"), legacy);
  await assert.rejects(
    runServiceCommand("restart", options),
    /service install.*upgrade|upgrade.*service install/i,
  );
  assert.equal(active, true);
  assert.ok(!calls.some(({ args }) => args[1] === "stop"));
  assert.match(await runServiceCommand("stop", options), /stopped/i);
  assert.equal(active, false);
  await runServiceCommand("uninstall", options);
  await assert.rejects(stat(unitPath(options)), { code: "ENOENT" });
});

test("install refuses a previous-version unit whose executable or entry path differs", async (t) => {
  const options = await createLinuxOptions(t);
  await createUnitDirectory(options);
  const mismatchedUnit = systemdUnit(
    { ...options, entryPath: join(options.homeDirectory, "different source", "cli.ts") },
    true,
  );
  await writeFile(unitPath(options), mismatchedUnit, { mode: 0o600 });
  options.runner = async () => success();

  await assert.rejects(runServiceCommand("install", options), /refusing|match|different/i);
  assert.equal(await readFile(unitPath(options), "utf8"), mismatchedUnit);
});

test("status reports live runtime, persistent autostart, and user lingering read-only", async (t) => {
  const calls: Call[] = [];
  const options = await createLinuxOptions(t);
  await installCurrentUnit(options);
  options.runner = async (command, args) => {
    recordCalls(calls, command, args);
    if (isUnitFileStateQuery(command, args)) return success("enabled\n");
    if (isLingerQuery(command, args)) return success("yes\n");
    if (command === SYSTEMCTL && args[0] === "--user" && args[1] === "show") {
      return managerState(options, 4242, "active");
    }
    return success();
  };
  options.readiness = async (expectedProcessId) => ({
    processId: expectedProcessId,
    instanceId: "instance-live",
    mode: "production",
  });

  const result = await runServiceCommand("status", options);

  assert.match(result, /Runtime:.*running.*PID 4242.*instance-live/i);
  assert.match(result, /Autostart:\s*enabled\b/i);
  assert.match(result, /User lingering:\s*enabled\b/i);
  assert.ok(
    calls.some(
      ({ command, args }) =>
        command === SYSTEMCTL &&
        JSON.stringify(args) ===
          JSON.stringify([
            "--user",
            "show",
            "pi-dwell.service",
            "--property=UnitFileState",
            "--value",
          ]),
    ),
    "autostart status must use the read-only UnitFileState query",
  );
  assert.ok(
    calls.some(
      ({ command, args }) =>
        command === LOGINCTL &&
        JSON.stringify(args) ===
          JSON.stringify(["show-user", String(options.userId), "--property=Linger", "--value"]),
    ),
    "lingering status must use the read-only per-user Linger query",
  );
  assert.ok(
    !calls.some(
      ({ command, args }) =>
        [SYSTEMCTL, LOGINCTL].includes(command) &&
        ["start", "stop", "restart", "enable", "disable", "set-user-linger"].some((action) =>
          args.includes(action),
        ),
    ),
    "status must not change systemd or lingering state",
  );
});

test("status distinguishes disabled and runtime-only autostart and reports disabled lingering", async (t) => {
  const options = await createLinuxOptions(t);
  await installCurrentUnit(options);
  options.readiness = async (expectedProcessId) => ({
    processId: expectedProcessId,
    instanceId: "instance-live",
    mode: "production",
  });

  for (const [unitFileState, expected] of [
    ["disabled", /Autostart:\s*disabled\b/i],
    ["enabled-runtime", /Autostart:\s*enabled-runtime\b/i],
    ["static", /Autostart:\s*static \(not persistent autostart\)/i],
    ["alias", /Autostart:\s*alias \(not persistent autostart\)/i],
    ["enabled\ndisabled", /Autostart:\s*unknown\b/i],
  ] as const) {
    options.runner = async (command, args) => {
      if (isUnitFileStateQuery(command, args)) return success(`${unitFileState}\n`);
      if (isLingerQuery(command, args)) return success("no\n");
      if (command === SYSTEMCTL && args[0] === "--user" && args[1] === "show") {
        return managerState(options, 5252, "active");
      }
      return success();
    };

    const result = await runServiceCommand("status", options);

    assert.match(result, /Runtime:.*running.*PID 5252/i);
    assert.match(result, expected);
    assert.match(result, /User lingering:\s*disabled\b/i);
  }
});

test("an upgraded unit survives reload failure and install can retry without restarting work", async (t) => {
  const options = await createLinuxOptions(t);
  await createUnitDirectory(options);
  await writeFile(unitPath(options), systemdUnit(options, true), { mode: 0o600 });
  let reloadFails = true;
  const calls: Call[] = [];
  options.runner = async (command, args) => {
    recordCalls(calls, command, args);
    if (isUnitFileStateQuery(command, args)) return success("enabled\n");
    if (isLingerQuery(command, args)) return success("yes\n");
    if (command === SYSTEMCTL && args[1] === "show") return managerState(options, 4242, "active");
    if (command === SYSTEMCTL && args[1] === "daemon-reload" && reloadFails)
      return failure("reload denied");
    return success();
  };
  await assert.rejects(
    runServiceCommand("install", options),
    /registration is saved.*reload failed/i,
  );
  assert.doesNotMatch(await readFile(unitPath(options), "utf8"), /After=default.target/);
  reloadFails = false;
  assert.match(
    await runServiceCommand("install", options),
    /already installed.*\nAutostart: enabled/,
  );
  assert.ok(
    !calls.some(({ args }) => ["stop", "restart", "enable", "disable"].includes(args[1] ?? "")),
  );
});

test("status reports unknown autostart and lingering when either state query fails", async (t) => {
  const options = await createLinuxOptions(t);
  await installCurrentUnit(options);
  options.runner = async (command, args) => {
    if (isUnitFileStateQuery(command, args)) return failure("unit-file query failed");
    if (isLingerQuery(command, args)) return failure("linger query failed");
    if (command === SYSTEMCTL && args[0] === "--user" && args[1] === "show") {
      return managerState(options, 0, "inactive");
    }
    return success();
  };

  const result = await runServiceCommand("status", options);

  assert.match(result, /Runtime:.*stopped/i);
  assert.match(result, /Autostart:\s*unknown\b/i);
  assert.match(result, /User lingering:\s*unknown\b/i);
  assert.doesNotMatch(result, /Autostart:\s*disabled\b/i);
  assert.doesNotMatch(result, /User lingering:\s*disabled\b/i);
});

test("install reports the actual existing enabled state rather than claiming startup is disabled", async (t) => {
  const options = await createLinuxOptions(t);
  options.runner = async (command, args) => {
    if (isUnitFileStateQuery(command, args)) return success("enabled-runtime\n");
    if (isLingerQuery(command, args)) return success("yes\n");
    if (command === SYSTEMCTL && args[0] === "--user" && args[1] === "show") {
      return managerNotFound();
    }
    return success();
  };

  const result = await runServiceCommand("install", options);

  assert.match(result, /Autostart:\s*enabled-runtime\b/i);
  assert.match(result, /User lingering:\s*enabled\b/i);
  assert.doesNotMatch(result, /login startup remains disabled|not enabled for login startup/i);
});

test("status and install refuse a loaded manager unit whose FragmentPath points elsewhere", async (t) => {
  const options = await createLinuxOptions(t);
  await installCurrentUnit(options);
  const differentFragment = join(options.homeDirectory, "elsewhere", "pi-dwell.service");
  options.runner = async (command, args) => {
    if (command === SYSTEMCTL && args[0] === "--user" && args[1] === "show") {
      return managerState(options, 0, "inactive", differentFragment);
    }
    return success("disabled\n");
  };

  await assert.rejects(
    runServiceCommand("status", options),
    /different systemd unit file|FragmentPath/i,
  );
  await assert.rejects(
    runServiceCommand("install", options),
    /different systemd unit file|FragmentPath/i,
  );
  assert.match(await readFile(unitPath(options), "utf8"), /Managed by pi-dwell/);
});

test("uninstall stops and waits, disables autostart, removes only its unit, then reloads without touching lingering", async (t) => {
  const calls: Call[] = [];
  const options = await createLinuxOptions(t);
  await installCurrentUnit(options);
  const dataDirectory = join(options.homeDirectory, ".local", "share", "pi-dwell");
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const retainedData = join(dataDirectory, "catalog.sqlite");
  await writeFile(retainedData, "preserve me");
  const state = { active: true };
  const finalReloadObserved = { unitAlreadyRemoved: false };
  options.runner = async (command, args) => {
    recordCalls(calls, command, args);
    if (command === SYSTEMCTL && args[0] === "--user" && args[1] === "daemon-reload") {
      if (
        calls.some(
          (call) =>
            call.command === SYSTEMCTL && call.args[0] === "--user" && call.args[1] === "disable",
        )
      ) {
        try {
          await stat(unitPath(options));
        } catch (error: unknown) {
          finalReloadObserved.unitAlreadyRemoved =
            error instanceof Error && "code" in error && error.code === "ENOENT";
        }
      }
      return success();
    }
    if (command === SYSTEMCTL && args[0] === "--user" && args[1] === "show") {
      if (args.includes("--property=UnitFileState")) return success("enabled\n");
      return managerState(options, state.active ? 6262 : 0, state.active ? "active" : "inactive");
    }
    if (command === SYSTEMCTL && args[0] === "--user" && args[1] === "stop") {
      state.active = false;
      return success();
    }
    if (command === SYSTEMCTL && args[0] === "--user" && args[1] === "disable") return success();
    if (isLingerQuery(command, args)) return success("yes\n");
    return success();
  };

  const result = await runServiceCommand("uninstall", options);
  const stopIndex = calls.findIndex(
    (call) => call.command === SYSTEMCTL && call.args[1] === "stop",
  );
  const disabledIndex = calls.findIndex(
    (call) => call.command === SYSTEMCTL && call.args[1] === "disable",
  );
  const disable = calls[disabledIndex];
  const waitIndex = calls.findIndex(
    (call, index) =>
      index > stopIndex &&
      call.command === SYSTEMCTL &&
      call.args[1] === "show" &&
      call.args.includes("--property=ActiveState"),
  );

  assert.match(result, /uninstalled/i);
  assert.ok(stopIndex >= 0, "running unit should be stopped first");
  assert.ok(waitIndex > stopIndex, "uninstall should confirm stopped state before disabling");
  assert.ok(disabledIndex > waitIndex, "autostart should be disabled only after stop completes");
  assert.deepEqual(disable?.args, ["--user", "disable", "pi-dwell.service"]);
  assert.ok(
    finalReloadObserved.unitAlreadyRemoved,
    "final daemon-reload should follow unit removal",
  );
  await assert.rejects(stat(unitPath(options)), { code: "ENOENT" });
  assert.equal(await readFile(retainedData, "utf8"), "preserve me");
  assert.ok(
    !calls.some(({ command, args }) => command === LOGINCTL && args.includes("set-user-linger")),
    "uninstall must never disable user lingering",
  );
});

test("uninstall disable failure preserves the unit and user data and reports partial completion", async (t) => {
  const calls: Call[] = [];
  const options = await createLinuxOptions(t);
  await installCurrentUnit(options);
  const originalUnit = await readFile(unitPath(options), "utf8");
  const dataDirectory = join(options.homeDirectory, ".local", "share", "pi-dwell");
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const retainedData = join(dataDirectory, "catalog.sqlite");
  await writeFile(retainedData, "preserve me");
  const state = { active: true };
  let reloadCount = 0;
  options.runner = async (command, args) => {
    recordCalls(calls, command, args);
    if (command === SYSTEMCTL && args[0] === "--user" && args[1] === "daemon-reload") {
      reloadCount += 1;
      return success();
    }
    if (command === SYSTEMCTL && args[0] === "--user" && args[1] === "show") {
      if (args.includes("--property=UnitFileState")) return success("enabled\n");
      return managerState(options, state.active ? 7373 : 0, state.active ? "active" : "inactive");
    }
    if (command === SYSTEMCTL && args[0] === "--user" && args[1] === "stop") {
      state.active = false;
      return success();
    }
    if (command === SYSTEMCTL && args[0] === "--user" && args[1] === "disable") {
      return failure("disable denied");
    }
    return success();
  };

  await assert.rejects(
    runServiceCommand("uninstall", options),
    /disable.*failed|partial|incomplete|disable denied/i,
  );

  assert.equal(await readFile(unitPath(options), "utf8"), originalUnit);
  assert.equal(await readFile(retainedData, "utf8"), "preserve me");
  assert.equal(
    calls.filter(
      ({ command, args }) =>
        command === SYSTEMCTL && args[0] === "--user" && args[1] === "daemon-reload",
    ).length,
    reloadCount,
  );
  assert.equal(reloadCount, 1, "failed disable must not continue to remove/reload the unit");
});
