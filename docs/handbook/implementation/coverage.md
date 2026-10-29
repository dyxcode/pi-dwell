# Implementation coverage and maintenance

English | [简体中文](../../i18n/zh-CN/handbook/implementation/coverage.md)

[Implementation](README.md) · [Handbook](../README.md)

<a id="scope"></a>

## What is covered

The production inventory contains 43 TypeScript files and 592 named callable declarations: functions, methods, constructors and accessors with bodies. The [source atlas](../source-map.md) links each callable to a concrete explanation section and its declaration line in both editions. The three files without named callable declarations are still covered for top-level startup, HTML/CSS or browser asset construction. Types, fields and constants remain indexed and are explained with their owning operation and the shared contracts.

Anonymous callbacks and arrow locals are explained in their owning function or lifecycle. External dependencies are covered at Dwell's boundary.

<a id="files"></a>

## Production file coverage

| Source | Callables | Prose chapter |
| --- | ---: | --- |
| [src/cli.ts](../../../src/cli.ts) | 0 | [cli](cli.md) |
| [src/clients/cli/arguments.ts](../../../src/clients/cli/arguments.ts) | 4 | [cli](cli.md) |
| [src/clients/cli/main.ts](../../../src/clients/cli/main.ts) | 1 | [cli](cli.md) |
| [src/clients/cli/runtime.ts](../../../src/clients/cli/runtime.ts) | 2 | [cli](cli.md) |
| [src/clients/cli/status.ts](../../../src/clients/cli/status.ts) | 5 | [cli](cli.md) |
| [src/clients/web/attachments.ts](../../../src/clients/web/attachments.ts) | 11 | [browser-input](browser-input.md) |
| [src/clients/web/client.ts](../../../src/clients/web/client.ts) | 67 | [browser-controller](browser-controller.md) |
| [src/clients/web/conversation.ts](../../../src/clients/web/conversation.ts) | 23 | [browser-rendering](browser-rendering.md) |
| [src/clients/web/dom.ts](../../../src/clients/web/dom.ts) | 6 | [browser-rendering](browser-rendering.md) |
| [src/clients/web/events.ts](../../../src/clients/web/events.ts) | 33 | [browser-events](browser-events.md) |
| [src/clients/web/icons.ts](../../../src/clients/web/icons.ts) | 2 | [browser-rendering](browser-rendering.md) |
| [src/clients/web/input.ts](../../../src/clients/web/input.ts) | 2 | [browser-input](browser-input.md) |
| [src/clients/web/markdown.ts](../../../src/clients/web/markdown.ts) | 5 | [browser-rendering](browser-rendering.md) |
| [src/clients/web/page.ts](../../../src/clients/web/page.ts) | 0 | [browser-rendering](browser-rendering.md) |
| [src/clients/web/script.ts](../../../src/clients/web/script.ts) | 0 | [browser-rendering](browser-rendering.md) |
| [src/clients/web/tool-command.ts](../../../src/clients/web/tool-command.ts) | 3 | [browser-rendering](browser-rendering.md) |
| [src/clients/web/transport.ts](../../../src/clients/web/transport.ts) | 6 | [browser-controller](browser-controller.md) |
| [src/local/files.ts](../../../src/local/files.ts) | 5 | [cli](cli.md) |
| [src/local/paths.ts](../../../src/local/paths.ts) | 4 | [cli](cli.md) |
| [src/runtime/message-identity.ts](../../../src/runtime/message-identity.ts) | 3 | [history](history.md) |
| [src/runtime/pi-history-budget.ts](../../../src/runtime/pi-history-budget.ts) | 5 | [history](history.md) |
| [src/runtime/pi-history.ts](../../../src/runtime/pi-history.ts) | 22 | [history](history.md) |
| [src/runtime/pi-models.ts](../../../src/runtime/pi-models.ts) | 1 | [runtime](runtime.md) |
| [src/runtime/pi-process.ts](../../../src/runtime/pi-process.ts) | 43 | [runtime](runtime.md) |
| [src/runtime/pi-rpc.ts](../../../src/runtime/pi-rpc.ts) | 9 | [rpc](rpc.md) |
| [src/server/access.ts](../../../src/server/access.ts) | 3 | [authentication](authentication.md) |
| [src/server/auth.ts](../../../src/server/auth.ts) | 15 | [authentication](authentication.md) |
| [src/server/http.ts](../../../src/server/http.ts) | 10 | [http](http.md) |
| [src/server/session-discovery.ts](../../../src/server/session-discovery.ts) | 16 | [discovery](discovery.md) |
| [src/server/sse.ts](../../../src/server/sse.ts) | 10 | [http](http.md) |
| [src/service/service.ts](../../../src/service/service.ts) | 42 | [services](services.md) |
| [src/sessions/events.ts](../../../src/sessions/events.ts) | 60 | [events](events.md) |
| [src/sessions/history.ts](../../../src/sessions/history.ts) | 15 | [history](history.md) |
| [src/sessions/service.ts](../../../src/sessions/service.ts) | 62 | [sessions](sessions.md) |
| [src/shared/discovery.ts](../../../src/shared/discovery.ts) | 6 | [validators](validators.md) |
| [src/shared/events.ts](../../../src/shared/events.ts) | 13 | [validators](validators.md) |
| [src/shared/history.ts](../../../src/shared/history.ts) | 9 | [validators](validators.md) |
| [src/shared/images.ts](../../../src/shared/images.ts) | 7 | [validators](validators.md) |
| [src/shared/protocol.ts](../../../src/shared/protocol.ts) | 1 | [validators](validators.md) |
| [src/shared/sessions.ts](../../../src/shared/sessions.ts) | 4 | [validators](validators.md) |
| [src/shared/thinking.ts](../../../src/shared/thinking.ts) | 4 | [validators](validators.md) |
| [src/shared/turns.ts](../../../src/shared/turns.ts) | 6 | [validators](validators.md) |
| [src/storage/catalog.ts](../../../src/storage/catalog.ts) | 47 | [catalog](catalog.md) |

<a id="verification"></a>

## Tooling, tests and maintenance

[Tooling](tooling.md) explains package checks, the documentation checker, installed-Pi checks and real-browser acceptance machinery. [Development](../development.md) explains how to run checks; the [test atlas](../test-map.md) maps tests and synthetic fixtures. The symbol count above covers production source, not declarations inside the test suite or verification scripts.

For a behavior change, update its workflow, owning module explanation, contracts where needed, source/test citations and Chinese mirror. If a declaration moves, update its atlas line; if a function is added or removed, add or remove its explanation mapping. Run `npm run check:docs` for navigation/coverage, the targeted behavior checks for correctness, and `npm run check:package` when public contents change. The doc checker validates local navigation and callable mappings. Review behavioral explanations and translations against the implementation and tests.
