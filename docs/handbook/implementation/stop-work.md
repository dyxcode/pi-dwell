# Stop work and close a Pi runtime

English | [简体中文](../../i18n/zh-CN/handbook/implementation/stop-work.md)

[Implementation](README.md) · [Handbook](../README.md)

<a id="behavior"></a>

## Behavior

Stopping work targets one execution: a durable Dwell turn or an extension-started Pi run with a process-local native execution identity. Closing an idle session stops its Pi child while retaining the Dwell session and native transcript. Host shutdown coordinates every session.

Cancellation records intent first. Before prompt dispatch, the turn settles as aborted without sending work to Pi. After dispatch, the service asks Pi to abort and waits for execution settlement; Pi may finish before cancellation takes effect, so its completed result can win the race.

Closing a runtime retains the session, records the latest native history state, and stops an idle Pi child. Reopening uses the same Pi identity and saved file. A browser disconnect leaves host-owned execution running.

<a id="ownership"></a>

## Ownership

SQLite owns each Dwell turn's lifecycle and persisted cancellation intent. The session service is the authority that decides whether a requested turn is still active and coordinates its Pi runtime.

Pi owns the execution loop and its abort response. The Pi process adapter owns one child process, its RPC connection, and the runtime's active execution. Native execution records are ephemeral observations, separate from durable turns and request identities. The browser sends the current turn or native execution identity so the host can reject stale stop requests.

The session catalog retains session identity, project directory, runtime settings, and the Pi native-file reference. Closing the child releases process resources and leaves that catalog record and transcript in place.

<a id="execution"></a>

## Execution

A turn cancellation first validates the session and active turn, then commits cancellation intent. Before dispatch, it marks the turn aborted and cancels any queued preparation scan; the worker exits before sending the prompt.

For dispatched work, the service sends Pi's abort command through the active runtime and waits for settlement. If the abort response times out or Pi rejects it, the service stops the child. Pi's correlated command response reports control acceptance; its later settlement event reports the run outcome. If the process or RPC connection is lost after dispatch, the turn becomes interrupted because its outcome is uncertain.

Native cancellation checks that the supplied identity still names the active native Pi run. It asks Pi to abort that run, then stops the child if abort cannot be confirmed. A stale identity cannot stop a later extension run.

Session close is serialized with catalog mutations. It requires no active Dwell turn and an idle Pi runtime. The service refreshes native history and session state, stops the runtime, releases observers, and publishes the closed state.

Host shutdown stops new admission, marks pre-dispatch turns aborted, requests cancellation for dispatched turns, and stops all Pi children. It waits for turn cleanup and admitted history reads before closing the event hub and catalog. After restart, remaining nonterminal turns are interrupted and never launched automatically.

<a id="mechanisms"></a>

## Mechanisms

Cancellation intent and turn status represent different facts: one records the request, the other the observed outcome. After Pi receives a prompt, Dwell retains the active slot through execution and final bookkeeping, preventing overlap while a stop is being resolved.

An abort RPC response acknowledges the control command; Pi's settlement event supplies the execution outcome. If abort transport fails, stopping the child closes the connection and an active run can become uncertain. Tool side effects may have occurred before a final assistant response.

Runtime stop closes Pi's input stream, then uses bounded process-signal escalation. Pi gets a graceful shutdown opportunity, and the host can reclaim the child; observers and pending requests are released when it exits. Extension work retains a process-local identity, so a later turn cannot inherit its stop target.

<a id="technology"></a>

## Technology

Pi RPC provides the runtime's abort and event protocol. Dwell owns the subprocess boundary and can stop an unresponsive runtime while preserving Pi's model and tool loop. SQLite preserves turn cancellation and recovery decisions across restarts; native execution observation remains in memory.

Long-running Pi work stays outside the global mutation queue. Cancellation and shutdown target the owning execution, then wait for cleanup.

<a id="verification"></a>

## Verification scenarios

Cancel a turn before dispatch. It settles as aborted, and Pi receives no prompt.

Cancel after dispatch while Pi is still working. Cancellation intent is visible immediately, the active slot remains held until settlement, and no later turn starts in parallel.

Let Pi complete at the same time as a stop request. The terminal result reflects the settlement Pi reported; the cancellation flag still records the request.

Send a native stop for an old execution identity after a later run has started. The later run continues. Stop the current native run and its native execution state settles separately from the turn ledger.

Close an idle session, then reopen it. The runtime is recreated for the same Pi session and saved transcript. Shut down during dispatched work, then restart: the durable turn is interrupted and no prompt is replayed.
