# Authority and browser authentication

English | [简体中文](../../i18n/zh-CN/handbook/implementation/authentication.md)

[Implementation index](README.md) · [HTTP request handling](http.md) · [Authentication overview](../http-auth.md)

Dwell has two credential lanes: a long-lived CLI bearer credential for local administration and a paired browser session for the Web client. Optional HTTPS access uses an exact configured proxy authority with the same browser pairing and cookie binding.

<a id="authority-and-cookies"></a>
## Authority selection and browser cookies

[readBrowserOrigin](../../../src/server/access.ts#L8) loads optional access.json only in production. The private file must contain exactly version 1 and one canonical HTTPS browserOrigin. Paths, query strings, fragments, wildcard hosts, alternate spellings, extra keys, and oversized text fail startup. Missing configuration means no HTTPS lane; development ignores the file.

[requestAccess](../../../src/server/access.ts#L65) selects between the exact loopback Host and the one configured HTTPS Host. Forwarded metadata never selects an authority. A local-authority request carrying Forwarded or X-Forwarded-* is rejected, so a proxy cannot use the local credential lane by forwarding a forged loopback Host. The configured proxy must preserve Host; TLS terminates outside Dwell while the listener remains on loopback.

The selected authority determines the browser cookie name and whether it is secure. [browserCookie](../../../src/server/access.ts#L94) sets Path=/, HttpOnly, SameSite=Strict, and Max-Age. The HTTPS cookie uses the __Host prefix and Secure with no Domain attribute; the local cookie is scoped to its host mode without Secure. The cookie contains a random bearer secret, while the request also needs the origin-scoped browser binding key.

<a id="browser-session-auth"></a>
## LocalAuth state and pairing

[AccessError.constructor](../../../src/server/auth.ts#L25) carries public status and code. [digest](../../../src/server/auth.ts#L32) hashes browser secrets before persistence. [parseSessions](../../../src/server/auth.ts#L36) treats the browser-session file as untrusted input: it checks the version and exact object shape, caps records at 100, validates both SHA-256 hex hashes and safe positive expiry values, and rejects duplicate cookie hashes. Invalid or unsupported state remains in place and causes startup to fail.

[LocalAuth.constructor](../../../src/server/auth.ts#L97) receives already validated durable state and creates memory-only pairing-code, rate-limit, queue, and storage-fault state. [LocalAuth.open](../../../src/server/auth.ts#L104) prepares the private data directory, exclusively creates a 32-byte random CLI token and an empty session file when absent, then reads both through the private-file boundary. An existing unsafe or malformed file is preserved and reported as an error. [LocalAuth.isCli](../../../src/server/auth.ts#L121) checks bearer format before a timing-safe token comparison. [LocalAuth.available](../../../src/server/auth.ts#L130) stops browser-auth operations after a persistence failure. [LocalAuth.isBrowser](../../../src/server/auth.ts#L139) requires correctly shaped cookie and browser-binding values, hashes each, and matches an unexpired stored pair.

[LocalAuth.createPairing](../../../src/server/auth.ts#L158) removes expired pending codes, caps the map at ten, and generates eight case-sensitive characters from an alphabet that omits ambiguous glyphs. The map stores only each code's hash and five-minute expiry; collisions are regenerated. Each persisted browser session lasts 30 days. Pairing attempts and codes are memory-only, so a restart clears them.

All durable mutations pass through [LocalAuth.serialize](../../../src/server/auth.ts#L181), a promise queue whose tail recovers after a rejected action so later mutations can still run. [LocalAuth.save](../../../src/server/auth.ts#L190) atomically replaces the private browser-session file and changes in-memory sessions only after the write succeeds. A failed save faults browser authentication until repair and restart. The HTTP error path also revalidates active streams, so browser observers close as soon as the failed write makes their authorization unavailable.

[LocalAuth.redeem](../../../src/server/auth.ts#L204) serializes a rolling 20-attempt-per-minute limit, code expiry/use validation, expired-session pruning, and the 100-browser cap. It writes the new hashed cookie and browser-key pair before consuming the code or returning the raw cookie token. [LocalAuth.logout](../../../src/server/auth.ts#L241) removes one token and expired rows. [LocalAuth.revoke](../../../src/server/auth.ts#L252) persists an empty list before clearing pending codes. [LocalAuth.drain](../../../src/server/auth.ts#L260) lets shutdown await all queued writes already admitted.

<a id="http-authentication-integration"></a>
## HTTP admission and stream revalidation

The HTTP [handle](../../../src/server/http.ts#L167) checks duplicate security-sensitive headers, then delegates Host selection to requestAccess. A request carrying Origin must match the selected authority. The HTTPS lane rejects Authorization entirely so CLI bearer credentials stay on the loopback address. Protected session and status routes accept either a valid CLI token or a browser cookie plus matching browser-binding key. Browser POSTs also need the matching Origin and Dwell request marker; Pi executable configuration remains CLI-only.

Pairing creation and browser revocation require the CLI credential. Pair redemption is public to the selected browser origin but validates the exact code and browser-key shape before calling LocalAuth.redeem. The handler sends Set-Cookie only after redemption has durably saved the session. Logout validates that the presented cookie and browser binding still match, removes that one browser, expires its cookie, and revalidates event streams. Revoke atomically clears all persisted sessions and pending codes, then closes every stream whose browser authorization no longer holds.

For example, the CLI creates a short pairing code; the browser redeems it with its browser key, matching Origin, and Dwell request marker. The response sets an HttpOnly cookie. Later GETs send that cookie with the browser key; browser POSTs also send the Origin and request marker. A copied cookie without its matching browser key is rejected.

[openEventStream](../../../src/server/http.ts#L134) closes over the request headers and rechecks the same credentials before writes and heartbeats. [revalidateEventStreams](../../../src/server/http.ts#L130) closes affected streams immediately after logout or revoke, including when no event or heartbeat arrives. The stream writer's queue, expiry checks, and response cleanup are documented in [HTTP and SSE](http.md#sse-lifecycle-and-overflow).

<a id="authentication-test-evidence"></a>
## Test evidence

[auth.test.ts](../../../tests/auth.test.ts#L21) covers code collisions and case sensitivity, private initialization, restart persistence, cookie binding, expiry, logout/revoke, storage failures, and corrupt state. [access.test.ts](../../../tests/access.test.ts#L121) covers production HTTPS pairing, Host/Origin checks, forwarded-header rejection, cookie flags, configuration validation, and immediate SSE closure on revoke. [events-http.test.ts](../../../tests/events-http.test.ts#L534) exercises stream closure on browser revoke, logout, expiry, and authentication storage failure using synthetic local sessions.
