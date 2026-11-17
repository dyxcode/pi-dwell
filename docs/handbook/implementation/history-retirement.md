<a id="history-retirement"></a>

# History retirement and restoration

English | [简体中文](../../i18n/zh-CN/handbook/implementation/history-retirement.md)

[Implementation index](README.md)

<a id="behavior"></a>

## Behavior

Pi's native file is the conversation record. Distill may delete it after its lifecycle rules are satisfied. Dwell marks history as retired only when a completed Distill receipt matches; ordinary file absence remains missing. Dwell retains the session, names, turn records, and Current references after deletion.

Retirement invalidates transcript projections, history continuations, and saved-image previews. Restoring a valid Pi file makes the session readable and reloads the browser conversation. A replacement source generation does not inherit the old retirement.

<a id="ownership"></a>

## Ownership

Pi owns the conversation file; Distill owns source generations, cleanup, and deletion receipts. Dwell records the observed file, its generation and deletion intent, and the visible history state. The browser owns the temporary transcript and image previews, which it drops when the host reports retirement.

Dwell protects source access with two mechanisms: a short read lease covers a history read and receipt lookup, while a durable use reservation covers a hosted Pi child's lifetime. Distill owns the reservation record; Dwell creates it before reopening, attaches the child after spawn, and releases it only after confirmed close.

<a id="execution"></a>

## Execution

1. Before reading saved history, Dwell leases the Pi session, file, and working directory. It reads the file and checks the deletion receipt before releasing the lease.
2. Before reopening a session or starting a Pi child, Dwell reserves source use and attaches the child's identity after spawn. It releases the reservation after that child closes.
3. If the file is missing, Dwell requests a completed receipt for the same session, path, and generation. A match establishes retirement; otherwise expected history remains missing.
4. The browser clears saved projections and images when retirement is published. A successful read of a restored file returns the session to readable history and reloads the conversation.

<a id="mechanisms"></a>

## Mechanisms

Retirement requires a completed receipt for the exact session, file path, and source generation. Dwell remembers the last deletion intent, so an old receipt cannot retire a restored file that is later removed manually. A new generation clears the old intent; absence remains missing until its own receipt matches. A retired state survives host restart while the file remains absent and its generation is unchanged, even if Distill is unavailable.

Overlapping checks allow only the latest-started observation to commit. An older check finishing after a newer commit settles against that result; a newer check still pending cannot erase the last saved result. A busy lease leaves the current history state unchanged.

The durable reservation does not occupy the short history-read gate. After restart, Distill releases an attached reservation only after confirming that exact child exited. A known unspawned opening can be abandoned; an uncertain one remains reserved. Failed releases stay queued for shutdown retry, and an open child keeps its reservation.

<a id="technology"></a>

## Technology

Short leases serialize file reads against cleanup without locking a source for an interactive process's lifetime. Durable reservations tell cleanup when a hosted Pi child still uses the source. Together they protect history and reopen operations while allowing other bounded reads.

Source generation and a completed receipt distinguish cleanup from manual loss or replacement. Dwell retains execution state, Pi owns conversation content, and Distill controls source retention. A restored file follows the same Pi active-branch read path.

<a id="verification"></a>

## Verification

After Distill cleans up the exact generation, Dwell should mark history retired, reject old continuations, clear saved conversation and image views, and preserve names, turns, and Current references. Manual removal without a matching receipt should remain missing.

Restoring a valid file should return the session to readable history and reload the browser view. Later manual removal should remain missing, and a replacement generation must not inherit the old receipt. A live Pi child keeps its reservation through host restart until its exit is confirmed. Overlapping checks leave the latest committed observation authoritative; a busy lease cannot create a false retirement.
