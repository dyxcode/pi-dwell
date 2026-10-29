<a id="session-events-implementation"></a>

# Session events

English | [简体中文](../../i18n/zh-CN/handbook/implementation/events.md)

[Implementation index](README.md) · [Session service](sessions.md) · [Events overview](../sessions-storage.md#live-events-and-bounded-replay)

`SessionEvents` is a process-local, bounded projection layer. It combines validated durable session/turn views with selected Pi live messages and tool activity for browser observation. It does not persist events or own execution. A reconnect receives a snapshot or retained replay; saved conversation content still comes from the native Pi history reader.

<a id="event-shapes-and-helper-functions"></a>

## Frame and projection helpers

[`InvalidCursorError`, `SubscriberLimitError`, and `StreamCapacityError`](../../../src/sessions/events.ts#L30) separate malformed/foreign cursor, subscriber overflow, and unavailable stream capacity. [`EventType`, `PayloadFor`, `ReplayableFrame`, and stream state interfaces`](../../../src/sessions/events.ts#L51) distinguish replayable events from snapshot/resync control frames and keep each stream's epoch, sequence, replay bytes, subscribers, cached durable view, live projection, and last-use tick together.

The module helpers implement bounded wire values and Pi-record projection:

| Declaration | Behavior |
| --- | --- |
| [`isRecord`](../../../src/sessions/events.ts#L144) | Narrows non-null, non-array objects at the Pi event boundary. |
| [`jsonStringBytes`](../../../src/sessions/events.ts#L148) | Measures the serialized JSON string, including escaping and quotation overhead. |
| [`boundedJsonString`](../../../src/sessions/events.ts#L152) | Keeps a string within a JSON-byte budget and appends an ellipsis when clipped, without splitting a Unicode code point. |
| [`appendBoundedJsonString`](../../../src/sessions/events.ts#L176) | Appends only the portion that fits, returning both the resulting value and the exact new delta; a suffix is included only if it fits. |
| [`safeJsonString`](../../../src/sessions/events.ts#L209) | Converts arbitrary input for display, returning an empty string if serialization fails. |
| [`equalJson`](../../../src/sessions/events.ts#L217) | Compares already-validated projections by serialized value. |
| [`blockDelta`](../../../src/sessions/events.ts#L221) | Includes delta text in thinking-block updates; ordinary text is carried in the message-level text field. |
| [`emptyLiveState`](../../../src/sessions/events.ts#L229) | Initializes empty message/tool state, identity counts, ownership maps, truncation flags, and one-shot error/limit tracking. |
| [`parseCursor`](../../../src/sessions/events.ts#L246) | Requires `<session UUID>:<epoch UUID>:<safe sequence>` and rejects cursors from another session. |
| [`projectSession`](../../../src/sessions/events.ts#L260) | Selects public session fields and clips directory, provider, model, and error metadata before streaming; clipping any of these fields marks metadata as limited. |
| [`projectTurn`](../../../src/sessions/events.ts#L312) | Converts a stored turn to `TurnProjection`: it exposes entry count rather than entry IDs and bounds error code/message. |
| [`extractText`](../../../src/sessions/events.ts#L338) | Reads a string result directly or joins text blocks from a record's `content` array. |
| [`clippedToolInput` and `clippedToolText`](../../../src/sessions/events.ts#L349) | Serialize/cap tool arguments, or extract/cap visible text from a result. |
| [`eventSize`](../../../src/sessions/events.ts#L357) | Measures serialized frame bytes. |
| [`asReplayable`](../../../src/sessions/events.ts#L361) | Excludes snapshots and resync notices from replay retention. |
| [`copyFrame`](../../../src/sessions/events.ts#L365) | Uses `structuredClone` so each listener receives a detached frame. |
| [`boundedLimit`](../../../src/sessions/events.ts#L1373) | Validates positive safe integer configuration and clamps it to the built-in maximum. |

The fixed limits bound the number of tracked streams, replay events/bytes, subscribers, visible assistant blocks, tool fields, and serialized snapshot sizes. Constructor options may lower limits within their accepted ranges but cannot raise them above the module's ceilings; the replay-byte limit must still fit one maximum-sized event.

<a id="event-hub-lifecycle"></a>

## Hub lifecycle and durable view publication

[`SessionEvents.constructor` and `ensure`](../../../src/sessions/events.ts#L381) initialize clamped limits and optionally reserve a valid session stream. If no idle stream can be evicted at capacity, `ensure` raises `StreamCapacityError`.

[`publishSession`](../../../src/sessions/events.ts#L401) accepts only a valid `SessionInfo`. The first publication seeds a cache without producing a change event; later unequal views replace the cache, update its recency, report metadata clipping once, and emit `session.updated`. Projection exceptions are swallowed because durable mutation already belongs to `SessionService`.

[`publishTurn`](../../../src/sessions/events.ts#L429) requires a consistent session/active/latest view. It seeds all three projections on first use. On subsequent updates it clears previous live state when the latest run identity changes and does not match the currently active run, stores the latest session and turn projections, reports clipping, and emits only changed session/latest-turn views. An event-observer failure cannot roll back a ledger update or Pi execution.

[`#validView`](../../../src/sessions/events.ts#L683) checks each provided `TurnInfo` belongs to this session and matches the corresponding IDs in `SessionInfo`, including the null cases. [`#getOrCreate`](../../../src/sessions/events.ts#L703) returns and touches an existing stream or, at capacity, evicts the least-recently-used stream only when it has no active run and no subscribers. A new stream receives a random epoch, zero sequence, empty replay, and empty live state. [`#touch`](../../../src/sessions/events.ts#L735) advances the process-wide recency tick. [`#removeSubscriber`](../../../src/sessions/events.ts#L739) is idempotent, decrements the global count once, and refreshes recency.

[`#reconcileView`](../../../src/sessions/events.ts#L746) brings a stream's cached view up to date during a new connection, emitting changed session/latest-turn frames so existing subscribers also catch up. It applies the same live-state reset rule when the latest turn changes. [`#publishViewLimits`](../../../src/sessions/events.ts#L802) reports metadata truncation for the session or either turn, using the configured metadata scopes.

<a id="connection-snapshots-and-replay"></a>

## Connection, snapshots, and replay

[`connect`](../../../src/sessions/events.ts#L642) validates the supplied durable view and cursor before allocating subscriber capacity. It enforces both the per-session and global subscriber ceilings, obtains a stream, synchronously reconciles durable state, and computes initial frames before adding the listener. That order gives the snapshot/replay calculation and subscriber registration one synchronous sequence boundary. The returned unsubscribe closure calls `#removeSubscriber`; it does not close the session or Pi process.

[`#initialFrames`](../../../src/sessions/events.ts#L816) returns one snapshot when there is no cursor. A different epoch, cursor ahead of the stream, or cursor older than the retained replay window returns a resync reason followed by a current snapshot. A valid cursor gets cloned replay frames with larger sequence values; if that batch exceeds the initial queue byte budget, it resyncs instead. [`#snapshotFrame`](../../../src/sessions/events.ts#L840) clones cached metadata and current live state and checks the shared frame contract. If live content makes the frame too large, it tries a fallback snapshot with empty but explicitly truncated live state; if even that fails, it raises stream capacity. [`#resyncFrame`](../../../src/sessions/events.ts#L871) creates a validated control frame with a null cursor. [`#cursor`](../../../src/sessions/events.ts#L885) formats the current session ID, epoch, and sequence.

[`#emit`](../../../src/sessions/events.ts#L889) constructs a candidate frame using the next sequence, clones its payload, and validates it before incrementing the stream sequence. A frame that fails contract validation or either per-event/replay-byte ceiling is dropped without consuming a sequence. Accepted frames are cloned into replay; oldest entries are removed until both event-count and byte limits hold. Subscribers are called with their own clone. A synchronous throw or rejected listener promise removes only that subscriber; healthy listeners and Pi continue. [`close`](../../../src/sessions/events.ts#L672) marks all subscribers inactive, clears streams and counters, and prevents future allocation/publication.

[`fail`](../../../src/sessions/events.ts#L626) emits a best-effort, bounded `stream.error` without hiding the failure that prompted it. [`#limited`](../../../src/sessions/events.ts#L934) emits at most one `projection.limited` per scope and marks non-metadata live state truncated. [`#projectionError`](../../../src/sessions/events.ts#L941) emits only the first malformed-Pi projection warning for a stream, preventing malformed output from generating an unbounded error flood.

<a id="live-turn-and-native-execution"></a>

## Live turn and native execution ownership

[`beginTurn`](../../../src/sessions/events.ts#L493) starts a Dwell-owned projection for a valid session/run ID and copies the saved-message occurrence baseline. Repeating the same ID is idempotent. A competing active run is a projection error and does not replace its owner. [`beginNativeExecution`](../../../src/sessions/events.ts#L518) uses a distinct native execution ID. If it replaces an active projection, it first preserves the currently observed identity counts when known; otherwise it uses the supplied saved-file baseline. It resets visible message/tool state and returns the baseline metadata for the service's later reconciliation. [`observe`](../../../src/sessions/events.ts#L561) ignores records for any inactive or mismatched run and dispatches only Pi message/tool start, update, and end records to their projection functions.

[`endTurn`](../../../src/sessions/events.ts#L593) releases the active-run identity and tool-owner maps while leaving the last visible message/tools available in the snapshot. [`endNativeExecution`](../../../src/sessions/events.ts#L602) does the same for a matching native ID and returns identity counts plus the count of unidentifiable assistant messages; mismatched IDs return `undefined`. The service combines those counts with native saved-history branch checks before reporting coverage. A live event by itself never proves that history was saved.

<a id="live-message-projection"></a>

## Assistant message projection

[`#messageStart`](../../../src/sessions/events.ts#L950) validates a Pi message envelope, ignores non-assistant roles, parses initial content, resets any prior live message, and emits a start frame. [`#messageUpdate`](../../../src/sessions/events.ts#L963) accepts only the six text/thinking start/delta/end event kinds. Unknown kinds are ignored; malformed envelopes, negative/non-integer indexes, or type changes report one projection error. Content indexes above the supported block count emit a limit notice. Start/update/end handling uses partial cumulative content when available to avoid duplicating a prefix already present in a seeded message; it appends only bounded new text. Text deltas also populate the visible message text; thinking deltas stay attached to their indexed thinking block. Each update carries a block descriptor and truncation flag so clients can retain order without receiving Pi's raw event object.

[`#messageEnd`](../../../src/sessions/events.ts#L1094) validates and ignores non-assistant endings, derives a full-message native identity when identity is known, counts unidentifiable endings otherwise, reparses final content, and associates tool-call IDs with the finished assistant identity. It emits `message.finished` using the current live message ID when possible. [`#parseContent`](../../../src/sessions/events.ts#L1118) accepts an absent content array as empty, rejects non-arrays, keeps at most the allowed number of blocks, projects only text/thinking strings, and uses `#appendContent` for byte accounting. [`#contentBlock`](../../../src/sessions/events.ts#L1152) returns an existing block only if its type is stable, otherwise creates an empty indexed block. [`#partialContent`](../../../src/sessions/events.ts#L1174) reads a same-type text/thinking value from the matching index of Pi's partial message.

[`#appendContent`](../../../src/sessions/events.ts#L1186) computes remaining message JSON capacity after accounting for sibling block text, then updates one block with a bounded append and truncation marker. [`#publishMessage`](../../../src/sessions/events.ts#L1203) sorts blocks by native content index, concatenates text blocks into the visible text string, preserves thinking separately, and records text ranges, finished/truncated state, native key, stable order, and stable message ID. It emits frames only for start/finish calls; delta callers emit their own `message.delta` after the returned message identity is known.

<a id="live-tool-projection"></a>

## Tool projection

[`#toolStart`](../../../src/sessions/events.ts#L1256), [`#toolUpdate`](../../../src/sessions/events.ts#L1276), and [`#toolEnd`](../../../src/sessions/events.ts#L1300) require a bounded call ID and nonempty name. Start captures clipped arguments and marks the call running; update refreshes arguments only when supplied and extracts partial-result text; end records final result text and uses `isError` to choose failed/completed. Each emits a cloned Dwell `LiveTool`, never the raw Pi event. Input, output, and name truncation each report a scoped limit once.

[`#getTool`](../../../src/sessions/events.ts#L1324) correlates calls using the owning assistant-message key plus native call ID; if no owner exists, it falls back to the current live message ID, then an explicit unknown owner. This prevents reused call IDs in later assistant messages from merging. It updates the matching projection when present, otherwise enforces the tool-count cap and allocates a Dwell ID, order, initial input/name, and running status. [`#toolEventId`](../../../src/sessions/events.ts#L1360) rejects empty IDs and IDs exceeding either character or UTF-8 byte limits. [`#toolEventName`](../../../src/sessions/events.ts#L1368) accepts only nonempty strings; the start/update/end functions perform the tighter serialized-name clipping.

The event contract and replay behavior are covered by [event hub tests](../../../tests/events.test.ts), [session event integration tests](../../../tests/session-events.test.ts), and [HTTP stream tests](../../../tests/events-http.test.ts).
