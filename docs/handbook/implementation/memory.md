<a id="memory"></a>
# Search and read Memory

English | [简体中文](../../i18n/zh-CN/handbook/implementation/memory.md)

[Implementation index](README.md)

<a id="behavior"></a>

## Behavior

Memory is a read-only view in the sidebar. Opening its tab or clearing the search box shows recently updated memories with a preview and date. Selecting a row opens the record in the same sidebar. If both Distill and Current are configured, the sidebar has Memory and Library tabs. With just one integration, the sidebar shows its view directly; without either, it shows Conversations.

If Distill is configured but its Memory reader is unavailable, the sidebar remains in Memory and offers **Retry**. This keeps the navigation consistent with the selected integration while making reader availability visible.

Browsing Memory leaves the selected conversation, Pi context and saved conversation history unchanged.

<a id="ownership"></a>

## Ownership

Distill owns Memory content, search matching, pagination cursors, record revisions and revision conflicts. Dwell owns the configured local connection, authenticated browser access, and the boundary checks around each request and response. The browser keeps the current query, result page and selected reading page as view state.

Memory content remains in Distill. Dwell does not copy it into the session catalog, turn ledger or Pi history. Current remains a separate owner for collected external material and exact-version references attached to a conversation.

<a id="execution"></a>

## Execution

1. The browser receives the Host's available client capabilities and shows Memory when Distill is configured.
2. With no query, the browser asks Distill for a page of recent updates. A submitted query instead asks for literal matches. In either mode, each result includes a preview and identifies a record revision.
3. Selecting a result asks Distill to read that specific revision. The browser can request later pages of the same record when more text is available.
4. If the selected record has changed since the search result was returned, the read reports a revision conflict. The browser can refresh the search and select the current revision.
5. If Memory cannot be opened, the Memory view reports its unavailable state and offers **Retry**. A reader failure does not stop Dwell's session host or configured source coordination. After a Host restart, the browser requests integration capabilities again so the sidebar reflects the new Host's reader state.

<a id="mechanisms"></a>

## Mechanisms

Search matches one literal substring of at most 128 Unicode code points and returns at most 20 results per page. Each request scans at most 128 stored Memory records. A page can therefore be empty and still include a continuation cursor; continue while a cursor is present, and treat the search as complete only when no cursor remains. A result preview is at most 500 code points. Reading returns at most 8,000 code points per page. Distill owns matching, cursor construction and interpretation, revision identity, and conflict detection; Dwell validates the bounded values it receives and transports them to the authenticated browser.

Recent pages contain at most 20 records, newest updates first, with ties ordered by ascending record identity. The signed continuation marks the last update time and identity; it belongs to the current reader and cannot be used as a search or read cursor. These are live pages, not a snapshot of the store.

The revision returned by browsing or search is required when reading a result. Distill compares that revision with the stored record before returning each page. If an edit occurs between pages, the read reports a conflict and the browser clears the partial text rather than joining content from different revisions. This ties the read to the record the user selected instead of silently substituting content edited after the result appeared. Search cursors belong to the reader instance and query; reading cursors belong to the selected record revision. Reopening the reader invalidates its cursors, and a cursor cannot be applied to a different query or revision. Opaque continuation cursors keep pagination rules with Distill, which owns the underlying data and search mechanism.

The browser tracks search and read generations. Starting another query invalidates the previous search and any read tied to it; selecting another result or closing the reader invalidates earlier reads. A response is applied only while its generation still matches the active query and selection. Disconnecting clears the view and invalidates pending work. After reconnecting, a newer Host capability response replaces older state only when it belongs to the current authenticated connection and latest capability check.

<a id="technology"></a>

## Technology

Dwell connects to Distill through its local versioned Node API and the explicitly configured Distill store. Distill keeps Memory records and their revisions in its existing SQLite database. The reader opens that store read-only, so Dwell adds no second Memory database and revision checks compare against the same saved records Distill updates. The adapter calls Distill's public API instead of reaching into the database. Memory reader availability is independent of Distill's source-access coordination: failure to open the reader leaves the Dwell Host available.

The browser uses Dwell's authenticated HTTP boundary for browsing, search, and reading. This keeps Distill matching, revision and cursor rules in Distill; Dwell handles transport and validation, and the client handles navigation and presentation.

<a id="verification"></a>

## Verification

Verify the four integration combinations, including the standalone Conversations sidebar and switching between Memory and Library without leaving the conversation. The desktop sidebar should remember collapse across reloads; the mobile drawer should start closed. Opening Memory or clearing the query should show recent updates with **More** when another page exists. An empty store should say **No memories saved yet.** If the reader cannot open, Memory should offer **Retry** while the Host and source coordination remain available.

A query should return only literal-substring matches, within the scan, result, preview and page limits. An empty response with a continuation cursor should allow the search to continue; only a response without one establishes that no more matches are available. Reading should return the selected revision in bounded pages; changing the record between search and read should produce a conflict rather than content from a different revision. A Memory reader failure should leave ordinary Dwell sessions and Distill source coordination available. Searching and reading must not add Memory content to Pi prompts or histories.
