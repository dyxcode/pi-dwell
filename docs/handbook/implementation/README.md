# Implementation handbook

English | [简体中文](../../i18n/zh-CN/handbook/implementation/README.md)

[Implementation](README.md) · [Handbook](../README.md)

<a id="start"></a>

## Understand the implementation

Start with [the running system](overview.md), follow one complete workflow, then explore the module responsible for the step you want to understand. These chapters explain current implementation in prose: input, decisions, state changes, outcomes, failure paths and cleanup. Source citations open the relevant declarations.

Use [Reference](../reference.md) for exact public interfaces and [contracts](../contracts.md) for field/limit lookup. Use [coverage](coverage.md) and the [source atlas](../source-map.md) to find the explanation for a particular file or function.

<a id="workflows"></a>

## Follow a complete workflow

| Read | Follow the state changes |
| --- | --- |
| [Startup and session lifetime](workflow-lifecycle.md) | CLI → listener → pairing → session creation → model/images → close/reopen → shutdown |
| [One message](workflow-message.md) | Browser request → admission → durable intent → RPC → settlement → saved result, including interruption points |
| [Observation and reconnect](workflow-observation.md) | Subscription → live projection → saved branch → reconciliation → reconnect/resync |

For a first reading, finish the message workflow before opening individual module chapters. The overview distinguishes Pi and its session files from Dwell's process management, request records and browser client.

<a id="modules"></a>

## Explore responsibilities and functions

| Chapter | Responsibilities |
| --- | --- |
| [CLI and local files](cli.md) | Command parsing, local HTTP administration, paths and permissions |
| [Operating-system services](services.md) | Registration ownership, readiness, boot and stop behavior |
| [HTTP and SSE transport](http.md) | Admission, route dispatch, bounded bodies, streaming and shutdown |
| [Authentication and authority](authentication.md) | Pairing, credential state, browser binding and HTTPS authority |
| [Directory and model discovery](discovery.md) | Directory listing, isolated probes and capability extraction |
| [Shared data and validation](validators.md) | Field checks, identities, image decoding and event/history contracts |
| [Catalog and durable records](catalog.md) | Schema validation, migrations, transactions and turn transitions |
| [Session coordination](sessions.md) | Pi process management, request acceptance, dispatch, cancellation and recovery |
| [Pi process and execution](runtime.md) | Launch, readiness, prompt disposition, native execution and stop |
| [JSONL RPC transport](rpc.md) | Correlation, buffering, deadlines and transport failure |
| [Reading Pi session files](history.md) | Branch reading, scan budgets, identity, cursors and images |
| [Session events](events.md) | Visible messages/tools, replay, limits and subscriptions |
| [Browser coordination](browser-controller.md) | Session views, async generations, pending requests and model selection |
| [Browser event state](browser-events.md) | SSE decoding, reducer state and live/saved reconciliation |
| [Rendering and assets](browser-rendering.md) | Markdown, DOM reuse, conversation grouping, HTML/CSS and asset serving |
| [Composer and attachments](browser-input.md) | Keyboard/viewport behavior, draft ownership and image previews |
| [Build and verification machinery](tooling.md) | Package contents, documentation checks, Pi and Chrome acceptance |

<a id="citations"></a>

## How to use source and verification citations

Relative links open the source in the same checkout or repository view. A `#L…` anchor identifies the inspected declaration or behavior; GitHub supports line navigation, while some local Markdown viewers only open the file. Symbol names remain visible so you can search if a viewer ignores the line anchor. Citations near a helper group may point to the start of that group; the source atlas provides each declaration's own line and its explanation section.

Verification links point to related tests and the [test atlas](../test-map.md). When code changes, update the prose, source positions and both language editions together. See [coverage and maintenance](coverage.md#verification) for the checks to run.
