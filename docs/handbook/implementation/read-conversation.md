<a id="read-conversation"></a>

# Read a conversation

English | [简体中文](../../i18n/zh-CN/handbook/implementation/read-conversation.md)

[Implementation index](README.md)

<a id="behavior"></a>

## Behavior

The conversation view combines Pi's saved active branch with temporary live execution. Saved history is authoritative; live messages and tools appear while work is underway, then yield individually to matching saved entries. Project-instruction snapshots appear in a separate Context panel before messages; history context and branch summaries stay with their response group.

The sidebar lists sessions, and open Pi sessions also appear as numbered tabs that keep their slots until close. Each user message begins a turn; its assistant text, thinking, tool calls and results, extension messages, and history context form one response group. Consecutive thinking and tool steps share one collapsed activity summary. The summary shows a step count, any running tool, and the count of visible failed steps; opening it reveals individual details without expanding their output. Assistant prose still appears in order outside the summaries. Older history loads in bounded pages.

<a id="ownership"></a>

## Ownership

Pi owns the native session file, branch structure, persisted message content, and model context. The host reads and validates a snapshot of the selected branch, then projects entries into bounded pages for the browser. Saved project-instruction context is a snapshot carried by Pi history; the view does not reread current files from the workspace.

The browser owns the rendered view, live stream, disclosures, focus, and scroll position. Saved images load by history-entry and image position. Changing sessions replaces that session's history, event stream, and image requests together.

<a id="execution"></a>

## Execution

1. Selecting an open session loads its newest saved-history page and starts observation; pending reads from the prior session become stale.
2. The host follows Pi's saved leaf through parent entries, projects the active branch in order, and returns context snapshots with a continuation for older pages.
3. Live events update messages and tools. Reconnection or resynchronization reloads saved history; a saved terminal result replaces covered live content.
4. Older pages prepend to the conversation. The browser preserves the visible message anchor, or follows new content when the reader is already at the bottom.

<a id="mechanisms"></a>

## Mechanisms

Assistant identity uses the complete native message and occurrence, preserving repeated identical messages while matching live output to its saved counterpart. Tool results pair by call identity across intervening entries. Orphan results and calls without a saved result remain visible with an explanation.

Markdown becomes explicit elements: raw HTML remains text, links allow only HTTP, HTTPS, or mail destinations, and Markdown images become labels. Code, tables, lists, and emphasis retain their structure. Thinking panels start closed and may use a short heading as their label.

Stable DOM identities let reconciliation reuse nodes, update changed saved groups, and retain open disclosures. If a focused tool summary is replaced, focus returns to its matching summary. Streaming follows the bottom only when the reader was within 90 pixels; otherwise the nearest visible message anchor preserves position.

Each saved-history page holds at most 100 projected entries or 240 KiB. Continuations pin a native file revision, so appends do not shift an older page boundary. They expire when the host restarts; loading latest history creates a fresh boundary.

<a id="technology"></a>

## Technology

Pi's native JSONL and branch links preserve its conversation semantics. Bounded projections keep large histories manageable; native identities prevent live output from duplicating saved entries. The Markdown parser supplies a syntax tree, and explicit DOM construction keeps message text out of executable HTML.

Keyed reconciliation and cached response groups preserve open details, focus, and image callbacks across updates. This handoff depends on saved and live views sharing message and tool identities.

<a id="verification"></a>

## Verification

Repeated identical assistant messages should remain separate, and live content should yield only to its matching saved message. Tool results should pair across intervening entries; unmatched results and missing results should remain visible.

Raw HTML should display as text and unsafe links remain inactive. A long sequence of steps should occupy one summary while collapsed, with prose and failure counts still visible. Opening activity and individual tool or thinking details should survive stream updates and saved-history handoff. New output should retain a bottom-following reader, while updates and older-page prepends preserve the visible message for readers browsing earlier content. A pending history read from another session should never appear in the selected conversation.
