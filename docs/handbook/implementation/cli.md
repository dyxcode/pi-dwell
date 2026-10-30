# CLI, local files, and data paths

English | [简体中文](../../i18n/zh-CN/handbook/implementation/cli.md)

[Implementation index](README.md) · [CLI and service overview](../cli-service.md) · [Command reference](../reference.md)

The CLI parses administrative commands and sends host operations through its HTTP client. It reads existing local credentials and keeps Dwell state outside repositories and the Obsidian vault. Only foreground serve loads the server module.

<a id="command-parsing"></a>
## Command grammar and validation

[parseOptions](../../../src/clients/cli/arguments.ts#L17) separates named option values from positionals and recognizes one optional --dev flag. It rejects repeated flags/options, missing values, unknown options, and unsupported positionals at the caller. A value beginning with two dashes is treated as a missing option value. [requiredValue](../../../src/clients/cli/arguments.ts#L47) rejects absent or whitespace-only required values; [absolutePath](../../../src/clients/cli/arguments.ts#L54) rejects relative executable paths.

[parseCommand](../../../src/clients/cli/arguments.ts#L59) returns a discriminated command union. No arguments mean production serve. Top-level and supported command-level help are read-only. Service accepts exactly one of install, uninstall, start, stop, restart, or status. Pi configure accepts only executable, optional entry-point, and optional --dev. The auth revoke spelling is retained as an alias; session CRUD commands and public port, host, and data-directory overrides are not accepted. Service actions always use production paths.

<a id="command-dispatch"></a>
## CLI dispatch and foreground host

[runCli](../../../src/clients/cli/main.ts#L9) parses before reading any state. Help prints the command surface and exits. Service commands delegate directly to runServiceCommand. Other commands choose the production/development data path and then dispatch status, pairing, browser revocation, or Pi executable configuration through the CLI HTTP client. Status and configuration print validated JSON; pairing prints the short code and expiry; revoke prints confirmation without printing the durable bearer credential.

Only the serve branch dynamically imports startHost, keeping administrative subcommands separate from server and SQLite loading. It installs SIGINT and SIGTERM handlers before awaiting startup. The nested shutdown callback remembers a signal received before the host value is available, closes the host once startup completes, reports shutdown failure, and removes both handlers after close settles. A listener collision is converted to an actionable message that names the fixed port and production/development collision. [src/cli.ts](../../../src/cli.ts#L3) is the top-level module: it passes process arguments to runCli, prints one prefixed error for a rejected command, and sets exit status 1.

<a id="local-http-client"></a>
## Authenticated local HTTP client

[localRequest](../../../src/clients/cli/status.ts#L11) first reads the existing private auth-token, then builds a request to 127.0.0.1 at the selected fixed/default port. POST bodies serialize as JSON, with an omitted body represented by an empty object; GET bodies fail locally. Fetch uses an abort deadline, rejects redirects, and sends JSON accept/authentication headers without placing the bearer token in a URL.

Timeouts explicitly say the host may have completed the operation, so the caller should inspect state before retrying. Network errors name the local address and startup commands. A 401 explains production/development credential mismatch. A successful HTTP status still must contain parseable JSON; non-JSON, malformed public errors, and incompatible success data are reported separately. [errorMessage](../../../src/clients/cli/status.ts#L86) extracts only a nonempty string from the public error.message field.

The typed wrappers keep each command's expected response narrow. [readHostStatus](../../../src/clients/cli/status.ts#L101) validates HostStatus. [createPairing](../../../src/clients/cli/status.ts#L107) validates the eight-character pairing alphabet and safe integer expiry. [revokeBrowsers](../../../src/clients/cli/status.ts#L126) requires an object whose ok field is true. [configurationOptions](../../../src/clients/cli/runtime.ts#L6) raises Pi executable configuration requests to at least 60 seconds because executable verification can take longer than status. [configureRuntime](../../../src/clients/cli/runtime.ts#L13) POSTs the Pi executable configuration and validates the response with the shared RuntimeConfiguration validator.

<a id="data-directory-policy"></a>
## Data directory selection and isolation

[dataDirectory](../../../src/local/paths.ts#L7) selects ~/.local/share/pi-dwell for production and ~/.local/share/pi-dwell-dev for development. [hasCode](../../../src/local/paths.ts#L11) safely checks an unknown filesystem error's code. [canonicalDestination](../../../src/local/paths.ts#L15) resolves the existing portion of a destination; when the final path does not exist, it recursively resolves its parent and appends the last component. This makes the isolation check work before directory creation and across parent symlinks.

[validateDataDirectory](../../../src/local/paths.ts#L27) canonicalizes the requested path before creating anything. It rejects the Obsidian vault itself or any descendant, then walks every ancestor and refuses a path under a .git or .obsidian marker. Service registration and log destinations reuse this validation. [prepareDataDirectory](../../../src/local/files.ts#L7) then creates the selected directory recursively with mode 0700 and checks with lstat that the final path is a current-user-owned directory with exactly owner-only permissions.

<a id="private-file-operations"></a>
## Private credential and state files

[readPrivateFile](../../../src/local/files.ts#L17) opens read-only with O_NOFOLLOW and O_NONBLOCK. It requires a single-link regular file owned by the current user with exactly mode 0600 and no more than 1 MiB, then closes the handle in finally. It rejects symlinks, FIFOs, hard links, broad permissions, oversized files, and foreign owners; the existing file remains unchanged.

[createPrivateFile](../../../src/local/files.ts#L38) uses exclusive creation, O_NOFOLLOW, and mode 0600, writes UTF-8 content, syncs the file, and closes it even after failure. [replacePrivateFile](../../../src/local/files.ts#L52) first validates the existing destination, writes and syncs a unique private sibling, renames it over the destination, syncs the parent directory, and removes any leftover temporary file. The replacement is atomic for that one file; it does not transact with SQLite or Pi's session files.

[readCredential](../../../src/local/files.ts#L70) reads auth-token through the same private-file checks, trims the stored newline, and requires exactly 64 lowercase hexadecimal characters. It reads existing state only. A missing token produces a setup-oriented error; a malformed or unsafe token is preserved and reported.

<a id="cli-test-evidence"></a>
## Test evidence

[cli.test.ts](../../../tests/cli.test.ts#L23) verifies read-only help, separate production/development paths, rejected removed commands and multi-instance flags, authenticated status/pair/revoke, and real child-process signal/port behavior. [runtime-cli.test.ts](../../../tests/runtime-cli.test.ts#L89) checks parser boundaries, the authenticated configure request, and malformed or failed server responses. [auth.test.ts](../../../tests/auth.test.ts#L46) checks private initialization, persistent credentials, and rejection of repository/vault data destinations including symlink aliases.
