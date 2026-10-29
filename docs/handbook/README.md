# Pi Dwell documentation

English | [简体中文](../i18n/zh-CN/handbook/README.md)

Use Dwell, understand its behavior, and follow its implementation from browser controls to Pi execution and saved history. Choose a section according to what you want to do.

## Quick Start

[Install, pair, and send your first message](quick-start.md). Start here if you have not run Dwell before.

## Guide

[Features and everyday use](guide.md): host directories, sessions, models and thinking, images, saved conversations, context, cancellation, reconnecting, and current limitations.

## Tutorials

[Step-by-step workflows](tutorials.md): return to a conversation, change models, send images, stop and reopen sessions, and trace a feature through the code.

## Examples

[Reusable recipes](examples.md): foreground/development modes, health checks, revocation, logs, targeted checks, and an example turn payload.

<a id="internals"></a>

## Implementation

[Read the implementation handbook](implementation/README.md) to understand the running system, follow complete workflows, and explore module/function behavior in prose. Source and test citations link each explanation to its implementation and checks.

| Reading route | Start here |
| --- | --- |
| Understand the system | [Processes, ownership and state](implementation/overview.md) |
| Follow a workflow | [One message](implementation/workflow-message.md), [startup/session lifetime](implementation/workflow-lifecycle.md), [observation/reconnect](implementation/workflow-observation.md) |
| Explore a module | [Responsibility-based module chapters](implementation/README.md#modules) |
| Find a function | [Source and explanation atlas](source-map.md) |
| Check coverage | [43 production files and callable coverage](implementation/coverage.md) |

The [system overview](system.md), [CLI/service](cli-service.md), [HTTP/authentication](http-auth.md), [sessions/storage](sessions-storage.md), [runtime](runtime.md), and [browser](web-client.md) chapters provide compact orientation and reference. The implementation handbook explains each workflow and module in detail.

## Reference

| Page | Contents |
| --- | --- |
| [Commands and configuration](reference.md) | Complete CLI grammar, state locations, optional HTTPS origin, and reference navigation |
| [HTTP API](http-auth.md#complete-route-map) | Every route, method, authentication requirement, input and response behavior |
| [Data contracts](contracts.md) | Shared types, validation, state values and resource limits |
| [Error reference](errors.md) | Error codes, meaning, diagnostics and recovery guidance |
| [Glossary](glossary.md) | Pi/Dwell terminology and distinctions between related concepts |

## Development

[Development and verification](development.md) explains repository layout, configuration, scripts, checks and the change workflow. The [test and fixture atlas](test-map.md) indexes every test file, synthetic fixture and statically named test scenario.

## Scope and maintenance

The documentation covers current Dwell source and its user-facing capabilities. Node.js 22.19+ and Pi 1.4.0 are the implemented compatibility requirements. The browser conversation client and administrative CLI are available; an interactive Dwell TUI, scheduled tasks and domain integrations remain future work.

Guide and Tutorials explain tasks; Reference defines exact interfaces; Implementation explains workflows, module logic and callable behavior in prose. Function bodies remain in source files, reached through citations and the source atlas. External dependencies are documented at Dwell's boundary.

Update affected sections together when behavior changes, and refresh source/test atlas anchors when declarations move.
