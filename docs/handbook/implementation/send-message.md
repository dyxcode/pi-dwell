# Send a message to a hosted Pi session

English | [简体中文](../../i18n/zh-CN/handbook/implementation/send-message.md)

[Implementation](README.md) · [Handbook](../README.md)

<a id="behavior"></a>

## Behavior

Sending creates one durable Dwell turn in the selected Pi session. The browser sends original text and an optional ordered image set. Text is limited to 8 KiB; a request may contain up to four images totaling 5 MiB decoded. It requires nonblank text or an image, and the Web composer does not interpret slash commands.

Each attempt carries a request identity. If the host accepted it but the response was lost, the browser keeps that identity and payload so retry can recover the original turn. The host looks up the request identity within that session, then compares the full text-and-image payload. A matching retry returns the existing turn, including while it is running; reusing the identity with different content is rejected. A new identity creates a distinct attempt even when the visible text is the same.

The initial response confirms durable admission; execution continues after it and after the browser disconnects. The browser clears its draft and attachments after it confirms which request the host accepted.

<a id="ownership"></a>

## Ownership

The browser owns the unsent draft, attachment previews, and any submission whose acceptance remains unknown. It freezes that submission while confirmation is pending, then retries the same content and identity.

The HTTP boundary authenticates the caller, validates the bounded request, and delegates admission. The session service serializes catalog mutations through a global queue and uses a per-session active slot to prevent overlapping turns. SQLite owns durable request identity, turn status, cancellation intent, and references to native history entries. Pi owns prompt interpretation, extensions, model calls, tools, and the transcript that records resulting messages. The event hub keeps a bounded live projection while the Pi child continues under host ownership.

<a id="execution"></a>

## Execution

Admission validates the request again inside the global mutation queue. It looks up the session-scoped request identity, compares the stored content identity, and returns a matching turn before applying busy checks. For new work, the service confirms usable storage, an idle session, and Pi configuration. It commits the accepted turn, reserves that session's active slot, publishes state, and schedules execution outside the HTTP request.

The worker opens or resumes the same Pi session and checks image support against the active model. Before dispatch, Dwell reads saved history and records a baseline of native entry IDs and assistant-message identities. A SQLite transaction records dispatch intent and that Pi history is expected. The worker checks cancellation and shutdown again, then installs the Pi event observer before sending the prompt.

Pi's prompt response classifies input as an ordinary agent run or extension-handled input. Ordinary runs move through accepted, dispatching, and running before settlement. Dwell then reads saved history, identifies entries added since the baseline, and commits the terminal result with their references. Later result reads resolve those references against Pi's saved file.

<a id="mechanisms"></a>

## Mechanisms

Admission commits before prompt dispatch, so a failed commit prevents sending. The session-scoped request identity resolves retries; its separate content identity detects changed text or images.

Pi events can precede the prompt response. The runtime installs run state before its RPC write and correlates each response with its outstanding command. A command timeout rejects pending RPC work; after a prompt was sent, that leaves execution outcome uncertain. The pre-dispatch observer and saved-history baseline let Dwell reconcile transient events with newly persisted entries.

An extension may consume input without starting an ordinary assistant response. Dwell settles the request as handled, using only entries Pi actually saved. A later agent run started by the extension has its own native execution identity and is observed separately from the completed request.

After a host restart, a nonterminal durable turn is retained as interrupted. If dispatch had not begun, the recorded state identifies that the prompt was not sent; after dispatch, the outcome can be unknown because a tool or extension may have acted before the interruption. Neither case automatically resends the prompt.

<a id="technology"></a>

## Technology

Pi RPC preserves the installed coding-agent runtime and its extensions and tools, while Dwell owns the child process and session coordination. Correlated responses and asynchronous events separate acceptance from settlement.

SQLite protects admission and dispatch intent, while the long model run stays outside transactions and the global mutation queue. Native JSONL remains the result store; SQLite keeps lifecycle state and entry references.

<a id="verification"></a>

## Verification scenarios

After admission the browser loses the response and retries the same text and images with the same request identity. The host returns the original turn, and Pi receives one prompt.

Two simultaneous admissions with the same request identity and payload resolve to one turn. Changed content with that identity is rejected; a new identity is a distinct attempt.

An extension consumes a request without producing a normal assistant response. The request settles as handled, its result contains only entries Pi actually saved, and any extension-started follow-up appears as native work.

A restart after dispatch leaves the turn interrupted and does not replay it. A retry retrieves the recorded turn rather than repeating possible tool effects.
