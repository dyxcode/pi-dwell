# OS service management

English | [简体中文](../../i18n/zh-CN/handbook/implementation/services.md)

[Implementation index](README.md) · [CLI and service overview](../cli-service.md) · [Development reference](../development.md)

The service adapter manages one production user service through macOS launchd or Linux systemd. It generates a registration from explicit executable paths, verifies that the manager refers to that exact registration, and checks authenticated host readiness before it reports a successful start. Installation does not enable login startup; uninstall removes the service registration but preserves Dwell data and user lingering.

<a id="service-command-and-paths"></a>
## Command contract and path resolution

[runServiceCommand](../../../src/service/service.ts#L983) accepts only the six SERVICE_ACTIONS and dispatches after resolving a complete ServicePaths record. [ServiceCommandOptions](../../../src/service/service.ts#L58) exposes internal test seams for platform, home, executable, entry point, user ID, command runner, readiness probe, and polling limits; these are not CLI options. Restart verifies the current registration before stopping and starting the service. A known legacy Linux registration must be upgraded before restart.

[defaultRunner](../../../src/service/service.ts#L96) calls execFile with argument arrays, a five-second timeout, a 128 KiB output cap, and no shell. It normalizes process failures to a result containing exit code and captured output. [validatePath](../../../src/service/service.ts#L119) requires absolute paths without control characters and resolves dot segments. [resolvePaths](../../../src/service/service.ts#L130) supports only darwin and linux, resolves and checks the current-user-owned home directory, validates executable and entry-point paths, derives the production data, registration, log, and manager targets, applies validateDataDirectory to local destinations, and validates positive startup/polling durations. Its default readiness callback queries the authenticated local host status; injected runners and callbacks let tests exercise manager behavior without changing public command syntax.

<a id="safe-service-directories"></a>
## Service directory checks

[ensureDirectories](../../../src/service/service.ts#L197) walks each path component with lstat. It rejects symlinks, non-directories, and components owned by another user. Missing components are created only when requested, and an EEXIST race is re-read and checked. Every component must allow owner read/write/search; designated final macOS application-support and log directories must also be private 0700.

[ensureServiceDirectories](../../../src/service/service.ts#L255) chooses the macOS Application Support and Logs trees or Linux systemd user-unit tree. The Linux systemd directory is checked for owner access but is not forced to the private-directory rule used for Dwell-specific macOS directories. The registration file itself is still created privately.

<a id="registration-generation"></a>
## Generated launchd and systemd registrations

The generator group keeps serialization separate from installation. [plistEscape](../../../src/service/service.ts#L275) escapes XML text. [systemdQuote](../../../src/service/service.ts#L279) escapes backslashes, quotes, percent specifiers, and—when serializing command arguments—dollar expansion. [launchAgentContent](../../../src/service/service.ts#L285) emits the fixed Node, entry-point, and serve arguments; working directory; HOME; private stdout/stderr log paths; RunAtLoad; restart-on-unsuccessful-exit; and a five-second throttle. Writing a plist does not bootstrap it into launchd.

[systemdUnitContent](../../../src/service/service.ts#L329) emits Type=simple, HOME, ExecStart, restart-on-failure, five-second restart delay, ten-second stop timeout, journal output, start-rate limits, and WantedBy=default.target. It does not enable the unit or impose ordering after default.target. WorkingDirectory follows systemd's scalar grammar, so the current form escapes percent and appends /. to preserve trailing spaces and backslashes. [registrationContent](../../../src/service/service.ts#L360) selects the platform generator. [isLegacyRegistration](../../../src/service/service.ts#L364) recognizes the exact known older Linux unit forms.

<a id="registration-ownership"></a>
## Registration ownership, updates, and race handling

[fileOpenFlags](../../../src/service/service.ts#L372) uses read-only, no-follow, and nonblocking flags so a symlink or FIFO cannot redirect or hang an inspection. [readPrivateRegistration](../../../src/service/service.ts#L376) treats a missing path as absent; otherwise it requires a private, current-user-owned, single-link regular file with owner-read permission. It bounds both stat size and actual bytes read at 64 KiB and always closes the handle.

[upgradeRegistration](../../../src/service/service.ts#L418) writes a random exclusive 0600 sibling, syncs it, rereads the previous registration to detect concurrent replacement, atomically renames the new content, syncs the parent directory, and removes any leftover temporary path. [writePrivateRegistration](../../../src/service/service.ts#L450) accepts an exact current registration or exact known legacy content. It refuses unrelated content before mutation. For Linux, it checks the loaded manager identity before keeping or replacing a registration, before first creation, and again when another installer wins the exclusive-create race with identical content. A different file path or a conflicting create race aborts before daemon-reload.

[verifyRegistration](../../../src/service/service.ts#L506) first verifies the directory chain, then returns absent/current/legacy only after exact content comparison. Operations such as status and stop may inspect a known legacy unit; start and restart require the current generated version. That distinction allows safe inspection and stop while requiring an explicit install upgrade before future starts.

<a id="manager-command-adapter"></a>
## Manager command adapter and Linux boot state

[run](../../../src/service/service.ts#L527) forwards a fixed command and argument list to the injected runner. [commandError](../../../src/service/service.ts#L535) chooses stderr, then stdout, then exit code for its diagnostic. [runRequired](../../../src/service/service.ts#L542) throws that diagnostic for any nonzero result. [reloadLinuxManager](../../../src/service/service.ts#L552) runs daemon-reload only on Linux.

[unknownSetting](../../../src/service/service.ts#L557) maps an informational query failure to a bounded “unknown” report. [linuxAutostart](../../../src/service/service.ts#L562) reads systemd UnitFileState and distinguishes enabled, disabled, runtime-only enablement, non-persistent states, and invalid/failed queries. [linuxLingering](../../../src/service/service.ts#L596) reads logind's Linger value and likewise reports query failures as unknown. [linuxBootStatus](../../../src/service/service.ts#L613) runs these independent read-only queries concurrently and combines their results. Neither status reporting nor install changes lingering or enables autostart.

<a id="manager-identity-inspection"></a>
## Manager identity checks

[inspectLinux](../../../src/service/service.ts#L618) asks systemd for LoadState, FragmentPath, MainPID, and ActiveState. It rejects duplicate properties, missing or malformed values, and a FragmentPath other than the exact expected registration. A missing unit returns undefined. The legacy-repair path accepts bad-setting only when the registered file is the expected one and the unit is inactive with PID zero.

[parseLaunchdRegistration](../../../src/service/service.ts#L675) extracts path, program, argument lines, PID, and state from launchctl output; its local value reader handles each scalar field, while absent state falls back to running or idle based on PID. [validateLaunchdIdentity](../../../src/service/service.ts#L700) requires the exact registration path, executable, and three arguments. [inspectMac](../../../src/service/service.ts#L714) runs launchctl print, recognizes the manager's missing-service response, and validates every loaded identity before returning state.

[managerProcessIsRunning](../../../src/service/service.ts#L727) requires a positive PID and the platform's active state name. [inspectManager](../../../src/service/service.ts#L732) dispatches to the correct adapter. These checks avoid treating a same-named foreign unit or LaunchAgent as Dwell.

<a id="readiness-and-start"></a>
## Start and authenticated readiness

[readReadiness](../../../src/service/service.ts#L736) delegates to the configured readiness probe. [validateReadyIdentity](../../../src/service/service.ts#L744) requires the HTTP host's process ID to equal the manager PID, requires production mode, and requires a nonempty instance ID. Manager state alone is insufficient evidence that the expected Dwell process owns the fixed listener.

[waitForReady](../../../src/service/service.ts#L757) polls until the startup deadline. Once the manager reports a running process, it performs the authenticated HTTP check with the remaining time, validates identity, and remembers the latest readiness issue if a retry is needed. It sleeps for the lesser of the configured interval and remaining deadline, then reports the last issue on timeout.

[startService](../../../src/service/service.ts#L784) verifies a current registration and prepares required directories before manager operations. Linux reloads systemd, then both adapters inspect the current state. macOS bootstraps an unloaded job or kickstarts a loaded non-running one; Linux starts only a non-running unit. An already running service is checked for readiness but not restarted. If startup or readiness fails after this invocation started the service, it attempts an owned stop; cleanup failure is reported alongside the original error. A service that was running before the command is not stopped on a failed readiness check.

<a id="stop-uninstall-and-status"></a>
## Stop, install, uninstall, and status

[waitForStopped](../../../src/service/service.ts#L832) polls until launchd no longer reports the job, or Linux reports PID zero with inactive/failed state. [stopService](../../../src/service/service.ts#L851) requires an owned registration (including known legacy content), reloads Linux if needed, and targets only launchctl bootout or systemctl stop for that exact manager identity. It never kills an arbitrary PID. It returns false when the owned registration is not loaded.

[removeRegistration](../../../src/service/service.ts#L866) rereads content immediately before unlink and removes only the current or exact known legacy registration. [install](../../../src/service/service.ts#L877) validates generated content, creates safe directories, writes or upgrades the owned file, and reloads Linux. A reload failure leaves the saved registration in place and reports that install can be retried. Install does not start/restart the process or enable autostart; Linux reports the actual autostart and lingering state, while macOS reports that login autostart is not enabled and does not report whether the registration is currently loaded.

[uninstall](../../../src/service/service.ts#L904) stops and waits first. On Linux it rechecks registration ownership before disabling autostart, then removes the registration and reloads the manager. Each failure explains the completed stage and preserves later state where possible. It leaves the Dwell data directory and user lingering unchanged. [runtimeStatus](../../../src/service/service.ts#L939) reports launchd/systemd service state together with authenticated Dwell host readiness: unloaded, stopped, failed, activating, deactivating, other not-ready states, ready, or process-running but host-not-ready. Readiness failures appear in the status text and do not make the command fail. [status](../../../src/service/service.ts#L974) combines that service status with Linux boot settings and a legacy-upgrade hint.

<a id="service-test-evidence"></a>
## Test evidence

[service.test.ts](../../../tests/service.test.ts#L69) covers generated files and permissions, path escaping, isolation failures, ownership, FIFO and hard-link defenses, readiness identity, startup cleanup, platform manager commands, and removal. [service-boot.test.ts](../../../tests/service-boot.test.ts#L167) covers Linux ordering, foreign-unit refusal, exclusive-create races, atomic legacy upgrades, parser acceptance of special working-directory characters, live boot-state reporting, partial failures, and uninstall ordering. The tests inject manager responses and use temporary directories; they do not install a real user service.
