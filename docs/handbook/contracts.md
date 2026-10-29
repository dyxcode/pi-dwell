# Shared protocol contracts

English | [简体中文](../i18n/zh-CN/handbook/contracts.md)

Detailed prose walkthrough: [Implementation](implementation/validators.md).

The shared contracts define runtime-checked shapes used by the host, browser,
and Pi adapter. Values from HTTP, saved history, and event streams are
untrusted until validators narrow them. Each validator has its own strictness
and budget; a TypeScript interface alone does not guarantee exact keys, path
canonicalization, or every application invariant.

## Module map

| Module | Main types and guards | Boundary |
| --- | --- | --- |
| [protocol.ts](../../src/shared/protocol.ts) | `HostStatus`, `isHostStatus`, `DEFAULT_PORT` | Host status response and protocol compatibility. |
| [sessions.ts](../../src/shared/sessions.ts) | `SessionInfo`, `SessionModelRequest`, `NativeExecutionInfo`, `RuntimeConfiguration` and validators | Session catalog/runtime metadata and model mutation input. |
| [thinking.ts](../../src/shared/thinking.ts) | `ThinkingLevel`, model capability request/response | Pi model reasoning levels and image support. |
| [discovery.ts](../../src/shared/discovery.ts) | `HostDirectoryListing`, model list response types and guards | Directory and loaded-model discovery responses. |
| [turns.ts](../../src/shared/turns.ts) | `TurnCreateRequest`, `TurnInfo`, statuses and guards | Durable Dwell request/turn catalog shape. |
| [images.ts](../../src/shared/images.ts) | `ImageContent`, image limits and guards | JSON-safe image data accepted by turns and Pi RPC. |
| [history.ts](../../src/shared/history.ts) | `HistoryEntry`, `HistoryPage`, `ContextSource` and `isHistoryPage` | Bounded display projection of a saved Pi branch. |
| [events.ts](../../src/shared/events.ts) | `StreamFrame`, turn/live projections, event budgets and `isStreamFrame` | Bounded JSON event protocol used over SSE. |

## Validation rules at a glance

- A guard accepting a value means only that it passed that guard. Some guards
  reject extra keys; others check required fields and allow additional ones.
- **Characters** usually means JavaScript string length, measured in UTF-16
  code units. Explicit byte limits use UTF-8 encoded length. History text
  blocks are one important character-count limit; live/event payloads mostly
  use UTF-8 byte limits.
- Live text ranges are UTF-16 offsets into the containing message string.
- Limits apply at the boundary described by the validator. They should not be
  added together as though they describe one global process-memory cap.
- Shape validation does not establish filesystem containment, canonical path
  identity, provider availability, execution success, or authorization.

## Host status

[protocol.ts](../../src/shared/protocol.ts) sets `DEFAULT_PORT` to `8787` and
defines service `pi-dwell`, protocol version 2, phase `sessions`, and
capabilities `sessions: true` / `tasks: false`. `isHostStatus()` checks the
service name, version, phase, parseable date string, positive safe-integer
process ID, 36-character lowercase-hex/hyphen instance ID, mode
(`production` or `development`), and both capability values.

The guard does not require an exact object shape, strict ISO timestamp syntax,
or an exact-key capabilities object. Additional fields are accepted. The
host tests cover the status response and incompatible protocol/service
rejection in [host.test.ts](../../tests/host.test.ts).

## Sessions and model mutation

[sessions.ts](../../src/shared/sessions.ts) defines a lowercase UUID-shaped
`SESSION_ID` pattern. It checks the text shape only; it does not require a
particular UUID version or variant.

`SessionInfo` separates three states:

| Field | Values |
| --- | --- |
| `status` | `creating`, `ready`, `failed`, `interrupted` |
| `runtimeState` | `closed`, `opening`, `ready`, `failed`, `closing` |
| `historyState` | `empty`, `available`, `unavailable` |

The validator requires session and Pi session IDs, directory, provider/model
pair, thinking level, timestamps, these state fields, error, and active/latest
turn IDs. Provider and model must both be null or both non-null; a `ready`
session requires both to be strings. `nativeExecution` is optional for
backward compatibility and may be null. When present as an object it must
have exactly `id`, `status`, and `error`; its ID is session-ID-shaped and its
status is running/completed/failed/aborted/interrupted. Its error is limited
to 2 KiB UTF-8. Provider/model values, when non-null, must be non-empty
strings. Timestamps are safe integers. The rest of `SessionInfo` is not
exact-keyed: extra fields are allowed, and directory/error strings have no
shared size limit.

`RuntimeConfiguration` checks only that `executable` and an optional
`entryPoint` are non-empty strings. It does not require absolute paths or
reject extra keys. `SessionCreateRequest` is an interface here, but this
module does not export a matching runtime validator.

`SessionModelRequest` is exact-keyed: provider and model are required, with
optional `thinkingLevel`. Provider and model must be non-empty and at most 200
and 300 JavaScript characters respectively. The optional thinking level must
be one of the shared levels. The session validator and model request are
exercised by [sessions.test.ts](../../tests/sessions.test.ts) and
[session-models.test.ts](../../tests/session-models.test.ts). Native execution
separation is covered in [native-executions.test.ts](../../tests/native-executions.test.ts).

## Thinking levels and model capabilities

[thinking.ts](../../src/shared/thinking.ts) exports these exact values:

`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`.

`ModelCapabilitiesRequest` is exact-keyed and requires a non-empty provider
(maximum 200 characters) and model (maximum 300 characters). The response is
also exact-keyed: provider, model, `thinkingLevels`, and `supportsImages`.
The level list must be non-empty, contain at most all seven known values, and
contain no duplicates. Image support is a boolean. The guard checks response
shape, not whether the model is still loaded or can successfully answer.

Model-specific behavior and thinking restoration are tested in
[session-discovery.test.ts](../../tests/session-discovery.test.ts) and
[runtime.test.ts](../../tests/runtime.test.ts).

## Directory and model discovery

[discovery.ts](../../src/shared/discovery.ts) defines directory and model
listing shapes:

- A directory listing has an absolute-looking `path`, nullable absolute-looking
  `parent`, up to 500 directory entries, and a boolean `truncated` flag. Each
  entry has a name from 1 to 255 JavaScript characters and an absolute-looking
  path. “Absolute-looking” means POSIX slash, drive-letter plus slash/backslash,
  or UNC prefix. The guard does not canonicalize paths, prove that a child is
  contained in its parent, or reject extra keys.
- A general model list has up to 10,000 entries. Each provider and model ID is
  non-empty and at most 200 and 300 JavaScript characters. `supportsImages`
  may be absent, otherwise it must be boolean.
- A session model list additionally requires a valid session ID and, for every
  model, a boolean `supportsImages` and one to seven unique valid thinking
  levels.

These validators do not enforce uniqueness of directories or model
provider/ID pairs, and they do not prove the paths' filesystem meaning.
Discovery tests cover absolute-path handling, model list shape, extension
models, and capability discovery in
[session-discovery.test.ts](../../tests/session-discovery.test.ts) and
[session-models.test.ts](../../tests/session-models.test.ts).

## Turn submission

[turns.ts](../../src/shared/turns.ts) defines the durable turn state machine:

`accepted` → `dispatching` → `running` → one of `completed`, `failed`,
`aborted`, or `interrupted`.

The arrows describe the usual progression; the type permits every listed
status and the service remains responsible for legal state transitions.

`isTurnCreateRequest()` requires an exact object with `requestId` and
`message`, plus optional `images`. The request ID must match the shared
lowercase UUID-shaped pattern. The message is preserved as supplied, but must
be nonblank after trimming unless at least one image is present, no more than
8 KiB UTF-8, and must not begin with `/` after leading whitespace is removed.
An empty `images` array does not make a blank message valid. Images are checked
by `isImageContentArray()`.

`TurnInfo` is exact-keyed and contains run/session/request IDs, status,
cancellation state, safe-integer timestamps, nullable error, and entry IDs.
Error code and message must be non-empty after trimming, but the shared turn
guard places no size cap on either string. Entry IDs must be non-empty strings;
there is no array-size limit in this validator. The full durable turn contains
`entryIds`; its smaller SSE projection uses `entryCount` instead.

The exact request shape, slash-command rule, and byte limit are tested in
[turn-catalog.test.ts](../../tests/turn-catalog.test.ts). Admission,
deduplication, abort, and extension-handled inputs are covered by
[turns.test.ts](../../tests/turns.test.ts).

## Image records

[images.ts](../../src/shared/images.ts) defines the JSON shape
`{ type: "image", data, mimeType }`. It accepts PNG, JPEG, WebP, and GIF.
`isImageContent()` requires exactly those three keys, a canonical base64
string, decoded content greater than zero and no larger than 5 MiB, and a
magic header matching the declared MIME type.

The list guard accepts at most four images and caps the combined decoded bytes
at 5 MiB. It checks each record as well as the combined budget. These are
header/signature checks, not full image-format parsing; the browser adds an
actual decode check before staging its draft. `imageByteLength()` assumes the
caller already has a validated image record.

Image-only turns, exact size boundaries, signatures, multi-image limits,
native Pi delivery, and text-only model rejection are covered in
[images.test.ts](../../tests/images.test.ts).

## Saved history

[history.ts](../../src/shared/history.ts) describes a display projection of a
saved native entry. It is not a reconstruction of the model's full context.
History pages carry branch metadata and paginated display entries; image
blocks contain an index and MIME type, not image bytes.

| Value | Runtime limit or rule |
| --- | --- |
| Page status | `empty`, `pending`, or `available`. Non-available pages cannot carry entries, revision, leaf, cursor, covered turn, or covered native execution. |
| Revision | Null or 64 lowercase hex characters; `available` requires a revision. |
| Entries | At most 100 per page; each entry has at most 64 blocks. |
| Blocks | Types are text, thinking, tool_call, image, or unsupported; at most 64 per entry. Block text is at most 64 Ki JavaScript characters, not 64 KiB. Image blocks require a non-negative safe-integer image index and allowed MIME type. |
| Entry fields | ID/type at most 1024 characters, timestamp at most 100; nullable parent/tool-call/tool-name/target strings are null or non-empty and at most 1024 characters. Role is null or user/assistant/toolResult/bashExecution/custom/context/diagnostic. Optional error is boolean. |
| Context sources | At most 32; path at most 4096 JavaScript characters; source content at most 32 KiB UTF-8. The truncated flag is legal only when sources are present. |
| Cursor and coverage IDs | Cursor is null or a non-empty string up to 1536 JavaScript characters. Active/latest/covered turn IDs and optional covered native-execution ID use the session UUID-shaped pattern. |
| Whole page | Serialized JSON must fit within 256 KiB UTF-8. |

Entry and block objects are exact-keyed, with only the documented optional
entry fields (`error`, `nativeKey`, and `toolOwnerKey`). Several ordinary
entry strings are bounded by JavaScript character length; native/tool owner
keys follow a 64-hex-plus-ordinal pattern. Context source content has the
explicit UTF-8 byte limit shown above.

`coveredTurnId` and `coveredNativeExecutionId` are distinct. Each marks a
terminal Dwell turn or native Pi execution proven present on the saved
branch; neither says the execution succeeded, and neither means the current
page contains the whole transcript. A pending page is not an empty history
page and must not erase an already-rendered view.

Page validation, saved-branch projection, tool/image blocks, and context
budgets are covered by [history.test.ts](../../tests/history.test.ts) and
[history-context.test.ts](../../tests/history-context.test.ts).

## Event stream

[events.ts](../../src/shared/events.ts) defines two related but different
records:

- `TurnProjection` is the compact stream form: it carries `entryCount` and
  `errorTruncated`.
- `TurnInfo` is the durable catalog form: it carries the actual `entryIds`.

Confusing these shapes can make UI code assume the event stream contains entry
IDs when it contains only a count.

Every serialized business event is limited to 64 KiB UTF-8. A snapshot may be
up to 224 KiB UTF-8. The SSE decoder in the browser separately permits an
unfinished transport frame up to 256 KiB; that buffering limit does not
replace the shared JSON event/snapshot budgets.

### Cursor and frame shape

Business frames have exact outer keys: session ID, nullable run ID, cursor,
type, and payload. Nested session and turn IDs must agree with the outer
frame. Cursor form is `sessionId:epochId:sequence`: the session ID must match
the frame, the epoch is a 36-character lowercase hex/hyphen UUID-shaped
string, and the sequence is a safe integer with no leading zeros except
`0`. A `resync` frame has a null cursor and one of four reasons:
`cursor_stale`, `cursor_ahead`, `epoch_changed`, or `replay_limit`.

A snapshot has exact top-level and payload keys. Its embedded session is
strict-keyed for the stream projection, and active/latest turn references
must agree with the session's corresponding IDs. Snapshot payloads use the
224 KiB budget. The regular event variants cover session/turn updates,
message start/delta/finish, tool start/update/finish, projection limits,
projection errors, and stream errors.

### Live content budgets

| Projection | Shape and limits |
| --- | --- |
| Turn projection | UUID-shaped run/session/request IDs, one of the seven turn statuses, boolean cancellation state, safe-integer timestamps, non-negative `entryCount`, and an error-truncation flag; error code up to 128 UTF-8 bytes and message up to 2048 UTF-8 bytes. |
| Message | UUID ID; text up to 64 KiB UTF-8; optional native key and non-negative safe-integer order; boolean finished/truncated flags; at most 64 ordered content blocks. |
| Message delta | UUID message ID, text up to 64 KiB UTF-8, truncated flag, and optional text/thinking block selector. A thinking delta carries its text in the block and has empty compatibility text. |
| Text block | At most 64 ranges, each a positive-length, non-overlapping UTF-16 span into the compatibility `message.text` string. |
| Thinking block | Text up to 64 KiB UTF-8. Thinking-only deltas put their text in the thinking block and leave the compatibility delta text empty. |
| Tool | UUID ID; status is running/completed/failed; boolean truncated flag. At most eight tools in a live projection. Name up to 512 UTF-8 bytes; input/output each up to 16 KiB; optional owner key, non-negative safe-integer order, and call ID up to 1024 UTF-8 bytes. |
| Projection errors | Code up to 128 UTF-8 bytes; message up to 2048 UTF-8 bytes. |

Live message block indices are safe integers from 0 through 63 and strictly
increase within a message. Text ranges cannot overlap across blocks.
`projection.limited` reports one of the declared scopes and a positive
safe-integer limit. Its scopes are metadata, message, tool input, tool output,
tool name, and tool count. Nested projections and the final serialized event
must both satisfy their shape and size checks.

The event tests cover cursor validation, frame size, ranges and thinking
deltas, replay/resync, projection truncation, and observer behavior in
[events.test.ts](../../tests/events.test.ts) and
[web-events.test.ts](../../tests/web-events.test.ts).

## Interpreting guard results

- Guards differ in key strictness: host status, ordinary session metadata, and
  discovery responses accept extra properties; turn requests, turn records,
  history records/pages, and stream frames check explicit key shapes.
- JavaScript character counts use UTF-16 code units; image, turn text,
  context-source content, and stream serialization budgets use UTF-8 bytes.
  History block text and many names/IDs use `.length`.
- A matching image header confirms the declared format signature, not full
  decodability; the web client also decodes images in the browser.
- History pages are bounded display projections of a saved branch, not Pi's
  complete model context. A coverage marker records saved-branch presence, not
  turn success.
- `TurnInfo`, `TurnProjection`, and optional `SessionInfo.nativeExecution` have
  distinct identities and lifecycles; the Dwell turn catalog and native Pi
  execution metadata are separate records.
