# Directory and Pi model discovery

English | [简体中文](../../i18n/zh-CN/handbook/implementation/discovery.md)

[Implementation index](README.md) · [HTTP discovery overview](../http-auth.md) · [Session and storage overview](../sessions-storage.md)

Directory browsing returns canonical host-directory metadata for session setup. Model discovery inspects configured Pi models in a private temporary workspace and returns public capabilities without importing Pi core or contacting a provider.

<a id="discovery-errors-and-home"></a>
## Errors, host home, and Pi configuration location

[SessionDiscoveryError.constructor](../../../src/server/session-discovery.ts#L47) carries the status and code used by the HTTP boundary. [errnoCode](../../../src/server/session-discovery.ts#L54) narrows Node filesystem errors to a string code. [hostHomeDirectory](../../../src/server/session-discovery.ts#L60) chooses HOME, then USERPROFILE on Windows, then the operating-system home; it requires an absolute path no longer than 4096 characters and returns its resolved form. [canonicalPathForPiAgentDirectory](../../../src/server/session-discovery.ts#L72) expands only the exact tilde and tilde-slash forms. Otherwise PI_CODING_AGENT_DIR must be absolute and within the same length cap; if unset, the default is the host's .pi/agent directory.

[directoryError](../../../src/server/session-discovery.ts#L90) preserves an existing SessionDiscoveryError and maps ENOENT/ENOTDIR to invalid-directory, EACCES/EPERM to directory-unavailable with status 403, and other scan failures to a generic status 500. This mapping prevents raw OS messages from becoming the public route contract.

<a id="directory-listing"></a>
## Host directory browser

[listHostDirectories](../../../src/server/session-discovery.ts#L112) defaults to the supplied home directory and rejects non-absolute, empty, or overlong paths. It resolves the requested path with realpath and confirms it is a directory before enumeration. The selected root in the response is canonical, and parent is null only at the filesystem root.

Enumeration uses opendir and an asynchronous scan. Hidden names and names over 255 characters are skipped; regular files and symlinks to files are excluded. For a directory or directory symlink, stat confirms the target is a directory and realpath returns its canonical destination. A child that vanishes, is inaccessible, or is a broken link is skipped without failing the whole listing. Results sort by displayed name. The scan stops after 10,000 entries or 500 included directories and sets truncated; the return value is a bounded chooser, not a general file browser.

<a id="temporary-discovery-workspace"></a>
## Private temporary workspace and child environment

[createDiscoveryWorkspace](../../../src/server/session-discovery.ts#L187) creates a unique directory under the operating system temporary directory, changes its root to mode 0700, and creates separate agent, cwd, package, and session directories. It writes minimal package metadata exclusively with mode 0600. If preparation fails, it removes the partial workspace and reports a safe discovery error.

[isolatedEnvironment](../../../src/server/session-discovery.ts#L226) copies the caller's environment but redirects Pi's agent and session state into the workspace, enables offline mode, disables color, selects a dumb terminal, and removes PI_MANAGED_INSTALL_ROOT. [discoveryEnvironment](../../../src/server/session-discovery.ts#L243) adds the workspace package directory for the child that reads the copied model configuration. The initial version check uses the isolated environment without switching the caller's PI_PACKAGE_DIR; the model-list and capability children use the fully isolated package setting.

[copyPiConfiguration](../../../src/server/session-discovery.ts#L250) copies only auth.json, oauth.json, settings.json, models.json, and models-store.json when each exists. It first resolves the source with realpath, so an allowlisted symlink can lead to a regular target. It then opens the canonical target with O_NOFOLLOW, rejecting a final-component symlink introduced at that path, requires a regular file, and caps each file at 8 MiB and the total at 16 MiB. Each target is an exclusive 0600 file in the private workspace. Missing files are allowed; other read, validation, or write errors fail discovery, and every opened source handle closes in a finally block. Extensions, sessions, project data, and unrelated profile files are not copied.

<a id="global-model-list"></a>
## Global model-list subprocess

[runModelList](../../../src/server/session-discovery.ts#L293) calls execFile with the configured executable and optional entry point. It requests offline model listing and disables session loading, extensions, MCP, skills, prompt templates, themes, and context files. The child uses the temporary cwd and isolated environment, has a 15-second timeout with SIGKILL, and is limited to 1 MiB of output. No shell command is assembled.

[discoverPiModels](../../../src/server/session-discovery.ts#L434) creates the workspace before reading host profile paths, verifies the configured Pi version, and then copies the allowlisted files. When the configured entry point is Pi's rpc-entry.js, it verifies the sibling cli.js as the model-list entry point because model listing is a CLI command; the configured RPC entry point remains the runtime configuration. It parses the child output, captures a sanitized typed failure, and always removes the workspace. Cleanup failure takes precedence over the probe result or any earlier error. Unsupported Pi versions receive a specific error; process stderr and local configuration contents are not returned to callers. A missing parsed result is also an explicit failure.

<a id="model-list-parser"></a>
## Model table parsing and validation

The parser helpers share one fixed six-column contract. [modelColumnPositions](../../../src/server/session-discovery.ts#L331) finds provider, model, context, max-out, thinking, and images headings in order. [modelColumns](../../../src/server/session-discovery.ts#L343) slices each row at those positions while excluding the expected column gap. [parseModelList](../../../src/server/session-discovery.ts#L356) first strips terminal control sequences and normalizes line endings. Any line beginning with “No models available.” produces an empty list.

Otherwise, parseModelList finds a row whose sliced headers exactly match the expected names. It rejects unsupported headers, malformed rows, empty or overlong provider/model identifiers, missing context/max-out cells, and thinking/image values other than yes or no. It rejects duplicate provider-plus-model pairs and stops above 10,000 entries. The result contains provider, model ID, and image support; other details from Pi's display table are omitted.

<a id="model-capability-probe"></a>
## Per-model capability probe

[discoverPiModelCapabilities](../../../src/server/session-discovery.ts#L503) validates the provider/model request before creating temporary state. It verifies Pi, copies the allowlisted host configuration, and starts a PiProcess with the workspace cwd, session directory, environment, and isolated resource policy. It then reads Pi state and confirms the selected provider and model exactly match the request. Thinking levels and image support are queried concurrently from that same process, so both values describe one effective model selection.

The function captures process and version failures as safe public errors. In every post-start path it attempts to stop Pi before removing the workspace. A stop or workspace-removal failure becomes discovery_cleanup_failed, including when a result or another error was already available. The temporary runtime is not registered in the host session catalog.

<a id="discovery-test-evidence"></a>
## Test evidence

[session-discovery.test.ts](../../../tests/session-discovery.test.ts#L29) checks canonical directory output, visible child directories, symlink handling, and rejection of relative/missing/file paths. Its model-list tests use synthetic Pi entry points to verify version checks, offline flags, the copied-file allowlist and size boundary, sanitized failures, empty model lists, both CLI and RPC entry-point forms, and provider-free local configuration. The capability test confirms isolated Pi RPC returns thinking/image support without loading a configured extension. An integration case verifies that the session service coalesces concurrent global scans and drains discovery before shutdown.
