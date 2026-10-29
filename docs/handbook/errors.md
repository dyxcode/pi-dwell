# Error reference

English | [简体中文](../i18n/zh-CN/handbook/errors.md)

[Handbook index](README.md) · [Full reference](reference.md)

Error codes are plain strings carried alongside an HTTP status or stream event. Each layer defines its own codes, and some names recur across layers.

## Start with the symptom

| What you see | What it usually means | Safe next step |
| --- | --- | --- |
| The browser says storage is unavailable (`storage`, status `0`). | The browser could not write and verify its local binding in `localStorage`; no host request was made. | Allow site storage for the Dwell origin, then reload. This is browser-local state, separate from the host catalog. |
| The host returns `401 unauthenticated` or `403 cli_required`. | Browser pairing expired/revoked, the browser identity is missing, or a CLI-only route was called without the local CLI credential. | Reconnect the browser using the local pairing flow. For CLI-only setup, use the local CLI and confirm it targets the same Dwell mode. Never paste the CLI credential into a browser request. |
| Pairing returns `invalid_pairing`, `rate_limited`, or `pairing_limit`. | A one-time code is wrong, expired, already used, or the attempt/pending-code limit was reached. | Create a fresh pairing code with the local CLI. Wait for the stated retry window after rate limiting; pairing codes expire after five minutes. |
| `409 request_conflict` appears after a retry. | The same `requestId` was already bound to a different directory/model or message/images. | Reuse that ID only for the identical request. Use a new UUID for a distinct operation. The original operation is retained; do not infer that it was rolled back. |
| A turn is still active (`409 session_busy` or `turn_pending`). | Dwell is protecting a session with an existing turn or native Pi execution, or the turn has not settled. | Check the turn/session state and let it settle, or explicitly abort the matching run. Do not submit the same work under a new ID just to get around the busy state. |
| A request gets `429` such as `history_busy`, `subscriber_limit`, or `model_discovery_busy`. | A bounded read, event subscription, or discovery slot is occupied. | Honor `Retry-After` when present, or retry after the active operation ends. The current HTTP handler sets 300 seconds for `pairing_limit` and 60 seconds for other `429` responses. |
| History returns `410 history_unavailable`. | Dwell expected saved Pi history for this session but could not read the recorded file. | Keep the session and its original Pi history intact. Check that the same session file is present and readable before reopening or retrying. Do not create a replacement session and treat it as the old conversation. |
| History returns `409 history_changed` or `400 invalid_cursor`. | The saved file changed during a bounded read, a history cursor is no longer valid, or an event cursor is malformed or belongs to another session. Stale/ahead/old-epoch event cursors instead receive resync plus a snapshot. | Reload the latest history or reconnect the event stream so the client receives a fresh snapshot. A history-page cursor and an event cursor are different values. |
| History returns `409 invalid_history` or `413 history_limit`. | The native JSONL branch/records could not be safely projected, or the saved history exceeds the reader's configured limits. | Preserve the native file and note the session ID. Use the source and tests below to diagnose its shape/size; do not edit or delete it as a first response. |
| A turn is `interrupted` with `outcome_unknown`, or the UI says it could not confirm a send. | The host durably marked the turn `dispatching` but could not establish the final Pi outcome. The prompt may or may not have reached Pi. Dwell does not automatically replay it. | Inspect the existing turn and saved history first. Retry with the same `requestId` to retrieve the retained turn; use a new ID only if you deliberately intend a new execution after reconciling the old one. |
| A turn is `failed` with `execution_rejected` or `provider_error`. | Pi explicitly rejected the prompt, or Pi settled the execution as failed. These are terminal turn outcomes, not HTTP error codes. | Read the turn's message and inspect saved history. A retry with the same `requestId` retrieves the same record; a deliberate new attempt needs a new request ID. |
| Session/model discovery says `runtime_unavailable`, `runtime_mismatch`, or `model_discovery_failed`. | Pi could not start, did not restore the stored session/model as requested, or returned unsupported discovery output. | Check the locally configured Pi executable/version and selected model. Preserve the Dwell session and its native history while diagnosing. |
| `503 storage_unavailable` or a `stream.error` with that code appears. | Dwell could not persist durable session/turn/auth state. After a turn dispatch, replay is deliberately withheld because execution may already have happened. | Stop issuing new work. Preserve the catalog and session files, inspect storage availability while the host is stopped, then diagnose the specific failing file or database operation. Do not remove the catalog or rotate credentials as a generic fix. |
| SSE closes, reports a decoder error, or reconnects with a `resync` frame. | The browser saw malformed/oversized stream data, the connection ended, or the server's bounded replay window no longer covers the cursor. | Let the client reconnect and consume its fresh snapshot. `resync` is a recovery frame, not a failed turn. |

## How an error reaches the caller

The HTTP handler turns `AccessError` and `SessionError` into JSON of the form `{ "error": { "code", "message" } }`, with the exception's status. Request validation and access checks originate in [the HTTP host](../../src/server/http.ts); session operations originate in [SessionService](../../src/sessions/service.ts). A session error therefore has an HTTP status even when the same `code` is also stored on a turn.

The browser's [`ApiError`](../../src/clients/web/transport.ts) preserves the response status, code, and message. If it cannot read a compatible JSON error body it synthesizes `http` with the returned status. Browser storage failures synthesize `storage` with status `0` before any fetch. The browser-facing text is generally the server's `message`, not a separate UI error-code namespace.

SSE has two more paths. Server-side stream startup can return an HTTP error through [`SseStartError`](../../src/server/sse.ts). Once the stream has started, `stream.error` and `projection.error` are ordinary event payloads with a `code` and `message`; they do not have an HTTP status. The browser's [`SseDecodeError`](../../src/clients/web/events.ts) is local protocol validation and also has no HTTP status.

Pi RPC is different again. A correlated Pi response with `success: false` becomes [`RpcCommandError`](../../src/runtime/pi-rpc.ts), carrying the command and Pi's rejection text, not a Dwell status/code pair. A broken pipe, timeout, malformed record, or closed RPC connection is a generic `Error`; if it happens after dispatch, the execution outcome can be unknown. The service records that boundary in the turn ledger rather than automatically replaying a prompt.

## HTTP error-envelope catalog

These are literal codes currently emitted through the HTTP JSON error envelope, plus the two session-creation outcome codes. The listed status is the source status. A repeated code may have more than one status/meaning where noted.

### Request shape, routing, and host availability

| Code | HTTP status | Meaning |
| --- | ---: | --- |
| `aborted` | 400 | The client interrupted a request body while the host was reading it. |
| `body_too_large` | 413 | The request body or message exceeds that route's byte limit. |
| `duplicate_header` | 400 | A security-sensitive request header appeared more than once. |
| `invalid_input` | 400 | A JSON body, identifier, model selection, or operation-specific value failed validation. |
| `invalid_json` | 400 | The body is not valid JSON. |
| `invalid_cursor` | 400 | A history cursor fails parsing/signature/boundary checks, or an event cursor is malformed or cross-session. A stale event cursor normally triggers resync rather than this error. |
| `method_not_allowed` | 405 | The route exists but requires another HTTP method; the response includes `Allow`. |
| `not_found` | 404 | The route or requested saved image does not exist. More specific session/turn lookups use their own codes. |
| `unexpected_body` | 400 | A body was sent to a GET; nonempty objects on empty-object POST operations instead produce `invalid_input`. |
| `unexpected_query` | 400 | A route received an unsupported query parameter or an invalid query shape. |
| `unsupported_encoding` | 415 | Compressed request bodies are not accepted. |
| `unsupported_media_type` | 415 | JSON routes require `application/json` (optional UTF-8 charset). |
| `url_too_long` | 414 | The request target exceeds the host's URL bound. |
| `unavailable` | 503 | The host/session service is starting or stopping. |
| `internal_error` | 500 | An uncategorized failure reached the host boundary; the response contains a generic message without underlying error details. |

Source: [HTTP handler](../../src/server/http.ts). This code list covers literal JSON-envelope codes from the handler; lower-level startup/configuration exceptions may be ordinary errors before a request can be served.

### Access and pairing

| Code | HTTP status | Meaning |
| --- | ---: | --- |
| `forbidden_origin` | 403 | Origin/request marker does not match the browser origin used to open Dwell. |
| `forbidden_host` | 403 | The request's Host is neither the local listener nor the configured browser origin. |
| `forbidden_proxy` | 403 | A request with proxy-forwarded headers tried to use the local-listener Host lane. |
| `local_credential_required` | 403 | A CLI credential was sent through the secure browser-origin lane; CLI credentials belong on the local address. |
| `cli_required` | 403 | The operation is deliberately restricted to the local CLI credential. |
| `unauthenticated` | 401 | There is no valid browser session or local CLI credential for this route. |
| `invalid_pairing` | 401 | The one-time pairing code is invalid, expired, or already redeemed. |
| `pairing_limit` | 429 | Too many pending pairing codes; the handler's `Retry-After` is 300 seconds. |
| `rate_limited` | 429 | Too many pairing attempts; the handler's `Retry-After` is 60 seconds. |
| `session_limit` | 429 in auth | The browser-session limit was reached; this is distinct from the Dwell open-session limit below. |
| `storage_unavailable` | 503 | Authentication state could not be read or saved. |

Sources: [request access](../../src/server/access.ts), [pairing and browser-session state](../../src/server/auth.ts), [HTTP boundary](../../src/server/http.ts). Pairing codes are one-use credentials, not diagnostic error codes.

### Session, turn, history, and discovery operations

These errors are raised by `SessionService` or by its delegated history/discovery readers, then returned with the same status and code by the HTTP host. “Stored turn error” in the notes below means a `TurnInfo.error` field; it is not an HTTP status.

| Code | HTTP status | Meaning |
| --- | ---: | --- |
| `directory_changed` | 409 | The saved project path now resolves to a different canonical directory. |
| `directory_unavailable` | 403 or 500 | The selected directory cannot be read, or the directory browser itself failed. |
| `discovery_cleanup_failed` | 503 | Temporary, isolated model-discovery state or its Pi process could not be cleaned up. |
| `history_busy` | 429 | The bounded saved-history read queue is full. |
| `history_changed` | 409 | The native history file changed while it was being read. |
| `history_limit` | 413 | The saved history exceeds record, byte, depth, or branch bounds. |
| `history_unavailable` | 410 | The expected native history file cannot be read or is no longer available. |
| `home_directory_unavailable` | 503 | Dwell cannot determine the host home directory required for discovery. |
| `invalid_catalog` | 500 | A catalog record contains an invalid identity or path. |
| `invalid_cursor` | 400 | History pagination or event subscription supplied an invalid cursor. |
| `invalid_directory` | 400 | The selected project path is not an absolute existing directory. |
| `invalid_history` | 409 | Saved JSONL/branch identity is invalid, inconsistent, or claimed by multiple files. |
| `invalid_model` | 400 | A model-capabilities discovery request has an invalid provider/model pair. |
| `invalid_runtime` | 400 | The configured Pi executable/entry point is invalid. |
| `model_capabilities_failed` | 503 | Isolated Pi model-capability discovery failed or returned no usable result. |
| `model_catalog_too_large` | 413 | Pi's available-model list exceeded its configured count bound. |
| `model_config_too_large` | 413 | Local Pi model configuration exceeded a discovery input bound. |
| `model_discovery_busy` | 429 | Both model-capability discovery slots are occupied. |
| `model_discovery_failed` | 502 or 503 | Pi could not provide a supported model list. `502` is used for listing models in an open session; top-level discovery failures use `503`. |
| `model_not_found` | 404 | The requested model is not available in this open session. |
| `model_unavailable` | 400 | Pi did not select the requested model; the service closes that runtime safely. |
| `model_change_failed` | 503 | Pi did not confirm a model change; the runtime is closed safely. |
| `native_abort_failed` | 503 | Pi could not confirm that native execution had stopped reliably. |
| `native_execution_stale` | 409 | The execution ID no longer identifies the current/live native execution. |
| `request_conflict` | 409 | A `requestId` was reused with different creation settings or turn content. |
| `result_limit` | 413 | A complete saved turn result is too large/deep for one response; use paginated history. |
| `result_unavailable` | 410 | The turn result or one of its recorded history entries cannot be read. |
| `runtime_busy` | 409 | Pi runtime configuration cannot change while sessions are open. |
| `runtime_mismatch` | 503 | Pi did not restore or retain the expected session/model state. |
| `runtime_unavailable` | 503 | Pi is unconfigured, could not start, or is not available to the operation. |
| `session_busy` | 409 | A turn/native execution is active, or the runtime is not idle for this operation. |
| `session_changed` | 409 | The runtime/session changed while model data was being read. |
| `session_interrupted` | 409 | Session creation was interrupted; the response includes its Dwell session ID. |
| `session_limit` | 409 in sessions | The maximum of eight open Dwell sessions was reached. Close an idle session before opening another. |
| `session_not_found` | 404 | The Dwell session ID is unknown. |
| `session_not_open` | 409 | Open the session before reading/changing its session-specific model list. |
| `session_not_ready` | 409 | The session is not in the ready state required for a model change. |
| `session_start_failed` | 503 | Session creation failed; the response includes the retained Dwell session ID for inspection. |
| `shutting_down` | 503 | Session operations are being drained during Dwell shutdown. |
| `storage_unavailable` | 503 | Durable catalog/turn/session metadata could not be saved. Work is not automatically replayed. |
| `stream_overloaded` | 503 | The initial SSE snapshot would exceed the response buffer bound. |
| `stream_unavailable` | 503 | Session stream setup failed or exceeded capacity. |
| `subscriber_limit` | 429 | The per-session event subscriber limit is reached. |
| `turn_interrupted` | 409 | The turn has no live execution owner; inspect its terminal record/history. |
| `turn_not_found` | 404 | The run ID is unknown within the Dwell session. |
| `turn_pending` | 409 | The turn result has not settled yet. |
| `unsupported_image_model` | 400 | The selected model does not accept image input. |
| `unsupported_pi_version` | 503 | The configured Pi version does not provide the discovery interface required by Dwell. |

Sources: [session operations and API mapping](../../src/sessions/service.ts), [native JSONL read errors](../../src/runtime/pi-history.ts), [history-page cursor/branch checks](../../src/sessions/history.ts), [directory and model discovery](../../src/server/session-discovery.ts), [SSE startup errors](../../src/server/sse.ts). Names and statuses are in the constructors; the precise message may vary by failure site.

## Non-HTTP error codes and outcomes

### Durable turn errors

The turn ledger's `error` is `{ code, message } | null`; the `TurnStatus` is a separate field. The schema accepts any nonempty code and message rather than a closed code union, because session errors can also be retained on a failed turn.

| Stored code | Usual turn status | Meaning |
| --- | --- | --- |
| `not_dispatched` | `interrupted` | Recovery found a turn still at `accepted`; host shutdown/restart happened before the prompt was sent. |
| `outcome_unknown` | `interrupted` | Dwell durably marked the turn `dispatching`, but the host could not establish the final result; the prompt may or may not have reached Pi. |
| `execution_rejected` | `failed` | Pi returned a correlated negative response for the `prompt` command. |
| `provider_error` | `failed` | Pi settled the run with a failed outcome and an error message. |
| Other service code | Depends on the failure point | A `SessionError` may be recorded while the service finalizes a turn. Read both the code and status; do not interpret a stored code as an HTTP response. |

Turn recovery separates `accepted` from `dispatching`: an `accepted` turn has not reached the send step, while a `dispatching` turn remains uncertain if shutdown races the RPC call. Only accepted turns become `not_dispatched`; uncertain outcomes are not replayed automatically. Sources: [turn dispatch and finalization](../../src/sessions/service.ts), [startup interruption transaction](../../src/storage/catalog.ts), [turn contract](../../src/shared/turns.ts).

### Stream and browser-local codes

| Code family | Codes | Meaning and recovery |
| --- | --- | --- |
| Server `stream.error` event payload | `state_unavailable`, `storage_unavailable` | These codes have no HTTP status after the SSE response has started. `state_unavailable` means a session snapshot could not be synchronized; reconnect for a fresh snapshot. `storage_unavailable` reports a durable write fault. |
| SSE startup error | `unauthenticated`, `stream_unavailable`, `stream_overloaded` | These are `SseStartError` codes raised before the stream begins. The HTTP host maps `unauthenticated` to 401 and the other two to 503. |
| Pi live-event projection | `invalid_pi_event` | The event shape/content could not be projected into the live view. It does not say that saved native history is corrupt or that the Pi execution failed. |
| Browser SSE decoder | `frame_too_large`, `malformed_sse`, `invalid_json`, `invalid_frame`, `event_mismatch`, `id_mismatch` | The browser rejected the stream framing, JSON, frame schema, event name, or cursor ID. These are local `SseDecodeError` values, not host response codes. Reconnect/resync rather than treating one as a turn result. |
| Browser API wrapper | `storage`, `http` | `storage` is local browser-binding storage failure with status `0`; `http` is a fallback when the response body did not contain a compatible `{error:{code,message}}` envelope. Normal server codes pass through unchanged. |
| Resync reason | `cursor_stale`, `cursor_ahead`, `epoch_changed`, `replay_limit` | The server could not continue event replay from the supplied cursor and sent a fresh snapshot. These are control reasons on a `resync` frame, not error codes. |

Sources: [event projection and stream errors](../../src/sessions/events.ts), [server SSE transport](../../src/server/sse.ts), [browser SSE decoder](../../src/clients/web/events.ts), [browser API wrapper](../../src/clients/web/transport.ts).

Pi RPC transport errors such as `Pi RPC connection closed`, `Pi RPC record exceeds 8 MiB`, or an RPC timeout are ordinary JavaScript errors, not stable code values. A command rejection is different: `RpcCommandError.command` identifies the Pi RPC command and `.rejection` contains Pi's text. See [Pi RPC](../../src/runtime/pi-rpc.ts) and [Pi process lifecycle](../../src/runtime/pi-process.ts).

## Test map

| Area | Tests that exercise the current failure boundary |
| --- | --- |
| Host routing, access errors, auth and pairing | [access](../../tests/access.test.ts), [auth](../../tests/auth.test.ts), [host](../../tests/host.test.ts) |
| Session and turn HTTP envelopes | [sessions HTTP](../../tests/sessions-http.test.ts), [turns HTTP](../../tests/turns-http.test.ts), [images HTTP](../../tests/images-http.test.ts) |
| Saved history, cursor and cancellation errors | [history HTTP](../../tests/history-http.test.ts), [history service](../../tests/history-service.test.ts), [Pi history](../../tests/pi-history.test.ts), [history cancellation](../../tests/history-cancellation.test.ts), [history budget](../../tests/pi-history-budget.test.ts) |
| SSE replay, overload, and browser decoding | [server event HTTP](../../tests/events-http.test.ts), [session events](../../tests/session-events.test.ts), [event hub](../../tests/events.test.ts), [browser SSE](../../tests/web-events.test.ts) |
| Pi RPC and runtime failure | [runtime failure](../../tests/runtime-failure.test.ts), [runtime](../../tests/runtime.test.ts) |
| Durable turn results and restart recovery | [turns](../../tests/turns.test.ts), [turn catalog](../../tests/turn-catalog.test.ts), [turn recovery](../../tests/turn-recovery.test.ts) |
| Browser handling of host errors and retry states | [web client](../../tests/web-client.test.ts) |

For a type inventory and endpoint schemas, use [shared contracts](contracts.md). For the detailed dispatch/recovery algorithm, read [sessions and storage](sessions-storage.md); for route and access checks, read [HTTP and authentication](http-auth.md).
