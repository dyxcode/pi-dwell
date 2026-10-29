<a id="pi-runtime-implementation"></a>

# Pi runtime process

English | [简体中文](../../i18n/zh-CN/handbook/implementation/runtime.md)

[Implementation index](README.md) · [RPC transport](rpc.md) · [Saved history](history.md) · [Runtime overview](../runtime.md)

`PiProcess` owns one child process and one Pi session. Pi remains responsible for the agent loop, tools, provider calls, extensions, and native session format. Dwell validates the subprocess boundary, tracks whether work belongs to a durable Dwell turn or an extension/native execution, and exposes listeners that observe but never own execution.

<a id="runtime-types-and-boundary-validation"></a>

## Runtime state and boundary validators

[`RuntimeState`, `PiOptions`, `SessionState`, `RunResult`, `NativeExecutionResult`, `ActiveExecution`, and `PiEntry`](../../../src/runtime/pi-process.ts#L19) define the process boundary. Dwell work can settle as completed, failed, aborted, or handled; an independently initiated native execution can additionally be interrupted. `ActiveExecution` keeps a Dwell run distinct from an ephemeral native execution ID. Pi is pinned to [`SUPPORTED_PI_VERSION`](../../../src/runtime/pi-process.ts#L18), currently `1.4.0`.

[`sessionState`](../../../src/runtime/pi-process.ts#L99) validates `get_state`: session ID, optional session file, streaming/compacting flags, safe nonnegative message counts, thinking level, and optional selected model. [`isSelectedModel`](../../../src/runtime/pi-process.ts#L133) accepts only nonempty provider and ID strings. [`sessionEntries`](../../../src/runtime/pi-process.ts#L143) validates a `get_entries` response as an array of unique entry IDs, nonempty types, null/string parents, and a null or existing leaf ID; parent-chain validation for saved history is stricter in [History](history.md#native-jsonl-snapshot-and-validation).

[`verifyPiConfiguration`](../../../src/runtime/pi-process.ts#L172) accepts an executable plus optional Node entry point, requires absolute paths without control characters, resolves them with `realpath`, and executes `--version` using the chosen working directory and environment. It bounds the command deadline/output and requires an exact version match. Path, spawn, and version-read errors become concise configuration failures. It returns canonical executable/entry-point paths; provider credentials remain in the owner-supplied child environment.

<a id="runtime-startup-and-session-handshake"></a>

## Starting and validating a Pi child

[`PiProcess.constructor`](../../../src/runtime/pi-process.ts#L232) attaches stderr, RPC, and process lifecycle listeners. The stderr tail is capped at 16 KiB for private diagnostics; it is not automatically inserted into public errors. The child `error` event marks startup failure. On `close`, an unexpected exit fails the runtime, RPC is closed, any run is interrupted, dialogs are cleared, stopping becomes exited, and the shared closed promise resolves only after the operating-system child actually closes.

[`PiProcess.start`](../../../src/runtime/pi-process.ts#L274) validates all executable, cwd, session, entry-point, and extension paths as absolute. An explicit session ID is validated and cannot be combined with `resumeFile`; `resumeFile` reopens an existing transcript, an explicit session ID selects a new session identity, and omitting both is also valid for a fresh Pi-managed session. Provider/model must be both present or both absent. Request and shutdown deadlines must be safe integers from 1 through 60,000 ms. It resolves and verifies the project directory, validates the private session directory, and validates a resume file and its owning directory. After rechecking Pi's version, it creates the session directory and builds arguments for RPC mode, the Dwell-owned session directory, optional new-session model selection, and requested extension paths. Hosted sessions use native Pi resource discovery by default; only `resourcePolicy: "isolated"` adds Pi flags disabling extensions, skills, prompt templates, themes, MCP, and context files. It spawns without a shell and with stdin/stdout/stderr pipes.

Startup is not complete until `get_state` responds. `start` rejects a runtime that is streaming, compacting, or has pending messages unless a native extension execution began during open; requires Pi to select a model; verifies the requested resume file/session ID/new-session model; and ensures the process remained in a valid starting/ready/running state. It changes `starting` to `ready` only after this handshake. Any error after spawn calls `stop` before rethrowing so a partially initialized child is not left behind.

<a id="runtime-observation-and-process-state"></a>

## Process state and observer lifecycle

[`state`, `pid`, `stderrTail`, and `activeExecution`](../../../src/runtime/pi-process.ts#L393) expose the current state, child PID, bounded diagnostic tail, and the active work owner. `activeExecution` returns only the native execution ID for native work; Dwell turns remain owned by their durable service slot.

[`subscribe`](../../../src/runtime/pi-process.ts#L411) registers a Pi-record listener and treats it as interactive by default. Its unsubscribe function removes that exact listener; if no interactive listeners remain, pending extension dialogs are canceled. [`subscribeState`](../../../src/runtime/pi-process.ts#L420) registers a state listener and immediately reports current state. [`subscribeNativeExecution`](../../../src/runtime/pi-process.ts#L426) registers an execution listener and immediately reports the currently running native execution or the most recent settled native event. Listener failures are isolated by the notification helpers, so detach/failure cannot stop Pi.

[`getState`](../../../src/runtime/pi-process.ts#L439) issues `get_state` and validates it with `sessionState`; malformed state fails the RPC channel because the runtime contract is no longer trustworthy. [`#setState`](../../../src/runtime/pi-process.ts#L784) ignores duplicate state values and notifies a snapshot of listeners so mutation during callbacks is safe. [`#notifyStateListener`](../../../src/runtime/pi-process.ts#L869) catches both synchronous throws and rejected promises. [`#notifyNativeExecutionListener`](../../../src/runtime/pi-process.ts#L857) does the same for native events. Ordinary `subscribe` record callbacks are also guarded inside `#onRecord`.

<a id="runtime-model-and-context-operations"></a>

## Model, thinking, and context operations

[`getAvailableModels`](../../../src/runtime/pi-process.ts#L449) is allowed only while ready or running and validates the active session's registry through `parsePiSessionModels`. [`getAvailableThinkingLevels`](../../../src/runtime/pi-process.ts#L455) requires a nonempty list of at most seven supported, unique thinking levels; malformed data fails the RPC connection. [`setThinkingLevel`](../../../src/runtime/pi-process.ts#L478) checks the shared level type, refuses a busy/non-ready runtime, writes Pi's `set_thinking_level`, then returns Pi's confirmed state value.

[`setModel`](../../../src/runtime/pi-process.ts#L487) validates provider/model lengths and idle readiness, requests `set_model`, and requires Pi to echo exactly the requested provider and ID. An invalid or different echo fails the RPC channel; Dwell persists only a selection confirmed by Pi. A normal typed Pi command rejection remains an ordinary error, allowing `SessionService` to classify unavailable models/API keys separately.

[`getMessages`](../../../src/runtime/pi-process.ts#L516) validates Pi's current `get_messages` response as records with string roles and returns the message array; this is working model context, not the full branch. [`getEntries`](../../../src/runtime/pi-process.ts#L532) validates the current native entry set and leaf via `sessionEntries`, failing RPC on malformed structure. [`supportsImages`](../../../src/runtime/pi-process.ts#L542) requires an idle ready runtime, reads state and available models concurrently, finds the exact active provider/model, validates its input-type list, and returns whether it contains `image`. Invalid capability data fails the RPC connection; ordinary transport/command failures propagate.

[`parsePiSessionModels`](../../../src/runtime/pi-models.ts#L6) is the strict public metadata projection for the Pi 1.4 registry. Its nested `invalid` callback creates a consistent malformed-metadata error. The parser bounds registry count and serialized result size, requires unique provider/ID pairs, validates reasoning/input fields and optional thinking-level mappings, and exports only provider, ID, image support, and allowed thinking levels. When reasoning is unavailable it exposes `off`; disabled mapped levels (`null`) are excluded, while extended `xhigh`/`max` levels require an explicit registry mapping. Provider headers, credentials, and private registry fields never enter the returned options.

<a id="runtime-dwell-run-lifecycle"></a>

## Dwell prompt acceptance and settlement

[`startRun`](../../../src/runtime/pi-process.ts#L578) separates prompt acceptance from final execution settlement. It refuses busy/non-ready state, messages over 1 MiB, empty text with no images, or malformed image arrays. Before sending the prompt it installs a `Run` record and sets state to running because Pi events can arrive before the correlated prompt response. It returns two handled promises: `accepted` resolves to `started` or `handled`; `settled` resolves to a final `RunResult` or rejects on transport/process failure. Both receive an early rejection observer so callers can await them at different times safely.

The prompt response must contain a recognized disposition. A malformed disposition fails the RPC channel. For a `handled` response, the Dwell run settles as handled at the acknowledgement/ownership-transfer point; if Pi began agent work, ownership is represented separately by a native execution record. Even when a native follow-up began before the acknowledgement, the handled Dwell settlement does not wait for that native execution to settle. If native work had already settled, its separate native record can publish that outcome immediately. For `started`, an already observed settlement is completed after acknowledgement; otherwise it remains active. A correlated command rejection rejects acceptance and the active settlement. The ordering preserves settlement/events that race ahead of prompt acknowledgment.

[`run`](../../../src/runtime/pi-process.ts#L648) is the simpler text-only wrapper: it waits for acceptance, then returns the settlement promise. [`abort`](../../../src/runtime/pi-process.ts#L654) sends Pi's abort command only when state is running. `SessionService` owns the durable cancellation request and recovery semantics; this method only controls the child.

[`#finish`](../../../src/runtime/pi-process.ts#L705) and [`#rejectRun`](../../../src/runtime/pi-process.ts#L713) act only if the run still owns the process. They clear the active slot and pending dialogs, return a running process to ready, and settle the promise exactly once. [`#fail`](../../../src/runtime/pi-process.ts#L721) is idempotent for failed/exited state; it records the error, marks failed, closes RPC, interrupts current work, then initiates process stop.

<a id="runtime-rpc-events-and-native-execution"></a>

## Pi event handling and native executions

[`#onRecord`](../../../src/runtime/pi-process.ts#L730) is the owner callback for asynchronous Pi records. `agent_start` begins a native run when there is no Dwell run; during Dwell work it marks the initial agent start or transfers ownership when a later agent follow-up begins. `agent_settled` validates its aborted flag, derives completed/failed/aborted outcome using both Pi settlement and observed provider/message errors, and finishes either the native or Dwell run. An assistant `message_end` validates its message envelope and updates the current run's error/aborted state from `stopReason`. `extension_ui_request` routes to `#uiRequest`. Every record is then delivered to a snapshot of observers; callback failures are swallowed so observation does not control execution.

[`#beginNativeRun`](../../../src/runtime/pi-process.ts#L792) creates a process-local UUID, takes ownership of the active slot, marks running, and publishes `started`. [`#finishNativeRun`](../../../src/runtime/pi-process.ts#L800) clears the matching slot/dialogs, returns to ready, and publishes the settled outcome. [`#transferHandledRun`](../../../src/runtime/pi-process.ts#L808) replaces a handled Dwell slot with a native execution before resolving the Dwell result; if the agent already settled, it immediately publishes the matching native settlement. [`#interruptRun`](../../../src/runtime/pi-process.ts#L835) clears any active work on process loss: Dwell settlement rejects as uncertain, while native work publishes `interrupted` with an error. [`#publishNativeExecution`](../../../src/runtime/pi-process.ts#L851) saves the most recent event for late subscribers and sends cloned copies. The service maps these notices to ephemeral session state, never to synthetic durable turn records.

<a id="runtime-extension-dialogs-and-shutdown"></a>

## Extension dialogs and shutdown

[`respondToUi`](../../../src/runtime/pi-process.ts#L659) accepts only a pending dialog ID and a method-appropriate response: confirmation boolean for `confirm`, string value for other dialog types, or cancellation. String values are capped at 1 MiB. It removes the pending dialog and timer before writing `extension_ui_response`; unknown/already-answered IDs and mismatched response shapes fail locally.

[`#hasInteractiveObservers`](../../../src/runtime/pi-process.ts#L878) checks whether any registered record listener can answer UI. [`#cancelDialogs`](../../../src/runtime/pi-process.ts#L882) cancels all pending IDs through `respondToUi`, and is invoked when the last interactive observer detaches. [`#uiRequest`](../../../src/runtime/pi-process.ts#L887) requires string IDs and method names; it silently ignores unsupported dialog methods. Supported `confirm`, `select`, `input`, and `editor` records are validated, duplicate IDs/invalid fields or more than 32 pending dialogs are rejected, the timer is capped at the RPC deadline, and requests are cancelled immediately when no interactive observer exists. [`#clearDialogs`](../../../src/runtime/pi-process.ts#L925) clears every timer and pending record on run completion or process close.

[`stop`](../../../src/runtime/pi-process.ts#L682) is idempotent by sharing `#stopping`. [`#stop`](../../../src/runtime/pi-process.ts#L687) returns after an already exited child closes; otherwise it changes state to `stopping` unless the process is already `failed`, then closes RPC, sends stdin EOF, schedules SIGTERM and then SIGKILL at bounded deadlines, and waits for the actual `close` event. Both escalation timers are cleared in `finally`; the stop promise resolves only after process closure.

Runtime behavior is exercised by [Pi process tests](../../../tests/runtime.test.ts), [transport/failure tests](../../../tests/runtime-failure.test.ts), and [model metadata tests](../../../tests/pi-models.test.ts).
