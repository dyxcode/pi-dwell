# Follow a message from submission to saved result

English | [简体中文](../../i18n/zh-CN/handbook/implementation/workflow-message.md)

[Implementation](README.md) · [Handbook](../README.md)

<a id="starting"></a>

## Starting state and the browser decision

Assume an authenticated browser has selected a Dwell session and composed ordinary text or valid image drafts. `submit` first checks selection and conflicting local operations. If a Dwell request or extension-initiated Pi work is already executing, the same control follows the appropriate stop path instead of creating another prompt. Otherwise it takes the current text/images, checks image readiness/capability, and forms a request that can be retried with the same identity.

The browser keeps an unconfirmed pending submission when transport fails ambiguously. Retry resends the frozen pending payload and request ID, even if the draft subsequently changes; a different session cannot submit until that pending attempt is resolved. Making a new ID would represent new work. An explicit server rejection is different from a network failure after admission. Input whitespace is retained in the submitted content. Attachments are drafts until submitted; see [browser input](browser-input.md).

Source / verification: [`submit`](../../../src/clients/web/client.ts#L1705) · [tests/web-client.test.ts](../../../tests/web-client.test.ts) · [tests/images-http.test.ts](../../../tests/images-http.test.ts)

<a id="admission"></a>

## HTTP admission and durable acceptance

HTTP validates authority, authentication and the bounded request body before calling `SessionService.submitTurn`. The shared guard checks exact turn keys, UUID, message and images. The service revalidates the request within its mutation queue, computes payload identity from the exact message plus images, and looks up an existing request for this session. A matching identity returns the existing turn; a different payload with the same request ID returns request_conflict.

For new work, the service rejects a storage fault, another active turn or native execution, and missing Pi executable configuration. It inserts an accepted turn into SQLite, reserves an in-memory active slot, publishes state and schedules execution with `setImmediate`. The HTTP route acknowledges acceptance with 202 for a new turn and returns 200 for an existing matching request. Request deduplication comes before busy checks so an accepted request can still be recovered while it is executing.

Source / verification: [`startHost`](../../../src/server/http.ts#L102) · [`SessionService.submitTurn`](../../../src/sessions/service.ts#L882) · [`turnPayloadIdentity`](../../../src/sessions/service.ts#L81) · [tests/turns.test.ts](../../../tests/turns.test.ts) · [tests/turns-http.test.ts](../../../tests/turns-http.test.ts)

<a id="dispatch"></a>

## Prepare history, then record dispatch intent

`#executeTurn` rechecks the accepted record and stopping state, starts or resumes Pi through the serialized mutation path, and verifies any expected history. For images it queries the active model's capability before dispatch. A bounded saved-history read establishes entry IDs and native-message occurrence counts before this run; these baselines later separate old content from newly saved work.

The catalog transaction changes the turn to dispatching and records that history is now expected. Only after that durable intent is recorded does the service begin event projection, install a passive Pi-record observer and call `startRun`. Cancellation/stopping checks occur again immediately before dispatch. A database failure before sending prevents the prompt from being sent. After a crash following dispatch intent, whether Pi received or acted on the prompt may be unknown; recovery preserves that uncertainty.

The long model run is not held inside a database transaction or the global mutation queue. The per-session slot still prevents overlapping admitted work while other session operations can proceed.

Source / verification: [`SessionService.#executeTurn`](../../../src/sessions/service.ts#L1139) · [`SessionCatalog.markTurnDispatching`](../../../src/storage/catalog.ts#L781) · [tests/turn-recovery.test.ts](../../../tests/turn-recovery.test.ts) · [tests/history-cancellation.test.ts](../../../tests/history-cancellation.test.ts)

<a id="execution"></a>

## Acceptance, events and settlement

`PiProcess.startRun` installs run state before writing the prompt because Pi events can arrive before the RPC response. The returned accepted promise classifies the prompt as started or handled; the settled promise reports the lifecycle outcome. `PiRpc` matches command responses to pending IDs, while `PiProcess` interprets Pi execution events and notifies its subscribers.

Started prompts transition the durable turn to running. Handled prompts may have been consumed by an extension without a standard assistant response; the service detaches that turn's event observer and completes the handled path from saved evidence. Independent extension follow-up work is observed as native execution, not relabeled as the user's durable turn. The browser can receive updates before the original POST returns. Its submission, event and refresh paths therefore maintain separate in-flight and observed state; see the browser controller chapter for their ordering.

Source / verification: [`PiProcess.startRun`](../../../src/runtime/pi-process.ts#L578) · [`SessionService.#completeHandledTurn`](../../../src/sessions/service.ts#L1326) · [tests/runtime.test.ts](../../../tests/runtime.test.ts) · [tests/native-executions.test.ts](../../../tests/native-executions.test.ts)

<a id="results"></a>

## Persist the outcome and locate result content

After settlement the service waits for any outstanding abort attempt, remembers Pi's history reference, reads saved history again and selects entry IDs absent from the baseline. It commits the terminal outcome and those IDs. Failed provider work carries a provider_error; successful or aborted work records the corresponding outcome. The finally path removes observers, releases only the matching active slot, ends event projection and publishes the final state.

`getTurn` reads durable status. `getTurnResult` refuses active turns with turn_pending, then resolves recorded entry IDs against saved native history. A completed turn with no recorded entries returns an empty result. A missing source or missing referenced entry returns result_unavailable, and a too-large/deep result directs callers toward paginated history.

The browser normally renders paginated history together with the live projection. It replaces live content when native identities prove matching saved content, and clears remaining live data only when saved coverage is established. [Observation workflow](workflow-observation.md) explains why settlement alone is not sufficient.

Source / verification: [`SessionService.#executeTurn`](../../../src/sessions/service.ts#L1139) · [`SessionService.getTurnResult`](../../../src/sessions/service.ts#L964) · [tests/turns.test.ts](../../../tests/turns.test.ts) · [tests/history-service.test.ts](../../../tests/history-service.test.ts)

<a id="failures"></a>

## Read the same flow at interruption points

| Interruption point | Observable consequence |
| --- | --- |
| POST response lost after admission | Retry the same identity; it can recover the original turn rather than submit twice |
| Cancellation before dispatch | Persist aborted and cancel queued history work; no prompt needs to be sent |
| Known prompt rejection | Record the known rejection as failure |
| Pi process or RPC transport lost after dispatch | Record interruption/unknown outcome, stop the Pi process and do not replay automatically |
| Final bookkeeping cannot be written | Mark the session's storage fault, preserve the error boundary and stop unsafe execution |
| Saved content removed after completion | Turn status may remain completed while result/history is unavailable |

For example, a tool could have modified a file before Pi or Dwell crashed, leaving a side effect without a final reply. Request deduplication prevents a second admission with the same identity; tool effects occur outside that transaction.

Source / verification: [`SessionService.abortTurn`](../../../src/sessions/service.ts#L1014) · [`SessionService.#storageFault`](../../../src/sessions/service.ts#L496) · [tests/turn-recovery.test.ts](../../../tests/turn-recovery.test.ts) · [tests/turns-http.test.ts](../../../tests/turns-http.test.ts)
