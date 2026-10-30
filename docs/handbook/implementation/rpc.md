<a id="pi-rpc-implementation"></a>

# Pi RPC transport

English | [简体中文](../../i18n/zh-CN/handbook/implementation/rpc.md)

[Implementation index](README.md) · [Pi process](runtime.md) · [System flow](../system.md)

`PiRpc` frames JSONL records over a Pi child process's stdin and stdout. It correlates command responses, forwards asynchronous Pi records, and bounds reads, writes, pending requests, and deadlines. [`PiProcess`](runtime.md#runtime-startup-and-session-handshake) owns the child lifecycle and combines these responses with Pi events to settle Dwell runs.

<a id="rpc-errors-and-record-narrowing"></a>

## Command errors and record shape

[`RpcCommandError`](../../../src/runtime/pi-rpc.ts#L6) represents a correlated `success: false` response. It retains the rejected command and Pi-provided reason, allowing `SessionService` to distinguish a known prompt rejection from a transport failure with uncertain execution outcome. [`isRecord`](../../../src/runtime/pi-rpc.ts#L19) narrows a parsed value to a non-null, non-array object before the transport reads its envelope fields. `RpcRecord` requires only the string `type` at this layer; each owning consumer validates the fields it actually uses.

<a id="rpc-construction-and-request-admission"></a>

## Construction and request admission

[`PiRpc.constructor`](../../../src/runtime/pi-rpc.ts#L44) receives the child's writable stdin, readable stdout, request timeout, record callback, and fatal-failure callback. It attaches input/output error handlers, streams decoded output into `#read`, and treats an output end with buffered non-newline text as a truncated JSONL record. `StringDecoder` preserves split UTF-8 sequences across chunks.

[`PiRpc.request`](../../../src/runtime/pi-rpc.ts#L66) rejects immediately after closure and caps correlated requests at 32 pending. It allocates monotonically increasing `dwell-N` IDs, starts a timeout, stores the expected command and promise handlers, then queues a JSONL command record. A timeout fails the entire transport because Dwell cannot distinguish a command Pi has not processed from one Pi processed whose response is delayed or lost. Write errors follow the same fatal path.

[`PiRpc.write`](../../../src/runtime/pi-rpc.ts#L82) serializes one record plus newline, rejects a single line over 8 MiB or a queued total over 16 MiB, and appends the write to a promise chain. It waits for Node's write callback before sending the next line, so backpressure and ordering are respected. The queued-byte count is reduced in `finally`; the chain itself catches rejection so a failed write does not leave the queue tail permanently rejected.

<a id="rpc-close-and-failure"></a>

## Close and fatal failure

[`PiRpc.close`](../../../src/runtime/pi-rpc.ts#L107) is idempotent. It records the terminal error, clears all pending timers, rejects every outstanding command promise, empties the correlation map, and drops the partial line buffer. [`PiRpc.fail`](../../../src/runtime/pi-rpc.ts#L118) closes first, then notifies the owning `PiProcess`; this ordering ensures waiting callers see a settled transport before lifecycle cleanup begins. `close` is also used during expected shutdown without invoking the fatal callback.

<a id="rpc-jsonl-decoding-and-response-correlation"></a>

## JSONL decoding and response correlation

[`PiRpc.#read`](../../../src/runtime/pi-rpc.ts#L124) appends decoded bytes and repeatedly consumes complete newline-delimited records. It accepts an optional CR before each newline, enforces the 8 MiB limit on complete lines and partial buffered records, parses JSON, and requires an object with a string `type`. `type: "response"` routes to `#response`; all other records are delivered to the owner callback. Any malformed JSON/envelope, callback exception, overlong record, or incomplete final line fails the transport. Valid asynchronous records therefore remain separate from command promise settlement.

[`PiRpc.#response`](../../../src/runtime/pi-rpc.ts#L155) requires string ID/command and boolean success. It looks up a pending request and requires both its ID and expected command to match; unknown or mismatched responses fail the transport as protocol errors. Success removes the pending entry, clears its timer, and resolves with `data`. Failure additionally requires a string `error`, then rejects with `RpcCommandError`. A `RpcCommandError` identifies a known Pi rejection; timeout or process loss leaves the execution outcome uncertain.

The transport boundary is covered by [runtime failure tests](../../../tests/runtime-failure.test.ts), including fragmented Unicode, response identity, pending-request caps, timeout classification, malformed output, and shutdown escalation.
