# Development and verification

English | [简体中文](../i18n/zh-CN/handbook/development.md)

[Documentation index](README.md) · [Source atlas](source-map.md) · [Test atlas](test-map.md)

## Repository layout

| Path | Role |
| --- | --- |
| `src/cli.ts` | Executable entry point |
| `src/clients/cli/` | Administrative command parsing, dispatch and local HTTP client |
| `src/clients/web/` | HTML/CSS, browser module serving, transport, state, rendering and interactions |
| `src/server/` | HTTP routes, origin/authentication policy, SSE and discovery |
| `src/sessions/` | Session/turn coordination, event projection and saved history projection |
| `src/runtime/` | External Pi supervision, JSONL RPC, native history and identity |
| `src/storage/` | SQLite catalog and durable turn ledger |
| `src/shared/` | Shared data contracts and runtime validators |
| `src/local/` | Private paths and filesystem operations |
| `src/service/` | launchd/systemd user-service adapter |
| `tests/` | Node tests and synthetic subprocess/provider fixtures |
| `scripts/` | Package, installed-Pi and browser acceptance checks |
| `docs/` | Public documentation and translated README |

The [source atlas](source-map.md) inventories every source file and its named declarations. The [test atlas](test-map.md) lists each test file, fixture, and statically named scenario so coverage can be explored without guessing from filenames.

## Toolchain and configuration

[`package.json`](../../package.json) declares an ESM private package, MIT license, Node >=22.19.0, exact dependency pins, and command scripts. [`package-lock.json`](../../package-lock.json) locks the transitive graph. `marked` is the runtime Markdown parser; Pi packages are development dependencies for exact-version tests/types, while hosted execution uses an externally configured Pi binary.

[`.npmrc`](../../.npmrc) sets exact dependency saving, disables lifecycle scripts, and disables automatic audit/funding output. Use `npm ci --ignore-scripts` for a lockfile-based installation. This repository defines no npm publication workflow.

[`tsconfig.json`](../../tsconfig.json) uses NodeNext module resolution, explicit `.ts` imports, no emit, strict checking, erasable syntax only, unchecked-index protection, exact optional properties, unused-symbol checks, and JS checking for scripts. Node executes the TypeScript directly; browser modules are stripped and rewritten by the Web asset module.

[`biome.json`](../../biome.json) covers source, tests, scripts and root JSON; it uses two-space indentation, a 100-character line width, double quotes and semicolons. `npm run check:docs` checks handbook links, anchors, source positions and explanation coverage.

[`.gitignore`](../../.gitignore) excludes dependencies, build/test outputs, local agent guidance and runtime/credential paths. Public documentation belongs in `docs/`; private agent instructions and operational records remain outside the public package.

## Commands and what they establish

| Command | What it checks or runs |
| --- | --- |
| `npm run lint` | Biome lint with warnings treated as errors |
| `npm run format:check` | Read-only Biome formatting check |
| `npm run typecheck` | TypeScript no-emit checking |
| `npm test` | Node's `tests/*.test.ts` suite |
| `npm run check` | All four checks above, sequentially |
| `npm run format` | Rewrites formatted files; use deliberately |
| `npm run check:package` | Dry-run package contents against the public-file boundary |
| `npm run check:pi -- /absolute/path/to/pi` | Offline compatibility against an installed standalone Pi |
| `npm run check:pi -- /absolute/path/to/node /absolute/path/to/pi-cli.js` | Same compatibility using a Node entry point |
| `npm run check:web -- /absolute/path/to/chrome` | Real browser acceptance with synthetic host/Pi fixtures, HTTP and HTTPS |

The default check needs no provider access or credentials. Browser and installed-binary checks are separate because they require external executables. Interactive Dwell sessions are different: they use the configured Pi environment and can call providers/tools.

## The three verification scripts

[`check-package.mjs`](../../scripts/check-package.mjs) runs npm pack in dry-run JSON mode with lifecycle scripts disabled and a temporary cache. It validates every returned path against the allowlist and asserts required files. Its temporary directory is removed in a finally block. It checks packaging without publishing.

[`check-pi.ts`](../../scripts/check-pi.ts) requires one absolute executable and an optional absolute entry point, then spawns the runtime test file with fixture environment overrides. The file has a 60-second runner budget, while individual scenarios retain their own timeouts. SIGINT is forwarded to the child. Offline fixtures verify the installed binary's protocol compatibility without contacting a provider account.

[`check-web.ts`](../../scripts/check-web.ts) drives a real Chrome process through the DevTools WebSocket protocol. It starts isolated fixtures, pairs through real HTTP/HTTPS pages, exercises conversation/model/image/stream/lifecycle behavior, and uses temporary browser profiles. An optional executable positional argument overrides the macOS Chrome default. `--http` or `--https` selects one mode; without either, both run. `DWELL_WEB_SCREENSHOT_DIR` optionally saves acceptance screenshots. Use a local destination outside the repository for private test artifacts.

## Reading tests by boundary

| Area | Starting tests |
| --- | --- |
| Entry point and client protocol | `cli`, `runtime-cli`, `host` |
| Authentication/origins/service ownership | `auth`, `access`, `service`, `service-boot` |
| Catalog and lifecycle | `catalog`, `sessions`, `sessions-http`, `turn-catalog` |
| Turn execution and recovery | `turns`, `turns-http`, `turn-recovery`, `native-executions` |
| RPC/runtime/model registry | `runtime`, `runtime-failure`, `pi-models`, `session-models`, `session-discovery` |
| Native and projected history | `pi-history`, `pi-history-budget`, `history`, `history-service`, `history-http`, `history-context`, `history-cancellation` |
| Events and streaming | `events`, `events-http`, `session-events`, `web-events` |
| Browser rendering and images | `web`, `web-client`, `conversation`, `images`, `images-http` |

Names above omit `.test.ts`. The complete [test atlas](test-map.md) includes scenarios and links, including fixtures for deterministic Pi failures, extension-handled input, native follow-ups, owner death, and HTTPS proxy behavior.

## Make a behavior change

1. Define the observable behavior and relevant boundary cases. Read the owning chapter, source, contracts and existing tests.
2. Add or adjust a targeted failing behavior test before implementation. Use real loopback sockets or subprocesses where that boundary is what matters.
3. Implement in the module that owns the decision. Keep untrusted values `unknown` until validated; update shared contracts when the wire representation changes.
4. Run the targeted test, then `npm run check`. Run package checks when contents change, installed-Pi checks for RPC compatibility, and browser acceptance for browser integration changes.
5. Review the diff and update user-facing behavior, API reference and internals together. Record synthetic acceptance and live provider/device acceptance separately.

For example, image admission spans shared validation, HTTP body bounds, turn payload identity, browser previews, Pi prompt projection and saved-image reads. Trace that path and update each affected boundary.

## Maintain the documentation

Keep task explanations in Guide/Tutorials, exact contracts in Reference, and implementation rationale in Internals. Link between them and define each limit at its authoritative location. Recheck duplicated compatibility requirements against their defining constants.

English pages in `docs/handbook/` have matching Simplified Chinese pages in `docs/i18n/zh-CN/handbook/` with the same filenames. Update both editions when behavior changes. Chinese prose retains important concepts and code identifiers in English. Keep the page-level language switches and explicit original-heading anchors intact so translated headings preserve cross-page links. The package check requires both editions of every listed handbook page.

The source and test atlases are snapshots of current declarations and test names. Refresh affected entries and line anchors whenever code moves, and verify coverage against the files under `src/` and `tests/`. A source line anchor is a navigation aid; the source at the current revision remains authoritative.

Run `npm run check:docs` to validate both handbook file sets, local links and anchors, source line positions, and callable-to-explanation coverage. The [implementation coverage page](implementation/coverage.md) explains the maintenance contract; [tooling](implementation/tooling.md) explains the checker.
