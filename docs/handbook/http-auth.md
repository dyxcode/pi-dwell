# HTTP, authentication, and discovery

English | [简体中文](../i18n/zh-CN/handbook/http-auth.md)

Detailed prose walkthrough: [Implementation](implementation/http.md).

[Handbook index](README.md) · [Source atlas](source-map.md)

## Files and responsibilities

| File | Responsibility |
| --- | --- |
| [`server/http.ts`](../../src/server/http.ts) | Listener lifecycle, request validation, route dispatch, response headers, errors, shutdown |
| [`server/access.ts`](../../src/server/access.ts) | Local/HTTPS authority selection, configuration validation, cookie attributes |
| [`server/auth.ts`](../../src/server/auth.ts) | CLI credential verification, pairing, browser authentication, serialized persistence |
| [`server/sse.ts`](../../src/server/sse.ts) | Per-response SSE encoding, backpressure, authorization rechecks and cleanup |
| [`server/session-discovery.ts`](../../src/server/session-discovery.ts) | Host directory browsing and isolated global model/capability discovery |

## Request pipeline

`startHost` creates a Node HTTP server with an 8 KiB header limit and five-second header, request, and socket deadlines. Once a session operation has passed admission, the socket timeout is cleared; RPC has its own deadlines. The server binds loopback before writing data.

Each response starts with `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a restrictive CSP. Scripts, styles, and connections are same-origin; images use blob URLs; frames, base URLs, and form submissions are disabled. HTML, CSS, and the fixed browser module map are served directly, not through an arbitrary filesystem path.

`handle` processes a request in this order:

1. Reject duplicate security-sensitive headers: Host, Origin, Authorization, Cookie, both Dwell headers, and Last-Event-ID.
2. Select the local or configured HTTPS authority, reject cross-origin requests, and reject CLI Authorization on the HTTPS lane.
3. Reject requests while starting/stopping and request targets longer than 2048 characters.
4. Parse the path and the narrowly supported query forms. Directory browsing accepts one `path`; history accepts one nonempty `cursor` of at most 1536 characters. Other query strings fail.
5. Determine the allowed method. Unknown paths return 404; wrong methods return 405 with `Allow`.
6. Authenticate protected routes; reject bodies on GET; enforce CLI-only runtime configuration and browser mutation checks.
7. Parse bounded JSON, apply operation-specific validators, and delegate to the service.
8. Map typed errors to the public error envelope. Unknown exceptions produce a generic 500; errors after headers have been sent destroy the response.

`readJson` accepts `application/json` with an optional UTF-8 charset, rejects Content-Encoding, checks both declared and streamed byte counts, and accepts only JSON objects; arrays and primitives are rejected. Most bodies have an 8 KiB limit; turn submission has an 8 MiB JSON limit, with a separate 8 KiB UTF-8 message limit.

## Complete route map

All API paths below are relative to `/api/v1`. **Either** means local bearer authentication or a browser cookie plus binding key. Browser POST operations also require the matching Origin and `X-Dwell-Request: 1`. Empty bodies mean the JSON object `{}`, not a missing Content-Type.

| Method and route | Authentication | Input and result |
| --- | --- | --- |
| `GET /` (outside API prefix) | Public, authority checked | Host page |
| `GET /style.css`, browser asset map (outside prefix) | Public, authority checked | Fixed CSS/JS resources |
| `GET /healthz` (outside prefix) | Public, authority checked | `{status: "ok"}`; process availability, not provider readiness |
| `GET /status` | Either | HostStatus, including mode, PID, instance and capabilities |
| `POST /auth/pairings` | CLI | `{}` → 201 pairing code and expiry |
| `POST /auth/pair` | Browser origin/request marker; no prior login | `{code, browserKey}` → session cookie and `{ok: true}` |
| `POST /auth/logout` | Browser | `{}` → remove that browser, clear cookie, revalidate streams |
| `POST /auth/revoke` | CLI | `{}` → remove all browsers and pending codes, revalidate streams |
| `POST /runtime` | CLI only | Absolute executable and optional entryPoint → verified stored configuration |
| `GET /directories[?path=…]` | Either | Canonical host directory, parent, child directories, truncation flag |
| `GET /models` | Either | Global isolated discovery result wrapped in `models` |
| `POST /model-capabilities` | Either | Provider/model → thinking levels and image support |
| `GET /sessions` | Either | Session list |
| `POST /sessions` | Either | requestId, directory, optional provider+model → 201 ready session; failed/interrupted creation returns a typed error |
| `GET /sessions/:id` | Either | SessionInfo |
| `POST /sessions/:id/open` | Either | `{}` → reopened SessionInfo |
| `POST /sessions/:id/close` | Either | `{}` → closed SessionInfo |
| `GET /sessions/:id/context` | Either | Current Pi context projection; opens/reopens the runtime as needed |
| `GET /sessions/:id/models` | Either | Session-scoped model registry, including extension models |
| `POST /sessions/:id/model-capabilities` | Either | Provider/model → session-scoped capability metadata |
| `POST /sessions/:id/model` | Either | Provider/model, optional thinkingLevel → effective SessionInfo |
| `GET /sessions/:id/history[?cursor=…]` | Either | Page of projected native branch history |
| `GET /sessions/:id/history/:entry/images/:index` | Either | Validated native saved image bytes with MIME type and length |
| `GET /sessions/:id/events` | Either | SSE; optional Last-Event-ID cursor |
| `POST /sessions/:id/turns` | Either | requestId, message, optional images → 202 new turn or 200 existing turn |
| `GET /sessions/:id/turns/:run` | Either | Durable turn metadata |
| `GET /sessions/:id/turns/:run/result` | Either | Turn result resolved from native history |
| `POST /sessions/:id/turns/:run/abort` | Either | `{}` → cancellation outcome |
| `POST /sessions/:id/native-executions/:execution/abort` | Either | `{}` → stop the specified native execution |

Image entry IDs are percent-decoded with explicit failure handling. Image indices must be safe integers. The route resolves content from the selected session/entry; clients cannot provide a filesystem path.

Session creation accepts provider and model together or neither and rejects unknown keys. Runtime configuration also rejects unknown keys. Turn and model payloads use shared validators; see [contracts](contracts.md). Session routes return typed service results, keeping catalog objects out of route responses.

## Authority and HTTPS configuration

`readBrowserOrigin` reads optional production-only `access.json` through the private-file reader. Its exact shape is `{ "version": 1, "browserOrigin": "https://host.example" }`; extra fields, noncanonical origins, paths, query strings, fragments, wildcards, and oversized text fail. Development ignores this file.

`requestAccess` accepts the literal loopback authority or the one configured HTTPS authority. A request to the local authority containing Forwarded or X-Forwarded-* is rejected, preventing a proxy from selecting the local credential lane. Forwarded headers never grant access. A proxy must preserve the configured Host; TLS terminates outside Dwell while the listener remains loopback.

Local cookies are named by mode. HTTPS cookies use the `__Host-` prefix and Secure. Both use Path=/, HttpOnly, SameSite=Strict, and a bounded Max-Age. These checks assume a trusted host account and local executable environment; they do not authenticate a malicious replacement process occupying the exact local origin.

## LocalAuth internals

`open` prepares private state and exclusively creates missing `auth-token` and `browser-sessions.json` files. Existing files are read and validated; malformed state remains in place and causes startup to fail. The CLI token is 32 random bytes encoded as 64 hex characters. `isCli` checks format before timing-safe comparison.

Browser sessions persist only SHA-256 hashes of the cookie token and browser binding key, plus expiry. `parseSessions` checks version, exact keys, hash formats, positive safe expiry values, unique hashes, and a maximum of 100 records. `isBrowser` validates both supplied secrets and requires an unexpired matching pair.

Pairing uses eight independent cryptographic selections from an alphabet excluding ambiguous `0/O/o` and `1/I/i`. Codes are case-sensitive. The in-memory map stores code hashes and five-minute expiries; collisions regenerate. Creation prunes expired codes and permits at most ten pending codes.

`redeem`, `logout`, and `revoke` run through a promise chain. A rejected action does not poison the queue. Redemption permits at most 20 attempts in a rolling minute after HTTP shape validation, prunes expired browser records, enforces the 100-session limit, writes a new 30-day browser session, then deletes the code. A persistence failure faults browser authentication until repair and restart; new state is not installed in memory before a successful write.

`logout` removes one token and expired sessions. `revoke` saves an empty list and clears pending codes. `drain` lets host shutdown await admitted authentication writes. Pairing codes and rate-limit counters are memory-only and reset on restart.

## SSE writer and backpressure

The event hub owns ordering/replay; `createSseConnection` owns one HTTP response. `encodeFrame` validates the shared frame, safe event name, and newline-free cursor before encoding event/id/data lines.

Each connection has a queue, byte count, blocked/started/closed/ending flags, an unsubscribe callback, heartbeat, and error-flush timer. Its 256 KiB budget counts queued buffers **and** the response's writableLength. An oversized initial snapshot raises `SseStartError` before headers; overflow after streaming starts destroys that slow connection.

`start` prepends initial frames ahead of notifications queued during subscription, checks authorization and the combined budget, sets SSE headers, and pumps. `pump` rechecks authorization before each write and pauses when `response.write` signals backpressure. `drain` resumes it. Heartbeats run every 15 seconds by default and also recheck authentication.

A `stream.error` detaches observation, attempts to flush the error, and bounds that flush to one second. `release` clears timers, queue and listeners exactly once, and isolates unsubscribe/onClose exceptions from producers. Revocation and logout explicitly revalidate all active streams; expiry is also detected by heartbeats/writes. A disconnected observer cannot stop the Pi execution it was watching.

## Directory discovery

`listHostDirectories` defaults to the host home and accepts absolute paths up to 4096 characters. It resolves the selected path, checks that it is a directory, and enumerates readable child directories and directory symlinks. Hidden names and overlong names are skipped; inaccessible children are skipped. Results are sorted by name, with a canonical parent or null at the root.

A scan stops after 10,000 entries or 500 included directories and marks truncation. The result is a bounded directory browser, not an unrestricted file-content API. Missing paths become invalid-directory errors; permission errors are distinct from generic discovery failure.

## Global model discovery

Global discovery differs from the active session registry described in [sessions/storage](sessions-storage.md). It creates a private temporary workspace containing isolated agent, cwd, package, and session directories. It resolves the configured Pi agent directory from HOME/PI_CODING_AGENT_DIR and copies only the allowlisted configuration files: auth, OAuth, settings, models, and model-store JSON.

Copies are limited to 8 MiB per file and 16 MiB total and written privately. The child environment selects that workspace, sets offline mode and plain terminal output, and disables native resource discovery for the probe. Temporary local credentials must never be logged or included in documentation.

`discoverPiModels` verifies the exact executable version, handles the RPC-entry/CLI-entry distinction, and runs Pi's offline model-list command with a 15-second timeout and 1 MiB output cap. The parser strips terminal controls, locates known table columns, validates provider/model lengths and yes/no flags, rejects duplicate model IDs, and caps the list at 10,000 models.

`discoverPiModelCapabilities` starts an isolated Pi process for the requested model, verifies the effective selection, and reads thinking levels and image support. Both paths remove temporary state; the capability path also stops its child. Cleanup failures are surfaced explicitly, including when discovery otherwise produced a result.

## Error and test map

Public errors use `{error: {code, message}}`. AccessError and SessionError preserve their status and code. SSE initialization maps unauthenticated to 401 and other initialization failures to 503. Rate limits receive Retry-After (300 seconds for pending-code saturation, otherwise 60). Unknown internal errors do not expose stack traces.

Read [host.test.ts](../../tests/host.test.ts), [auth.test.ts](../../tests/auth.test.ts), and [access.test.ts](../../tests/access.test.ts) for transport and authentication boundaries; [sessions-http.test.ts](../../tests/sessions-http.test.ts), [turns-http.test.ts](../../tests/turns-http.test.ts), [history-http.test.ts](../../tests/history-http.test.ts), and [images-http.test.ts](../../tests/images-http.test.ts) for operation routes; [events-http.test.ts](../../tests/events-http.test.ts) for streams; [session-discovery.test.ts](../../tests/session-discovery.test.ts) for isolated discovery.
