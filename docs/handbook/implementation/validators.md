# Shared data and validation

English | [简体中文](../../i18n/zh-CN/handbook/implementation/validators.md)

[Implementation](README.md) · [Handbook](../README.md)

<a id="boundaries"></a>

## Why validation belongs at each boundary

The shared modules describe JSON exchanged by the host and browser. Their type guards accept `unknown`, inspect runtime values and return a boolean. They are pure shape checks. Callers check authorization, file existence, lifecycle transitions and whether a response belongs to the request currently visible in the browser.

Read [contracts](../contracts.md) for the field reference. This chapter explains the decision procedure behind those contracts. Some guards deliberately permit extra properties; others require exact own keys. Array handling also differs: explicit iteration or `Array.from` rejects holes through failed element validation, whereas some discovery lists use `every` and assume JSON-decoded dense arrays.

Source / verification: [src/shared/sessions.ts](../../../src/shared/sessions.ts) · [src/shared/events.ts](../../../src/shared/events.ts)

<a id="sessions"></a>

## Session identity and model requests

`isRuntimeConfiguration` requires a nonempty executable string and, if present, a nonempty entry point. It does not establish absolute paths or executable compatibility; the service/runtime performs those checks before launch.

`isSessionInfo` checks both UUIDs, directory, paired nullable provider/model, nullable supported thinking level, safe-integer timestamps, lifecycle/runtime/history enums, error, and active/latest turn references. A `ready` session must have a provider and model. The guard permits extra top-level fields. Optional native execution is delegated to `isNativeExecutionInfo`, which instead requires exactly id/status/error, a UUID, an allowed terminal/running state, and at most 2,048 UTF-8 bytes of error text. An ephemeral native execution ID is not a durable turn request ID.

`isSessionModelRequest` rejects arrays and unknown keys, requires provider/model of at most 200/300 characters, and optionally accepts a valid thinking level. Explicitly supplied invalid thinking values fail; omission is different from `null`. For example, a request with a provider but no model fails before any model mutation.

Source / verification: [`isSessionInfo`](../../../src/shared/sessions.ts#L61) · [`isSessionModelRequest`](../../../src/shared/sessions.ts#L131) · [tests/session-models.test.ts](../../../tests/session-models.test.ts)

<a id="turns"></a>

## Turn input and durable result records

The private `hasExactKeys`, `isUuid` and `isTimestamp` helpers establish property identity, lowercase UUID spelling and safe integers; timestamp validation does not enforce positivity or chronological ordering. `isTurnError` requires only code/message with nonblank trimmed content.

`isTurnCreateRequest` first checks the object, request UUID and message string. It chooses the exact allowed keys depending on whether `images` is an own property, then validates the image array. A message may be empty only when at least one valid image is present. Text is bounded to 8 KiB of UTF-8, and leading-whitespace slash commands are rejected. This guard tests trimmed text but does not replace the original message with trimmed text; payload identity and dispatch can preserve its whitespace.

`isTurnInfo` requires exactly the ledger's public fields, valid three UUIDs and status, boolean cancellation intent, safe timestamps and a nullable valid error. It walks every index of `entryIds`, requiring an own, nonempty string element, so sparse arrays fail. Catalog constraints establish legal transitions; saved history establishes whether the referenced entries and result content survive. A valid completed turn can therefore have unavailable history.

Source / verification: [`isTurnCreateRequest`](../../../src/shared/turns.ts#L85) · [`isTurnInfo`](../../../src/shared/turns.ts#L114) · [tests/turns-http.test.ts](../../../tests/turns-http.test.ts) · [tests/turn-catalog.test.ts](../../../tests/turn-catalog.test.ts)

<a id="images"></a>

## Image decoding and aggregate limits

`object` excludes null and arrays. `base64ByteLength` checks nonempty text, the maximum encoded length, a multiple-of-four length, the alphabet/padding form, and a positive decoded byte count. `decoded` calls that inexpensive check before `atob`, checks the actual decoded length, and requires `btoa(decoded) === input`; malformed and noncanonical encodings return null rather than throwing into the caller.

`signature` uses its local `ascii` callback to match PNG, JPEG, WebP or GIF magic bytes against the claimed MIME type. The check validates header agreement without decoding pixels. `isImageContent` requires exactly type/data/mimeType, accepts only the four declared MIME types, decodes, then checks the signature.

`imageByteLength` computes decoded size from a typed, already-validated base64 string. `isImageContentArray` accepts at most four images, estimates each image's decoded size, adds it to the running total, rejects totals over 5 MiB, fully validates that image, then proceeds to the next. Empty arrays are valid image arrays, but do not make an empty turn message valid. Individual images and the combined set both have a 5 MiB limit. The HTTP JSON limit is separate because base64 expands the transport representation.

Source / verification: [`isImageContent`](../../../src/shared/images.ts#L64) · [`isImageContentArray`](../../../src/shared/images.ts#L86) · [tests/images.test.ts](../../../tests/images.test.ts) · [tests/images-http.test.ts](../../../tests/images-http.test.ts)

<a id="discovery"></a>

## Discovery and thinking capabilities

In `thinking.ts`, `isObject` excludes null/arrays and `isThinkingLevel` accepts one of the seven declared strings. `isModelCapabilitiesRequest` requires exactly provider/model with their length limits. `isModelCapabilitiesResponse` requires exactly four fields, a boolean image capability, and a nonempty, duplicate-free array of supported thinking values no longer than the seven known levels. Runtime registry inspection determines which levels a particular model supports.

In `discovery.ts`, `isObject` serves the same structural purpose. `isAbsolutePath` recognizes POSIX-rooted, Windows-drive and UNC spellings without reading the filesystem. `isModelOption` checks provider/id lengths and an optional boolean supportsImages. `isHostDirectoryListing` requires an absolute path, a nullable absolute parent, at most 500 named absolute directory entries, and a truncated flag. It does not prove that any path exists or remains accessible. `isAvailableModelsResponse` bounds the list to 10,000 model options; `isSessionModelsResponse` additionally validates the session UUID and requires image support plus unique nonempty thinking levels on every option. The selected session's service and runtime check whether the caller can select a model.

Source / verification: [`isModelCapabilitiesResponse`](../../../src/shared/thinking.ts#L38) · [`isSessionModelsResponse`](../../../src/shared/discovery.ts#L36) · [tests/pi-models.test.ts](../../../tests/pi-models.test.ts) · [tests/session-discovery.test.ts](../../../tests/session-discovery.test.ts)

<a id="history"></a>

## Validating saved-history projections

`record`, `text`, `optionalText`, `optionalUuid` and `exact` are the primitive gates: plain records, nonempty bounded strings, nullable versions and exact own keys. The text helper measures JavaScript string length; `contextSource` separately measures instruction content in UTF-8 bytes.

`block` requires the common type/text/callId/name fields, with imageIndex/mimeType only for image blocks. Text is bounded to 64 KiB in string length; image index is a nonnegative safe integer and MIME type is allowlisted. `entry` validates entry metadata, the allowed roles, at most 64 blocks, nullable tool/parent/target references and optional boolean error. Optional nativeKey/toolOwnerKey must be a 64-hex digest followed by a positive occurrence count. These fields identify repeated native content and scoped tool ownership; matching displayed text alone is insufficient.

`contextSource` requires exactly path/content/truncated, a bounded path and at most 32 KiB of instruction content. `isHistoryPage` checks the allowed combinations of optional fields, UUIDs, revision digest, cursor length, at most 100 entries and 32 instruction sources. `contextSourcesTruncated` requires contextSources. Non-available pages must have no entries, revision, leaf, cursor or covered result identities; available pages require a revision. Finally the whole serialized page must fit 256 KiB. A true result confirms the display contract. Pi model context is read separately from the runtime.

Source / verification: [`isHistoryPage`](../../../src/shared/history.ts#L167) · [tests/history-http.test.ts](../../../tests/history-http.test.ts) · [tests/history-context.test.ts](../../../tests/history-context.test.ts)

<a id="stream-primitives"></a>

## Stream primitives and ordered content blocks

`isRecord`, `hasExactKeys` and `isBoundedString` provide object, field and UTF-8 bounds. `isCursorFor` splits the session/epoch/sequence cursor, binds it to the requested session, validates the epoch UUID and requires a safe sequence number. `isSession` tightens the general session guard with exact stream fields. `isTurnProjection` validates the turn IDs, status, timestamps, cancellation flag, nonnegative entry count, truncation flag and bounded nullable error, without sending every entry ID.

`isLiveMessage` checks identity, optional nativeKey/order, text budget and flags. Optional blocks must have strictly increasing contentIndex values below 64. Text blocks refer to nonempty UTF-16 ranges within the compatibility text string; ranges must be ordered locally and cannot overlap even across different blocks. Thinking blocks store their own bounded text. The guard collects and sorts all text ranges to detect cross-block overlap.

`isLiveMessageDelta` checks the message UUID, bounded text and optional block descriptor. A thinking delta must leave the ordinary text empty and put content in block.text. `isLiveTool` validates tool identity, optional call/owner/order metadata, bounded name/input/output, status and truncation. `isLiveProjection` combines a nullable message with at most eight tools and an aggregate truncation flag. These guards validate one representation; stream ordering and reconciliation are handled by the event consumer.

Source / verification: [`isLiveMessage`](../../../src/shared/events.ts#L251) · [`isLiveMessageDelta`](../../../src/shared/events.ts#L331) · [tests/events.test.ts](../../../tests/events.test.ts) · [tests/web-events.test.ts](../../../tests/web-events.test.ts)

<a id="stream-frame"></a>

## Choosing and validating a stream frame

`isCommonEvent` validates session/run identities and a cursor bound to the session. `hasBoundedJsonSize` serializes and measures UTF-8 bytes; serialization failures return false. `isStreamFrame` first selects the frame type, then enforces its own exact envelope and payload.

A snapshot validates the session, nullable active/latest turn projections, live content and metadata truncation. It cross-checks inner session IDs and run IDs against the outer envelope and session's active/latest references, including the null cases, before applying the 224 KiB snapshot budget. A resync has a null cursor and exactly one of cursor_stale, cursor_ahead, epoch_changed or replay_limit as its reason.

Ordinary events have sessionId/runId/cursor/type/payload. Session and turn updates cross-check payload identities; message/tool variants delegate to the relevant guards. Projection-limit frames require an allowed scope and a positive safe-integer limit. Projection/stream errors carry bounded code/message. Each non-snapshot frame fits 64 KiB; an unknown type fails. For example, a correctly shaped turn for another session fails the identity cross-check, while a valid resync deliberately cannot be treated as a replayable cursor-bearing event.

Source / verification: [`isStreamFrame`](../../../src/shared/events.ts#L421) · [tests/events.test.ts](../../../tests/events.test.ts) · [tests/events-http.test.ts](../../../tests/events-http.test.ts)

<a id="host"></a>

## Host identity validation

`isHostStatus` requires the pi-dwell service marker, protocol 2, sessions phase, parseable start date, positive safe process ID, a 36-character lowercase-hex/hyphen instance marker, production/development mode and sessions:true/tasks:false capabilities. Its instance-marker expression is looser than the UUID guard used for sessions. Extra fields are tolerated. The function recognizes a status shape; service-management code separately compares identities to decide whether it owns a listener or registration.

Source / verification: [`isHostStatus`](../../../src/shared/protocol.ts#L14) · [tests/cli.test.ts](../../../tests/cli.test.ts) · [tests/service.test.ts](../../../tests/service.test.ts)
