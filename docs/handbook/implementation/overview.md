# How Dwell hosts Pi

English | [简体中文](../../i18n/zh-CN/handbook/implementation/overview.md)

[Implementation](README.md) · [Handbook](../README.md)

<a id="reading-model"></a>

## System structure

The CLI starts or administers the Dwell host. The host runs Pi in child processes and exchanges commands and events through RPC. Browser clients send authenticated HTTP requests to the host and receive updates through SSE.

Follow the [message workflow](workflow-message.md) for a complete request, then use the [implementation index](README.md) to explore individual modules.

Source / verification: [`runCli`](../../../src/clients/cli/main.ts#L9) · [`startHost`](../../../src/server/http.ts#L102) · [`PiProcess`](../../../src/runtime/pi-process.ts#L215)

<a id="state"></a>

## Components and responsibilities

| System | Component | Responsibility | Data and state |
| --- | --- | --- | --- |
| Dwell host | [HTTP server](http.md) | Validate and route requests; serve HTTP responses and SSE streams | Listener, connections and stream writers |
| Dwell host | [Authentication service](authentication.md) | Authenticate CLI requests, pair browsers and revoke access | Credentials, browser-session records, pending pairing codes and rate limits |
| Dwell host | [Session service](sessions.md) | Start and stop Pi processes, accept requests and track execution | Pi process handles, pending operations and execution status in host memory |
| Dwell host | [Session catalog](catalog.md) | Store Pi configuration, Dwell session records and submitted turns | SQLite records containing session mappings, request IDs, outcomes and Pi entry references |
| Dwell host | [Session events](events.md) | Convert Pi output into client events and retain bounded replay | Live message/tool state, event cursors and replay buffers in host memory |
| Pi | [Pi](runtime.md) | Run the agent loop, model calls, tools and extensions; save conversations | Context in the Pi process and native JSONL session files |
| Browser | [Web client](browser-controller.md) | Submit user input and render Pi messages, tool results and progress | Drafts, attachment previews, selection and displayed content |

Source / verification: [`LocalAuth`](../../../src/server/auth.ts#L87) · [`SessionService`](../../../src/sessions/service.ts#L205) · [`SessionCatalog`](../../../src/storage/catalog.ts#L541) · [`SessionEvents`](../../../src/sessions/events.ts#L370) · [Web client](../../../src/clients/web/client.ts)

<a id="processes"></a>

## Pi sessions and processes

For each session it hosts, Dwell stores a catalog record linking its own session ID to a Pi session ID, project directory and session file when one exists. To resume the session, the host verifies the recorded directory and file, then starts Pi with that file. If an expected session file is missing, the request fails with `history_unavailable`.

The host runs Pi in independent subprocesses, retaining the Pi CLI's startup flow, process environment and resource-loading mechanisms for extension compatibility. `PiProcess` wraps the child process and its RPC connection. The [Pi process chapter](runtime.md) explains executable configuration, version checks, startup and stopping.

At startup, Dwell reads the catalog and starts Pi processes on demand. The [lifecycle workflow](workflow-lifecycle.md) follows session creation, resumption and shutdown through the relevant functions.

Source / verification: [`SessionService.createSession`](../../../src/sessions/service.ts#L506) · [`SessionService.#open`](../../../src/sessions/service.ts#L1912) · [`PiProcess.start`](../../../src/runtime/pi-process.ts#L274)

<a id="boundaries"></a>

## Request flow and recovery

When the browser submits a message, the host checks authentication, request fields and whether the session can accept work. It records the request ID and a hash of the payload for deduplication, then sends the prompt through Pi RPC. Retrying the same request ID and payload returns the existing turn. Exact routes, fields and limits are listed in [Reference](../reference.md) and [contracts](../contracts.md).

The host records `dispatching` in SQLite before sending the prompt. The database write and Pi execution are separate operations: after a crash, Dwell may be unable to determine whether Pi received the prompt or completed a tool action. Restart recovery marks unfinished turns interrupted and does not resend their prompts.

During execution, Dwell converts Pi events into bounded SSE updates. It reads saved messages and tool results from Pi's JSONL files, and records their entry IDs against the Dwell turn. The browser matches those entries to live output to avoid displaying the same content twice. A completed turn can return `result_unavailable` if its referenced saved content has been removed. The [observation workflow](workflow-observation.md) explains history reads, matching and reconnect behavior.

Pi extensions can start work without a submitted Dwell request. Dwell tracks that work using a separate native execution ID so it can report progress and target cancellation without attributing it to another request.

Source / verification: [`SessionService.submitTurn`](../../../src/sessions/service.ts#L882) · [`SessionCatalog.markTurnDispatching`](../../../src/storage/catalog.ts#L781) · [`SessionService.getTurnResult`](../../../src/sessions/service.ts#L964) · [`SessionService.#observeRuntime`](../../../src/sessions/service.ts#L1686)

<a id="terms"></a>

## Identifiers used by Dwell

| Identifier | Use |
| --- | --- |
| Dwell session ID | Look up Dwell's catalog record and address the session through HTTP |
| Pi session ID | Identify the Pi conversation associated with that record |
| Request ID | Detect a retried submission |
| `runId` | Identify the Dwell turn recorded for an accepted request |
| Native execution ID | Track Pi work initiated without a Dwell request |
| History revision | Keep pagination tied to the saved content being read |
| SSE cursor | Track event position within the current host event epoch |

The [Glossary](../glossary.md) defines related terms.

Source / verification: [src/shared/sessions.ts](../../../src/shared/sessions.ts) · [src/shared/turns.ts](../../../src/shared/turns.ts) · [src/shared/history.ts](../../../src/shared/history.ts) · [src/shared/events.ts](../../../src/shared/events.ts)
