# Web client internals

English | [简体中文](../i18n/zh-CN/handbook/web-client.md)

Detailed prose walkthrough: [Implementation](implementation/browser-controller.md).

The web client is the browser-facing conversation surface for a host-owned Pi
session. Use the [handbook index](README.md)
to navigate the chapters and the [project README](../../README.md) for the
project overview.

The browser owns presentation and short-lived UI state. The host owns session
catalog state, Pi runtimes, native transcript files, turn admission, and saved
history. The client sends same-origin HTTP requests and observes a session
event stream; it does not call a model provider directly. Unless stated
otherwise, API paths below are relative to `/api/v1`.

## Runtime path

The host serves the browser page from this fixed set of source modules:

1. [page.ts](../../src/clients/web/page.ts) defines the HTML shell and styles.
2. [script.ts](../../src/clients/web/script.ts) exposes a fixed browser asset
   map. Node strips TypeScript types, rewrites local imports from `.ts` to
   `.js`, and serves the pinned `marked` module from a fixed vendor URL.
3. [client.ts](../../src/clients/web/client.ts) connects the page controls to
   the host API, session state, history renderer, and SSE observer.
4. [transport.ts](../../src/clients/web/transport.ts) adds the browser binding
   to API requests and converts failed responses to `ApiError`.
5. [events.ts](../../src/clients/web/events.ts) decodes SSE frames and reduces
   them into browser-side live state.
6. [conversation.ts](../../src/clients/web/conversation.ts) turns saved and
   live Pi projections into DOM fragments; [dom.ts](../../src/clients/web/dom.ts)
   reconciles those fragments while retaining stable visible nodes.

The fixed `script.ts` allowlist names the client modules and their shared
protocol dependencies; an asset request can address only that set. Browser
asset tests check the exposed module set and confirm auth implementation
modules remain private.

## Source map

| File | Responsibility |
| --- | --- |
| [client.ts](../../src/clients/web/client.ts) | Main UI coordinator: authentication, session selection, API calls, model and image capability state, SSE/history lifecycle, composer submission, close/reopen flows, and event handlers. |
| [page.ts](../../src/clients/web/page.ts) | Static HTML shell, pairing gate, navigation, conversation region, composer, dialogs, and CSS. |
| [script.ts](../../src/clients/web/script.ts) | Fixed TypeScript-module-to-browser-asset map and native type stripping. |
| [transport.ts](../../src/clients/web/transport.ts) | Browser binding storage, request headers, JSON fetch wrapper, and HTTP error decoding. |
| [events.ts](../../src/clients/web/events.ts) | SSE text framing, event validation, browser conversation state, ordering, bounded live accumulation, resync, history merge, and live/saved de-duplication. |
| [conversation.ts](../../src/clients/web/conversation.ts) | Saved-message grouping, tool/result pairing, thinking disclosures, tool and context display, saved/live message DOM, and unchanged-group caching. |
| [dom.ts](../../src/clients/web/dom.ts) | Identity-based DOM reconciliation that preserves compatible elements, open disclosures, handlers, and marked subtrees. |
| [markdown.ts](../../src/clients/web/markdown.ts) | Marked lexer integration and safe construction of supported Markdown DOM. |
| [attachments.ts](../../src/clients/web/attachments.ts) | Per-session image drafts, validation, asynchronous decode, previews, removal, and object URL cleanup. |
| [input.ts](../../src/clients/web/input.ts) | Composer resizing, viewport/keyboard accommodation, scroll anchoring, and guarded long-press Backspace behavior. |
| [tool-command.ts](../../src/clients/web/tool-command.ts) | Bash command summary and full multiline disclosure. |
| [icons.ts](../../src/clients/web/icons.ts) | Small fixed inline SVG control icons and text/icon button labels. |

## Page structure and interaction

The shell contains a pairing gate and a hidden application shell. Once
connected, the application has a conversation sidebar, open-session status
tabs, a notice region, a scrollable conversation, and a composer. Dialogs cover
session close, directory-based creation, model selection, host details, and
image preview. IDs in `page.ts` are the DOM contract consumed by
`client.ts`; `el()` validates each required ID and its expected element class.

Status tabs expose Ready, Working, Needs attention, Stopped, or Opening.
Their close action appears only after selecting a tab once more; tab slots are
assigned to currently runtime-open sessions and reused after close.

The stylesheet is colocated with the HTML template. At widths up to 760 px the
sidebar becomes a drawer, and the composer adapts to the smaller viewport. The
viewport declaration requests `interactive-widget=resizes-content`; the
composer code also checks `VisualViewport` when the keyboard still occludes
content. Focus-visible styles, semantic labels, status text, native dialogs,
and reduced-motion rules are implemented in the page/client pair.

The composer binds Enter-to-send only for a fine pointer, and only when Shift
is not held and input composition is not active. On touch layouts, Enter stays
available to the keyboard. Shift+Enter inserts a line break. The textarea
resizes up to a viewport-relative height and then scrolls internally;
conversation scroll position is kept near the bottom when already following
the latest message and anchored when the reader has scrolled upward.

The composer also accelerates repeated Backspace only for trusted, non-IME
key events with no modifiers and a collapsed caret. After 1.2, 2.4, and 4
seconds of holding the key, the deletion step grows to 2, 4, and 8 characters
when the browser supports native deletion; it resets if the caret moves.

## Browser state and persistence

The main coordinator keeps separate state for the session catalog, selected
session, current live stream projection, saved history pages, context preview,
model capabilities, turn metadata, input drafts, image drafts, pending
requests, and lifecycle generations. Generation counters invalidate late
responses after a session switch, reconnect, or authentication change.

| State | Storage | Behavior |
| --- | --- | --- |
| Browser binding | `localStorage`, key `dwell.browser-binding.v1` | A 32-byte cryptographically random value represented as 64 lowercase hex characters. It is created during pairing and sent as `X-Dwell-Browser`. |
| Selected session preference | `localStorage`, key `dwell.web.preferences.v1` | The current UI writes the selected ID. A stored ID is a preference; the client selects it only when `runtimeState !== closed`. |
| Text drafts | JavaScript `Map`, keyed by session ID | Switching sessions saves and restores the current textarea value. A full page reload loses these drafts. |
| Image drafts | `Attachments` instance, keyed by session ID | Held in memory as image payloads and object URLs; not stored in localStorage. They remain associated with a session while switching within the page, then are cleared on authentication loss/logout or successful send. |
| Pi session and transcript | Host-owned catalog and native Pi files | The browser lists and displays them through the host API. They outlive page reloads and browser disconnection. |

`transport.ts` uses JSON requests with `cache: no-store`, same-origin
credentials only when a browser binding exists, and a 15-second GET or
60-second POST timeout. POSTs add `Content-Type: application/json` and
`X-Dwell-Request: 1`. A returned `{ error: { code, message } }` becomes an
`ApiError` carrying HTTP status and the host code. Other failures receive a
bounded generic message. If browser storage cannot persist the binding,
transport reports a pairing failure and does not send an unpersisted token.
The wrapper returns `unknown` JSON; each caller validates its response with
the relevant shared guard before using it.

## Connect, select, and refresh

`connect()` reads `/api/v1/status`, validates it with `isHostStatus`, then
refreshes `/api/v1/sessions`. The pairing form first creates or reuses the
browser binding and posts the pairing code to `/api/v1/auth/pair`. A 401
returns the user to the pairing gate. The browser stores no provider API key
and does not sign in to a provider.

The first selection after refresh prefers the saved selected ID only when that
session is runtime-open. Otherwise it selects the first open session; if all
sessions are closed, no historical session is opened automatically. Selecting
a closed or failed catalog item through the sidebar is an explicit action:
`openFromSidebar()` posts to `/sessions/{id}/open`, validates the returned
session, refreshes navigation, and then selects it.

`select()` is the transition boundary. It saves the previous textarea
draft, stops the old stream, increments the client generation, resets model
capability and history-recovery state, associates image drafts with the new
session, releases saved-image object URLs, clears visible history/live state,
and restores that session's text draft. It then probes model capability,
starts the SSE request, and loads latest saved history. Requests that return
after a later selection are ignored by the generation/session checks.

While authenticated, `poll()` refreshes the session list every five seconds.
The selected session's event stream is independent of this list poll. A
`session.updated` stream frame can update the selected catalog entry sooner;
the next poll also detects changes made by another browser or a Pi process.
The poll refreshes catalog state; opening a closed session requires a sidebar action.

## Session creation and model selection

The new-session dialog asks for a directory. `browse()` reads the host's
directory listing and validates the shape before populating parent/child
choices. Creation posts only a UUID request ID and directory to `/sessions`;
model and thinking selection happen later. The host starts Pi with its
native/default selection, after which the separate model picker can change
the selected session.

Creation uses `pendingCreate` to retry with the same request ID if the
response is uncertain. A confirmed session is selected after refresh. The
host supplies directory choices and owns their enumeration.

The model picker is session-scoped:

1. `showModels()` requests `/sessions/{id}/models` and validates the
   response. The list comes from the Pi runtime loaded for that session,
   including extension-provided models.
2. The text search filters provider and model ID in the browser.
3. `showThinking()` requests or reuses `/model-capabilities`. This supplies
   the model's allowed thinking levels and image support.
4. A model with one thinking level selects it directly. Otherwise the user
   chooses one of the returned levels.
5. `changeModel()` sends provider, model, and thinking level as one session
   mutation. It refreshes authoritative session state after a failed or
   uncertain response and never replays the mutation automatically.

The picker is disabled while the session is working, while another model
mutation is pending, or while send/create/image work blocks selection.
Capability results are keyed by session/provider/model and invalidated when
the model picker opens, the selected session changes, or the page resumes.
Image intake stays disabled while model capability is unknown or being
checked, and when the selected model reports no image support. An existing
image remains removable after switching to a text-only model.

## Message submission and stopping

`submit()` uses two distinct busy paths before creating a new turn:

- If Pi reports a running native extension execution, the button sends an
  abort request for that exact native execution ID.
- If Dwell reports an active turn, it sends an abort request for that turn ID.

When idle, a submission contains a UUID `requestId`, the textarea text, and
optional image records. It rejects text over 8 KiB in UTF-8, text that is
blank after trimming unless at least one image is attached, and input whose
leading whitespace is followed by `/`. Slash commands are not exposed through
this composer. Image-only messages are allowed. The shared request guard
defines the same constraints; see [contracts](contracts.md#turn-submission).

The client keeps the exact request ID, message text, and image payload in
`pendingSend` until it can confirm the outcome. Retrying an uncertain request
reuses that ID, so a lost response does not create a new logical request.
Successful HTTP or matching SSE turn acknowledgement clears the draft and
attachments. Most 4xx responses clear the pending retry; HTTP 408 is treated
as uncertain. The notice explains that a retry will use the same request.

## Image attachment lifecycle

`Attachments` manages draft image files independently from message text:

- The picker and paste handler accept PNG, JPEG, WebP, or GIF, up to four
  images with a combined decoded size of 5 MiB. The shared guard also caps
  each image at 5 MiB, so the total cap is the tighter limit for a multi-image
  request.
- A file is read as a data URL, converted to the JSON-safe image shape, checked
  against MIME and magic bytes, and decoded by the browser before it is added.
  A generation/session check discards the result if the user switches session
  or loses authentication while decoding.
- The tray uses a temporary object URL for preview. Removing an item or
  clearing a session revokes its URL.
- The JSON image data is sent only when the user submits the message to the
  host turn endpoint. There is no separate upload request while drafting.
- Saved-image rendering later requests a history image by session, entry ID,
  and image index from `/sessions/{id}/history/{entryId}/images/{index}`. It
  checks the returned type and size, queues reads serially, and caches an
  object URL for the active conversation. URLs are revoked when changing
  session or resuming the page.

Attachment intake is blocked while the session is busy, a send/model change is
pending, Pi's image support check is unresolved, or the chosen model is
text-only. The attach control may offer a capability-check retry after a
failed probe.

## SSE, live state, and saved history

`stream()` opens `/sessions/{id}/events` with an
`Accept: text/event-stream` header and the current cursor in `Last-Event-ID`.
It requires a successful response and an SSE content type. `SSEDecoder`
accepts fragmented UTF-8, LF/CRLF framing, multiline data, and heartbeats. It
bounds unfinished frames at 256 KiB, validates event metadata/JSON, and checks
event-name/type plus SSE-ID/cursor consistency (resync frames carry no ID).
Every frame must name the selected session.

`reduceFrame()` returns a new state and leaves its input unchanged. It ignores
foreign-session, duplicate, stale, or out-of-order frames; cursor gaps mark
the projection incomplete until a snapshot/resync path repairs it. The
browser accumulates a bounded live window and retains message text ranges and
thinking blocks in native content order. Its accumulator holds at most 64
live messages and 64 tools, and caps each live message's text plus thinking
content at 64 KiB. This client accumulation is separate from the shared
snapshot projection's eight-tool limit. Shared event limits and units are
documented in [contracts](contracts.md#event-stream).

Live output remains visible until saved history proves the matching terminal
turn or native execution is on the saved branch. A native message identity is
used to hand the live DOM content to its saved entry. Repeated identical text
from different native messages remains distinct; text equality is not used as
the de-duplication key.

History reads use `/sessions/{id}/history`; older pages add the server cursor.
The latest page replaces only the branch-incompatible suffix while preserving
a compatible older prefix. Older pages are prepended without repeated entry
IDs. A pending history response does not erase existing saved state. Context
source previews are updated only from a non-pending page.

The browser loads latest history on selection and after snapshots, resync,
terminal turn updates, or native execution settlement. A missing terminal
coverage marker triggers bounded re-reads. Failed history reads schedule one
retry; after repeated failure the conversation shows a retry row. The “Load
earlier messages” control appears when a next cursor exists.

Transport and ordinary action failures appear in the notice region; model,
creation, and close failures also use their dialog-specific feedback. A 401
returns the browser to pairing. Turn/native execution error metadata is shown
beside the conversation projection, separate from assistant text.

## Conversation rendering and safe Markdown

Saved and live content share the same Markdown renderer. `renderMarkdown()`
parses GFM tokens using `marked.lexer()` but constructs DOM nodes explicitly:
it does not insert a rendered HTML string. Raw HTML tokens become text.
Links are resolved and restricted to HTTP, HTTPS, and mailto protocols, and
open in a new tab with `noopener noreferrer`. Markdown image syntax becomes
a safe text link; saved transcript images use the authenticated image route. Code blocks,
tables, task lists, headings, lists, quotes, emphasis, and inline code are
rendered from an explicit element allowlist. Token traversal stops beyond 64
levels or 12,000 visited tokens.

`groupConversationEntries()` keeps every response-side entry together until
the next user entry, so assistant text, tool results, extension messages,
context notes, and diagnostics do not fragment the response into separate
turn bubbles. `pairToolResults()` matches native tool calls and results in
FIFO order by call ID; unmatched results remain visible as orphan details.
Saved bash commands show the first meaningful line and physical line count
when multiline, with the full command available in the disclosure. Tool input
and output are shown in expandable details, and error details start open.
Custom extension messages remain visible; context, branch/conversation
summaries, and diagnostics use their own disclosure presentation.

Thinking blocks render as collapsed `<details>`. If the text begins with a
Markdown heading or bold heading no longer than 72 characters, that heading
becomes the disclosure label and is removed from the body; otherwise the label
is “Thinking” and the full content remains inside. Live and saved thinking
share a stable native-message/content-index key, allowing an expanded
disclosure to stay expanded across the live-to-history transition. Tool errors
start expanded.

The history “Context” disclosure previews the bounded set of project
instruction sources reported as part of Pi's saved system context. The page
can say some source content was omitted or truncated. It does not show the
complete effective model prompt or runtime context. The history contract and
its source/byte limits are in
[contracts](contracts.md#saved-history).

## DOM and scroll continuity

`SavedConversationRenderer` caches unchanged saved groups so live events can
reuse saved Markdown subtrees. `reconcileChildren()`
matches elements by `data-key`, `data-entry-id`, or `data-session-id` and
retains compatible DOM nodes. This preserves open `<details>` elements,
handlers, focusable controls, and explicitly marked subtrees while replacing
nodes whose preserve marker or render version changed.

Before rendering, `renderConversation()` records whether the reader was near
the bottom, the visible history anchor, expanded disclosures, and focused
tool summary. After reconciliation it follows the bottom only when the reader
was already there; otherwise it restores the anchor's screen position. If a
focused tool summary was replaced, focus moves to the same keyed summary.

## Close, reopen, and browser lifecycle

Closing an open session takes two steps. Activating the
selected status tab reveals its close affordance; the close dialog then reads
fresh session metadata and a short saved user-message preview. If the session
is busy, its copy says “Stop and close?” and the confirmation path targets the
captured turn ID or native execution ID. The client checks that identity again
before aborting, waits for settlement, and rejects a race if a newer run
starts. It then posts `/close`. Closing removes the runtime from the open-tab
strip but retains the session catalog identity and saved Pi history.

Reopening is explicit from the sidebar. A page reload never opens a historical
closed session just because its ID was stored as the last selection. Close
errors are shown in the dialog and the session list is refreshed to learn
whether the host nevertheless completed the close.

The tested Pi handoff is sequential: close the Dwell runtime, run another Pi
process against the same native session identity, then reopen through Dwell to
read the appended transcript. This flow is covered by the sessions test.

`pagehide` stops the browser's stream and polling, but it does not send an
abort or close request. When the page returns through `pageshow`, `online`,
or visibility restoration, `resume()` invalidates stale capability/model-picker
work, releases saved-image object URLs, reconnects the selected stream, reloads
history, and polls the session list. Losing authentication or forgetting the browser
stops the stream and polling, clears in-memory image drafts, and returns to the
pairing gate while host work remains host-owned.

## Pi extension boundary

The browser is a passive observer of Pi runtime behavior. Dwell turns and
native Pi extension executions have separate IDs and lifecycle state. An
extension-handled input can finish without a model turn; a native extension
execution can continue asynchronously and is observed through session state
and stream events. The browser can abort a reported running native execution,
but it does not provide Pi's interactive extension-dialog API.

Pi extension confirmation dialogs require an interactive Pi observer. The
runtime test “passive Pi observers do not keep dialogs open without an
interactive observer” verifies that a browser-style passive observer alone
does not keep such dialogs open. The browser composer also rejects slash
command input, so it is not a general Pi terminal or command surface.

## Test coverage

| Coverage | Evidence |
| --- | --- |
| Browser shell, same-origin assets, fixed asset set, and directory-only creation | [web.test.ts](../../tests/web.test.ts), [web-client.test.ts](../../tests/web-client.test.ts) |
| Markdown, thinking disclosures, tool grouping/pairing, and command summaries | [conversation.test.ts](../../tests/conversation.test.ts) |
| Fragmented SSE, cursor ordering/gaps, resync, branch merge, coverage, bounds, and native identity handoff | [web-events.test.ts](../../tests/web-events.test.ts) |
| Image signatures, byte/count limits, image-only messages, model support, Pi delivery, and saved images | [images.test.ts](../../tests/images.test.ts), [history-context.test.ts](../../tests/history-context.test.ts) |
| Loaded extension models, per-model thinking levels, and discovery without switching a closed session | [session-models.test.ts](../../tests/session-models.test.ts) |
| Native extension execution separate from Dwell turns; passive observer and interactive dialog boundary | [native-executions.test.ts](../../tests/native-executions.test.ts), [runtime.test.ts](../../tests/runtime.test.ts) |
| Pi transcript reopen, session close/reopen, and missing-history safety | [runtime.test.ts](../../tests/runtime.test.ts), [sessions.test.ts](../../tests/sessions.test.ts) |
| Desktop/mobile browser acceptance using a synthetic Pi environment and Chrome CDP | [check-web.ts](../../scripts/check-web.ts) |
