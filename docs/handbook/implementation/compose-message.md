<a id="compose-message"></a>

# Compose messages and attach images

English | [简体中文](../../i18n/zh-CN/handbook/implementation/compose-message.md)

[Implementation index](README.md)

<a id="behavior"></a>

## Behavior

The composer belongs to the selected open Pi session. A message may contain text, images, or both; an image-only message is valid. Images travel as one ordered group, so their position among words is not saved. The browser accepts PNG, JPEG, WebP, and GIF, with at most four images and 5 MiB decoded data per message. Text is limited to 8 KiB in UTF-8. Slash-prefixed commands are not supported.

On a fine-pointer device, Enter submits and Shift+Enter inserts a line break; active IME composition keeps Enter in the input method. Touch devices use the visible send control. A draft remains associated with its session while the user switches between open sessions.

<a id="ownership"></a>

## Ownership

Text and image drafts live in browser-page memory. Text is held per session until a confirmed send or the page is discarded. An image draft keeps validated JSON-safe content and a temporary preview URL; selecting or pasting a file does not upload it. Removing an image revokes its URL, and disconnecting the page clears image drafts.

At submission, the browser sends text and the optional image group as one turn request. Dwell records execution identity and status; Pi's native history owns the saved message and image record. Temporary browser previews are separate from saved images.

<a id="execution"></a>

## Execution

1. Selecting a session restores its drafts. Model capability gates image intake: unknown or failed checks block new images, and a text-only model cannot receive an image message.
2. Selecting or pasting files starts one batch for that session. Each image's type and content are validated, encoded for a JSON request, and decoded by the browser before preview. Accepted drafts can be previewed or removed.
3. Sending captures the text and image order with one request identity. Empty messages, text above 8 KiB, slash commands, and known unsupported image combinations are rejected before Pi receives the turn; the host validates the request as well.
4. A confirmed send clears the drafts and reloads history. An uncertain result retains the captured content and identity; retry uses both unchanged, and a matching live-turn confirmation also clears the draft.

<a id="mechanisms"></a>

## Mechanisms

Image reading and browser decoding are asynchronous. Each batch captures its session and page generation. If the user switches sessions, disconnects the page, or image intake becomes unavailable before decoding finishes, the stale result is discarded and its preview URL revoked. The first invalid file ends the batch; accepted images remain. The file input resets so the same file can be chosen again.

The text input uses browser-native editing for newlines, paste, selection, and IME. Backspace acceleration requires a trusted, unmodified hold, a collapsed caret, and no composition; moving the caret, selecting text, or losing focus cancels it. The browser's native delete operation progressively removes more characters during a sustained hold; normal key repeat remains the fallback.

Mobile keyboards can resize the visible viewport before page layout catches up. The composer uses native content resizing and adjusts the page only when the active input remains obscured. Resizing preserves the conversation's distance from the lower edge: readers at the latest message stay there, while others keep their visible position.

<a id="technology"></a>

## Technology

A native multi-line text input keeps platform editing, accessibility, undo, and input-method behavior. The mobile layout follows the visible viewport when a keyboard hides the input, and animation frames batch rapid changes. The input grows to a viewport-relative height and scrolls internally for longer drafts.

Revocable object URLs provide image previews; validated base64 content fits Pi's JSON RPC boundary. Page-local drafts avoid a separate upload and storage lifecycle, but disappear when the page is discarded. Separate text and image groups match Pi's message interface, so images cannot be placed between text fragments.

<a id="verification"></a>

## Verification

Text-only, mixed, and image-only messages should each reach Pi as one user turn, with images in order and bytes preserved in saved history. A fifth image, unsupported media type, mismatched signature, or total above 5 MiB should be rejected while earlier drafts remain. A text-only model blocks sending images but still allows their removal.

Switching sessions should restore separate drafts, and switching during file decoding should not add an image to another session. After an uncertain send, retry should reuse the same message and images; the matching turn confirmation clears the composer. The input should remain visible as the mobile keyboard opens and closes, while the reader's prior scroll position stays stable.
