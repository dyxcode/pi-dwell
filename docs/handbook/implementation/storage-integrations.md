<a id="storage-integrations"></a>

# Local storage integrations

English | [简体中文](../../i18n/zh-CN/handbook/implementation/storage-integrations.md)

[Implementation index](README.md) · [Session files](history.md) · [Catalog](catalog.md)

Dwell hosts Pi and reads Pi's native session files. An optional Distill binding coordinates those reads and hosted processes with Distill's source cleanup. The binding uses Distill's public Node API and its configured database.

<a id="integration-configuration"></a>

## Configuration and API opening

[`readIntegrations`](../../../src/integrations/configuration.ts) reads the private `integrations.json` in Dwell's data directory. A missing file selects standalone operation. The file must have version 1 and recognized fields; `absolutePath` checks local absolute paths without NUL. Existing private-file checks enforce owner-only permissions, regular-file ownership and the configuration size limit.

`startHost` opens configured storage before creating SessionService and keeps its connection until session shutdown finishes. Configuration/import failure rejects startup. Shutdown drains admitted requests and Pi processes, releases source access, closes the storage adapter, then closes the listener.

[`openDistill`](../../../src/integrations/distill.ts) imports the configured local module and calls `openHostStorageV1` with the database path. `isDistillStorage` checks API version 1 and its read, host-use, recovery, receipt and close methods once. The returned object is Distill's API instance. Dwell's structural types describe that public contract; Distill owns validation of its database and source records.

<a id="source-read-coordination"></a>

## Short reads and Pi process lifetime

[`SessionSourceAccess`](../../../src/sessions/source-access.ts) separates two forms of access. Its constructor recovers attached reservations only through Distill's exact-child-exited check. An uncertain opening remains reserved.

`read` acquires a short source-read lease using the Pi session ID, actual file path and working directory, then holds it throughout the history reader. `#releaseRead` releases the lease after successful or failed reads. A failed release remains tracked for shutdown retry; if both reading and release fail, an `AggregateError` retains both errors. If Distill's access gate is occupied, `SourceAccessError` becomes `source_busy`; the file's previous observation is preserved.

`begin` creates a durable host-use reservation before a saved-history read or Pi spawn. A fresh session supplies its Pi ID and working directory while its file is still unknown. The returned `onSpawn` callback attaches the actual child PID. Its close promise releases the reservation only when the child closes; if attachment itself failed, confirmed close permits abandoning that opening. `abandon` releases only a reservation that never spawned a child. A hosted Pi process therefore holds a durable reservation without occupying the short global read gate.

`#release` removes a pending release when the durable operation succeeds or the reservation is already absent. A refused release whose reservation still exists remains available for retry. `drain` attempts every pending read and host-use release after session reads and stop operations settle, then reports any failures together in an `AggregateError`. An unclosed child is included in that report. Distill retains uncertain records across host death; elapsed time alone does not release them.

`SessionService.#checkHistory` places actual history reads inside `read`. `#open` calls `begin` before inspecting saved content, passes `onSpawn` to `PiProcess.start`, and abandons an unspawned opening on exit. Pi startup invokes the callback before its first readiness RPC; a callback failure stops and awaits the child before rejecting startup. Closing an idle session stops Pi even if the optional history refresh reports a file or access error; the previous file observation remains available.

Verification: [source access](../../../tests/session-source-access.test.ts), [Pi lifecycle](../../../tests/distill-sessions.test.ts), [Host configuration](../../../tests/integrations-host.test.ts), [adapter contract](../../../tests/distill-adapter.test.ts), and [spawn/close callback](../../../tests/runtime-spawn.test.ts). Actual Distill acceptance uses a configured built module and synthetic storage.
