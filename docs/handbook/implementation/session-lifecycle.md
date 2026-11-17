# Session lifecycle

English | [简体中文](../../i18n/zh-CN/handbook/implementation/session-lifecycle.md)

[Implementation handbook](README.md) · [Documentation](../README.md)

<a id="behavior"></a>

## Behavior

A Dwell session is a durable identity for one Pi conversation and project directory. Creation records that identity before starting Pi. Opening starts or reuses a Pi process; closing releases the process but keeps the catalog record and native conversation file. Saved sessions are not reopened automatically after host restart.

Each open session owns one Pi child process, with a host limit of eight. A session cannot close while Pi work is active. The host can start before Pi is configured; creating or opening a session requires a verified executable and existing project directory.

<a id="ownership"></a>

## Ownership

Dwell's private SQLite catalog stores Dwell and Pi identities, the canonical project location, Pi executable configuration, selected model and thinking level, and lifecycle state. It also stores durable turn metadata. Live processes, RPC connections, and observers are held in memory and disappear when the host stops.

Pi owns the agent loop, provider calls, tools, extensions, effective prompt context, active branch, and native JSONL conversation. Dwell stores the file's expected location and identity, not a second transcript. The project remains Pi's working directory, and Pi profile settings and credentials come from the host environment. SQLite and Pi files have separate commit boundaries.

<a id="execution"></a>

## Execution

1. Host startup opens and validates the catalog, applies supported schema migrations, and reconciles unfinished creation and turn records. It leaves saved Pi sessions closed.
2. Creation canonicalizes an existing project directory, checks Pi configuration, allocates separate Dwell and Pi identities, and commits a creation record before launching Pi. A matching retry returns the same record; changed settings under that retry identity are rejected.
3. Pi starts in RPC mode with the project as its working directory, a private session directory, the host environment, and the verified executable. A new session receives its preallocated Pi identity and optional model choice; otherwise Pi uses its configured default.
4. Dwell waits for Pi state and checks the session identity, effective model, and session file before marking the session ready. Startup failure is recorded and the child is stopped.
5. Reopen verifies the saved project location and native session file. Pi resumes the saved file, or uses the stored identity for a genuinely empty session. Missing or invalid expected history blocks reopen instead of creating a replacement conversation.
6. Closing an idle session remembers Pi's saved-file state, stops the child, detaches observers, and retains catalog and history. Shutdown stops admission, settles tracked work, closes children, drains admitted operations, then closes SQLite.

<a id="mechanisms"></a>

## Mechanisms

Pi configuration uses an absolute executable and optional absolute Node entry point. Dwell resolves both and verifies Pi 1.4.0 before saving. Changing the executable configuration requires all hosted Pi runtimes to be closed and all active turns to finish. Executable and version are checked again on every process launch.

The catalog has a versioned schema. Startup verifies it, applies migrations inside one SQLite immediate transaction, then checks the resulting schema and foreign-key relationships. Failure rolls back. Corrupt, unsupported, or unsafe catalog files stop startup and remain intact. Transactions protect related catalog writes and uniqueness constraints, but do not include Pi JSONL writes.

Session changes run through a host admission queue. Catalog constraints make a retry identity refer to one creation request and allow only one active Dwell turn per session. If Pi acts before a crash but Dwell cannot record settlement, restart marks the turn interrupted. It is not replayed because the native history may already contain its result.

On each start or reopen, Pi loads native resources from the host user's profile and selected project, applying its context rules, trust decisions, exclusions, extensions, skills, prompt templates, themes, and MCP settings. Reopening refreshes the files loaded at runtime startup. Hosted execution uses the host's configured provider access. The Host observes execution passively. With no interactive consumer, Dwell’s Pi adapter answers extension dialogs with cancellation; the browser has no terminal-dialog interface.

<a id="technology"></a>

## Technology

Node's built-in SQLite stores host-owned identity and lifecycle state; Pi JSONL remains the authoritative conversation history. This keeps Dwell metadata durable without maintaining a competing transcript. Their separate files mean a crash can leave native history ahead of Dwell's turn record, so uncertain work remains interrupted.

Dwell supervises the full Pi coding-agent runtime as a stdio JSONL RPC child. Responses are correlated separately from asynchronous Pi events. Malformed, oversized, unmatched, or timed-out records fail the owned runtime. Process isolation retains Pi's native resource and extension loading; Dwell owns shutdown, state validation, and recovery. The boundary is pinned to Pi 1.4.0, and terminal-specific extension interaction is cancelled without an interactive RPC consumer.

<a id="verification"></a>

## Verification

- Retrying creation with the same identity and settings returns one Dwell session; changed settings are rejected before a second Pi child starts.
- A new empty session can close and reopen with its Pi identity before a conversation file exists. A populated session resumes its saved file and effective model.
- Removing or corrupting expected history prevents reopen. Dwell does not create a new empty conversation under the old identity.
- A child reporting the wrong session or model is stopped before readiness. Invalid paths or unsupported Pi versions prevent startup and leave the durable outcome visible.
- Resource edits do not affect an open process; reopen loads current Pi resources and still respects trust and exclusions.
- After restart, sessions remain available, active work is interrupted, and no prompt is replayed. Explicit reopen resumes the native Pi file.
