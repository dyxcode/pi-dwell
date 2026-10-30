<a id="session-events-implementation"></a>

# Session events

[English](../../../../handbook/implementation/events.md) | 简体中文

[实现文档索引](README.md) · [Session service](sessions.md) · [Events 概览](../sessions-storage.md#live-events-and-bounded-replay)

`SessionEvents` 是 Dwell host process 内的有界 event hub。它将已验证的 Dwell session/turn view 与 Pi process 中选定的 live message 和 tool activity 组合起来，供 browser subscription 使用。`SessionService` 负责 durable mutation 和 Pi-process execution；该 hub 提供 snapshot、保留的 replay 与 live projection。已保存的对话 entries 从 Pi JSONL session file 读取。

<a id="event-shapes-and-helper-functions"></a>

## Frame 与 projection helper

[`InvalidCursorError`、`SubscriberLimitError` 和 `StreamCapacityError`](../../../../../src/sessions/events.ts#L30) 分别表示 malformed/foreign cursor、subscriber 超限和 stream capacity 不足。[`EventType`、`PayloadFor`、`ReplayableFrame` 与 stream state interface](../../../../../src/sessions/events.ts#L51) 将可 replay event 与 snapshot/resync control frame 区分，并把每条 stream 的 epoch、sequence、replay bytes、subscriber、durable-view cache、live projection 和最近使用 tick 放在一起。

模块 helper 实现 wire value 限制和 Pi-record projection：

| Declaration | 行为 |
| --- | --- |
| [`isRecord`](../../../../../src/sessions/events.ts#L144) | 将非 null、非 array object 窄化为 record，用于 Pi event 边界。 |
| [`jsonStringBytes`](../../../../../src/sessions/events.ts#L148) | 计算序列化 JSON string 的字节数，包含 escaping 和引号开销。 |
| [`boundedJsonString`](../../../../../src/sessions/events.ts#L152) | 将 string 限制在 JSON byte budget 内；超限时添加省略号，且不拆开 Unicode code point。 |
| [`appendBoundedJsonString`](../../../../../src/sessions/events.ts#L176) | 只追加能放入预算的部分，并同时返回结果值与精确 delta；只有 suffix 也能放入时才添加。 |
| [`safeJsonString`](../../../../../src/sessions/events.ts#L209) | 将任意值转换为显示文本；serialization 失败时返回空字符串。 |
| [`equalJson`](../../../../../src/sessions/events.ts#L217) | 通过序列化比较已验证的 projection。 |
| [`blockDelta`](../../../../../src/sessions/events.ts#L221) | Thinking-block update 携带 delta text；普通 text 则放在 message-level text field。 |
| [`emptyLiveState`](../../../../../src/sessions/events.ts#L229) | 初始化空 message/tool state、identity count、ownership map、truncation flag 和一次性 error/limit 标记。 |
| [`parseCursor`](../../../../../src/sessions/events.ts#L246) | 要求格式为 `<Dwell session UUID>:<epoch UUID>:<safe sequence>`，并拒绝属于其他 Dwell session 的 cursor。 |
| [`projectSession`](../../../../../src/sessions/events.ts#L260) | 选择 public session 字段，并在发送前截断 directory、provider、model、session error 与 native-execution error metadata；任一字段被截断都会标记 metadata limited。 |
| [`projectTurn`](../../../../../src/sessions/events.ts#L312) | 转换为 `TurnProjection`：对外提供 entry count，不暴露 entry ID，并限制 error code/message。 |
| [`extractText`](../../../../../src/sessions/events.ts#L338) | 直接读取 string result，或拼接 record `content` array 中的 text block。 |
| [`clippedToolInput` 和 `clippedToolText`](../../../../../src/sessions/events.ts#L349) | 序列化并限制 tool arguments，或从 result 提取并限制可见文本。 |
| [`eventSize`](../../../../../src/sessions/events.ts#L357) | 计算序列化 frame 的字节数。 |
| [`asReplayable`](../../../../../src/sessions/events.ts#L361) | 将 snapshot 与 resync notice 排除在 replay retention 之外。 |
| [`copyFrame`](../../../../../src/sessions/events.ts#L365) | 使用 `structuredClone` 为每个 listener 提供分离的 frame。 |
| [`boundedLimit`](../../../../../src/sessions/events.ts#L1373) | 验证正 safe integer 配置，并将其限制在内置最大值内。 |

固定上限约束 tracked stream 数、replay event/byte、subscriber 数、assistant block、tool field 和序列化 snapshot 大小。Constructor options 可以在有效范围内调低限制，但不能高于模块上限；replay-byte limit 仍须容纳一个最大尺寸的 event。

<a id="event-hub-lifecycle"></a>

## Hub lifecycle 与 durable view 发布

[`SessionEvents.constructor` 和 `ensure`](../../../../../src/sessions/events.ts#L381) 初始化已 clamp 的限制，并可为有效 session 预留 stream。如果容量已满且找不到可清理的 idle stream，`ensure` 会抛出 `StreamCapacityError`。

[`publishSession`](../../../../../src/sessions/events.ts#L401) 只接受有效的 `SessionInfo`。第一次发布只设置 cache，不发变更 event；后续 view 不同时，替换 cache、更新 recency、一次性报告 metadata 截断，并发出 `session.updated`。Projection exception 会被吞掉，因为 durable mutation 归 `SessionService` 所有。

[`publishTurn`](../../../../../src/sessions/events.ts#L429) 要求 session、active turn 和 latest turn 相互一致。首次调用会填入三个 projection。后续调用发现 latest run identity 改变且不等于当前 active run 时，会清除旧 live state；随后更新 session/turn cache、报告截断，并只对变化的 session/latest-turn view 发 event。Observer error 不能 rollback ledger update 或 Pi execution。

[`#validView`](../../../../../src/sessions/events.ts#L683) 验证每个提供的 `TurnInfo` 属于该 session，且其 ID 与 `SessionInfo` 中的对应 ID 匹配，包括 null 情况。[`#getOrCreate`](../../../../../src/sessions/events.ts#L703) 返回并 touch 已存在的 stream；若容量已满，只能驱逐没有 active run、没有 subscriber 的 least-recently-used stream。新 stream 获得随机 epoch、从零开始的 sequence、空 replay 和空 live state。[`#touch`](../../../../../src/sessions/events.ts#L735) 推进 event hub 的 recency tick。[`#removeSubscriber`](../../../../../src/sessions/events.ts#L739) 幂等地移除 subscriber，只递减一次 hub 级 subscriber count，并更新 recency。

[`#reconcileView`](../../../../../src/sessions/events.ts#L746) 在新连接时将 cache 同步到当前 durable view；如果 session 或 latest turn 改变，也会给已有 subscriber 发更新。Latest-turn identity 改变时同样按规则清除旧 live state。[`#publishViewLimits`](../../../../../src/sessions/events.ts#L802) 针对 session 或任一 turn 的 metadata clipping 发送 limit notice。

<a id="connection-snapshots-and-replay"></a>

## Connection、snapshot 与 replay

[`connect`](../../../../../src/sessions/events.ts#L642) 在分配 subscriber capacity 前校验 durable view 和 cursor。它检查 per-session/global subscriber 上限，取得 stream，同步 reconciliation，并在添加 listener 前生成 initial frame。这个顺序让 snapshot/replay 计算和 subscriber registration 共用一个同步 sequence boundary。返回的 unsubscribe closure 调用 `#removeSubscriber`，不会关闭 session 或 Pi process。

[`#initialFrames`](../../../../../src/sessions/events.ts#L816) 在没有 cursor 时返回一个 snapshot。Epoch 不同、cursor 超前或 cursor 早于保留 replay 窗口时，返回 resync reason 加当前 snapshot。有效 cursor 只接收 sequence 更大的 cloned replay frame；若整批超过初始 queue byte budget，也改为 resync。[`#snapshotFrame`](../../../../../src/sessions/events.ts#L840) clone cache metadata 和当前 live state，并验证共享 frame contract。若 live content 让 frame 超限，会尝试发送空但明确标记 truncated 的 live state；若仍超限则抛出 stream-capacity error。[`#resyncFrame`](../../../../../src/sessions/events.ts#L871) 创建 cursor 为 null 的已验证 control frame。[`#cursor`](../../../../../src/sessions/events.ts#L885) 将当前 session ID、epoch 与 sequence 格式化为 cursor。

[`#emit`](../../../../../src/sessions/events.ts#L889) 用下一个 sequence 构建 candidate frame，clone payload，并先做 contract validation，再增加 sequence。未通过 contract 或 event/replay byte limit 的 frame 会丢弃且不消耗 sequence。接受的 frame 会 clone 到 replay；随后从最早项开始移除，直至 event 数和总 byte 都符合限制。每个 subscriber 获得独立 clone。同步 throw 或 rejected listener promise 只会移除该 subscriber；Pi 和其他 listener 继续运行。[`close`](../../../../../src/sessions/events.ts#L672) 将全部 subscriber 标记 inactive、清空 stream/counter，并阻止后续 allocation/publication。

[`fail`](../../../../../src/sessions/events.ts#L626) 尽力发出有界 `stream.error`，不会掩盖触发它的原始 failure。[`#limited`](../../../../../src/sessions/events.ts#L934) 每个 scope 最多发一次 `projection.limited`，且 metadata 之外的 limit 会设置 live truncation。[`#projectionError`](../../../../../src/sessions/events.ts#L941) 每条 stream 只发第一次 malformed-Pi warning，避免坏 event 造成 error flood。

<a id="live-turn-and-native-execution"></a>

## Live turn 与 native execution ownership

[`beginTurn`](../../../../../src/sessions/events.ts#L493) 为有效 session/run ID 建立 Dwell-owned projection，并复制 saved-message occurrence baseline。相同 ID 重复调用幂等；如果已有不同 active run，则只报告 projection error，不替换 owner。[`beginNativeExecution`](../../../../../src/sessions/events.ts#L518) 使用不同的 native execution ID。如果它替换了 active projection，会优先保留当前已观察到的 identity count（前提是已知）；否则使用传入的 saved-file baseline。它重置可见 message/tool state，并返回 baseline metadata 供 service 后续 reconciliation。[`observe`](../../../../../src/sessions/events.ts#L561) 忽略 inactive 或 ID 不匹配的 record；只将 Pi message/tool start、update、end record 分发到对应 projection method。

[`endTurn`](../../../../../src/sessions/events.ts#L593) 释放 active-run identity 和 tool-owner map，但保留最后可见的 message/tool，让 snapshot 仍能显示最后状态。[`endNativeExecution`](../../../../../src/sessions/events.ts#L602) 对匹配 ID 做相同清理，并返回 identity counts 和无法识别的 assistant-message 数；ID 不匹配时返回 `undefined`。Service 还要结合 native saved-history branch 检查，才能报告 coverage。单独一个 live event 不能证明内容已经保存。

<a id="live-message-projection"></a>

## Assistant message projection

[`#messageStart`](../../../../../src/sessions/events.ts#L950) 验证 Pi message envelope，忽略非 assistant role，解析初始 content，清除上一条 live message 并发出 start frame。[`#messageUpdate`](../../../../../src/sessions/events.ts#L963) 只处理六种 text/thinking start/delta/end event。未知 event kind 忽略；malformed envelope、负数/非整数 index 或 block type 改变会报一次 projection error。超出 block 上限时发 limit notice。Start/update/end 根据 Pi 的 partial cumulative content 去重，避免 initial seed 与后续 delta 的 prefix 重复，然后只追加仍可放进预算的文本。Text delta 同时更新可见 message text；thinking delta 保留在原 content index 的 thinking block。每次 update 都包含 block descriptor 和 truncation flag，让 client 能保留顺序而不接收 Pi 原始 record。

[`#messageEnd`](../../../../../src/sessions/events.ts#L1094) 验证并忽略非 assistant message end；identity 已知时生成完整 native-message key，未知时增加 unidentified count；重新解析最终 content，并把 tool-call ID 关联到 finished assistant identity。它尽可能沿用当前 live message ID，再发 `message.finished`。[`#parseContent`](../../../../../src/sessions/events.ts#L1118) 将未提供的 content array 当作空数组，拒绝非 array，最多处理允许数量的 block，只投影 text/thinking string，并经由 `#appendContent` 核算 bytes。[`#contentBlock`](../../../../../src/sessions/events.ts#L1152) 仅在现有 block type 保持不变时复用，否则创建新的空 indexed block。[`#partialContent`](../../../../../src/sessions/events.ts#L1174) 从 Pi partial message 指定 index 读取同类型 text/thinking value。

[`#appendContent`](../../../../../src/sessions/events.ts#L1186) 扣除其他 block 已用的 JSON capacity 后，对单个 block 做有界 append，并记录 truncation。[`#publishMessage`](../../../../../src/sessions/events.ts#L1203) 按 native content index 排序 block，将 text block 拼成可见 text，单独保留 thinking，并生成 text range、finished/truncated 状态、native key、稳定 order 和稳定 message ID。它只在 start/finish 时直接发 frame；delta caller 会在拿到 message identity 后单独发 `message.delta`。

<a id="live-tool-projection"></a>

## Tool projection

[`#toolStart`](../../../../../src/sessions/events.ts#L1256)、[`#toolUpdate`](../../../../../src/sessions/events.ts#L1276) 和 [`#toolEnd`](../../../../../src/sessions/events.ts#L1300) 都要求有界 call ID 和非空 name。Start 保存截断后的 arguments 并设为 running；update 仅在 args 存在时更新 input，并提取 partial-result text；end 保存 final-result text，依据 `isError` 选择 failed/completed。每个 method 发送 clone 后的 Dwell `LiveTool`，不会向 client 透传 raw Pi event。Input/output/name 截断会按 scope 各报告一次。

[`#getTool`](../../../../../src/sessions/events.ts#L1324) 用 owner assistant-message key 加 native call ID 做 correlation；缺少 owner 时依次回退到当前 live message ID 或明确的 unknown owner。这样后续 assistant message 复用 call ID 时不会合并成一个 tool。已有 projection 会被更新；新 projection 受 tool-count limit 限制，并获得新的 Dwell ID、order、初始 input/name 和 running status。[`#toolEventId`](../../../../../src/sessions/events.ts#L1360) 同时限制字符数和 UTF-8 byte 数，并拒绝空 ID。[`#toolEventName`](../../../../../src/sessions/events.ts#L1368) 只接受非空 string；更严格的 serialized-name clipping 由 start/update/end 方法处理。

Event contract/replay 行为见 [event hub tests](../../../../../tests/events.test.ts)、[session event integration tests](../../../../../tests/session-events.test.ts) 和 [HTTP stream tests](../../../../../tests/events-http.test.ts)。
