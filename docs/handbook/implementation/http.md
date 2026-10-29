# HTTP host and SSE

English | [简体中文](../../i18n/zh-CN/handbook/implementation/http.md)

[Implementation index](README.md) · [HTTP overview and route reference](../http-auth.md) · [Authentication internals](authentication.md)

The loopback HTTP host validates requests, dispatches routes, and owns response cleanup. The session service owns session behavior, while each SSE writer owns one response. See [Authentication](authentication.md) for authority selection and durable browser credentials.

<a id="request-validation"></a>
## Request validation and response helpers

The small helpers in [http.ts](../../../src/server/http.ts) define the request boundary. [fail](../../../src/server/http.ts#L31) converts a validation or policy decision into an AccessError so the outer handler can produce one stable error envelope. [cookieToken](../../../src/server/http.ts#L34) accepts a cookie only when exactly one cookie with the selected name is present. [browserRequest](../../../src/server/http.ts#L42) requires both an exact Origin and the Dwell request marker for browser POSTs; the authority that Origin must match is selected by the access layer.

[readJson](../../../src/server/http.ts#L47) accepts JSON with an optional UTF-8 charset, rejects compressed bodies, and enforces the limit against both Content-Length and bytes actually streamed. Interrupted requests become a typed 400 error. The parsed value must be a non-null object, not an array or primitive; copying its enumerable entries gives route code a plain record to validate. Most requests are limited to 8 KiB. Turn submission gets an 8 MiB JSON envelope so image references fit, while its message text has a separate 8 KiB UTF-8 limit.

[send](../../../src/server/http.ts#L84) writes a status and JSON body. [parseHistoryCursor](../../../src/server/http.ts#L88) permits one nonempty cursor of at most 1536 characters and rejects repeated, mixed, or otherwise unsupported query parameters. Directory browsing has its own single path query check in the route handler.

<a id="host-lifecycle"></a>
## Host startup, active requests, and shutdown

[startHost](../../../src/server/http.ts#L102) accepts internal embedding and test seams for the port, data directory, mode, clock, session environment/extensions, and heartbeat interval. The public command line does not expose port or data-directory overrides. It validates the port, creates protocol-version-2 status metadata with a fresh instance ID and the sessions-available/tasks-unavailable capability flags, and keeps authentication, sessions, stopping state, active handlers, and open event streams in host-local variables.

The nested [revalidateEventStreams](../../../src/server/http.ts#L130) visits current writers after a credential change. [openEventStream](../../../src/server/http.ts#L134) binds a writer to the request's current authorization check, subscribes to the session event hub, and starts with the subscription snapshot. The subscription callback enqueues each frame; its onClose callback removes the writer from the host set. If subscription or start fails, it closes the writer before returning the error. The authorization closure is checked again while the stream stays open; the cookie and bearer rules are in [Authentication](authentication.md#browser-session-auth).

The nested [handle](../../../src/server/http.ts#L167) applies response security headers before entering the request pipeline. It rejects duplicate Host, Origin, Authorization, Cookie, Dwell binding, request-marker, and Last-Event-ID headers; selects the configured authority; rejects a cross-origin Origin and bearer credentials on the HTTPS lane; then checks host lifecycle and URL length. Query parsing is limited to directory path or saved-history cursor. See [authority selection](authentication.md#authority-and-cookies) for the exact Host and proxy-header rules.

The handler matches known route families and derives the required method. Unknown routes return 404; known routes with a different method return 405 and an Allow header. Protected routes authenticate before body parsing or service calls. GET requests reject transfer-encoded or nonempty bodies. Runtime configuration is CLI-only, and browser POSTs repeat the Origin/request-marker check. Each route then applies its narrow shape checks before calling the session service. The concrete branch behavior is listed below.

<a id="route-dispatch"></a>
### Route-specific branches

| Route family | Dispatch and boundary |
| --- | --- |
| Runtime configuration | POST is local-CLI-only. The object must pass the runtime configuration validator and contain only executable and optional entryPoint, then sessions.configure returns the stored configuration. |
| Directory and global model discovery | GET /directories accepts one nonempty path query or uses the host home. GET /models wraps the isolated global model list in a models object. POST /model-capabilities validates a provider/model pair before discovery. |
| Session catalog and lifecycle | GET /sessions returns the catalog. POST accepts only requestId, directory, and optional provider plus model; provider/model must appear together. A ready result is 201, failed creation is 503, and interrupted creation is 409. Per-session GET returns saved metadata; open and close are POST operations with an empty object, while context is GET and may open its runtime. |
| Session model operations | GET /sessions/:id/models returns the selected runtime's registry. POST /model-capabilities validates the provider/model pair; POST /model uses the shared session-model validator for provider, model, and optional thinkingLevel before changing the effective selection. |
| Saved history | GET /history accepts only one cursor query. The image route requires a safe integer index, percent-decodes the entry ID, and returns the selected saved bytes with MIME type, length, and inline disposition. It never accepts a client path. |
| Event observation | GET /events accepts one Last-Event-ID header. The session service validates session and cursor and returns an initial subscription snapshot before the HTTP writer commits SSE headers, so an unknown session or invalid cursor can still return JSON. |
| Turn and native execution operations | POST /turns without a run ID validates the full turn request and separately caps message text at 8 KiB UTF-8; a newly admitted turn is 202 and a request-key retry is 200. GET /turns/:run returns metadata, GET /result resolves history-backed result, and POST /abort requires an empty object. Native-execution abort is also POST with an empty object. |

After JSON body parsing, session operations clear the five-second socket deadline; admitted session/RPC work has its own deadlines. Body and header reading remain bounded.

For public GETs, health is a process-availability response, browser assets come from a fixed in-memory map, and status still requires a credential. Browser pairing and mutations use the authentication flows described in [LocalAuth state and pairing](authentication.md#browser-session-auth). Logout and revocation cause existing event streams to be revalidated immediately.

The server has an 8 KiB header cap and five-second header, request, and socket deadlines. It binds to 127.0.0.1 before preparing persistent state. The createServer request callback adds each handle promise to the active set and removes it on either fulfillment or rejection. Shutdown can then reject new work, close stream observers and sockets, wait for admitted handlers, stop sessions, drain authentication writes, and release the listener. The close operation is idempotent. Initialization failure runs the same cleanup path, preventing a failed startup from retaining the port.

Errors before headers are sent become JSON envelopes. AccessError and SessionError retain their status and code; rate limits add Retry-After. SSE startup errors map unauthenticated to 401 and other startup failures to 503. Unknown errors use a generic 500 message. If headers have already been sent, the handler destroys the response because it can no longer safely switch protocols or write JSON.

<a id="sse-frame-and-connection"></a>
## SSE framing, queueing, and response ownership

[SseStartError.constructor](../../../src/server/sse.ts#L11) preserves a safe public startup code. [encodeFrame](../../../src/server/sse.ts#L30) validates the shared StreamFrame, restricts the event-name alphabet, rejects newline or NUL in cursors, then writes event, optional id, and JSON data lines. It never copies event-frame data into shared hub state.

[createSseConnection](../../../src/server/sse.ts#L48) owns one ServerResponse and stores its queue, queued-byte count, started/blocked/closed/ending flags, subscription cleanup, timers, and any pre-start failure in closures. The 256 KiB bound includes both queued buffers and Node's writableLength. Before the first headers, an invalid frame or oversized initial snapshot becomes SseStartError. After streaming begins, encoding errors and overflow destroy only that response.

<a id="sse-lifecycle-and-overflow"></a>
### SSE callbacks and state transitions

The internal cleanup group has distinct roles. [detach](../../../src/server/sse.ts#L66) removes response listeners; [stopTimers](../../../src/server/sse.ts#L72) clears heartbeat and error-flush timers; [release](../../../src/server/sse.ts#L79) runs once, empties accounting, detaches, unsubscribes, and isolates cleanup exceptions; [terminate](../../../src/server/sse.ts#L101) chooses a clean end or destroy and releases ownership first. [authorized](../../../src/server/sse.ts#L119) converts an authorization exception to denial. [totalBufferedBytes](../../../src/server/sse.ts#L127) combines response and queue memory. [enqueueBuffer](../../../src/server/sse.ts#L130) enforces the shared limit before queueing, then asks the pump to write when started.

[pump](../../../src/server/sse.ts#L146) stops when not started, already blocked, closed, or failed. Before every write it rechecks authorization. A false return from response.write marks the writer blocked until drain. The nested [onDrain](../../../src/server/sse.ts#L171) clears that flag and resumes pumping; [onCloseResponse](../../../src/server/sse.ts#L176) releases a disconnected client; [onErrorResponse](../../../src/server/sse.ts#L180) destroys the failed response. [heartbeatOnce](../../../src/server/sse.ts#L184) rechecks authorization and enqueues a comment frame, while heartbeats are suspended during terminal error flushing.

The returned [enqueue](../../../src/server/sse.ts#L198) validates and queues a frame. A stream.error ends further observation, unsubscribes, gives the queued error at most one second to flush, then destroys if it cannot finish. The returned [start](../../../src/server/sse.ts#L229) installs the unsubscriber, validates and measures the initial snapshot before sending headers, checks current authorization, places the snapshot before notifications queued during subscription, starts heartbeat or bounded error flush, and pumps. The returned [revalidate](../../../src/server/sse.ts#L292) immediately terminates when authorization has been revoked; [close](../../../src/server/sse.ts#L298) releases this observer without changing the Pi execution.

<a id="http-test-evidence"></a>
## Test evidence

[events-http.test.ts](../../../tests/events-http.test.ts#L421) covers route admission, ordered snapshots, observer disconnect, expiry/revoke, cursor validation, and slow-reader isolation over loopback sockets. [access.test.ts](../../../tests/access.test.ts#L357) and [auth.test.ts](../../../tests/auth.test.ts#L75) exercise how authentication changes revalidate an already-open stream. Tests use synthetic local fixtures and do not contact a provider.
