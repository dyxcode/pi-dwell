# Rename a conversation

English | [简体中文](../../i18n/zh-CN/handbook/implementation/session-names.md)

[Implementation handbook](README.md) · [Documentation](../README.md)

<a id="behavior"></a>

## User behavior

Dwell saves conversation names on the Host. Browsers share the same name, and it survives a Host restart. Users can set a name, change it, or Reset to the default display.

The default label uses the last part of the working directory. The interface appends the selected model and thinking level. A custom name accepts up to **80 Unicode code points** after trimming surrounding whitespace. A combined emoji can occupy several code points. Blank names are rejected; Reset clears the custom name.

Import copies a legacy browser-local name into the editor. Save then makes it the shared name.

<a id="ownership"></a>

## Responsibilities and data

| Part | Responsibility | Data and lifetime |
| --- | --- | --- |
| Browser | Editing, display, conflict handling and asynchronous responses | Draft, opening name revision and editor generation, held in memory |
| Session coordination | Ordering mutations, resolving the conversation and publishing updates | Connects browser operations to the Catalog |
| Catalog | Durable storage and revision checks | Name, name revision and session update time, stored in SQLite |

Pi owns execution and native conversation history. Renaming updates Dwell's metadata while leaving that history intact. The name revision orders name changes; model and runtime changes use their own state handling.

<a id="execution"></a>

## Saving a name

Opening the editor captures the current name and revision. Input remains a local draft until Save. The browser validates the name and submits it with the captured revision, temporarily disabling Save, Reset and Import.

The Host queues the mutation, then reads the saved name and revision inside a database transaction. It compares revisions first, then checks whether the name changed. A changed name is saved with the next revision and a new update time. The Host publishes the saved state to subscribers and returns it to the initiating browser, which merges the result and closes the editor.

| Condition | Result |
| --- | --- |
| Current revision, changed name | Save, advance the revision and publish an update |
| Current revision, identical name | Return the current state with unchanged revision and update time |
| Outdated revision | Enter conflict handling, even if the submitted name matches |
| Blank or oversized name | Keep the editor open with an input message |
| Reset with a custom name | Clear the name and advance the revision |
| Reset while already using the default | Keep the existing revision |

<a id="mechanisms"></a>

## Concurrent edits and late responses

**Two browsers editing together.** Both open revision 4. The first save advances it to 5; the second still submits revision 4 and is rejected. This optimistic concurrency control allows simultaneous editing and checks the editing basis at save time.

On conflict, the browser fetches the latest name, updates the display and closes the editor, discarding the unsaved draft. If that refresh fails, the editor stays open and reports the failure.

**A delayed save response.** A browser can receive revision 6 through SSE before revision 5 arrives in an older save response. It retains the newer name. This comparison protects the name and its revision; other incoming session state still participates in the update.

**A different editor is now open.** Each opening receives a new generation marker. A response affects the editor only when its generation, conversation and open state still match. Closing an editor ends local editing; a mutation already sent to the Host can still complete.

**History observation finishes after a rename.** Ordinary Catalog updates write lifecycle and history information, while name updates own the name and revision. A background read carrying older session data therefore preserves the newly saved name.

<a id="technology"></a>

## Technology and trade-offs

| Mechanism | Role | Design consequence |
| --- | --- | --- |
| SQLite transaction | Checks the revision and writes the name atomically, with durable storage | Revision comparison and the write share one commit boundary |
| Host mutation queue | Orders operations inside the Host | Revision checks also handle time spent editing outside the queue |
| HTTP request | Submits the mutation and returns its result | Responses can arrive after newer real-time updates |
| SSE | Delivers shared state to subscribed browsers | Clients merge names by revision across updates and reconnects |
| Name revision | Orders shared name changes | An older name cannot replace a newer one |
| Editor generation | Associates a response with its local editing operation | A completed old operation cannot disturb a new editor |

<a id="verification"></a>

## Verification scenarios

| Scenario | Expected outcome |
| --- | --- |
| Two browsers save from the same revision | First save succeeds; second enters conflict handling |
| New SSE update arrives before an old save response | Newer name remains visible |
| Another editor opens before an old request finishes | New editor keeps its input and state |
| History reading overlaps a rename | New name survives the history update |
| Host restarts after saving | Saved name is restored |
| Compare Pi history before and after renaming | History content is identical |
| Reset twice | Second reset preserves the revision |
| Submit names at and beyond the length limit | Accept the limit; reject the longer name |
