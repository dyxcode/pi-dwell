# Tutorials

English | [简体中文](../i18n/zh-CN/handbook/tutorials.md)

[Documentation index](README.md) · Prerequisite: [Quick Start](quick-start.md)

Use these tutorials for end-to-end workflows, [Examples](examples.md) for shorter recipes, and the [Guide](guide.md) for feature behavior.

## Continue a conversation after leaving the browser

**Goal:** distinguish a browser connection from a host-owned session.

1. Pair a browser and create a session in a directory you recognize.
2. Send a short question and wait for a reply.
3. Close the browser tab, leaving the Dwell service running.
4. Open the same origin in the same browser profile. Select the existing session rather than creating a new one.
5. Read the saved conversation and send a follow-up referring to the previous reply.

The service owns the runtime; closing the tab only disconnects observation. A new browser profile or another origin needs its own pairing. Unsaved image drafts are browser memory and should not be treated as part of this persistence exercise.

**Code trail:** browser transport → HTTP session/history/event routes → SessionService → Pi JSONL. Read [System](system.md#live-output-saved-history-and-reconnect).

## Change model and inspect thinking

**Goal:** use a session-specific model selection without changing Pi's global default.

1. Open a ready session and wait until it is idle.
2. Open the composer model picker. Choose an available provider/model.
3. If the model offers thinking levels, select one of the reported levels and confirm.
4. Verify the composer shows the effective selection.
5. Send a prompt. Where Pi emits visible thinking content, expand its thinking disclosure.
6. Close and explicitly reopen the session, then inspect its effective model/thinking selection.

The picker uses the active session's registry, including supported extension-provided models. Available thinking levels depend on the selected model. A thinking-capable model may or may not emit visible thinking on a given response. Reopening a saved transcript follows Pi's saved state.

**Code trail:** [Web model picker](web-client.md) → session model/capability operations → [Pi runtime](runtime.md).

## Send an image and find it in saved history

**Goal:** distinguish an attachment draft from a saved image.

1. Choose an image-capable model in an idle session.
2. Add a PNG, JPEG, WebP, or GIF through the attachment control, or paste an image.
3. Inspect the draft preview and remove any unwanted attachment.
4. Add a question and send. Up to four images totaling 5 MiB are accepted.
5. Wait for the turn to settle and verify that the image appears in saved history. Then reopen the page and inspect the saved conversation.

Before submission, image drafts exist in browser memory. After Pi saves the message, the image is read from native history through an authenticated route. Images are sent as an ordered array alongside text; the composer does not model arbitrary inline text/image interleaving.

**Code trail:** attachments → shared image validation → turn admission → Pi prompt → saved image route. Read [Contracts](contracts.md) and [Web](web-client.md).

## Stop work and close a session

**Goal:** understand cancellation and retained history.

1. While a session is working, use **Stop** to request cancellation.
2. Wait for its state to settle. A tool may already have performed part of its work; cancellation does not undo side effects.
3. Close the session tab and confirm. If work is still active, the dialog asks to stop and close.
4. Select the closed session from the session list and explicitly reopen it.
5. Read the saved history before issuing new work.

Closing releases the runtime while retaining the catalog and native conversation. Native extension execution and a submitted Dwell turn have separate cancellation identities. A lost connection alone is not a cancellation request.

**Code trail:** close dialog → abort route → session settlement → runtime stop. Read [Sessions/storage](sessions-storage.md).

## Trace a feature through the code

**Goal:** learn the repository by following one observable behavior.

Use “submit a message” as the first trace:

1. In [Web client](web-client.md), locate the composer send path and its pending request identity.
2. In [HTTP](http-auth.md), find `POST /sessions/:id/turns`; inspect authentication, byte limits, and `isTurnCreateRequest`.
3. In [Sessions/storage](sessions-storage.md), follow `submitTurn`, the request-key lookup, and dispatch transition.
4. In [Runtime](runtime.md), follow prompt RPC correlation and event delivery.
5. Follow events back through the event hub, SSE writer, browser reducer, and renderer.
6. Find terminal bookkeeping and saved-history coverage. Notice why a reply can be observed live before it is available as complete saved history.
7. Read [turns.test.ts](../../tests/turns.test.ts), [turns-http.test.ts](../../tests/turns-http.test.ts), and [turn-recovery.test.ts](../../tests/turn-recovery.test.ts). Run a relevant test file before changing behavior.

Use the [source atlas](source-map.md) to jump to symbols, and the [test atlas](test-map.md) to find related scenarios. The same reading method applies to model switching, cancellation, and browser pairing.
