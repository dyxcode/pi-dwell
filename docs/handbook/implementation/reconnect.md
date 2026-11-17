# Reconnect a live session

English | [简体中文](../../i18n/zh-CN/handbook/implementation/reconnect.md)

[Implementation](README.md) · [Handbook](../README.md)

<a id="behavior"></a>

## Behavior

The browser reconnects to observe the same host-owned Pi session. The live stream carries session changes, durable turn summaries, assistant and tool projections, and native extension execution state. It gives observers prompt progress; the saved Pi transcript supplies durable conversation content.

When a connection resumes, Dwell replays events after the browser's last accepted cursor or sends a fresh snapshot. If the cursor is outside the current epoch, sequence, retention window, or replay budget, the server sends a resynchronization frame followed by a snapshot. The browser then reloads saved history to reconcile the snapshot with the native transcript.

The snapshot represents current execution and recent live content; saved history pages supply the full conversation branch. Reconnect can therefore recover the session view after earlier event frames have left the replay window.

<a id="ownership"></a>

## Ownership

SQLite owns durable session and turn metadata. Pi owns execution and native JSONL history. The event hub keeps a bounded, process-local projection of current session state, the active or latest turn, and live Pi events. Stream cursors and replay frames exist only in that hub.

The SSE transport frames validated events, applies per-connection buffering and backpressure, and rechecks browser authorization while writing. Disconnecting a subscriber removes its listener; it leaves the Pi process and any turn under host control.

The browser combines its live projection and last accepted cursor with saved-history pages. Stream updates and history reads keep independent ordering, so a settlement frame may arrive before its saved entries are available.

<a id="execution"></a>

## Execution

When a browser opens a session stream, it supplies the last cursor it accepted, if one is available. The host validates the cursor against the selected session, reads the durable session and turn view, reconciles that view into the in-memory projection, and calculates initial frames before registering the subscriber. The snapshot/replay boundary and listener registration therefore share one synchronous step.

Without a cursor, the host sends a snapshot. With a cursor in the same epoch and retained replay window, it sends only later frames. A cursor from another epoch, ahead of the stream, too old for retention, or beyond the initial replay budget causes resynchronization and a fresh snapshot. Stream epoch changes on hub recreation, including host restart or eviction of an idle stream.

The browser incrementally decodes SSE frames, checks their envelope and cursor, and applies them in sequence. A gap marks live projection incomplete. Snapshots, resynchronization, and terminal execution updates trigger saved-history reads; matching native identities replace the corresponding live items.

<a id="mechanisms"></a>

## Mechanisms

Every stream has an epoch and increasing sequence. A cursor combines the session, epoch, and sequence, binding replay to one stream history. The hub retains at most 1,000 events or 1 MiB of replay data per stream. After older frames are evicted, a fresh snapshot restores current state.

Before generating initial frames, the hub reconciles session and turn metadata from the durable catalog. Frame calculation and subscriber registration are synchronous, closing the gap between snapshot creation and subscription. Replay records are process-local; catalog and native JSONL recover the session after restart.

The browser discards incremental frames from another session or epoch. A fresh snapshot can establish a new epoch for the selected session. It ignores duplicate sequences and older snapshots within the same epoch, and preserves compatible live text when a bounded snapshot carries a shorter prefix. A gap or epoch transition marks live output incomplete until history establishes saved coverage.

Selection, authentication, history, and image requests have separate browser generations. Switching sessions or invalidating history advances the relevant generation; late responses and image callbacks are discarded, and replaced image object URLs are released.

<a id="technology"></a>

## Technology

SSE provides ordered, one-way progress without making the browser a runtime owner. A cursor allows brief disconnects to replay a bounded suffix; snapshots recover from longer gaps and stream recreation. Keeping replay in memory avoids a second event database, while durable catalog and JSONL reads reconstruct the authoritative session view.

The hub bounds stream count, event count, payload size, and subscribers. The transport separately bounds each connection's write buffer. These limits keep a slow or disconnected observer from holding unbounded host memory or controlling Pi execution.

<a id="verification"></a>

## Verification scenarios

Reconnect with a cursor whose events remain retained. Only later frames arrive, in sequence, and the browser continues the same live run.

Reconnect with an evicted cursor or after a host restart. The host sends a fresh snapshot; saved-history pages restore the conversation view, and the browser marks any unproven live interval incomplete.

Deliver a duplicate frame, a frame from another session, or an older same-epoch snapshot. The browser keeps the newer selected-session state.

Switch sessions while an earlier history or image request is pending. Its late result cannot change the new session's messages or image preview.

Settle a turn while saved entries are still being read. Live output remains visible until native identities establish that saved history covers it, then each saved message appears once.
