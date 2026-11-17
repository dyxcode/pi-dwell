<a id="library"></a>

# Browse the Current library

English | [简体中文](../../i18n/zh-CN/handbook/implementation/library.md)

[Implementation index](README.md)

<a id="behavior"></a>

## Behavior

The Web client can browse an optional local Current library from a single dialog. Latest items and search results show bounded excerpts; selecting an item opens the exact saved version for reading. Browsing is useful without a selected conversation. Attaching or removing a reference requires a selected Dwell session.

An attached reference identifies a library binding, item, and exact version. Attaching stores that identity for the selected session and leaves Pi context unchanged. Current remains the owner of the content. The host can keep displaying and removing saved references while Current is unavailable, although browsing, exact-version reads, and new attachments require the library to be open.

<a id="ownership"></a>

## Ownership

Current owns collected text, metadata, and version history. Dwell opens Current through its local versioned library API and presents a bounded read-only view. Dwell's catalog stores stable session references and the association between each library binding and its canonical local root; Current retains article bodies.

A binding is the local identity of a configured library. The catalog keeps the first canonical root associated with that binding, so opening a different store under the same binding is rejected instead of redirecting existing references. A different store needs its own binding. Dwell can run without Current configured, and a configured Current module that cannot open leaves the session host usable with library reading unavailable.

<a id="execution"></a>

## Execution

1. Opening the dialog loads the latest Current batch and, when a session is selected, that session's stored references. Search replaces the result list with matching excerpts.
2. Selecting a result reads that item's requested version. The reader presents its title, source, retrieval date, summary, text, and source-completeness or truncation information.
3. Attaching asks the open Current library to confirm the exact binding, item, and version before Dwell records the reference. Repeating the same attachment is an idempotent no-op. Removing a reference deletes only that exact identity.
4. After a reference change, the dialog reloads the catalog's saved list. Closing and reopening the dialog reads it again, so displayed references follow persisted session state rather than a temporary toggle.

<a id="mechanisms"></a>

## Mechanisms

Latest and search each return at most 20 items, with excerpts of up to 2,000 Unicode code points. Opening a specific version returns up to 20,000 code points. These limits bound page size while preserving a useful preview and longer reader view. Source completeness and shortening indicators distinguish a partial source from text shortened for display.

The exact reference includes all three identities. Reading never substitutes the newest version for a requested older one. If Current later removes that version, the reference remains attached and visible; opening it reports that the version is unavailable, and the user can still remove it. Listing and removal use the Dwell catalog and therefore work while Current is offline. The catalog cannot add a new reference offline because the exact Current version must be confirmed first.

The browser fences reads by dialog, session selection, and request order. A late search or item response is ignored if the dialog has closed, the session changed, or a newer read has started. Reference changes are serialized in the dialog, then the saved list is reloaded so an older response cannot overwrite a newer persisted state.

<a id="technology"></a>

## Technology

A small adapter over Current's public local API keeps library semantics and storage inside Current while giving Dwell a stable, bounded view. Explicit bindings prevent identity drift when a host's local library path changes. Persisting references rather than article text avoids duplicating Current content or letting session history become another content store.

This division keeps Dwell's conversation usable without Current and keeps reference management available during a library outage. Reading content still depends on the configured Current store; a stored identity remains a reference rather than an offline copy. The user chooses which references belong to a session; those links remain independent of Pi input.

<a id="verification"></a>

## Verification

With no Current binding, the host should continue to support ordinary sessions while library browsing reports that no library is available. If a configured library cannot open, the host should remain usable. Latest and search should return no more than 20 results; opening a reference should return the exact requested version, not whichever version is newest.

After Current removes a version, an existing session reference should remain visible and removable while its content is unavailable. Listing and removing references should work with Current offline, while new attachments should require a successful exact-version read. Attaching should leave Pi context, turn payload, and conversation history unchanged. Reopening the same binding at a different root should be rejected.
