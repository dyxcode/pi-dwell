<a id="storage-integrations"></a>

# Local storage integrations

English | [简体中文](../../i18n/zh-CN/handbook/implementation/storage-integrations.md)

[Implementation index](README.md) · [Session files](history.md) · [Catalog](catalog.md)

Dwell hosts Pi and reads Pi's native session files. An optional Distill binding coordinates those reads and hosted processes with Distill's source cleanup. The binding uses Distill's public Node API and its configured database.

<a id="integration-configuration"></a>

## Configuration and API opening

[`readIntegrations`](../../../src/integrations/configuration.ts) reads the private `integrations.json` in Dwell's data directory. A missing file selects standalone operation. The file must have version 1 and recognized fields; `absolutePath` checks local absolute paths without NUL. Existing private-file checks enforce owner-only permissions, regular-file ownership and the configuration size limit.

`startHost` opens configured storage before creating SessionService and keeps its connection until session shutdown finishes. Malformed configuration or Distill import failure rejects startup. Current availability is handled separately below. Shutdown drains admitted requests and Pi processes, releases source access, closes the storage adapter, then closes the listener.

[`openDistill`](../../../src/integrations/distill.ts) imports the configured local module and calls `openHostStorageV1` with the database path. `isDistillStorage` checks API version 1 and its read, host-use, recovery, receipt and close methods once. The returned object is Distill's API instance. Dwell's structural types describe that public contract; Distill owns validation of its database and source records.

<a id="source-read-coordination"></a>

## Short reads and Pi process lifetime

[`SessionSourceAccess`](../../../src/sessions/source-access.ts) separates two forms of access. Its constructor recovers attached reservations only through Distill's exact-child-exited check. An uncertain opening remains reserved.

`read` acquires a short source-read lease using the Pi session ID, actual file path and working directory, then holds it throughout the history reader. `#releaseRead` releases the lease after successful or failed reads. A failed release remains tracked for shutdown retry; if both reading and release fail, an `AggregateError` retains both errors. If Distill's access gate is occupied, `SourceAccessError` becomes `source_busy`; the file's previous observation is preserved.

`begin` creates a durable host-use reservation before a saved-history read or Pi spawn. A fresh session supplies its Pi ID and working directory while its file is still unknown. The returned `onSpawn` callback attaches the actual child PID. Its close promise releases the reservation only when the child closes; if attachment itself failed, confirmed close permits abandoning that opening. `abandon` releases only a reservation that never spawned a child. A hosted Pi process therefore holds a durable reservation without occupying the short global read gate.

`#release` removes a pending release when the durable operation succeeds or the reservation is already absent. A refused release whose reservation still exists remains available for retry. `drain` attempts every pending read and host-use release after session reads and stop operations settle, then reports any failures together in an `AggregateError`. An unclosed child is included in that report. Distill retains uncertain records across host death; elapsed time alone does not release them.

`SessionService.#checkHistory` places actual history reads inside `read`. `#open` calls `begin` before inspecting saved content, passes `onSpawn` to `PiProcess.start`, and abandons an unspawned opening on exit. Pi startup invokes the callback before its first readiness RPC; a callback failure stops and awaits the child before rejecting startup. Closing an idle session stops Pi even if the optional history refresh reports a file or access error; the previous file observation remains available.

Verification: [source access](../../../tests/session-source-access.test.ts), [Pi lifecycle](../../../tests/distill-sessions.test.ts), [Host configuration](../../../tests/integrations-host.test.ts), [adapter contract](../../../tests/distill-adapter.test.ts), and [spawn/close callback](../../../tests/runtime-spawn.test.ts). Actual Distill acceptance uses a configured built module and synthetic storage.

<a id="current-library-api"></a>

## Optional pi-current library

[`readIntegrations`](../../../src/integrations/configuration.ts) reads the optional `current` object from Dwell's private `integrations.json`. It requires an absolute module path, an absolute data root, and a binding label accepted by [`isLibraryBinding`](../../../src/shared/library.ts). The root is canonicalized and checked by [`CurrentLibrary.open`](../../../src/integrations/current.ts); it must resolve outside Obsidian vaults and repositories. The module is imported from that local file path and opened once through `openContentLibrary`. Dwell checks `contentLibraryApiVersion === 1`, then checks that the returned handle has `apiVersion === 1` and the `search`, `latest`, `read`, and `close` methods before retaining it.

With no `current` object, the library endpoints return `503 library_unavailable`. A well-formed configuration whose Current module, root, or API cannot be opened also leaves the host running without the library. An invalid `integrations.json` still prevents startup. When the library opens, `SessionService.create` records its binding-to-canonical-root association; attempting to start with the same binding mapped to another root fails with `library_binding_mismatch`.

[`CurrentLibrary`](../../../src/integrations/current.ts) is a read-only projection over the Current API v1 handle.

| Callable | Behavior |
| --- | --- |
| `CurrentLibrary.open(config?)` | Returns `undefined` when not configured; otherwise imports and checks the module, canonicalizes the root, and opens the store. Import, root, open, or API-shape failures become `CurrentLibraryError("library_unavailable")`. |
| `search(input, signal?)` | Validates a query request, asks Current for matches, and returns at most 20 item views. The default limit is 20. |
| `latest(input?, signal?)` | Reads Current's latest batch, optionally filtered by source, and returns at most 20 views. If Current has no batch, returns `collectedAt: null` and an empty item list. |
| `read(reference, signal?)` | Requires the configured binding and reads the exact item and version. A different binding gives `library_binding_mismatch`; a missing version gives `library_not_found`. |
| `close()` | Closes the single Current handle; a close failure is reported as `library_unavailable`. |
| `CurrentLibraryError(code)` | Carries one of the shared library error codes and its user-facing message. |

The `binding` and canonical `root` properties identify the opened store. Search and latest excerpts contain up to 2,000 Unicode code points; exact reads contain up to 20,000. The projection also caps title at 500, author at 250, and summary at 1,000 code points. It preserves Current's `sourceCompleteness` and source `truncated` flag, and sets `displayTruncated` when Current reports display shortening or Dwell clips a projected field. The source URL, retrieval time, source ID, and exact `{binding,itemId,versionId}` are retained. The Dwell catalog stores only the reference; Current retains item text and original metadata.

The private constructor retains the binding, canonical root, and opened handle. The private `record`, `isLibraryModule`, and `isContentLibrary` functions check the module and handle shapes once at open. `unavailable` creates the standard `CurrentLibraryError`; `clip` stops at the display limit while iterating code points. `#project` creates the bounded DTO; `#call` checks and forwards an optional `AbortSignal`, rethrows an operation error when that signal has aborted, and maps other Current failures to `library_unavailable`. The HTTP host currently calls the adapter without a signal, so its library requests continue after a browser disconnect. Host shutdown waits for active requests before closing Current.

<a id="library-reference-storage"></a>

## Persistent bindings and session references

Catalog schema 7 adds `library_bindings(binding, root)` and `session_library_references(session_id, binding, item_id, version_id)`. The v6-to-v7 migration preserves existing session and turn rows. A binding remains associated with its first canonical root in this catalog, even after its session references are removed. Session deletion removes that session's references through the foreign key cascade. See [`SessionCatalog`](../../../src/storage/catalog.ts).

| Catalog callable | Behavior |
| --- | --- |
| `bindLibrary(binding, root)` | Inserts a new canonical mapping, returns true for the same existing mapping, and returns false for a different root under that binding. |
| `listLibraryReferences(sessionId)` | Returns references ordered by binding, item ID, and version ID. |
| `addLibraryReference(sessionId, reference)` | Inserts the exact reference; a duplicate is an idempotent no-op. |
| `removeLibraryReference(sessionId, reference)` | Deletes only the exact reference; an absent reference is a no-op. |

`initializeSchema` applies the v6-to-v7 migration transactionally, and `migrateV6ToV7` creates the two tables. At catalog open, `#validateLibraryRows` uses `isCanonicalLibraryRoot`, `libraryBindingFromDatabase`, and `libraryReferenceFromDatabase` to check persisted bindings, canonical roots, and references. SQLite's foreign-key check validates the references' parent rows. Invalid persisted data prevents the catalog from opening.

[`SessionService.create`](../../../src/sessions/service.ts) binds the opened Current root before serving sessions. `listLibraryReferences` reads the catalog and works when Current is offline. `addLibraryReference` serializes with other session mutations, validates the exact identity, requires the configured binding, and successfully reads that exact Current version before inserting it. A stale or deleted item therefore cannot be newly attached. `removeLibraryReference` deletes the exact identity and works without an open Current store. Catalog mutations affect only reference rows; session metadata, turn rows, Pi context, and conversation history remain unchanged.

<a id="library-http-browser"></a>

## Authenticated HTTP and browser flow

The `handle` request function inside `startHost` dispatches library routes after Dwell's existing local authentication and request checks. Search and latest return projected item views; exact reads address one saved version. The reference routes store only stable identity:

| Method and path | Behavior |
| --- | --- |
| `POST /api/v1/library/search` | JSON body with `query` and optional `source` and `limit`. |
| `GET /api/v1/library/latest` | Optional `source` and `limit` query parameters. `parseLibraryLatestQuery` rejects unknown or repeated parameters; shared guards validate their values. |
| `GET /api/v1/library/{binding}/items/{itemId}/versions/{versionId}` | Reads exactly the named version. |
| `GET /api/v1/sessions/{sessionId}/library-references` | Lists saved references for the session. |
| `POST /api/v1/sessions/{sessionId}/library-references` | Adds a JSON `{binding,itemId,versionId}` after Current confirms the version exists. |
| `DELETE /api/v1/sessions/{sessionId}/library-references/{binding}/items/{itemId}/versions/{versionId}` | Removes exactly that reference. |

Library errors map to HTTP 400 (`invalid_input`), 404 (`library_not_found`), 409 (`library_binding_mismatch`), or 503 (`library_unavailable`). Unauthenticated calls receive the existing protected-route 401 response. If Current is unavailable, search, latest, exact reads, and adding a reference return 503; listing and removing already saved references still use the catalog. Search JSON requests use Dwell's existing 8 KiB body limit.

[`HOST_PAGE`](../../../src/clients/web/page.ts) provides one native dialog with desktop and mobile open buttons. It shows latest items, query results, an exact-version reader, and the references attached to the selected session. The source link is an HTTP(S) URL from the validated item view; titles, summaries, and body text are rendered as text. Browsing works with no selected session; attach and remove actions require a selected session. Attaching stores only the identity; the Pi prompt, turn, and context remain unchanged.

In [`client.ts`](../../../src/clients/web/client.ts), `openLibrary` opens the dialog and starts reference/latest reads; `searchLibrary`, `loadLatestLibraryItems`, and `readLibraryItem` load the corresponding views. `loadLibraryReferences` reloads the selected session's saved identities. `renderLibraryItems`, `renderLibraryReader`, and `renderLibraryReferences` update the three views; `sameLibraryReference` compares all three identity fields; `libraryFailure` displays request errors. `changeLibraryReference` serializes attach/remove actions in the dialog, disables those controls while a mutation is pending, then reloads authoritative references after the request settles. The refreshed catalog response becomes the displayed state, preventing an older mutation response from overwriting newer saved state.

Read requests carry the dialog generation, selected session, and read generation they started under. Results are ignored after the dialog closes or reopens, the selected session changes, or a newer library read starts. These generation checks suppress stale display. Dialog and session changes do not cancel in-flight requests; the shared transport applies its 15-second GET and 60-second mutation timeouts. Logout closes the dialog and invalidates its pending generations. A persisted reference can remain after its source version is deleted; opening it then returns 404, while the reference can still be removed.

`startHost` opens one configured Current instance before creating `SessionService`. Shutdown stops admission, drains active HTTP operations, shuts down sessions and auth, closes Current, then closes the listener. The listener is closed even if `CurrentLibrary.close` rejects; the close promise reports the failure. Startup cleanup also closes a listener if later setup fails.

<a id="library-contract-guards"></a>

## Shared library contract and guards

[`shared/library.ts`](../../../src/shared/library.ts) defines the DTOs used by the adapter, server, and browser. `LibraryReference` is exactly `{binding,itemId,versionId}`; item views expose source ID, title, URL, optional author and summary, bounded text, retrieval time, completeness, and truncation flags. Search/latest responses carry the binding and at most 20 views. Latest also carries a collection timestamp or `null`.

The exported limits are `LIBRARY_SEARCH_LIMIT = 20`, `LIBRARY_EXCERPT_CHARACTERS = 2,000`, and `LIBRARY_READ_CHARACTERS = 20,000`. `isLibraryBinding` accepts 1–64 ASCII letters, digits, dots, underscores, or hyphens, beginning with a letter or digit. `isLibraryErrorCode` checks the four stable error codes. `isLibrarySearchRequest` requires a nonblank query of at most 200 code points; `isLibraryLatestRequest` validates optional source and limit. A source is a lowercase slug of at most 64 characters; a limit is an integer from 1 through 20.

`isLibraryReference` requires the exact three-field shape and UUID item/version IDs. `isLibraryReferencesResponse` validates each persisted identity and the response envelope; the collection has no reference-count cap. `isLibraryItemView` checks field sizes, timestamp, completeness flags, and an HTTP(S) URL without embedded credentials; it caps an item JSON encoding at 256 KiB. `isLibraryItemsResponse` and `isLibraryLatestResponse` require at most 20 views and cap the full response JSON at 2 MiB. The private `record`, `exact`, `keysWithOptional`, `text`, `source`, and `validLimit` helpers implement these shared checks. `libraryItemPath` validates a reference and percent-encodes its identity into the exact-version route.

The acceptance coverage is in [Current adapter](../../../tests/current-library.test.ts), [persistent references](../../../tests/library-references.test.ts), [HTTP and Host lifecycle](../../../tests/library-http.test.ts), and [browser contract](../../../tests/library-web.test.ts). The Current-backed tests use a built API v1 entry and synthetic store data.
