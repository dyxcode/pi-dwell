# Host service

English | [简体中文](../../i18n/zh-CN/handbook/implementation/host-service.md)

[Implementation handbook](README.md) · [Documentation](../README.md)

<a id="behavior"></a>

## Behavior

Dwell runs as one host process on a fixed loopback listener. It can run in the foreground or under the current user's macOS launchd or Linux systemd user service. Service administration installs, starts, checks, restarts, stops, and uninstalls that background host. Starting Dwell does not require a project directory, model choice, or Pi configuration; those are required only for a Pi session.

Production and development use separate local state directories but share the listener, so they cannot run together. Service administration always targets production. Optional browser access through a local HTTPS proxy is configured separately.

<a id="ownership"></a>

## Ownership

The command-line layer routes service actions to the OS adapter. The adapter owns a registration only when its contents and manager identity match the current Dwell checkout. launchd or systemd owns the background process and its restart policy. Dwell owns its private data, SQLite catalog, Pi runtime configuration, and session processes.

The service registration records absolute paths to Node and the Dwell entry point. Moving either requires reinstalling it. Pi's provider credentials and profile settings must be available in the service manager's environment; an interactive shell's environment is not copied into the background service.

<a id="execution"></a>

## Execution

1. Dwell acquires the loopback listener before opening persistent state. A competing host fails before it can write to the shared data directory.
2. Installation validates user-owned paths and writes a private OS registration. Linux reloads its user manager. Installation does not create Dwell's data directory, start the host, or enable login or boot startup.
3. Start asks the manager to launch the registered process, then checks authenticated readiness. The host must report the manager's process identity and production mode before start succeeds.
4. Stop targets the verified registration. Dwell closes streams, rejects new work, drains admitted operations, shuts down Pi children and storage, then releases the listener. Restart performs this stop/start sequence.
5. Uninstall stops the service first. Linux disables the unit before removing its registration. Both platforms preserve Dwell data and Linux lingering settings.

<a id="mechanisms"></a>

## Mechanisms

Private directories and registration files are checked for current-user ownership, safe file type, and restrictive permissions. Dwell compares registration content and the manager's loaded path with its expected service before acting. It refuses unrelated registrations; a matching install is idempotent, and an exact older Linux registration can be atomically upgraded. A manager reload failure leaves the saved registration available for retry.

Starting an already-running service checks readiness without restarting it. If a service started by the current request never becomes ready, Dwell attempts to stop that service; a previously running instance remains untouched. Stop waits for the manager to report completion and never kills an arbitrary process. Status combines manager state with authenticated host readiness. Linux reports boot autostart and lingering separately; unavailable queries are shown as unknown. Linux also restarts a failed process with backoff.

<a id="technology"></a>

## Technology

The host uses Node's built-in HTTP and SQLite facilities and runs Pi as a child process. OS user services provide background execution without requiring elevated host privileges. Manager calls use fixed executable paths and argument lists, with no shell command construction. Exact registration checks matter because a service manager can load a same-named unit from another file.

The platforms have different startup settings. macOS installation creates a user registration without enabling login startup. Linux installation reloads systemd but leaves boot enablement to the user; surviving logout also depends on user lingering. These states remain separate from whether the service is installed or ready.

<a id="verification"></a>

## Verification

- Installing on either platform creates a private registration for the current Node executable and checkout. Repeating installation leaves it unchanged and does not start Dwell or enable startup.
- A same-named manager entry that points elsewhere is not operated on or replaced.
- A running process with mismatched identity, development mode, or an unready host fails the readiness check. Cleanup applies only to a service newly started by that request.
- Stop waits for the owned service and leaves unrelated processes alone. Uninstall removes its registration after stop while preserving data and Linux lingering.
- Linux status distinguishes runtime readiness, boot autostart, and lingering; a failed query for one setting does not hide the others.
