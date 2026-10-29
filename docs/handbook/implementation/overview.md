# Understand the running system

English | [简体中文](../../i18n/zh-CN/handbook/implementation/overview.md)

[Implementation](README.md) · [Handbook](../README.md)

<a id="reading-model"></a>

## A map of responsibility

Dwell is a host process around an external Pi coding-agent runtime. The CLI starts or administers the host; a browser sends authenticated HTTP commands and observes SSE. `SessionService` coordinates runtime ownership and records durable metadata. Pi performs model/tool work and writes its native conversation files. Browser rendering is a projection of those records and live events.

Follow the [message workflow](workflow-message.md) for one complete vertical path, then read the relevant module pages in the [implementation index](README.md).

Source / verification: [`startHost`](../../../src/server/http.ts#L102) · [`SessionService`](../../../src/sessions/service.ts#L205) · [`PiProcess`](../../../src/runtime/pi-process.ts#L215)

<a id="processes"></a>

## Processes and lifetimes

The host owns its HTTP listener, authentication service, catalog connection, session coordination, live event buffers and supervised Pi children. A child corresponds to an open hosted Pi session; a browser tab does not own that child. Multiple browser connections can observe the same host state. Closing a browser stops observation, while closing a session releases its runtime and preserves saved state.

Process state and durable session state differ. A catalog row can be ready while its runtime is closed. After a host restart, runtimes are opened lazily and interrupted prompts remain interrupted. A service manager can restart Dwell; current execution state comes from the new host process. The implemented HTTP API reports task scheduling unavailable.

Source / verification: [`SessionService.#view`](../../../src/sessions/service.ts#L1514) · [`SessionService.#open`](../../../src/sessions/service.ts#L1912) · [`isHostStatus`](../../../src/shared/protocol.ts#L14)

<a id="state"></a>

## Four kinds of state

| State | Authority | What it can establish |
| --- | --- | --- |
| Catalog and turn ledger | Dwell SQLite | Session/request identities, configuration, lifecycle, cancellation intent and recorded outcomes |
| Conversation and branches | Pi JSONL | Saved messages, tools, branch ancestry and context evidence |
| Runtime and live event projection | Current host process | What is currently running and what observers can replay within bounded memory |
| Drafts and presentation | Browser | Unsent input, attachment drafts, selected views and local interaction state |

A ledger row stores references to saved entries, not a copy of their text or images. A completed outcome and readable result content are separate facts. SSE is bounded observation, not a transcript archive. Browser state cannot declare a turn completed or roll back a tool effect.

The SQLite transaction that records dispatch intent cannot atomically include an external process or Pi JSONL append. Dwell therefore records interruption and unknown outcome after a crash. Native Pi extensions can execute work outside a Dwell turn; those executions retain their own ephemeral identities.

Source / verification: [`SessionCatalog.markTurnDispatching`](../../../src/storage/catalog.ts#L781) · [`SessionService.getTurnResult`](../../../src/sessions/service.ts#L964) · [`SessionService.#observeRuntime`](../../../src/sessions/service.ts#L1686)

<a id="boundaries"></a>

## Inputs cross validation and ownership boundaries

A browser input first crosses local interaction rules, then transport, HTTP admission, shared runtime validation, service ownership checks, catalog constraints and the Pi protocol. Each layer checks a distinct condition: JSON shape, authorization, session existence, idle ownership, dispatch and execution outcome.

The host delegates provider calls and the agent loop to the full Pi runtime. Installed Pi version 1.4.0 is an explicit compatibility boundary. Session resources come from Pi's native loading rules; isolated probes use separate restrictions. Exact route/field/limit lookup remains in [Reference](../reference.md) and [contracts](../contracts.md); module explanations show where those rules are applied.

Source / verification: [`startHost`](../../../src/server/http.ts#L102) · [`isTurnCreateRequest`](../../../src/shared/turns.ts#L85) · [`verifyPiConfiguration`](../../../src/runtime/pi-process.ts#L172)

<a id="terms"></a>

## Identities and related terms

A Dwell session ID identifies host metadata; a Pi session ID identifies native conversation identity. A request ID deduplicates submission; a runId identifies a recorded Dwell turn; native execution IDs identify observed Pi work without a corresponding request. A history revision identifies saved content for pagination, while an SSE cursor identifies position within a host event epoch. A model context is the input Pi currently uses; saved history is the persisted branch shown to the user.

The [Glossary](../glossary.md) provides the shorter lookup form.

Source / verification: [src/shared/sessions.ts](../../../src/shared/sessions.ts) · [src/shared/turns.ts](../../../src/shared/turns.ts) · [src/shared/history.ts](../../../src/shared/history.ts) · [src/shared/events.ts](../../../src/shared/events.ts)
