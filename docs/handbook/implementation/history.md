<a id="history-implementation"></a>

# Saved history and identity

English | [简体中文](../../i18n/zh-CN/handbook/implementation/history.md)

[Implementation index](README.md) · [Session service](sessions.md) · [Runtime overview](../runtime.md)

History crosses four modules with distinct jobs. `pi-history.ts` reads Pi's native JSONL safely and pins revisions; `sessions/history.ts` selects the active branch and turns native entries into bounded client pages; `message-identity.ts` matches complete assistant messages across saved and live views; `pi-history-budget.ts` limits concurrent file scans. The catalog stores references to native entry IDs, not a duplicate transcript.

<a id="native-jsonl-snapshot-and-validation"></a>

## Native JSONL snapshot and validation

[`HistoryReadError`, `HistoryPrefix`, `SavedHistory`, and `SavedHistoryReadOptions`](../../../src/runtime/pi-history.ts#L15) define the read boundary. Errors carry HTTP-compatible status/code pairs; a prefix contains the byte length and revision of a previously read complete prefix. A successful snapshot returns parsed entries, the file's last entry ID, the complete-byte revision, its complete-byte length, and whether an unterminated tail was omitted. Reads are bounded at 128 MiB per source, 8 MiB per record, and 100,000 entries.

The error constructors keep failure categories stable: [`changed`, `invalid`, `unavailable`, `overLimit`, and `busy`](../../../src/runtime/pi-history.ts#L50) represent a stale pinned revision, structurally unsafe content, a missing/unreadable saved file, configured size overflow, and scan-budget overload. [`isRecord`](../../../src/runtime/pi-history.ts#L78) narrows parsed JSON objects. [`errorCode`](../../../src/runtime/pi-history.ts#L82) extracts only a string filesystem code. [`openError`](../../../src/runtime/pi-history.ts#L88) maps missing files to unavailable, symlink/type changes during a pinned read to changed, and invalid file types to invalid; other open failures are unavailable.

[`validatePrefix`](../../../src/runtime/pi-history.ts#L96) accepts only a positive safe byte length within the source cap and a 64-hex revision. [`sameIdentity`](../../../src/runtime/pi-history.ts#L105) compares device/inode pairs; [`sameReadMetadata`](../../../src/runtime/pi-history.ts#L112) compares size, mtime, and ctime snapshots. [`assertSafeFile`](../../../src/runtime/pi-history.ts#L123) requires a regular file owned by the current process UID with one hard link. [`assertPathIdentity`](../../../src/runtime/pi-history.ts#L129) uses `lstat` to reject symlinks and ensure the path still resolves to the opened file identity, mapping replacement differently for a pinned prefix. [`readBoundary`](../../../src/runtime/pi-history.ts#L141) reads exactly the requested byte count in bounded chunks and detects early EOF as a changed file.

[`validTimestamp`](../../../src/runtime/pi-history.ts#L161) accepts only bounded timestamps that parse and round-trip exactly through ISO serialization. [`parseRecord`](../../../src/runtime/pi-history.ts#L173) rejects oversized records and invalid UTF-8/JSON, strips one CR before parsing, ignores blank complete lines, and requires each nonblank line to be an object. [`parseEntries`](../../../src/runtime/pi-history.ts#L193) validates the first nonblank record as the matching Pi v3 session header. Later records require unique bounded IDs, a valid type/timestamp, a null or previously seen parent ID, and the global entry cap; a parent must therefore precede its child. It returns the final entry as the native file leaf. [`makeRevision`](../../../src/runtime/pi-history.ts#L254) hashes device, inode, complete length, and complete bytes, so a same-content replacement has a different identity. [`completedBytes`](../../../src/runtime/pi-history.ts#L266) finds the last newline boundary.

[`readSavedHistorySnapshot`](../../../src/runtime/pi-history.ts#L270) opens with `O_NOFOLLOW | O_NONBLOCK`, checks ownership/link/file identity before reading, and determines the byte boundary. An unpinned read uses the initially observed file size; ordinary appends after that point do not extend the snapshot. A cursor read uses its recorded prefix length and rejects if the file is shorter. The implementation stats after reading; if metadata changed, it reads the same boundary a second time and requires identical bytes and stable identity, then checks the path identity again. It calculates the revision from complete newline-terminated bytes only. For a pinned prefix, the requested boundary must be complete and its revision must still match. Only then are records parsed. An unfinished final line is omitted and marked `incompleteTail`; malformed complete lines are errors. All raw file errors are normalized to `HistoryReadError`, and the handle is closed in `finally`.

[`readSavedHistory`](../../../src/runtime/pi-history.ts#L336) validates an optional prefix, runs the scan under the shared history budget, and translates queue overflow to `history_busy`. This separates scan admission from file parsing and keeps every caller under the same process-wide limit.

<a id="history-scan-budget"></a>

## History scan budget

[`HistoryReadBudgetError` and `abortError`](../../../src/runtime/pi-history-budget.ts#L4) identify queue saturation and cancellation while waiting. The private `HistoryReadBudget` has two active permits and eight FIFO waiters. [`HistoryReadBudget.run`](../../../src/runtime/pi-history-budget.ts#L27) rejects an already-aborted queued request, starts immediately when a permit is free and no one is queued, otherwise rejects a ninth waiter or enqueues it. An admitted operation is not interrupted mid-file read. `cancelQueuedOnly` permits a public read admitted before shutdown to take a free permit even if its signal is now aborted, but still prevents it from entering the wait queue. The nested `start` callback runs the operation and releases the permit after either resolution or rejection; `onAbort` removes the exact queued waiter, detaches its listener, and rejects it.

[`HistoryReadBudget.#release`](../../../src/runtime/pi-history-budget.ts#L73) decrements the active count, repeatedly removes cancelled head waiters, then admits the next live waiter and removes its abort listener. The module's singleton is wrapped by [`runWithHistoryReadBudget`](../../../src/runtime/pi-history-budget.ts#L95), so file reads from service turns, history pages, result retrieval, and images share one queue. It is a per-process concurrency bound, not a disk-wide lock.

<a id="history-page-cursors-and-branch"></a>

## Signed cursors and active-branch pagination

[`HistorySlice` and `HistoryPages`](../../../src/sessions/history.ts#L326) define page output. The class keeps only a random in-memory HMAC key; it does not retain transcript contents or require a database table. A cursor is consequently verifiable only in the process that created it and expires when the host restarts.

[`HistoryPages.#cursor`](../../../src/sessions/history.ts#L339) bounds cursor length and requires two base64url parts. It computes the expected HMAC-SHA256, checks equal signature length before constant-time comparison, decodes JSON, and requires the same session ID, a positive safe byte boundary, a SHA-256 revision, and a positive safe `before` index. Malformed, forged, foreign, or expired prefixes become `invalid_cursor`. [`HistoryPages.#encode`](../../../src/sessions/history.ts#L375) serializes the validated payload and signs its base64url text.

[`HistoryPages.read`](../../../src/sessions/history.ts#L380) verifies the cursor first, then calls `readSavedHistory` with its pinned byte/revision prefix and optional cancellation signal. It indexes all entries by native ID and walks backward from Pi's persisted leaf through parent IDs; a missing parent is `invalid_history`. After reversing to chronological order, it derives assistant message identities and associates tool calls/results with their owning assistant message. A cursor's `before` position must fit the active branch. The method derives project-instruction sources from the whole branch, then walks backward from the page boundary until it reaches 100 projected entries or the 240 KiB page budget (including reserved metadata/context space). Entries are reversed back into chronological order. Hidden native entries still advance the branch index, preventing repeat/skip errors. If more branch entries remain, the next cursor pins the same complete byte prefix and revision plus the next index. The returned `branchIds` allow `SessionService` to prove whether a turn's native entries remain on the selected branch.

The page limits include 64 KiB per projected entry, 240 KiB of page body, 96 KiB for context-source JSON, at most 32 context sources, and a 256 KiB shared envelope. Images are represented by entry ID/index/MIME metadata; base64 bytes are loaded separately.

<a id="history-context-and-entry-projection"></a>

## Project instructions and saved-entry projection

[`string`, `block`, and `sections`](../../../src/sessions/history.ts#L27) are the shared projection primitives: `string` accepts nonempty metadata up to 1,024 characters, `block` creates a text-like block with no tool reference, and `sections` reads a record-valued native `sections` field. [`prefixUtf8`](../../../src/sessions/history.ts#L38) clips at a valid Unicode-code-point boundary under a byte cap.

[`contextSection`](../../../src/sessions/history.ts#L50) parses only persisted `<project_instructions path="…">` blocks from Pi's saved system context. It limits path length, each preview, source count, and combined JSON bytes. Its nested `sourceAt` builds a candidate source whose `truncated` flag records path/content clipping; `encodedSize` measures the serialized source plus its array separator. A binary search finds the longest content prefix that fits the remaining combined budget. If even the path-only record cannot fit, parsing stops and marks the result truncated. [`activeContextSources`](../../../src/sessions/history.ts#L99) applies system-message and compaction snapshots in order: `null` clears the active set, a string replaces it with sources parsed from that snapshot, and missing/unrecognized state leaves it unchanged. The function returns the latest active source set; it does not reopen project directories or reread the source files.

[`imageMimeType`](../../../src/sessions/history.ts#L122) whitelists PNG, JPEG, WebP, and GIF. [`savedImage`](../../../src/sessions/history.ts#L126) requires an image block with canonical-shaped base64 length/alphabet and an allowed MIME type. [`toolInput`](../../../src/sessions/history.ts#L139) iteratively checks nested arrays/objects with depth and item limits before JSON serialization; excessive nesting produces a bounded placeholder so the page can still be returned.

[`project`](../../../src/sessions/history.ts#L155) converts one Pi native entry to a `HistoryEntry` or omits it. Non-display custom entries and routine model/thinking/session/usage metadata are hidden. System messages are also hidden. Bash-execution messages show the command and available output/exit/cancellation/truncation state; incomplete commands become diagnostics. Displayable custom messages, branch/compaction summaries, user/assistant/tool-result messages, context edits, and labels retain distinct roles and metadata. Unknown roles/types become explicit diagnostic blocks. Content arrays keep at most 64 blocks and project text, thinking, tool calls, and images; unsupported blocks are represented as diagnostics. A saved tool input that exceeds its structural walk limit is replaced with a concise explanation.

After role projection, `project` applies a 64 KiB serialized budget per entry, including escaping, native IDs, roles, and block metadata. It reserves room for the entry envelope, then shortens text by code point or stops before a block that cannot fit. `project.metadata` accepts bounded string metadata and marks overlong values truncated. Image data is never placed in the page payload; only the active-branch image index and MIME type are returned. Tool-owner identity fields are attached by `HistoryPages.read` after projection so duplicate native call IDs in separate assistant messages remain distinguishable.

<a id="history-image-loading"></a>

## Loading saved images

[`HistoryPages.image`](../../../src/sessions/history.ts#L469) rejects invalid image indexes with `null`, reads a bounded native-history snapshot, and constructs the active branch from the persisted leaf. It returns nothing for an entry outside that branch, a non-message entry, malformed content, or a missing/unsupported image. Image indexes count image blocks within the selected native message in content order. The chosen block must pass `savedImage`; decoded bytes must stay within 5 MiB and re-encode to the exact original base64 string before the method returns MIME type and a `Buffer`. The browser requests an image by session, entry ID, and index; the server resolves it through validated native history.

<a id="assistant-message-identity"></a>

## Complete assistant-message identity

[`canonical`](../../../src/runtime/message-identity.ts#L5) recursively sorts object keys before hashing, preserves array order, and rejects nesting beyond 64 levels. [`nextMessageKey`](../../../src/runtime/message-identity.ts#L17) serializes that complete canonical message, computes a SHA-256 digest, and adds a per-digest occurrence count. It refuses to introduce a 100,001st distinct digest and returns `undefined` for nonserializable/deep messages; an unknown identity never suppresses live content. The resulting key is `digest:occurrence`, so two assistant messages with identical full payloads remain distinct occurrences. [`savedMessageKeys`](../../../src/runtime/message-identity.ts#L32) applies this rule only to Pi entries of type `message` whose role is assistant and returns both entry-to-key mappings and final digest counts. Display text alone is never the identity; complete message metadata and tool calls participate.

Identity is also used by `SessionEvents` while observing live `message_end` records and by `SessionService` when calculating what is new relative to an existing transcript. Tool ownership is scoped to the assistant identity. When a baseline or bounded diff is incomplete, or a message is unidentifiable, both live and saved evidence remain visible.

Related tests cover [native JSONL validation](../../../tests/pi-history.test.ts), [scan fairness and cancellation](../../../tests/pi-history-budget.test.ts), [history pages and projections](../../../tests/history.test.ts), [context snapshots](../../../tests/history-context.test.ts), and [service-level restart/reconciliation](../../../tests/history-service.test.ts).
