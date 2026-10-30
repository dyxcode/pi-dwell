# Shared data 与 validation

[English](../../../../handbook/implementation/validators.md) | 简体中文

[Implementation](README.md) · [Handbook](../README.md)

<a id="boundaries"></a>

## 各边界为什么分别 validation

Shared modules 描述 host 与 browser 交换的 JSON。Type guards 接受 `unknown`，逐项检查 runtime value 并返回 boolean，执行纯粹的 shape checks。Caller 检查 authorization、文件存在、state transition 合法性，以及 response 是否属于 browser 当前 request。

字段定义见 [contracts](../contracts.md)，本章解释检查过程。有些 guards 允许额外 properties，有些要求准确的 own keys。Array 检查也不同：显式遍历或 `Array.from` 会让 holes 经由 element validation 失败；部分 discovery lists 使用 `every`，依赖 JSON 解码后的 dense array。

Source / verification：[src/shared/sessions.ts](../../../../../src/shared/sessions.ts) · [src/shared/events.ts](../../../../../src/shared/events.ts)

<a id="sessions"></a>

## Session identity 与 model requests

`isRuntimeConfiguration` 要求非空 executable，以及存在时非空的 entry point。它不检查 absolute path 或 executable compatibility；session service 与 Pi process adapter 在启动前承担这些检查。

`isSessionInfo` 检查两个 UUID、directory、成对可空的 provider/model、可空且受支持的 thinking level、safe-integer timestamps、lifecycle/runtime/history enums、error，以及 active/latest turn references。`ready` session 必须有 provider 和 model。该 guard 允许额外 top-level fields。可选 native execution 交给 `isNativeExecutionInfo`：它要求准确的 id/status/error keys、UUID、允许的 running/terminal state，以及最多 2,048 UTF-8 bytes 的 error。Ephemeral native execution ID 不代表 durable turn request。

`isSessionModelRequest` 拒绝 arrays 和未知 keys，要求 provider/model 分别不超过 200/300 characters，并允许省略 thinking level。显式传入无效 thinking value 会失败；省略与 `null` 不同。例如只指定 provider 而无 model，会在 model mutation 之前被拒绝。

Source / verification：[`isSessionInfo`](../../../../../src/shared/sessions.ts#L61) · [`isSessionModelRequest`](../../../../../src/shared/sessions.ts#L131) · [tests/session-models.test.ts](../../../../../tests/session-models.test.ts)

<a id="turns"></a>

## Turn input 与 durable result records

私有 helpers `hasExactKeys`、`isUuid`、`isTimestamp` 分别检查 property identity、小写 UUID 与 safe integers；timestamp validation 不要求正数或时间先后关系。`isTurnError` 只允许 code/message，并要求 trim 后非空。

`isTurnCreateRequest` 先检查 object、request UUID 和 message string，再根据是否有 own `images` property 选择准确 keys，并验证 image array。只有存在至少一张有效 image 时，message 才可以为空。Text 上限为 8 KiB UTF-8；去除前导空白后以 slash 开始的 command 被拒绝。该 guard 只检查 trimmed text，不把原 message 改为 trimmed text，因此 payload identity 和 dispatch 可以保留原始空白。

`isTurnInfo` 要求准确的 public ledger fields、三个合法 UUID、status、boolean cancellation intent、safe timestamps 和可空 error。它逐个检查 `entryIds` 的 index，要求 own、非空 string element，因此 sparse arrays 失败。Catalog 检查 transitions；saved history 确认引用的 entries 和结果是否还在。一个合法 completed turn 仍可能没有可读取的 history。

Source / verification：[`isTurnCreateRequest`](../../../../../src/shared/turns.ts#L85) · [`isTurnInfo`](../../../../../src/shared/turns.ts#L114) · [tests/turns-http.test.ts](../../../../../tests/turns-http.test.ts) · [tests/turn-catalog.test.ts](../../../../../tests/turn-catalog.test.ts)

<a id="images"></a>

## Image decoding 与 aggregate limits

`object` 排除 null 与 arrays。`base64ByteLength` 检查非空 text、encoded length 上限、长度为四的倍数、alphabet/padding 格式，以及正的 decoded byte count。`decoded` 先做这些低成本检查，再调用 `atob`、验证实际长度，并要求 `btoa(decoded) === input`。Malformed 或非 canonical encoding 返回 null，不把 decoding exception 抛给 caller。

`signature` 使用局部 `ascii` callback 检查 PNG、JPEG、WebP 或 GIF magic bytes 是否匹配 MIME type。该检查验证 header 一致性，不解码 pixels。`isImageContent` 要求准确的 type/data/mimeType keys，只接受四类 MIME types，再 decode 并检查 signature。

`imageByteLength` 从已验证、带类型的 base64 string 计算 decoded size。`isImageContentArray` 最多接受四张 image，逐张计算低成本 size estimate，加入 running total，超过 5 MiB 即拒绝，否则完整验证该 image，再处理下一张。空数组是合法 image array，但不能使空 message 成为合法 turn。单张与总量上限都为 5 MiB。HTTP JSON limit 单独存在，因为 base64 会放大 transport representation。

Source / verification：[`isImageContent`](../../../../../src/shared/images.ts#L64) · [`isImageContentArray`](../../../../../src/shared/images.ts#L86) · [tests/images.test.ts](../../../../../tests/images.test.ts) · [tests/images-http.test.ts](../../../../../tests/images-http.test.ts)

<a id="discovery"></a>

## Discovery 与 thinking capabilities

`thinking.ts` 中，`isObject` 排除 null/arrays；`isThinkingLevel` 接受七个定义值之一。`isModelCapabilitiesRequest` 只允许 provider/model 并检查长度。`isModelCapabilitiesResponse` 要求准确的四个 fields、boolean image capability，以及非空、不重复、最多七项的已知 thinking values。Runtime registry 决定某个 model 实际支持哪些 levels。

`discovery.ts` 的 `isObject` 承担同类结构检查。`isAbsolutePath` 识别 POSIX root、Windows drive 和 UNC spelling，不访问 filesystem。`isModelOption` 检查 provider/id 长度及可选 boolean supportsImages。`isHostDirectoryListing` 要求 absolute path、可空 absolute parent、最多 500 个有名称的 absolute directory entries，以及 truncated flag；它不能证明路径存在或仍可访问。`isAvailableModelsResponse` 最多接受 10,000 models；`isSessionModelsResponse` 还检查 session UUID，并要求每个 option 都有 image support 和非空、不重复的 thinking levels。Session service 检查当前是否允许切换 model，再交给 Pi 应用选择。

Source / verification：[`isModelCapabilitiesResponse`](../../../../../src/shared/thinking.ts#L38) · [`isSessionModelsResponse`](../../../../../src/shared/discovery.ts#L36) · [tests/pi-models.test.ts](../../../../../tests/pi-models.test.ts) · [tests/session-discovery.test.ts](../../../../../tests/session-discovery.test.ts)

<a id="history"></a>

## 验证 saved-history projections

`record`、`text`、`optionalText`、`optionalUuid`、`exact` 是基础 gates：检查非 array records、非空有界 strings、nullable versions 与准确 own keys。`text` 按 JavaScript string length（UTF-16 code units）计数；`contextSource` 对 instruction content 单独按 UTF-8 bytes 检查，两种单位不能混用。

`block` 要求通用 type/text/callId/name，只有 image blocks 才带 imageIndex/mimeType。Text 上限为 65,536 UTF-16 code units，image index 必须为非负 safe integer，MIME type 必须在 allowlist 内。`entry` 检查 metadata、允许的 roles、最多 64 blocks、可空 tool/parent/target references 和可选 boolean error。可选 nativeKey/toolOwnerKey 必须为 64-hex digest 加正的 occurrence count，用来区分重复 native content 与 scoped tool ownership，仅比较显示 text 不够。

`contextSource` 要求准确的 path/content/truncated、bounded path 与最多 32 KiB instruction content。`isHistoryPage` 检查可选字段组合、UUIDs、revision digest、cursor length、最多 100 entries 和 32 instruction sources。`contextSourcesTruncated` 必须伴随 contextSources。非 available page 不得携带 entries、revision、leaf、cursor 或 covered result identities；available page 必须有 revision。最后，整页 serialized JSON 必须不超过 256 KiB。

Source / verification：[`isHistoryPage`](../../../../../src/shared/history.ts#L167) · [tests/history-http.test.ts](../../../../../tests/history-http.test.ts) · [tests/history-context.test.ts](../../../../../tests/history-context.test.ts)

<a id="stream-primitives"></a>

## Stream primitives 与 ordered content blocks

`isRecord`、`hasExactKeys`、`isBoundedString` 提供 object、field 与 UTF-8 bounds。`isCursorFor` 解析 session/epoch/sequence cursor，绑定目标 session，验证 epoch UUID，并要求 safe sequence number。`isSession` 在通用 session guard 上增加准确的 stream fields。`isTurnProjection` 检查 turn IDs、status、timestamps、cancellation flag、非负 entry count、truncation flag 与 bounded nullable error，避免发送全部 entry IDs。

`isLiveMessage` 检查 identity、可选 nativeKey/order、text budget 与 flags。可选 blocks 的 contentIndex 必须严格递增且小于 64。Text blocks 用 UTF-16 ranges 引用 compatibility text，ranges 必须非空、在文本范围内且局部有序；不同 blocks 之间也不能重叠。Thinking blocks 保存自己的 bounded text。Guard 收集全部 text ranges 并排序，以检测跨 block overlap。

`isLiveMessageDelta` 检查 message UUID、bounded text 与可选 block descriptor。Thinking delta 必须让普通 text 为空，把内容放在 block.text。`isLiveTool` 检查 tool identity、可选 call/owner/order metadata、bounded name/input/output、status 与 truncation。`isLiveProjection` 组合 nullable message、最多八个 tools 和 aggregate truncation flag。这些 guards 验证单次 representation；stream ordering 与 reconciliation 由 event consumer 处理。

Source / verification：[`isLiveMessage`](../../../../../src/shared/events.ts#L251) · [`isLiveMessageDelta`](../../../../../src/shared/events.ts#L331) · [tests/events.test.ts](../../../../../tests/events.test.ts) · [tests/web-events.test.ts](../../../../../tests/web-events.test.ts)

<a id="stream-frame"></a>

## 选择并验证 stream frame

`isCommonEvent` 验证 session/run identities 和绑定 session 的 cursor。`hasBoundedJsonSize` serialize 后按 UTF-8 bytes 计量；serialization failure 返回 false。`isStreamFrame` 先选择 frame type，再检查对应的准确 envelope 和 payload。

Snapshot 验证 session、nullable active/latest turn projections、live content 与 metadata truncation。它交叉核对内外 session IDs，以及 turn IDs 与 session 的 active/latest references，包括 null cases，最后应用 224 KiB snapshot budget。Resync 的 cursor 为 null，reason 只能为 cursor_stale、cursor_ahead、epoch_changed 或 replay_limit。

普通 events 包含 sessionId/runId/cursor/type/payload。Session/turn updates 交叉检查 payload identities；message/tool variants 调用相应 guards。Projection-limit frames 要求允许的 scope 和正 safe-integer limit；projection/stream errors 使用 bounded code/message。每个非 snapshot frame 最多 64 KiB，未知 type 失败。例如另一个 session 的 turn 即使 shape 正确，也无法通过 identity check；合法 resync 则刻意没有可用于 replay 的 cursor。

Source / verification：[`isStreamFrame`](../../../../../src/shared/events.ts#L421) · [tests/events.test.ts](../../../../../tests/events.test.ts) · [tests/events-http.test.ts](../../../../../tests/events-http.test.ts)

<a id="host"></a>

## Host identity validation

`isHostStatus` 要求 pi-dwell service marker、protocol 2、sessions phase、可解析的 start date、正 safe process ID、36-character lowercase-hex/hyphen instance marker、production/development mode，以及 sessions:true/tasks:false capabilities。Instance marker 的 expression 比 session UUID guard 宽松，额外 fields 也允许存在。该函数只识别 status shape；service-management code 另行比较 identity，判断 listener 或 registration 是否属于自己。

Source / verification：[`isHostStatus`](../../../../../src/shared/protocol.ts#L14) · [tests/cli.test.ts](../../../../../tests/cli.test.ts) · [tests/service.test.ts](../../../../../tests/service.test.ts)
