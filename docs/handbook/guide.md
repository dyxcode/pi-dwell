# User guide

English | [简体中文](../i18n/zh-CN/handbook/guide.md)

Pi Dwell gives you a browser conversation view for Pi sessions owned by a
Dwell host. Use the [handbook index](README.md) to choose the next chapter.
For setup, start with [quick start](quick-start.md); for worked workflows,
see [tutorials](tutorials.md); for the supported feature list and limits, see
[reference](reference.md).

It covers browser workflows, session switching, connection loss, and returning
a transcript to Pi.

## Start a conversation

1. Start the Dwell host and create a pairing code on the host machine. The
   [quick start](quick-start.md) covers host setup.
2. Open the host's browser page and enter the pairing code. Pairing authorizes
   this browser; it does not sign you in to a model provider.
3. Choose **New session**, then select a directory on the host machine.
4. Dwell opens a Pi session for that directory. The session starts with Pi's
   configured default model and thinking setting.
5. To choose another model, use the model control above the message box.
   Search by provider or model ID, choose a model, then select one of its
   available thinking levels.

Model and thinking choices belong to the session. Dwell shows the options
available in that session's loaded Pi runtime, including models contributed
by its loaded extensions. If a model offers one thinking level, Dwell selects
it directly. You can change the setting while the session is idle; the new
setting is used by the next message and remains with the session when it is
reopened.

## Send a message

Type a message in the composer and choose **Send**. On a keyboard with a fine
pointer, Enter sends and Shift+Enter inserts a newline. On touch layouts, use
the send button so Enter remains available to the on-screen keyboard.

Messages can contain up to 8 KiB of UTF-8 text. A message must contain
non-whitespace text or at least one image. The browser composer does not accept
Pi slash commands; use an interactive Pi client for command workflows.

While a Dwell turn or a native Pi extension execution is active, the composer
action becomes **Stop**. It targets the active run shown by the host. Model
changes and new image intake are unavailable while the session is busy.

## Attach images

Choose **+ Image** or paste an image into the composer. The browser accepts
PNG, JPEG, WebP, and GIF images. A message can contain up to four images with
5 MiB total decoded data, and the selected model must support images. Dwell
checks the image type and content before staging the draft; image-only
messages are allowed.

Images remain drafts until you send the message. You can preview or remove
each attachment. If you switch to a model that does not support images, the
existing draft remains removable; choose an image-capable model to send it.

The browser keeps text and image drafts in memory per session while the page is
open. Switching between sessions preserves those drafts. A full page reload
loses unsent text and image drafts. Losing authentication or forgetting the browser
clears image drafts; text remains only in the still-open page's memory.
Sending a message clears its draft after the host confirms acceptance.

## Switch and reopen sessions

The sidebar lists session identities; the top status tabs show sessions
Dwell currently considers open, including sessions that need attention.
Statuses include Ready, Working, Needs attention, Stopped, and Opening.

- Choose a sidebar item to select an already-open session.
- Choose a closed session in the sidebar to explicitly reopen it.
- A closed session keeps its saved history. Reloading the browser does not
  reopen it automatically.
- To close the selected runtime, select its status tab to reveal the close
  control, then confirm. If work is active, Dwell asks whether to stop and
  close it.

Closing a runtime leaves the session and its native Pi history available in
the sidebar. To continue later, reopen that session. The browser retains
unsent drafts only for the lifetime of the current page.

### Move a transcript between Dwell and Pi

The tested handoff is sequential. Close the Dwell runtime first, then open the
same native session identity in Pi. Reopen the session in Dwell to see the
transcript Pi saved. Dwell does not launch or select that Pi session for you.
See the [Pi runtime chapter](runtime.md) for the underlying ownership behavior.

## Read conversation history

Dwell displays saved Pi history and the current live response together. When a
response finishes, the saved entry takes over the matching live content so the
same text or tool call does not appear twice. Choose **Load earlier messages**
to fetch older pages.

Assistant text uses Markdown. Tool calls and their results are expandable;
failed tools start open. Thinking content is collapsed by default and can be
expanded. Saved images are loaded from the active transcript as you view them.

The **Context** disclosure shows a bounded preview of project instruction
sources that Pi saved as system context. It may say that content was shortened
or omitted. It is not a complete view of the prompt sent to a model.

## Stay connected

The browser reconnects its live event stream after a connection interruption
and refreshes the session list periodically. The host owns active Pi work, so
closing a tab or losing the browser connection does not cancel a response.
When the page becomes active again, Dwell reconnects and refreshes history.

Use **Forget this browser** to revoke this browser's pairing. This disconnects
the browser from the host; it leaves host-owned sessions and work running.
Pair again to reconnect.

## What the browser does not provide

- A Pi terminal or slash-command interface.
- Pi's interactive extension confirmation/dialog UI. The browser can show
  extension messages and observe native extension execution, but dialogs that
  need an interactive Pi client must be handled there.
- Session creation with a custom model in the creation form. Create the
  directory-based session first, then use the model control.
- A way to recover unsent drafts after a full page reload or browser
  closure. Image drafts also clear when browser authentication is lost or forgotten.

For all current features and numeric limits, see the
[feature reference](reference.md). For implementation behavior and test
coverage, see [web client internals](web-client.md),
[shared contracts](contracts.md), and the [handbook index](README.md).
