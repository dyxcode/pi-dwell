# Implementation coverage 与维护

[English](../../../../handbook/implementation/coverage.md) | 简体中文

[Implementation](README.md) · [Handbook](../README.md)

<a id="scope"></a>

## 覆盖范围

Production inventory 包含 43 个 TypeScript files、592 个带 body 的具名 callable declarations：functions、methods、constructors 与 accessors。[Source atlas](../source-map.md) 在两种语言中将每个 callable 链接到具体 explanation section 和 declaration line。三个没有具名 callable 的 files 仍覆盖其 top-level startup、HTML/CSS 或 browser asset construction。Types、fields 与 constants 保留索引，并结合所属操作与 shared contracts 解释。

Anonymous callbacks 和 arrow locals 放在所属 function/lifecycle 中解释。External dependencies 解释到 Dwell boundary。

<a id="files"></a>

## Production file coverage

| Source | Callables | 文字解释章节 |
| --- | ---: | --- |
| [src/cli.ts](../../../../../src/cli.ts) | 0 | [cli](cli.md) |
| [src/clients/cli/arguments.ts](../../../../../src/clients/cli/arguments.ts) | 4 | [cli](cli.md) |
| [src/clients/cli/main.ts](../../../../../src/clients/cli/main.ts) | 1 | [cli](cli.md) |
| [src/clients/cli/runtime.ts](../../../../../src/clients/cli/runtime.ts) | 2 | [cli](cli.md) |
| [src/clients/cli/status.ts](../../../../../src/clients/cli/status.ts) | 5 | [cli](cli.md) |
| [src/clients/web/attachments.ts](../../../../../src/clients/web/attachments.ts) | 11 | [browser-input](browser-input.md) |
| [src/clients/web/client.ts](../../../../../src/clients/web/client.ts) | 67 | [browser-controller](browser-controller.md) |
| [src/clients/web/conversation.ts](../../../../../src/clients/web/conversation.ts) | 23 | [browser-rendering](browser-rendering.md) |
| [src/clients/web/dom.ts](../../../../../src/clients/web/dom.ts) | 6 | [browser-rendering](browser-rendering.md) |
| [src/clients/web/events.ts](../../../../../src/clients/web/events.ts) | 33 | [browser-events](browser-events.md) |
| [src/clients/web/icons.ts](../../../../../src/clients/web/icons.ts) | 2 | [browser-rendering](browser-rendering.md) |
| [src/clients/web/input.ts](../../../../../src/clients/web/input.ts) | 2 | [browser-input](browser-input.md) |
| [src/clients/web/markdown.ts](../../../../../src/clients/web/markdown.ts) | 5 | [browser-rendering](browser-rendering.md) |
| [src/clients/web/page.ts](../../../../../src/clients/web/page.ts) | 0 | [browser-rendering](browser-rendering.md) |
| [src/clients/web/script.ts](../../../../../src/clients/web/script.ts) | 0 | [browser-rendering](browser-rendering.md) |
| [src/clients/web/tool-command.ts](../../../../../src/clients/web/tool-command.ts) | 3 | [browser-rendering](browser-rendering.md) |
| [src/clients/web/transport.ts](../../../../../src/clients/web/transport.ts) | 6 | [browser-controller](browser-controller.md) |
| [src/local/files.ts](../../../../../src/local/files.ts) | 5 | [cli](cli.md) |
| [src/local/paths.ts](../../../../../src/local/paths.ts) | 4 | [cli](cli.md) |
| [src/runtime/message-identity.ts](../../../../../src/runtime/message-identity.ts) | 3 | [history](history.md) |
| [src/runtime/pi-history-budget.ts](../../../../../src/runtime/pi-history-budget.ts) | 5 | [history](history.md) |
| [src/runtime/pi-history.ts](../../../../../src/runtime/pi-history.ts) | 22 | [history](history.md) |
| [src/runtime/pi-models.ts](../../../../../src/runtime/pi-models.ts) | 1 | [runtime](runtime.md) |
| [src/runtime/pi-process.ts](../../../../../src/runtime/pi-process.ts) | 43 | [runtime](runtime.md) |
| [src/runtime/pi-rpc.ts](../../../../../src/runtime/pi-rpc.ts) | 9 | [rpc](rpc.md) |
| [src/server/access.ts](../../../../../src/server/access.ts) | 3 | [authentication](authentication.md) |
| [src/server/auth.ts](../../../../../src/server/auth.ts) | 15 | [authentication](authentication.md) |
| [src/server/http.ts](../../../../../src/server/http.ts) | 10 | [http](http.md) |
| [src/server/session-discovery.ts](../../../../../src/server/session-discovery.ts) | 16 | [discovery](discovery.md) |
| [src/server/sse.ts](../../../../../src/server/sse.ts) | 10 | [http](http.md) |
| [src/service/service.ts](../../../../../src/service/service.ts) | 42 | [services](services.md) |
| [src/sessions/events.ts](../../../../../src/sessions/events.ts) | 60 | [events](events.md) |
| [src/sessions/history.ts](../../../../../src/sessions/history.ts) | 15 | [history](history.md) |
| [src/sessions/service.ts](../../../../../src/sessions/service.ts) | 62 | [sessions](sessions.md) |
| [src/shared/discovery.ts](../../../../../src/shared/discovery.ts) | 6 | [validators](validators.md) |
| [src/shared/events.ts](../../../../../src/shared/events.ts) | 13 | [validators](validators.md) |
| [src/shared/history.ts](../../../../../src/shared/history.ts) | 9 | [validators](validators.md) |
| [src/shared/images.ts](../../../../../src/shared/images.ts) | 7 | [validators](validators.md) |
| [src/shared/protocol.ts](../../../../../src/shared/protocol.ts) | 1 | [validators](validators.md) |
| [src/shared/sessions.ts](../../../../../src/shared/sessions.ts) | 4 | [validators](validators.md) |
| [src/shared/thinking.ts](../../../../../src/shared/thinking.ts) | 4 | [validators](validators.md) |
| [src/shared/turns.ts](../../../../../src/shared/turns.ts) | 6 | [validators](validators.md) |
| [src/storage/catalog.ts](../../../../../src/storage/catalog.ts) | 47 | [catalog](catalog.md) |

<a id="verification"></a>

## Tooling、tests 与维护

[Tooling](tooling.md) 解释 package checks、documentation checker、installed-Pi checks 与 real-browser acceptance machinery。[Development](../development.md) 说明怎样运行 checks，[test atlas](../test-map.md) 定位 tests 与 synthetic fixtures。上述 symbol count 覆盖 production source，不包含 test suite 或 verification scripts 中的 declarations。

Behavior change 时更新 workflow、所属 module explanation、需要变化的 contracts、source/test citations 与 Chinese mirror。Declaration 移动时更新 atlas line；function 新增或删除时更新 explanation mapping。用 `npm run check:docs` 检查 navigation/coverage，用 targeted behavior checks 验证 correctness，public contents 改变时运行 `npm run check:package`。Doc checker 验证本地 navigation 与 callable mappings。Behavioral explanations 和翻译需要对照 implementation 与 tests 复核。
