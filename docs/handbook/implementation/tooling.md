# Build, packaging and verification machinery

English | [简体中文](../../i18n/zh-CN/handbook/implementation/tooling.md)

[Implementation](README.md) · [Handbook](../README.md)

<a id="execution"></a>

## How the repository runs

Node runs the TypeScript entry point directly using erasable syntax; the project has no emitted server bundle. TypeScript's noEmit configuration checks the server, browser, tests and scripts under strict rules. Browser modules are prepared separately by the fixed asset machinery described in [browser rendering](browser-rendering.md).

Package scripts separate linting, format verification, type checking, documentation checking and the default Node test suite. The package is private. Its files allowlist contains production source, project READMEs and both handbook editions; dependencies are pinned in package.json and the lockfile. Biome checks configured source/test/script/JSON paths and does not format these Markdown chapters. The default check path uses synthetic local fixtures rather than provider credentials.

Source / verification: [package.json](../../../package.json) · [tsconfig.json](../../../tsconfig.json) · [biome.json](../../../biome.json) · [src/clients/web/script.ts](../../../src/clients/web/script.ts)

<a id="package"></a>

## Verify the actual package file set

`check-package.mjs` lists every allowed English handbook page explicitly and derives the matching Chinese paths. It creates a temporary npm cache, runs npm pack in dry-run JSON mode with lifecycle scripts disabled, validates the returned manifest shape and rejects any file outside the source-path pattern or exact public allowlist. A second pass requires the documentation and key runtime assets to be present. The finally block removes its own temporary directory whether the check succeeds or fails.

When adding a handbook page, update the explicit list and its Chinese mirror so the package check requires both files.

Source / verification: [scripts/check-package.mjs](../../../scripts/check-package.mjs)

<a id="docs"></a>

## Verify links, source positions and explanation coverage

`check-docs.ts` recursively enumerates the two public handbook trees with `files`; their relative Markdown file sets must match. `read` loads UTF-8 files. `explicitAnchors` extracts deliberate anchor IDs, and `headingAnchors` derives heading slugs and duplicate-heading suffixes. The checker compares explicit anchors across new implementation mirrors and rejects duplicate explicit IDs.

`checkLink` resolves relative links inside the repository, checks that a target exists, verifies Markdown anchors and source line/range bounds, and skips external URLs. Marked's lexer walks actual Markdown links and images, avoiding accidental parsing of example text as a source citation. Implementation chapters permit Mermaid fences but reject source-code fences; ordinary command/payload examples remain in the usage chapters.

`callables` uses the installed TypeScript parser to enumerate named functions, body-bearing methods, constructors and accessors. Its nested `visit` tracks class/function ownership and `record` saves exact declaration lines. Both source atlases must contain each production file and exactly one explanation link for every callable, at its current source line. Removed symbols and stale line positions fail the check. Each callable citation must resolve to its own source file, and its explanation section must name the callable (or its class for a constructor); this catches links to unrelated existing sections. Anonymous callbacks and arrow locals remain covered in the owning operation's prose.

Review behavioral explanations and translations against the implementation and tests as part of [documentation maintenance](coverage.md#verification).

Source / verification: [scripts/check-docs.ts](../../../scripts/check-docs.ts) · [Source atlas](../source-map.md)

<a id="pi-check"></a>

## Check the selected installed Pi binary

`check-pi.ts` accepts one absolute Pi executable or an absolute Node executable plus an absolute Pi entry point. Invalid/extra arguments produce usage and a nonzero exit code. It starts the runtime test file in a child Node process with a 60-second file-level budget and passes the selected paths through test-only environment variables. Individual tests still retain their own timeouts.

The child inherits standard IO. An error reports that tests could not start; SIGINT/SIGTERM handlers forward TERM, and the exit callback removes handlers and propagates the exit code. This checks the chosen binary through synthetic runtime fixtures; the default suite uses the pinned dependency. Live provider checks are separate.

Source / verification: [scripts/check-pi.ts](../../../scripts/check-pi.ts) · [tests/runtime.test.ts](../../../tests/runtime.test.ts) · [tests/fixtures/pi-environment.ts](../../../tests/fixtures/pi-environment.ts)

<a id="browser-check"></a>

## Real-browser verification infrastructure

`check-web.ts` runs a real headless Chrome against a temporary Dwell host and synthetic Pi environment. It selects HTTP, HTTPS or both, creates test model/configuration files and host directories, launches Chrome with a temporary profile and connects to its debugging WebSocket. The HTTPS fixture terminates local TLS and forwards to the loopback host; it does not test a user's remote network.

`record` validates decoded objects. `BrowserPage.constructor` routes response IDs to pending commands and accumulates Runtime.exceptionThrown events. `open` enables Page, Runtime and Network domains. `call` allocates an ID, installs a 15-second timeout, sends the command and clears timeout on completion. `evaluate` awaits JavaScript results by value and surfaces exception details; `until` polls a predicate for at most 20 seconds and emits diagnostic UI state on timeout. `click` and `type` drive DOM interactions, with type dispatching an input event.

Layout helpers cover composer, sidebar labels/widths, new-session heading, action icons and status/close geometry. `assertQuietProcessPresentation` checks thinking/tool presentation, multiline commands and disclosure focus/scroll behavior. `assertSavedRendererCacheAndImageGeneration` checks node reuse and stale image callbacks; `assertOlderAssistantGroupScrollAnchor` checks older-message expansion. `assertNoPartialOrRecoveryRow` rejects leftover recovery presentation. `assertInputGrows` and `checkMobileKeyboard` inspect textarea and viewport behavior. `stagePngImages` creates actual PNG fixtures through canvas and dispatches a file-selection change; `saveScreenshotIfRequested` writes screenshots only when configured.

The scenario body covers pairing, session creation/selection, plain/image prompts, model/thinking changes, rendering, reconnect, close/reopen, host restart and revocation. The finally path closes debugging sockets, terminates Chrome with bounded escalation, closes host/proxy and removes its temporary Pi environment. Browser tests cover synthetic interactions in headless Chrome. Physical-device keyboard and viewport behavior require device testing.

Source / verification: [scripts/check-web.ts](../../../scripts/check-web.ts) · [tests/fixtures/https-proxy.ts](../../../tests/fixtures/https-proxy.ts) · [tests/fixtures/pi-environment.ts](../../../tests/fixtures/pi-environment.ts)

<a id="test-map"></a>

## How to read the test suite

The [test atlas](../test-map.md) names each test file and statically named scenario. HTTP tests exercise loopback admission; catalog tests exercise durable constraints; runtime tests exercise subprocess/protocol boundaries; browser reducer and renderer tests isolate state/DOM behavior. Recovery fixtures deliberately stop owners at recorded transition points. Synthetic fixture processes can send malformed, early or interrupted protocol events that would be difficult to reproduce with a live provider.

Read the behavior explanation, then follow the test link to inspect the scenario's assertions and fixtures. Add boundary checks when introducing new behavior.

Source / verification: [tests/fixtures/turn-owner.ts](../../../tests/fixtures/turn-owner.ts) · [tests/turn-recovery.test.ts](../../../tests/turn-recovery.test.ts) · [tests/runtime-failure.test.ts](../../../tests/runtime-failure.test.ts)
