# Follow live events, saved history and reconnect

English | [简体中文](../../i18n/zh-CN/handbook/implementation/workflow-observation.md)

[Implementation](README.md) · [Handbook](../README.md)

<a id="subscribe"></a>

## Subscribe without taking ownership

Selecting a session starts an authenticated event connection and independent history reads. The server installs a subscription around a current snapshot and bounded replay, and the client validates each frame before applying it. An observer cannot acquire the right to cancel execution merely by disconnecting. Extension UI requests also do not become approved because a passive observer received them.

The SSE writer frames JSON with event IDs, sends heartbeat comments, respects output backpressure and closes slow or revoked connections. The browser reducer tracks session, epoch and sequence. Stale or duplicate frames must not replay visible changes. A frame belonging to a different active run can advance the cursor while its live payload is discarded, preserving stream position without changing the visible projection. A selection generation prevents an old asynchronous connection from writing into the new selection.

Source / verification: [`SessionService.subscribeEvents`](../../../src/sessions/service.ts#L442) · [src/server/sse.ts](../../../src/server/sse.ts) · [src/clients/web/events.ts](../../../src/clients/web/events.ts) · [tests/events-http.test.ts](../../../tests/events-http.test.ts) · [tests/web-events.test.ts](../../../tests/web-events.test.ts)

<a id="projection"></a>

## Build a bounded live projection

Pi records are projected into session/turn updates, message blocks and tool progress. The event hub clips bounded visible strings and tool collections, records truncation and limits replay retention. Thinking text and ordinary text retain their content order, while private provider signatures are not projected. Live tool identity includes ownership so two assistant messages reusing a tool call ID do not collapse into one.

The client applies valid deltas to its local projection and batches rendering on animation frames. Keyed DOM reconciliation retains compatible nodes, open disclosures, selection and image callbacks. A growing message can update its visible content without rebuilding the entire conversation. The projection stays in memory; saved history supplies durable content.

Source / verification: [src/sessions/events.ts](../../../src/sessions/events.ts) · [src/clients/web/conversation.ts](../../../src/clients/web/conversation.ts) · [src/clients/web/dom.ts](../../../src/clients/web/dom.ts) · [tests/conversation.test.ts](../../../tests/conversation.test.ts) · [tests/web-events.test.ts](../../../tests/web-events.test.ts)

<a id="saved"></a>

## Read the persisted branch

History reads validate the saved file's identity, session header and directory and enforce scan budgets. The reader follows the last persisted leaf through parent relationships, not every line in chronological file order. A trailing incomplete record is reported rather than treated as a complete entry. Message fingerprints plus occurrence counts distinguish identical repeated messages; tool ownership follows the corresponding assistant identity.

`HistoryPages` projects bounded display entries, signed cursors and context evidence. A cursor binds pagination to the source/revision, byte prefix and page boundary index so an altered branch or replaced file cannot silently continue the old view. Append-aware handling can retain a stable older page where the implementation proves the previous page boundary still belongs. Callers assess completeness from the result's truncation, incomplete-tail and coverage fields.

Source / verification: [`readSavedHistory`](../../../src/runtime/pi-history.ts#L336) · [`HistoryPages.read`](../../../src/sessions/history.ts#L380) · [tests/pi-history.test.ts](../../../tests/pi-history.test.ts) · [tests/history.test.ts](../../../tests/history.test.ts)

<a id="reconcile"></a>

## Replace live content only with matching saved evidence

During execution a message or tool result may appear both in live projection and a saved page. Reconciliation uses native message identities and scoped tool identities, rather than display text alone, to replace corresponding items. Identical text from distinct native occurrences remains distinct. An unfinished live tool can keep its current progress until its saved result is readable.

After settlement, the client may still need further history reads. It retains uncovered live work and schedules bounded recovery instead of clearing it merely because the turn is terminal. Server coverage flags identify the terminal turn/native execution whose expected content is proven present on the saved branch. The client also keeps active execution counts separate from older baselines, preventing a completed predecessor from hiding a new follow-up.

A history deletion or unprovable result is exposed as unavailable/partial evidence. The recorded durable outcome is preserved.

Source / verification: [`renderConversation`](../../../src/clients/web/client.ts#L1060) · [`loadHistory`](../../../src/clients/web/client.ts#L1286) · [`SessionService.getHistory`](../../../src/sessions/service.ts#L741) · [tests/session-events.test.ts](../../../tests/session-events.test.ts) · [tests/history-service.test.ts](../../../tests/history-service.test.ts)

<a id="reconnect"></a>

## Reconnect, resync and browser wake-up

The server supports reconnect with a last-known event cursor. If a caller supplies one and the server retains its epoch and sequence range, it can replay bounded events. The current browser clears its cursor after stream failure and on wake-up, so those recovery paths request a fresh snapshot and reload history rather than relying on replay. A stale/ahead cursor, a new epoch or a replay limit produces resync, which asks the client to rebuild its observation from fresh state. Saved history is fetched separately; a new snapshot is not the entire transcript.

Page wake-up and refresh restore connectivity and selected-session views without replaying a prompt. Authentication failure returns the browser to pairing; a network outage preserves recoverable local state and retries observation. Late responses are checked against selection/generation so switching sessions does not display another session's history. The distinction between retrying observation and submitting new work is the key invariant across refresh, reconnect and host restart.

Source / verification: [`stream`](../../../src/clients/web/client.ts#L1399) · [`resume`](../../../src/clients/web/client.ts#L2273) · [src/sessions/events.ts](../../../src/sessions/events.ts) · [tests/events.test.ts](../../../tests/events.test.ts) · [tests/web-events.test.ts](../../../tests/web-events.test.ts)
