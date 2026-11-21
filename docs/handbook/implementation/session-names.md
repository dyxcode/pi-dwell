# Session name metadata

English | [简体中文](../../i18n/zh-CN/handbook/implementation/session-names.md)

[Implementation handbook](README.md)

<a id="behavior"></a>

## Conversation labels

The Web client labels a conversation with the final component of its working directory, followed by the model and thinking level. An existing custom name takes the place of the directory in the label.

<a id="ownership"></a>

## Data ownership

Dwell’s Catalog stores the custom name, its revision and the session update time. Pi owns native conversation history.

<a id="execution"></a>

## Update name metadata

The Host API accepts a name and the caller’s expected revision. The Host resolves the session, compares the revision in a Catalog transaction and publishes changes to session state. A null name restores the default label. Sending the current name returns the current state. A trimmed name must contain 1 to 80 Unicode code points.

<a id="mechanisms"></a>

## Concurrent updates

A stale revision produces a conflict. API clients can reload the session before submitting a new update. The browser merges live and refreshed names by revision. Routine lifecycle and history updates preserve the saved name and revision.

<a id="technology"></a>

## Persistence

SQLite compares the revision and writes the update in one transaction. Session events carry the name and revision to subscribers.

<a id="verification"></a>

## Verification scenarios

Check that competing writes reject stale revisions, history observations preserve a newer name and the Catalog restores a saved name after restart.
