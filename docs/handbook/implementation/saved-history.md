# Read Pi saved history

English | [简体中文](../../i18n/zh-CN/handbook/implementation/saved-history.md)

[Implementation](README.md) · [Handbook](../README.md)

<a id="behavior"></a>

## Behavior

Pi's native JSONL file is the authoritative transcript and source of context when a session reopens. Dwell reads it to show the active branch, images, tool results, and saved instruction snapshots. Displayed history is separate from model context.

History follows the current leaf's ancestry; other saved branches stay outside this conversation view. The first page shows the newest active-branch entries, and later pages move toward its ancestors. Each page has up to 100 entries and a 240 KiB content budget, leaving room for response metadata.

The view projects text, thinking, tool calls and results, summaries, context edits, and supported diagnostics. Image data stays in native entries and loads on request. Instruction snapshots appear as context sources with truncation when they exceed display budgets.

<a id="ownership"></a>

## Ownership

Pi owns the native session file, its branch, saved messages, images, and the runtime rules for turning that branch into model context. Dwell's SQLite catalog stores the Pi session identity, native-file reference, observed history state, durable turn records, and native entry references associated with completed turns.

The native-history reader validates the v3 header against the Pi session and project directory, checks entry identity and parent order, and projects supported content. The page service builds the active branch, signs cursors, and resolves images; the browser combines those pages with temporary live output.

Turn status and saved content have separate lifetimes. A completed SQLite turn can outlive an unavailable native entry; Pi's file must still provide the referenced content.

<a id="execution"></a>

## Execution

For a latest-history read, Dwell resolves the session's native file and reads a stable bounded snapshot. It parses complete JSONL records, validates the header and parent chain, and identifies the active leaf. An unfinished final line is excluded and reported as an incomplete tail. The reader accepts the snapshot only when the file identity and bytes remain consistent during the read.

The page service walks parent references from the leaf and reverses the chain into conversation order. It projects up to 100 entries within entry and page budgets. A signed cursor records the session, byte-prefix revision, and older-page boundary; later appends do not shift pages already in progress.

Image blocks refer to an entry and image position. An image read verifies that the entry remains on the current branch and returns the selected supported image. Reopening starts Pi against the validated native file, restoring Pi's own branch and context rules. If that file or entry is missing, SQLite references cannot recreate its content.

<a id="mechanisms"></a>

## Mechanisms

The reader caps the native file at 128 MiB and each JSONL record at 8 MiB. It opens a host-user-owned regular file without following symbolic links and checks that the path still names that file after reading. File identity and a digest over the byte prefix bind each cursor to one observation; a changed prefix requires a fresh read.

Reconciliation fingerprints each complete native assistant message and its occurrence number, preserving repeated identical messages as distinct. Tool results are tied to the assistant message that owns their call. The browser matches live output by these native identities, not by visible text alone.

History and image reads share a process-wide budget: two scans run at once and up to eight wait in FIFO order. Cancellation removes queued turn-preparation reads; admitted scans finish and release their permit. Shutdown drains admitted reads before closing the catalog. Reads run outside the mutation queue.

<a id="technology"></a>

## Technology

The installed Pi RPC exposes saved entries as one unpaged response. Reading native JSONL directly lets Dwell bound file, record, page, and concurrency use without transferring the whole session tree through RPC. Pi's file remains the single durable transcript.

The adapter follows Pi's v3 JSONL layout and entry-parent semantics. This avoids a second transcript database but makes file validation and bounded scans part of the history boundary. Signed cursors need no transcript cache; their process-local signing key means a host restart returns the browser to the latest page.

<a id="verification"></a>

## Verification scenarios

Read a branched session. The page contains the leaf's ancestor chain in conversation order, and entries from abandoned branches are absent.

Append new messages while paging older history. The cursor continues over its original byte prefix; replacing or changing that prefix invalidates the page and requires a latest read.

Load a saved image after switching sessions or invalidating history. A stale response cannot attach its image to the new conversation, and the native-file read confirms the image still belongs to the active branch.

Save identical assistant messages more than once and include tool results. Each occurrence remains distinct, and a tool result is matched to its owning assistant message.

Restore the original Pi session file and reopen the Dwell session. Pi resumes from that native file, which remains the source of transcript content and model context.
