# Follow startup, pairing and session lifetime

English | [简体中文](../../i18n/zh-CN/handbook/implementation/workflow-lifecycle.md)

[Implementation](README.md) · [Handbook](../README.md)

<a id="startup"></a>

## From CLI to a ready listener

The entry point passes arguments to `runCli`; `parseCommand` selects foreground serving, local administration or OS service management. Service installation registers how the OS should launch the same application. Foreground serving imports the host only when required.

`startHost` validates the port and binds the loopback listener before preparing private state. Only after binding succeeds does it load access configuration, authentication and sessions. This ordering prevents a second host from changing shared files while another process owns the port. Requests during initialization or stopping receive unavailable responses. Development and production use different data locations but the same public port.

Session service startup opens and validates the catalog, reconciles interrupted records and leaves Pi runtimes lazy. No prompt is replayed during this startup. A ready listener establishes service availability. Provider credentials are exercised during model calls, and saved sessions are checked when reopened.

Source / verification: [`runCli`](../../../src/clients/cli/main.ts#L9) · [`startHost`](../../../src/server/http.ts#L102) · [`SessionService.create`](../../../src/sessions/service.ts#L240) · [tests/host.test.ts](../../../tests/host.test.ts)

<a id="pairing"></a>

## From local authority to browser access

The local CLI reads the owner-only bearer token and requests a short-lived pairing code. The browser creates a binding key, submits the code and key, and receives an HttpOnly session cookie after redemption is persisted. Authentication stores hashes, not the raw issued browser credentials. Serialized redemption prevents simultaneous uses of one code from both succeeding; a failed write must not consume a usable code.

Subsequent browser requests combine the cookie with the browser-binding header. Mutations additionally carry the expected origin and request marker. CLI bearer access and browser access remain distinct paths. Optional production HTTPS changes the accepted browser authority and cookie policy; it does not replace authentication with proxy identity headers. Revocation invalidates browser credentials and closes their streams. The browser returns to pairing rather than silently treating an authentication failure as a temporary network outage.

Source / verification: [`LocalAuth.redeem`](../../../src/server/auth.ts#L204) · [src/server/access.ts](../../../src/server/access.ts) · [tests/auth.test.ts](../../../tests/auth.test.ts) · [tests/events-http.test.ts](../../../tests/events-http.test.ts)

<a id="create"></a>

## Create identity before launching Pi

The browser directory picker lists directories on the host. Creation submits a request ID and the chosen directory; API clients can also supply a provider/model pair. `createSession` validates request shape and computes an identity from the originally admitted values before reading the filesystem. A matching retry can therefore find its record even if the directory has since disappeared.

For a new request, the service canonicalizes the directory, prunes exited children, enforces the eight-runtime limit and inserts a creating record containing separate Dwell and Pi IDs. It then launches Pi. A new empty session may have no JSONL file yet, so the catalog identity exists independently of a transcript. On launch failure the service attempts to persist failed and returns its internal view. The HTTP route turns that failed view into a 503 error containing the session ID, not a successful session response. If writing failed itself fails, creation rejects and the earlier creating record remains subject to restart recovery.

A new runtime may use Pi's configured defaults. Once native history exists, reopening uses its identity and effective model/thinking state. Explicit new-session model flags are not repeatedly forced over a resumed transcript. The runtime chapter explains readiness verification and startup resource discovery.

Source / verification: [`SessionService.createSession`](../../../src/sessions/service.ts#L506) · [`SessionService.#open`](../../../src/sessions/service.ts#L1912) · [tests/sessions.test.ts](../../../tests/sessions.test.ts) · [tests/session-models.test.ts](../../../tests/session-models.test.ts)

<a id="model"></a>

## Model selection and image preparation

The model picker fetches models from the selected live session's registry so extension-provided models can appear. Capability reads expose only the public provider/id, thinking levels and image support; they do not switch models to discover support. The browser guards late responses by the current selection and capability identity. A confirmed selection is sent to the service, which requires idle ownership, applies the model/thinking choice and reads back the actual Pi state before saving metadata.

Image drafts remain in browser memory, associated with their session. Intake checks file size/type and reads canonical content; preview resources are released when drafts are removed or cleared. Turn admission validates the JSON-safe images again, and execution verifies the selected model supports images. Saved images stay in Pi's native JSONL and are served through authenticated entry/index references.

Source / verification: [`SessionService.setSessionModel`](../../../src/sessions/service.ts#L587) · [`changeModel`](../../../src/clients/web/client.ts#L1997) · [src/clients/web/attachments.ts](../../../src/clients/web/attachments.ts) · [tests/session-models.test.ts](../../../tests/session-models.test.ts) · [tests/images-http.test.ts](../../../tests/images-http.test.ts)

<a id="close"></a>

## Stop, close and reopen

Stopping work targets an active durable turn or a specific native execution. Closing a session instead releases its runtime and retains its catalog/history. The browser close flow can request cancellation and wait for the runtime to become closable, but the service's close operation rejects active work rather than silently cancelling it. Before stopping an idle child, close remembers its history and refreshes relevant native execution coverage.

Reopen explicitly obtains a runtime for the stored session. Known missing or invalid history produces an unavailable/error boundary instead of creating a replacement empty conversation with the same apparent identity. Reading saved history does not need a Pi process, but reading current model context can open one. Returning to the browser therefore need not reopen every saved session.

Source / verification: [`SessionService.closeSession`](../../../src/sessions/service.ts#L698) · [`SessionService.getContext`](../../../src/sessions/service.ts#L729) · [`prepareClose`](../../../src/clients/web/client.ts#L770) · [`confirmSessionClose`](../../../src/clients/web/client.ts#L900) · [tests/history-service.test.ts](../../../tests/history-service.test.ts)

<a id="shutdown"></a>

## Orderly shutdown and restart recovery

The host close promise is shared across repeated calls. It closes streams and rejects new work while retaining the listener through admitted bookkeeping, then shuts down sessions and drains authentication writes before releasing the port. Session shutdown marks undispatched work aborted, cancels queued history reads, drains mutation coordination and asks active runtimes to stop. Pi stop closes input and escalates through bounded TERM/KILL waits.

The catalog stays open until tracked turn finalization, reads and discovery/refresh operations have settled. Restart reconciles unfinished durable work to interrupted rather than invoking it again. Crash, graceful cancellation and an ordinary browser disconnect are separate cases: only the last one leaves host ownership and ongoing execution intact without a stop request.

Source / verification: [`startHost`](../../../src/server/http.ts#L102) · [`SessionService.shutdown`](../../../src/sessions/service.ts#L1377) · [`PiProcess.stop`](../../../src/runtime/pi-process.ts#L682) · [tests/turn-recovery.test.ts](../../../tests/turn-recovery.test.ts) · [tests/host.test.ts](../../../tests/host.test.ts)
