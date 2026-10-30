<a id="browser-events"></a>
# Browser event stream 与 state reduction

[English](../../../../handbook/implementation/browser-events.md) | 简体中文

浏览器为选中的 Pi session 接收有界 SSE events。 [`events.ts`](../../../../../src/clients/web/events.ts) 将文本流转换为经过验证的 protocol frames，再将 frames 规约为 immutable state transitions，并按 native identity 将当前 message/tool observations 与分页 Pi history 合并。History pages 提供已持久化内容；SSE snapshots 和 deltas 提供有界的 live messages/tools，其中可能包含不完整内容。Cursor gaps 和 truncation 会显式保留在 state 中。Stream reconnect、render batching 和 history-read 调度见 [Browser controller](browser-controller.md)。

<a id="state-bounds-protocol-errors"></a>
## State、资源上限与 protocol errors

[`MAX_SSE_FRAME_BYTES`](../../../../../src/clients/web/events.ts#L13) 将单个 decoded frame 限制在 256 KiB。私有累积上限让 client 最多保留 64 条 live messages、64 个 live tools，以及每条 message 中最多 64 KiB 的 text 加 thinking text。 [`ResyncReason`](../../../../../src/clients/web/events.ts#L18) 区分 cursor 已过期、cursor 超前、epoch 变化和 replay limit 导致的 resync。 [`ConversationState`](../../../../../src/clients/web/events.ts#L20) 保存当前 session/cursor、session 与 turn metadata、live message/tool arrays、live run identity、完整性/截断 flags、最新 history page、resync reason，以及来自 `projection.error` 或 `stream.error` frame 的类型化 error。`lastCursor` 在 `cursor` 被清空以请求重新同步时，仍保留最近一次已接受的 cursor。

[`EventFields`](../../../../../src/clients/web/events.ts#L61) 保存 [`SSEDecoder`](../../../../../src/clients/web/events.ts#L69) 接收 chunks 时尚未完成的 SSE block：byte count、可选 event name/ID 和按序排列的数据行，直到空行结束并生成 frame。解析或 validation failure 会成为 [`SseDecodeError`](../../../../../src/clients/web/events.ts#L51)；[`SseDecodeError.constructor`](../../../../../src/clients/web/events.ts#L54) 设置 error name 和可机读 code，范围包括 `frame_too_large`、`malformed_sse`、`invalid_json`、`invalid_frame`、`event_mismatch` 与 `id_mismatch`。 [`emptyConversationState`](../../../../../src/clients/web/events.ts#L190) 初始化一个空的 browser stream state：没有 cursor、history page、live items 或 error，可选地绑定到指定 session ID。 [`CursorParts`](../../../../../src/clients/web/events.ts#L210) 是解析后的 cursor 结构，包含 session、epoch 和安全整数 sequence，用于比较 frames、发现 cursor gap 和 epoch 变化。

<a id="incremental-sse-decoding"></a>
## Incremental SSE decoding

[`SSEDecoder`](../../../../../src/clients/web/events.ts#L69) 会跨任意网络 chunk 保存未完成的行和 event 状态。 [`SSEDecoder.push`](../../../../../src/clients/web/events.ts#L77) 仅在开头忽略一个 UTF-8 BOM；识别 LF、CR 和跨 chunk 拆开的 CRLF；并在累积字符时统计 UTF-8 字节数。若一个 surrogate pair 被拆在两个 JavaScript string chunks 中，函数会在 frame-size 计数时修正其长度。若当前行和 block 超出字节上限，decoder 会清空未完成 parser state 并抛出 `frame_too_large`；不会返回部分 protocol frame。

[`SSEDecoder.#lineEnding`](../../../../../src/clients/web/events.ts#L120) 将当前行及其换行字节加入 block。空行会 dispatch event 并重置字段；comment 行（包括 heartbeat comments）会忽略。其他行按第一个冒号切分，移除一个可选的前导空格，并且只识别 `event`、`id` 和 `data`。Data lines 按输入顺序保留，最后以换行连接。ID 包含 NUL 时作为 malformed SSE 处理。

[`SSEDecoder.#dispatch`](../../../../../src/clients/web/events.ts#L156) 忽略没有 data 的 block；否则要求 event name 存在，解析 JSON，通过 shared `isStreamFrame` guard，再验证 SSE event name 与 frame `type` 相同，并检查 SSE ID 与 frame cursor 一致（resync frame 必须没有 ID）。Malformed fields、invalid JSON/schema、event mismatch、cursor mismatch 会分别产生对应 error code。 [`SSEDecoder.#emptyFields`](../../../../../src/clients/web/events.ts#L181) 创建新的空 block；[`SSEDecoder.#fail`](../../../../../src/clients/web/events.ts#L185) 抛出类型化错误。[decoder tests](../../../../../tests/web-events.test.ts#L205) 覆盖分块 CRLF、comment、multiline data、Unicode 字节计数、metadata 不匹配和超大的未完成 frame。

<a id="copying-state-joining-history-pages"></a>
## State copying 与 history page 合并

Reducer 不会改写已发布的 state 或 frame payload。 [`copyTurn`](../../../../../src/clients/web/events.ts#L226) 复制 turn 及其嵌套 error；[`copyMessage`](../../../../../src/clients/web/events.ts#L231) 复制 message 及 blocks/ranges；[`copyTool`](../../../../../src/clients/web/events.ts#L246) 复制 tool record；[`copyHistory`](../../../../../src/clients/web/events.ts#L250) 复制 history page、entries 和 blocks。因此调用方可以安全保留旧 state snapshot。

[`cursorParts`](../../../../../src/clients/web/events.ts#L216) 只接受规定的 session/epoch/sequence cursor 形式，并拒绝不安全整数。 [`mergeHistoryEntries`](../../../../../src/clients/web/events.ts#L261) 将新读取的最新 page 与已加载的较旧 prefix 连接起来。如果新 page 与旧 entries 有 identity overlap，就保留该 identity 之前的 prefix 并替换其余部分。如果新 page 从 branch root 开始，则直接替换旧 branch。否则函数沿新 page 第一项的 parent，在旧页中寻找连接点，只保留到该 parent 为止。当前已加载 prefix 找不到 parent，就无法证明两页属于同一 branch，因此以 incoming page 替换原 entries。空的 latest page 会清空列表。[history merge tests](../../../../../tests/web-events.test.ts#L706) 覆盖 overlap、fork replacement、无关 branch 和空 page。

[`utf8Bytes`](../../../../../src/clients/web/events.ts#L277)、[`isHighSurrogate`](../../../../../src/clients/web/events.ts#L285) 和 [`isLowSurrogate`](../../../../../src/clients/web/events.ts#L290) 支持跨 string chunks 的 surrogate pair 字节计数。 [`isTerminal`](../../../../../src/clients/web/events.ts#L295) 识别 completed、failed、aborted、interrupted 这四种 Dwell terminal-turn 状态。

<a id="saved-history-coverage-snapshot-merging"></a>
## Saved history coverage 与 snapshot merge

[`isTerminal`](../../../../../src/clients/web/events.ts#L295) 识别 completed、failed、aborted 和 interrupted 这四种 Dwell turn 终态。`coveredLiveRun` 区分 native-extension execution 与 Dwell turn 两条路径。Native execution 只有在不再运行、且 history page 明确列出该 native execution ID 时才算覆盖。Dwell run 则要求 history page 指向同一 turn ID、当前没有 active turn，且最新 turn 属于该 run 并已进入 terminal status。 [`coveredLiveRun`](../../../../../src/clients/web/events.ts#L304) 不会根据文本相同或单独一个 terminal-looking event 推断完成。 [`applyCoveredHistory`](../../../../../src/clients/web/events.ts#L323) 只有在 identity 与 terminal 条件都满足后才清除 live messages 和 tools。

[`preserveCompatiblePrefix`](../../../../../src/clients/web/events.ts#L343) 处理有界 snapshot：只有 incoming value 明确标记 truncated，且它与旧值的 prefix 相容时，才保留较长的旧值；比较时会忽略结尾省略号。 [`mergeSnapshotMessage`](../../../../../src/clients/web/events.ts#L352) 将该规则用于 message text 和 thinking blocks；若 message prefix 仍匹配，也保留兼容的 text ranges，并继续保留 truncation flags。 [`copyMessageBlock`](../../../../../src/clients/web/events.ts#L379) 复制一个 text block 及其 ranges，或一个 thinking block。 [`mergeSnapshotTool`](../../../../../src/clients/web/events.ts#L385) 对 tool name、input、output 应用同样的 compatible-prefix 规则。

[`upsertSnapshotMessage`](../../../../../src/clients/web/events.ts#L396) 和 [`upsertSnapshotTool`](../../../../../src/clients/web/events.ts#L412) 按 ID 将同一 run 的 snapshot item 与旧 live 版本合并；新 item 则走常规的有界 upsert。两者都会返回是否丢弃了超出上限的数据。 [`snapshotState`](../../../../../src/clients/web/events.ts#L425) 应用经过验证的 snapshot。同一 session/epoch 中更旧的 sequence 会被忽略；同一 sequence 的 snapshot 可在 resync 后恢复 cursor；旧 history 只在同一 session 中保留。Live-run identity 按 native execution、active turn、latest turn 的顺序确定。当 session 和 run 未变化时，incoming bounded message/tool data 会与旧值合并，而不是覆盖更长且相容的 prefix；session 或 run 改变时则清空 live arrays。两个 live flags 表示不同证据：`liveTruncated` 延续同一 run 之前的 truncation，并记录 host 的 `payload.live.truncated`、message/tool 自身的 truncation 或 client 因 item 上限丢弃数据。`liveIncomplete` 延续同一 run 之前的不完整状态；只要存在 live-run identity 或可见 live item、epoch 改变、或 item 被丢弃，也会置为 true。因此 snapshot 可以 incomplete 但没有 truncation。Snapshot 只含当前有界的 live items，不是完整的 run transcript。最后返回 snapshot 的 session/turn metadata 与 cursor，并清除旧 error 和 resync reason。

<a id="live-delta-accumulation"></a>
## Live delta 累积

[`upsertMessage`](../../../../../src/clients/web/events.ts#L522) 按 ID 替换已有 message，或追加防御性复制后的新 message，最多保留最新 64 条；加入第 65 条时会丢弃最旧的 message，并报告该损失。 [`appendDelta`](../../../../../src/clients/web/events.ts#L542) 忽略已结束 message 的 delta；按 UTF-8 字节数计算可用预算，并只追加能放进每条 message 64 KiB 上限的完整字符。对面向用户的 text block，它会将 content-index ranges 记录为相对累积 message text 的位置；相邻 ranges 会合并，不相邻 ranges 最多保留 64 个。如果新增的不相邻 range 会超过上限，仍会把可放入的 suffix 加到 `message.text`，但将该 block 标记为 truncated，且不再为该段添加 range，因此 range-based renderer 无法显示这段文字；block 本身不会被丢弃。Thinking delta 累积在单独的 indexed block，不进入可见 text。Blocks 按 native `contentIndex` 排序。UTF-8 clipping 和 range loss 会将 message/block 标记为 truncated，并将 live data 标记为 incomplete。 [`messageThinkingBytes`](../../../../../src/clients/web/events.ts#L637) 将 thinking-block 字节也计入同一 message budget。 [`upsertTool`](../../../../../src/clients/web/events.ts#L645) 按 ID 替换或追加 tool，最多保留最新 64 个；超过上限会丢弃最旧的 tool 并报告损失。Reducer 会将 message/tool item 丢失记录为 truncation 与 incompleteness。

<a id="event-reducer-branches-cursor-rules"></a>
## Event reducer 分支与 cursor rules

[`reduceFrame`](../../../../../src/clients/web/events.ts#L664) 在 state 边界重新运行 `isStreamFrame`，并忽略与已选 session 不同的 frame。`resync` 只清空用于下一次请求的 cursor，保留最后一个已接受 cursor 和 resync reason；现有 live content 继续显示，但标记为 incomplete。`snapshot` 委托给 `snapshotState`。其他 frame 要求 cursor 可解析，并与旧 cursor 具有相同 session/epoch。重复或较旧的 sequence 会忽略；跳过 sequence 会将当前 live data 标记为 incomplete。没有旧 cursor 时，sequence 大于 1 也代表存在 gap。

随后 frame switch 只更新该 event 所属的 state。`session.updated` 替换 session metadata，并可能带来 native execution identity；run 改变时清除旧的 live messages/tools。`turn.updated` 更新 active/latest turn metadata；run ID 改变时清除旧 live items；只有 nonterminal statuses 才算 active。Message start/finish frames upsert 完整 message，delta frames 追加有界内容。Tool start/update/finish frames upsert tool state。只有当当前 `liveRunId` 和传入的 `frame.runId` 都非 null 且不相同时，message/tool frame 才会因为 run mismatch 被拒绝。若 state 尚无 run ID，带 tag 的 frame 会采用传入 ID；untagged frame 不会分配 ID。`projection.limited` 根据 scope 标记 metadata 或 live content truncated；`projection.error` 与 `stream.error` 会作为带类型的 state errors 保留。处理 session/turn events 后，`applyCoveredHistory` 可能清除已保存且 terminal 的 live run。

[`reconcileHistory`](../../../../../src/clients/web/events.ts#L814) 验证 history page，并要求它与当前 session 相同，才将 defensive copy 附加到 state 并检查 coverage。 [`visibleLiveContent`](../../../../../src/clients/web/events.ts#L822) 只移除 native `nativeKey` 已存在于 saved entries 中的 live messages，以及 native owner/call pair 已存在于 saved entries 中的 live tools，然后按 observation order 合并剩余项。即使 display text 重复，只要 native identities 不同就仍是不同内容。Saved native content 一旦证明某个 item 已持久化，就由 saved renderer 显示；其余 live items 会保留，直到整个 run 被 history 覆盖。[reducer tests](../../../../../tests/web-events.test.ts#L330) 覆盖 frame 累积、顺序、不可变性、gap/resync、上限、native identity handoff 和 native execution 的独立 coverage。
