<a id="memory"></a>
# Search and read Memory

English | [简体中文](../../i18n/zh-CN/handbook/implementation/memory.md)

[Implementation index](README.md)

<a id="behavior"></a>

## Behavior

When Distill is explicitly configured for Dwell, the browser sidebar becomes a read-only Memory view for searching and reading saved records. The conversation list is replaced by icon-only session controls; **New** still starts a conversation, and the conversation composer and transcript remain available in the main view. Without Distill, the existing Conversations sidebar remains. The Current Library stays in its separate dialog when configured.

If Distill is configured but its Memory reader is unavailable, the sidebar remains in Memory and offers **Retry**. This keeps the navigation consistent with the selected integration while making reader availability visible.

Browsing Memory leaves the selected conversation, Pi context and saved conversation history unchanged.

<a id="ownership"></a>

## Ownership

Distill owns Memory content, search matching, pagination cursors, record revisions and revision conflicts. Dwell owns the configured local connection, authenticated browser access, and the boundary checks around each request and response. The browser keeps the current query, result page and selected reading page as view state.

Memory content remains in Distill. Dwell does not copy it into the session catalog, turn ledger or Pi history. Current remains a separate owner for collected external material and exact-version references attached to a conversation.

<a id="execution"></a>

## Execution

1. The browser receives the Host's available client capabilities and shows Memory when Distill is configured.
2. A search asks Distill for a bounded page of matching records. Each result identifies a record revision and includes a short preview.
3. Selecting a result asks Distill to read that specific revision. The browser can request later pages of the same record when more text is available.
4. If the selected record has changed since the search result was returned, the read reports a revision conflict. The browser can refresh the search and select the current revision.
5. If Memory cannot be opened, the Memory view reports its unavailable state and offers **Retry**. A reader failure does not stop Dwell's session host or configured source coordination. After a Host restart, the browser requests integration capabilities again so the sidebar reflects the new Host's reader state.

<a id="mechanisms"></a>

## Mechanisms

Search matches one literal substring of at most 128 Unicode code points and returns at most 20 results per page. Each request scans at most 128 stored Memory records. A page can therefore be empty and still include a continuation cursor; continue while a cursor is present, and treat the search as complete only when no cursor remains. A result preview is at most 500 code points. Reading returns at most 8,000 code points per page. Distill owns matching, cursor construction and interpretation, revision identity, and conflict detection; Dwell validates the bounded values it receives and transports them to the authenticated browser.

The revision returned by search is required when reading a result. Distill compares that revision with the stored record before returning each page. If an edit occurs between pages, the read reports a conflict and the browser clears the partial text rather than joining content from different revisions. This ties the read to the record the user selected instead of silently substituting content edited after the result appeared. Search cursors belong to the reader instance and query; reading cursors belong to the selected record revision. Reopening the reader invalidates its cursors, and a cursor cannot be applied to a different query or revision. Opaque continuation cursors keep pagination rules with Distill, which owns the underlying data and search mechanism.

The browser tracks search and read generations. Starting another query invalidates the previous search and any read tied to it; selecting another result or closing the reader invalidates earlier reads. A response is applied only while its generation still matches the active query and selection. Disconnecting clears the view and invalidates pending work. After reconnecting, a newer Host capability response replaces older state only when it belongs to the current authenticated connection and latest capability check.

<a id="technology"></a>

## Technology

Dwell connects to Distill through its local versioned Node API and the explicitly configured Distill store. Distill keeps Memory records and their revisions in its existing SQLite database. The reader opens that store read-only, so Dwell adds no second Memory database and revision checks compare against the same saved records Distill updates. The adapter calls Distill's public API instead of reaching into the database. Memory reader availability is independent of Distill's source-access coordination: failure to open the reader leaves the Dwell Host available.

The browser uses Dwell's authenticated HTTP boundary for search and reading. This keeps Distill matching, revision and cursor rules in Distill; Dwell handles transport and validation, and the client handles navigation and presentation.

<a id="verification"></a>

## Verification

Without Distill configured, the browser should retain its Conversations sidebar and continue to support ordinary sessions. With Distill configured, Memory search and reading should appear in the sidebar, open conversation controls should remain selectable as icons, and **New** should remain available alongside the main conversation view. After a Host restart, the sidebar should refresh Memory's available state. When Current is also configured, its Library dialog should remain usable. If the Memory reader is unavailable, Memory should remain selected and offer **Retry** while the Host and source coordination stay available.

A query should return only literal-substring matches, within the scan, result, preview and page limits. An empty response with a continuation cursor should allow the search to continue; only a response without one establishes that no more matches are available. Reading should return the selected revision in bounded pages; changing the record between search and read should produce a conflict rather than content from a different revision. A Memory reader failure should leave ordinary Dwell sessions and Distill source coordination available. Searching and reading must not add Memory content to Pi prompts or histories.
