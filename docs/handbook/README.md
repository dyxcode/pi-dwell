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

[Read by feature](implementation/README.md). Each chapter independently explains responsibilities, data ownership, the complete flow, internal mechanisms, technology trade-offs and verification scenarios.

| Feature to understand | Start here |
| --- | --- |
| Create, return to and name a conversation | [Session lifecycle](implementation/session-lifecycle.md), [shared names](implementation/session-names.md) |
| Send, stop and reconnect | [Send a message](implementation/send-message.md), [stop work](implementation/stop-work.md), [reconnect](implementation/reconnect.md) |
| Read content and manage history | [History and context](implementation/saved-history.md), [Library](implementation/library.md), [history cleanup](implementation/history-retirement.md) |

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

The documentation covers current Dwell source and its user-facing capabilities. Node.js 22.19+ and Pi 1.4.0 are the implemented compatibility requirements. The browser conversation client and administrative CLI are available; Current Library and Distill storage coordination are optional integrations; an interactive Dwell TUI and scheduled tasks remain future work.

Guide and Tutorials explain tasks; Reference defines exact interfaces; Implementation explains how each feature works. The source atlas connects declarations to their feature context.

Update affected sections together when behavior changes, and refresh source/test atlas anchors when declarations move.
