# CLI, local files, and OS services

English | [简体中文](../i18n/zh-CN/handbook/cli-service.md)

Detailed prose walkthrough: [Implementation](implementation/cli.md).

[Documentation index](README.md) · [Command reference](reference.md)

## Entry point and command grammar

[`src/cli.ts`](../../src/cli.ts) passes `process.argv.slice(2)` into `runCli`, catches unknown failures, prints one prefixed error, and sets exit status 1. It does not install a service or start a provider implicitly.

[`arguments.ts`](../../src/clients/cli/arguments.ts) returns a discriminated `Command` union. Missing arguments mean `serve`; help works at the top level and supported command prefixes. `parseOptions` separates named values and positionals, rejects repeated options, and validates the single `--dev` flag. `requiredValue` rejects empty values; `absolutePath` requires absolute executable and entry-point paths.

Service commands accept exactly one of install, uninstall, start, stop, restart, or status. They always target production. `pi configure` accepts only named executable/entry-point options and optional `--dev`. The remaining commands accept only optional `--dev`; there is no public port or data-directory override and no session-management CLI.

[`main.ts`](../../src/clients/cli/main.ts) dispatches the parsed command. Status/configuration results print as JSON; pairing prints the code and expiry; service management prints its status text. Foreground serving dynamically imports the HTTP host and installs SIGINT/SIGTERM handlers. A signal received during startup is remembered and acted on after startup finishes. An occupied port becomes an actionable error explaining the fixed listener and mode collision.

## Local HTTP client

[`status.ts`](../../src/clients/cli/status.ts) implements `localRequest`: read the private credential, construct the loopback URL, serialize POST bodies, use an abort deadline, reject redirects, and return parsed unknown JSON. GET bodies are rejected locally. The default request timeout is three seconds.

A timeout warns that the host may already have completed the operation. Network errors include the address and startup command. A 401 explains development/production credential mismatch. Non-JSON and error responses are handled separately. `errorMessage` extracts only a valid public message; each wrapper validates its expected response: HostStatus, pairing code/expiry, or `{ok:true}`.

[`runtime.ts`](../../src/clients/cli/runtime.ts) raises configuration's deadline to at least 60 seconds because executable verification can take longer than status. It POSTs `/api/v1/runtime` and validates the returned RuntimeConfiguration. The service requires open sessions to be closed before configuration changes.

## Data path and private-file rules

[`local/paths.ts`](../../src/local/paths.ts) selects `~/.local/share/pi-dwell` or `~/.local/share/pi-dwell-dev`. `canonicalDestination` resolves existing ancestors even when the final destination does not yet exist. `validateDataDirectory` rejects locations inside the home Obsidian vault and walks ancestors looking for `.git` or `.obsidian`, so aliases cannot bypass repository/vault isolation. `hasCode` safely narrows filesystem errors.

[`local/files.ts`](../../src/local/files.ts) centralizes storage operations:

| Function | Contract |
| --- | --- |
| `prepareDataDirectory` | Canonicalize, create with 0700, require a directory owned by the current user with exactly owner-only permissions |
| `readPrivateFile` | Open read-only with NOFOLLOW and NONBLOCK; require a single-link regular file, current owner, exactly 0600, at most 1 MiB |
| `createPrivateFile` | Exclusive NOFOLLOW creation at 0600, write, sync, and close |
| `replacePrivateFile` | Validate existing file, write/sync a unique private temporary sibling, rename, sync parent, clean temporary file |
| `readCredential` | Read existing state and validate a 64-hex credential |

Unsafe existing paths are rejected and left unchanged. Atomic replacement provides a coherent file update; it does not span SQLite, JSON files, and Pi side effects in one transaction.

## Service configuration and injected test seams

[`service/service.ts`](../../src/service/service.ts) is the OS-service adapter. `runServiceCommand` resolves paths and dispatches one action. `ServiceCommandOptions` allows tests to inject platform, home, executable, entry point, user ID, command runner, readiness probe, and polling deadlines. These are internal TypeScript seams, not CLI flags.

`resolvePaths` accepts macOS and Linux only. It verifies an absolute home owned by the user, absolute executable and entry-point paths without control characters, the user ID, and positive polling parameters. It validates state, registration, and log destinations against local isolation rules.

| Platform | Registration | Manager identity | Output |
| --- | --- | --- | --- |
| macOS | `~/Library/Application Support/Pi Dwell/io.pi-dwell.host.plist` | `gui/<uid>/io.pi-dwell.host` | `~/Library/Logs/Pi Dwell/host.stdout.log` and `host.stderr.log` |
| Linux | `~/.config/systemd/user/pi-dwell.service` | `pi-dwell.service` in the user manager | systemd journal |

`ensureDirectories` checks every path component with lstat, rejects symlinks and foreign ownership, verifies owner access, and requires private final directories where appropriate. Creation races are rechecked. `ensureServiceDirectories` applies the platform-specific directory layout.

## Generated registrations

`launchAgentContent` emits a plist with explicit Node/entry-point/serve arguments, HOME, working directory and log paths. It uses RunAtLoad, restart after unsuccessful exit, and a five-second throttle. The registration is outside LaunchAgents; installation alone does not establish login autostart. `plistEscape` protects XML values.

`systemdUnitContent` emits Type=simple, explicit HOME, ExecStart, working directory, restart-on-failure, five-second restart delay, ten-second stop timeout, journal output, and WantedBy=default.target. It permits five starts per 60 seconds. Installation registers the file without enabling boot startup or user lingering.

`systemdQuote` handles command quoting, percent expansion, and optional dollar escaping. WorkingDirectory is a scalar with different parsing rules: the current implementation uses an unquoted value, escapes `%`, and appends `/.` to protect trailing spaces/backslashes. Legacy registrations are recognized by exact old generated content; arbitrary similar files are not considered owned.

## Ownership before mutation

`readPrivateRegistration` opens without following symlinks and requires a private, owner-readable, single-link regular file owned by the current user. It checks both stat size and actual read length against 64 KiB.

`writePrivateRegistration` accepts an exact current file or an exact known legacy file. For Linux, it inspects the loaded manager identity before first creation, before upgrading, and again if another installer wins exclusive creation with identical content. A matching file does not authorize managing a foreign loaded unit.

`upgradeRegistration` writes and syncs a private temporary file, rechecks the previous contents, atomically renames, syncs the directory, and cleans up. `verifyRegistration` compares exact generated content and can allow a known legacy file for selected operations. `removeRegistration` repeats ownership/content checks immediately before unlinking.

`inspectLinux` parses LoadState, FragmentPath, MainPID, and ActiveState, rejects duplicate fields, and requires the expected registration path. A legacy bad-setting unit is repairable only when inactive with PID zero. `inspectMac` parses launchctl output and verifies registration path, executable, and every argument through `validateLaunchdIdentity`. Neither adapter treats a same-named foreign process as Dwell.

## Start, readiness, stop, and uninstall

`defaultRunner` invokes manager commands through execFile with a five-second deadline and 128 KiB output cap. `runRequired` converts failed exit codes into manager-specific errors. No shell command string is evaluated.

`startService` verifies registration, prepares required directories, reloads Linux's manager, and inspects current state. It bootstraps or kickstarts launchd, or starts systemd, only as needed. `waitForReady` polls every 150 ms within a ten-second startup budget. A manager-reported running PID is insufficient: authenticated HTTP status must match that PID, production mode, and a nonempty instance identity.

If a command started the service and readiness fails, it attempts to stop that service. It does not stop an already-running service merely because its readiness check failed. Cleanup failures are included alongside the original startup error.

`stopService` verifies ownership, reloads Linux's manager, and uses bootout or systemctl stop. `waitForStopped` waits for the registration to be unloaded on macOS or an inactive/failed PID-zero unit on Linux. `restart` performs an owned stop followed by start.

`uninstall` stops the service, rechecks registration before disabling Linux autostart, removes only the owned registration, and reloads the manager. It preserves Dwell data and reports partial failures with the stage already completed. It does not disable user lingering, which is a user-manager setting shared with other services.

## Reporting state

`runtimeStatus` distinguishes installed/unloaded, stopped, failed, starting, stopping, running-but-not-ready, and running-and-ready. `linuxAutostart` interprets UnitFileState, distinguishing persistent enabled from runtime-only enablement. `linuxLingering` queries logind. Failed informational boot queries are reported as unknown.

`status` combines runtime, autostart, lingering, and a legacy-registration upgrade hint. `install` reports created/updated/unchanged separately and does not restart an existing process when updating registration.

## Tests to read

[cli.test.ts](../../tests/cli.test.ts) exercises parsing and command behavior; [runtime-cli.test.ts](../../tests/runtime-cli.test.ts) covers configured executable requests; [service.test.ts](../../tests/service.test.ts) covers injected platform managers and identity/readiness checks; [service-boot.test.ts](../../tests/service-boot.test.ts) covers Linux ordering, migration, boot-state reports and parser behavior. [host.test.ts](../../tests/host.test.ts) and [auth.test.ts](../../tests/auth.test.ts) exercise state and credential boundaries through the host.
