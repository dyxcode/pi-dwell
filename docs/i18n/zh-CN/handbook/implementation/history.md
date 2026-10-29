<a id="history-implementation"></a>

# Saved history 与 identity

[English](../../../../handbook/implementation/history.md) | 简体中文

[实现文档索引](README.md) · [Session service](sessions.md) · [Runtime 概览](../runtime.md)

History 跨越四个职责不同的 module。`pi-history.ts` 安全读取 Pi native JSONL 并固定 revision；`sessions/history.ts` 选择 active branch 并转换为有界 client page；`message-identity.ts` 在 saved/live view 之间匹配完整 assistant message；`pi-history-budget.ts` 限制并发文件扫描。Catalog 保存 native entry ID reference，而不是 transcript 副本。

<a id="native-jsonl-snapshot-and-validation"></a>

## Native JSONL snapshot 与 validation

[`HistoryReadError`、`HistoryPrefix`、`SavedHistory` 和 `SavedHistoryReadOptions`](../../../../../src/runtime/pi-history.ts#L15) 定义读取边界。Error 携带可映射到 HTTP 的 status/code；prefix 保存已读完整前缀的 byte length 和 revision。成功结果包含解析出的 entries、文件最后 entry ID、完整 byte 前缀的 revision/length，以及是否忽略未终止的 tail。每次 read 限制为 source 128 MiB、record 8 MiB 和 100,000 entries。

错误构造器固定 failure 类别：[`changed`、`invalid`、`unavailable`、`overLimit` 和 `busy`](../../../../../src/runtime/pi-history.ts#L50) 分别表示 pinned revision 过期、结构/文件不安全、saved file 缺失或不可读、超出大小上限、扫描预算过载。[`isRecord`](../../../../../src/runtime/pi-history.ts#L78) 窄化 JSON object。[`errorCode`](../../../../../src/runtime/pi-history.ts#L82) 只读取 string 类型 filesystem code。[`openError`](../../../../../src/runtime/pi-history.ts#L88) 将文件缺失映射到 unavailable；pinned read 期间的 symlink/type change 映射为 changed；无效文件类型映射为 invalid；其他 open error 映射为 unavailable。

[`validatePrefix`](../../../../../src/runtime/pi-history.ts#L96) 只接受不超过 source 上限的正安全字节数及 64 位 hex revision。[`sameIdentity`](../../../../../src/runtime/pi-history.ts#L105) 比较 device/inode；[`sameReadMetadata`](../../../../../src/runtime/pi-history.ts#L112) 比较 size、mtime 与 ctime snapshot。[`assertSafeFile`](../../../../../src/runtime/pi-history.ts#L123) 要求 regular file 由当前 process UID 拥有且只有一个 hard link。[`assertPathIdentity`](../../../../../src/runtime/pi-history.ts#L129) 使用 `lstat` 拒绝 symlink，并确认 path 仍指向已打开文件；pinned-prefix 场景会区分替换错误。[`readBoundary`](../../../../../src/runtime/pi-history.ts#L141) 以有界 chunk 精确读取指定字节数；提前 EOF 会认定文件发生变化。

[`validTimestamp`](../../../../../src/runtime/pi-history.ts#L161) 只接受长度受限、可解析且经 ISO serialization round-trip 后完全相同的 timestamp。[`parseRecord`](../../../../../src/runtime/pi-history.ts#L173) 拒绝过大的 record 和非法 UTF-8/JSON，解析前移除一个 CR，忽略空白完整行，并要求每个非空记录为 object。[`parseEntries`](../../../../../src/runtime/pi-history.ts#L193) 将第一个非空 record 验证为匹配 Pi v3 session header。后续 record 必须有唯一且有界的 ID、有效 type/timestamp，以及 null 或此前已出现的 parent ID；因此 parent 必须先于 child。超过 entry 上限也会拒绝。函数返回最后一条 entry 作为 native file leaf。[`makeRevision`](../../../../../src/runtime/pi-history.ts#L254) 将 device、inode、完整长度及完整内容一起 hash，因此内容相同但文件被替换也会有不同 identity。[`completedBytes`](../../../../../src/runtime/pi-history.ts#L266) 查找最后一个 newline 边界。

[`readSavedHistorySnapshot`](../../../../../src/runtime/pi-history.ts#L270) 使用 `O_NOFOLLOW | O_NONBLOCK` 打开文件；读取前检查 owner、hard link 和 file identity，再决定 byte boundary。未 pin 的读取以首次观察到的文件大小为准，期间普通 append 不会扩展本次 snapshot。Cursor read 使用记录的 prefix 长度；若文件变短则认定已变化。读取后再次 stat；如果 metadata 改变，会从同一 boundary 重读，要求内容一致且 identity 稳定，随后再次校验 path identity。Revision 只基于完整 newline-terminated bytes。Pinned prefix 必须落在完整行 boundary 且 revision 仍匹配后才能解析。末尾未完成的一行会忽略并设置 `incompleteTail`；损坏的完整行则报错。底层文件错误统一转换为 `HistoryReadError`，file handle 在 `finally` 关闭。

[`readSavedHistory`](../../../../../src/runtime/pi-history.ts#L336) 验证可选 prefix，在共享 history budget 下执行扫描，并把 queue overflow 转为 `history_busy`。这样 scan admission 与文件解析分离，同时保证所有调用都服从同一进程级上限。

<a id="history-scan-budget"></a>

## History scan budget

[`HistoryReadBudgetError` 和 `abortError`](../../../../../src/runtime/pi-history-budget.ts#L4) 分别表示 queue 已满以及在等待期间取消。私有 `HistoryReadBudget` 有两个 active permit 和八个 FIFO waiter。[`HistoryReadBudget.run`](../../../../../src/runtime/pi-history-budget.ts#L27) 会立即拒绝已 abort 的 queued request；若有空闲 permit 且没有排队者，则立即启动；否则第九个 waiter 会被拒绝，其他请求进入队列。已经 admitted 的 operation 不会在文件读取中途被取消。`cancelQueuedOnly` 允许 shutdown 前已接受的 public read 在有空闲 permit 时启动，即使 signal 已 abort，但仍禁止它新加入等待队列。嵌套 `start` callback 运行 operation，并在成功或失败后释放 permit；`onAbort` callback 从队列移除对应 waiter、detach signal listener 并拒绝 Promise。

[`HistoryReadBudget.#release`](../../../../../src/runtime/pi-history-budget.ts#L73) 递减 active count，循环清掉队首已取消的 waiter，再 admission 下一个仍有效的 waiter 并移除其 abort listener。Module singleton 通过 [`runWithHistoryReadBudget`](../../../../../src/runtime/pi-history-budget.ts#L95) 暴露，因此 service turn、history page、result retrieval 和 image read 共享一个 queue。这是 process-local concurrency limit，不是跨进程磁盘锁。

<a id="history-page-cursors-and-branch"></a>

## Signed cursor 与 active-branch pagination

[`HistorySlice` 和 `HistoryPages`](../../../../../src/sessions/history.ts#L326) 定义 page 结果。Class 只保留随机生成的内存 HMAC key，不缓存 transcript，也不需要数据库表。因此 cursor 只能在签发它的进程中验证，host restart 后会过期。

[`HistoryPages.#cursor`](../../../../../src/sessions/history.ts#L339) 限制 cursor 长度并要求两个 base64url 部分。它计算 HMAC-SHA256，先检查 signature 长度再进行 constant-time comparison，解析 JSON 后要求 session ID 一致、byte boundary 为正安全整数、revision 为 SHA-256、`before` index 为正安全整数。Malformed、伪造、foreign 或过期 prefix 都会变成 `invalid_cursor`。[`HistoryPages.#encode`](../../../../../src/sessions/history.ts#L375) 将已验证 payload 序列化后签名。

[`HistoryPages.read`](../../../../../src/sessions/history.ts#L380) 先验证 cursor，再将其 byte/revision prefix 和可选 cancellation signal 传给 `readSavedHistory`。它按 ID 索引所有 entry，从 Pi persisted leaf 沿 parent ID 向回遍历；parent 缺失时报 `invalid_history`。反转为时间顺序后，它计算 assistant message identity，并将 tool call/result 与所属 assistant message 关联。Cursor 的 `before` 位置必须落在 active branch 内。Context source 从整个 branch 计算；page entries 则从 boundary 向回扫描，直到 100 个 projected entry 或 240 KiB page budget（预留 metadata/context 空间）用满，再恢复为时间顺序。隐藏的 native entry 也会前移 branch index，避免分页重复或跳过。若还有更早的 branch entry，next cursor 会 pin 同一完整 byte prefix/revision 及下一 index。返回的 `branchIds` 供 `SessionService` 判断 turn native entry 是否仍在选中 branch 中。

Page limit 包含每个 projected entry 64 KiB、page body 240 KiB、context-source JSON 96 KiB、最多 32 个 context source，以及总计 256 KiB 的 envelope。Image 只以 entry ID/index/MIME metadata 表示；base64 data 单独读取。

<a id="history-context-and-entry-projection"></a>

## Project instruction 与 saved-entry projection

[`string`、`block` 和 `sections`](../../../../../src/sessions/history.ts#L27) 是 projection primitive：`string` 接受最多 1,024 字符的非空 metadata；`block` 构造没有 tool reference 的文本 block；`sections` 从 record 读取 record-valued native `sections` field。[`prefixUtf8`](../../../../../src/sessions/history.ts#L38) 在 Unicode code point 边界截断，并遵守 byte 上限。

[`contextSection`](../../../../../src/sessions/history.ts#L50) 只从 Pi 保存的 system context 中解析 `<project_instructions path="…">` block。它限制 path 长度、每个 preview、source 数量及 JSON 总字节数。嵌套 `sourceAt` 构造 candidate source，并用 `truncated` 标记 path/content clipping；`encodedSize` 计算序列化 source 加 array separator 后的大小。Binary search 找到当前剩余预算能容纳的最长 content prefix。如果只含 path 的 record 都放不下，就停止解析并标记 truncation。[`activeContextSources`](../../../../../src/sessions/history.ts#L99) 按顺序应用 system-message 和 compaction snapshot：`null` 清除 active set；string 用该 snapshot 解析出的 source 替换 active set；缺失或无法识别的 state 则保留旧值。返回最新生效的 source set；它不会重新打开 project directory 或读取 source file。

[`imageMimeType`](../../../../../src/sessions/history.ts#L122) 仅允许 PNG、JPEG、WebP 和 GIF。[`savedImage`](../../../../../src/sessions/history.ts#L126) 要求 image block 有符合格式的 base64 长度/字符集以及允许的 MIME type。[`toolInput`](../../../../../src/sessions/history.ts#L139) 先迭代检查嵌套 array/object 的 depth 和 item 数，再进行 JSON serialization；结构超限时返回有界 placeholder，使页面仍可返回。

[`project`](../../../../../src/sessions/history.ts#L155) 将一个 Pi native entry 转为 `HistoryEntry`，或将其省略。Non-display custom entry、model/thinking/session/usage routine metadata 和 system message 都隐藏。Bash-execution message 显示 command 与可用的 output/exit/cancellation/truncation state；command 不完整时生成 diagnostic。Displayable custom message、branch/compaction summary、user/assistant/tool-result message、context edit 和 label 保留不同 role 与 metadata。未知 role/type 会生成 diagnostic block。Content array 最多保留 64 个 block，并投影 text、thinking、tool call 和 image；不支持的 block 用 diagnostic 表示。若 saved tool input 超出结构遍历限制，会显示简要说明。

Role projection 后，`project` 将每个 entry 的完整序列化预算限制为 64 KiB，包含 escaping、native ID、role 和 block metadata。它为 entry envelope 预留空间，再按 code point 截短 text，或在下一个 block 无法放入时停止。`project.metadata` 接受有界 string metadata，超长会标记 truncated。Image data 不会进入 page payload；只返回 active branch 中的 image index/MIME type。`HistoryPages.read` 会在 projection 后添加 tool-owner identity，以区分不同 assistant message 中重复使用的 native call ID。

<a id="history-image-loading"></a>

## 读取已保存图片

[`HistoryPages.image`](../../../../../src/sessions/history.ts#L469) 对无效 image index 返回 `null`，读取有界 native-history snapshot，并从 persisted leaf 构造 active branch。目标 entry 不在 branch、不是 message entry、content 格式错误或图片缺失/不受支持时也返回 `null`。Image index 按目标 native message 中 image block 的出现顺序计算。目标 block 必须通过 `savedImage`；解码结果不得超过 5 MiB，并且重新编码后必须与原 base64 完全一致，之后才返回 MIME type 和 `Buffer`。Browser 用 session、entry ID 和 index 请求图片；server 通过已验证的 native history 定位内容。

<a id="assistant-message-identity"></a>

## 完整 assistant-message identity

[`canonical`](../../../../../src/runtime/message-identity.ts#L5) 递归排序 object key、保留 array 顺序，并拒绝超过 64 层的嵌套。[`nextMessageKey`](../../../../../src/runtime/message-identity.ts#L17) 序列化完整 canonical message、计算 SHA-256 digest，并增加该 digest 的 occurrence count。它拒绝新增第 100,001 个 distinct digest；不可序列化或过深的 message 返回 `undefined`。Unknown identity 不会隐藏 live content。最终 key 为 `digest:occurrence`，因此内容完全相同的两条 assistant message 仍是不同 occurrence。[`savedMessageKeys`](../../../../../src/runtime/message-identity.ts#L32) 只处理 Pi `message` entry 中 role 为 assistant 的记录，返回 entry-to-key mapping 和最终 digest counts。Identity 是完整 message，而非 display text；message metadata 与 tool call 都参与计算。

`SessionEvents` 观察 live `message_end` 时使用此 identity；`SessionService` 也用它计算相对现存 transcript 新增的 message。Tool ownership 绑定 assistant identity。Baseline 或有界 diff 不完整，或 message 无法识别时，live 与 saved evidence 都会保留。

相关测试覆盖 [native JSONL validation](../../../../../tests/pi-history.test.ts)、[scan fairness/cancellation](../../../../../tests/pi-history-budget.test.ts)、[history page/projection](../../../../../tests/history.test.ts)、[context snapshot](../../../../../tests/history-context.test.ts) 与 [service-level restart/reconciliation](../../../../../tests/history-service.test.ts)。
