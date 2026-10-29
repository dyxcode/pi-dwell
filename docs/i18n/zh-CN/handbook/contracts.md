<a id="shared-protocol-contracts"></a>

# 共享协议 contracts

[English](../../../handbook/contracts.md) | 简体中文

详细文字解释：[Implementation](implementation/validators.md).

共享 contracts 定义 host、browser 和 Pi adapter 使用的 runtime-checked shapes。来自 HTTP、saved history 和 event stream 的值在经过 validator 收窄前都属于不可信输入。每个 validator 都有自己的严格程度和预算；TypeScript interface 本身不保证 key 完全匹配、path 已 canonicalize，或应用层的每条不变量都已检查。

## Module map

| Module | 主要 types 和 guards | 边界 |
| --- | --- | --- |
| [protocol.ts](../../../../src/shared/protocol.ts) | `HostStatus`、`isHostStatus`、`DEFAULT_PORT` | Host status response 与协议兼容性。 |
| [sessions.ts](../../../../src/shared/sessions.ts) | `SessionInfo`、`SessionModelRequest`、`NativeExecutionInfo`、`RuntimeConfiguration` 和 validators | Session catalog/runtime metadata 与 model mutation input。 |
| [thinking.ts](../../../../src/shared/thinking.ts) | `ThinkingLevel`、model capability request/response | Pi model 的 reasoning levels 和图片支持。 |
| [discovery.ts](../../../../src/shared/discovery.ts) | `HostDirectoryListing`、model list response types 和 guards | 目录及已加载 model 的发现结果。 |
| [turns.ts](../../../../src/shared/turns.ts) | `TurnCreateRequest`、`TurnInfo`、statuses 和 guards | Durable Dwell request/turn catalog shape。 |
| [images.ts](../../../../src/shared/images.ts) | `ImageContent`、图片限制和 guards | Turn 与 Pi RPC 接受的 JSON-safe 图片数据。 |
| [history.ts](../../../../src/shared/history.ts) | `HistoryEntry`、`HistoryPage`、`ContextSource` 和 `isHistoryPage` | 已保存 Pi branch 的有界 display projection。 |
| [events.ts](../../../../src/shared/events.ts) | `StreamFrame`、turn/live projections、event budgets 和 `isStreamFrame` | 通过 SSE 使用的有界 JSON event 协议。 |

<a id="validation-rules-at-a-glance"></a>

## 验证规则一览

- Guard 接受一个值，只说明该值通过了这个 guard。有些 guard 会拒绝额外 key；另一些只检查必需字段，并允许更多字段。
- **字符数**通常指 JavaScript string length，以 UTF-16 code unit 计数。明确的 byte 上限使用 UTF-8 编码长度。History text block 的一个重要上限按字符计数；live/event payload 则大多按 UTF-8 byte 计数。
- Live text range 是它所处 message string 中的 UTF-16 offset。
- 限制适用于对应 validator 所在的边界。不要把不同边界的限制相加，当作整个进程的统一内存上限。
- Shape 验证不能证明文件系统 containment、canonical path identity、provider 可用性、execution 成功或授权状态。

## Host status

[protocol.ts](../../../../src/shared/protocol.ts) 将 `DEFAULT_PORT` 设为 `8787`，并定义 service `pi-dwell`、protocol version 2、phase `sessions` 和 capabilities `sessions: true` / `tasks: false`。`isHostStatus()` 会检查 service name、version、phase、可解析的日期字符串、正的 safe-integer process ID、36 字符的小写 hex/hyphen instance ID、mode（`production` 或 `development`），以及两个 capability 值。

该 guard 不要求 object shape 完全匹配、不要求严格 ISO timestamp 格式，也不要求 capabilities object 使用 exact keys。它接受额外字段。Host status response 和不兼容的 protocol/service 拒绝逻辑见 [host.test.ts](../../../../tests/host.test.ts)。

<a id="sessions-and-model-mutation"></a>

## Sessions 与 model mutation

[sessions.ts](../../../../src/shared/sessions.ts) 定义小写、UUID-shaped 的 `SESSION_ID` pattern。它只检查文本 shape，不要求特定 UUID version 或 variant。

`SessionInfo` 分开表示三种状态：

| Field | Values |
| --- | --- |
| `status` | `creating`、`ready`、`failed`、`interrupted` |
| `runtimeState` | `closed`、`opening`、`ready`、`failed`、`closing` |
| `historyState` | `empty`、`available`、`unavailable` |

Validator 要求 session 和 Pi session ID、directory、provider/model pair、thinking level、timestamps、上述状态字段、error，以及 active/latest turn ID。Provider 和 model 必须同时为 null 或同时非 null；`ready` session 必须让两者都是 string。`nativeExecution` 为兼容旧数据而设为可选，也可以是 null。如果它是 object，必须且只能包含 `id`、`status` 和 `error`；它的 ID 必须符合 session ID shape，status 只能是 running/completed/failed/aborted/interrupted，error 上限为 2 KiB UTF-8。非 null 的 provider/model 值必须是非空 string。Timestamp 必须是 safe integer。`SessionInfo` 的其余字段没有 exact-key 检查；directory 和 error string 没有 shared size limit。

`RuntimeConfiguration` 只检查 `executable` 和可选 `entryPoint` 是非空 string。它不要求绝对路径，也不拒绝额外 key。`SessionCreateRequest` 在这里是 interface，但本 module 没有导出对应的 runtime validator。

`SessionModelRequest` 使用 exact keys：provider 和 model 必需，`thinkingLevel` 可选。Provider 和 model 必须非空，长度上限分别为 200 和 300 个 JavaScript 字符。可选 thinking level 必须属于 shared levels。Session validator 和 model request 测试见 [sessions.test.ts](../../../../tests/sessions.test.ts) 与 [session-models.test.ts](../../../../tests/session-models.test.ts)；native execution 分离逻辑见 [native-executions.test.ts](../../../../tests/native-executions.test.ts)。

<a id="thinking-levels-and-model-capabilities"></a>

## Thinking levels 和 model capabilities

[thinking.ts](../../../../src/shared/thinking.ts) 导出以下精确值：

`off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`。

`ModelCapabilitiesRequest` 使用 exact keys，要求非空 provider（最多 200 个字符）和 model（最多 300 个字符）。Response 也使用 exact keys：provider、model、`thinkingLevels` 和 `supportsImages`。Level list 不能为空，最多包含全部七个已知值，且不能有重复值。图片支持字段为 boolean。Guard 只检查 response shape，不检查 model 是否仍已加载，也不检查它是否能成功回答。

Model-specific 行为和 thinking restoration 测试见 [session-discovery.test.ts](../../../../tests/session-discovery.test.ts) 和 [runtime.test.ts](../../../../tests/runtime.test.ts)。

<a id="directory-and-model-discovery"></a>

## 目录与 model 发现

[discovery.ts](../../../../src/shared/discovery.ts) 定义目录和 model listing shape：

- Directory listing 含一个看起来是绝对路径的 `path`、可为 null 的同类 `parent`、最多 500 个目录 entry，以及 boolean `truncated` 标志。每个 entry 的 name 长度为 1 到 255 个 JavaScript 字符，path 看起来是绝对路径。“看起来是绝对路径”指 POSIX slash、drive letter 加 slash/backslash，或 UNC prefix。Guard 不会 canonicalize path、证明 child 位于 parent 内，也不会拒绝额外 key。
- 一般 model list 最多含 10,000 个 entry。每个 provider 和 model ID 都必须非空，长度上限分别是 200 和 300 个 JavaScript 字符。`supportsImages` 可以省略；如提供，必须是 boolean。
- Session model list 还要求有效 session ID；其中每个 model 都必须有 boolean `supportsImages` 和 1 到 7 个互不重复的有效 thinking level。

这些 validators 不保证目录或 provider/ID pair 唯一，也不证明 path 在文件系统中的实际含义。Absolute-path 处理、model list shape、extension model 和 capability discovery 测试见 [session-discovery.test.ts](../../../../tests/session-discovery.test.ts) 与 [session-models.test.ts](../../../../tests/session-models.test.ts)。

## Turn submission

[turns.ts](../../../../src/shared/turns.ts) 定义 durable turn state machine：

`accepted` → `dispatching` → `running` → `completed`、`failed`、`aborted` 或 `interrupted` 之一。

箭头表示通常的进展方向；类型允许列出的每个 status，合法的状态迁移仍由 service 负责。

`isTurnCreateRequest()` 要求 object 使用 exact keys，必需字段为 `requestId` 和 `message`，可选字段为 `images`。Request ID 必须符合 shared 的小写 UUID-shaped pattern。Message 会按原样保留，但 trim 后必须非空（除非至少有一张图片），UTF-8 长度不得超过 8 KiB，并且去掉开头空白后不能以 `/` 开始。空 `images` array 不能让空白 message 变为有效。图片通过 `isImageContentArray()` 检查。

`TurnInfo` 使用 exact keys，包含 run/session/request ID、status、cancellation state、safe-integer timestamps、nullable error 和 entry ID。Error code 与 message trim 后必须非空，但 shared turn guard 不限制它们的长度。Entry ID 必须是非空 string；此 validator 没有 array-size limit。完整 durable turn 包含 `entryIds`；较小的 SSE projection 用 `entryCount` 代替。

Request shape、slash-command 规则和 byte limit 测试见 [turn-catalog.test.ts](../../../../tests/turn-catalog.test.ts)。Admission、deduplication、abort 和 extension-handled input 测试见 [turns.test.ts](../../../../tests/turns.test.ts)。

<a id="image-records"></a>

## Image record

[images.ts](../../../../src/shared/images.ts) 定义 JSON shape `{ type: "image", data, mimeType }`，接受 PNG、JPEG、WebP 和 GIF。`isImageContent()` 要求对象且仅包含这三个 key；`data` 必须是 canonical base64，解码后内容大于零且不超过 5 MiB，并且 magic header 必须与声明的 MIME type 匹配。

List guard 最多接受四张图片，合计解码 byte 上限为 5 MiB。它会分别检查每条 record 和总量。这些是 header/signature 检查，不是完整图片格式解析；浏览器在暂存 draft 前还会实际 decode。`imageByteLength()` 假定调用方已验证 image record。

Image-only turn、精确大小边界、signature、多图限制、Pi native delivery 和 text-only model 拒绝测试见 [images.test.ts](../../../../tests/images.test.ts)。

## Saved history

[history.ts](../../../../src/shared/history.ts) 描述 saved native entry 的 display projection。它不是 model 完整 context 的重建。History page 携带 branch metadata 和分页 display entry；image block 只含 index 与 MIME type，不含 image bytes。

| Value | Runtime limit 或规则 |
| --- | --- |
| Page status | `empty`、`pending` 或 `available`。非 available page 不能携带 entry、revision、leaf、cursor、covered turn 或 covered native execution。 |
| Revision | Null 或 64 个小写 hex 字符；`available` 必须有 revision。 |
| Entries | 每页最多 100 个；每个 entry 最多 64 个 block。 |
| Blocks | 类型为 text、thinking、tool_call、image 或 unsupported；每个 entry 最多 64 个。Block text 最多 64 Ki 个 JavaScript 字符，不是 64 KiB。Image block 要求 image index 为非负 safe integer，且 MIME type 在允许列表内。 |
| Entry fields | ID/type 最多 1024 个字符，timestamp 最多 100 个字符；可为 null 的 parent/tool-call/tool-name/target string 必须为 null 或非空，且最多 1024 个字符。Role 为 null 或 user/assistant/toolResult/bashExecution/custom/context/diagnostic。Optional error 为 boolean。 |
| Context sources | 最多 32 个；path 最多 4096 个 JavaScript 字符；source content 最多 32 KiB UTF-8。仅当 sources 存在时，truncated flag 才合法。 |
| Cursor 和 coverage ID | Cursor 为 null 或非空且最多 1536 个 JavaScript 字符。Active/latest/covered turn ID 和可选 covered native-execution ID 都符合 session UUID-shaped pattern。 |
| Whole page | 序列化后的 JSON 必须不超过 256 KiB UTF-8。 |

Entry 和 block object 使用 exact keys，只允许文档列出的 optional entry field（`error`、`nativeKey` 和 `toolOwnerKey`）。一些普通 entry string 按 JavaScript 字符长度限制；native/tool owner key 遵循 64 个 hex 字符加 ordinal 的 pattern。Context source content 使用上表所示的 UTF-8 byte limit。

`coveredTurnId` 与 `coveredNativeExecutionId` 含义不同。它们分别标记已证明存在于 saved branch 的 terminal Dwell turn 或 native Pi execution；它们都不代表 execution 成功，也不表示当前 page 包含完整 transcript。Pending page 不等同于空 history page，也不应清除已经显示的内容。

Page validation、saved-branch projection、tool/image block 和 context budget 测试见 [history.test.ts](../../../../tests/history.test.ts) 与 [history-context.test.ts](../../../../tests/history-context.test.ts)。

## Event stream

[events.ts](../../../../src/shared/events.ts) 定义两种相关但不同的 record：

- `TurnProjection` 是紧凑的 stream shape，携带 `entryCount` 和 `errorTruncated`。
- `TurnInfo` 是 durable catalog shape，携带实际的 `entryIds`。

混淆这些 shape 会让 UI 误以为 event stream 含有 entry ID，而实际只有一个数量。

每个序列化后的业务 event 上限为 64 KiB UTF-8。Snapshot 最多 224 KiB UTF-8。浏览器的 SSE decoder 另允许未完成的 transport frame 最大 256 KiB；这个 buffering limit 不会替代 shared JSON event/snapshot budget。

<a id="cursor-and-frame-shape"></a>

### Cursor 与 frame shape

Business frame 的外层使用 exact keys：session ID、nullable run ID、cursor、type 和 payload。嵌套的 session/turn ID 必须与外层 frame 一致。Cursor 格式为 `sessionId:epochId:sequence`：session ID 必须与 frame 相同；epoch 是 36 个小写 hex/hyphen 字符组成的 UUID-shaped string；sequence 必须是 safe integer，且除 `0` 外不能有前导零。`resync` frame 的 cursor 为 null，reason 只能是以下之一：`cursor_stale`、`cursor_ahead`、`epoch_changed` 或 `replay_limit`。

Snapshot 的 top-level 和 payload 使用 exact keys。其嵌入的 session 对 stream projection 使用 strict keys；active/latest turn reference 必须与 session 对应 ID 一致。Snapshot payload 上限为 224 KiB。常规 event variant 包括 session/turn update、message start/delta/finish、tool start/update/finish、projection limits、projection errors 和 stream errors。

<a id="live-content-budgets"></a>

### Live content budget

| Projection | Shape 和限制 |
| --- | --- |
| Turn projection | Run/session/request ID 必须 UUID-shaped；status 是七种 turn status 之一；cancellation state 为 boolean；timestamps 为 safe integer；`entryCount` 为非负数；并带 error-truncation flag。Error code 最多 128 UTF-8 byte，message 最多 2048 UTF-8 byte。 |
| Message | UUID ID；text 最多 64 KiB UTF-8；可选 native key 和非负 safe-integer order；finished/truncated flag 为 boolean；最多 64 个有序 content block。 |
| Message delta | UUID message ID、最多 64 KiB UTF-8 的 text、truncated flag，以及可选 text/thinking block selector。Thinking delta 的文本放在 block 中，兼容字段 text 为空。 |
| Text block | 最多 64 个 range；每个都是 compatibility `message.text` string 中正长度、不重叠的 UTF-16 span。 |
| Thinking block | Text 最多 64 KiB UTF-8。仅含 thinking 的 delta 会把文本放在 thinking block 中，compatibility delta text 留空。 |
| Tool | UUID ID；status 为 running/completed/failed；truncated flag 为 boolean。一个 live projection 最多含八个 tool。Name 最多 512 UTF-8 byte；input/output 各最多 16 KiB；可带 owner key、非负 safe-integer order 和最多 1024 UTF-8 byte 的 call ID。 |
| Projection errors | Code 最多 128 UTF-8 byte；message 最多 2048 UTF-8 byte。 |

Live message block index 必须是 0 到 63 的 safe integer，且在一个 message 内严格递增。Text range 不能跨 block 重叠。`projection.limited` 会报告已声明的 scope 及正的 safe-integer limit。Scope 为 metadata、message、tool input、tool output、tool name 和 tool count。Nested projection 和最终序列化 event 都必须分别通过 shape 与大小检查。

Cursor validation、frame size、range 和 thinking delta、replay/resync、projection truncation 与 observer 行为测试见 [events.test.ts](../../../../tests/events.test.ts) 和 [web-events.test.ts](../../../../tests/web-events.test.ts)。

<a id="common-interpretation-pitfalls"></a>

## 解读 guard 结果

- Guards 的 key 严格程度不同：host status、普通 session metadata 和 discovery response 接受额外属性；turn request、turn record、history record/page 和 stream frame 会检查明确的 key shape。
- JavaScript 字符数按 UTF-16 code unit 计量；image、turn text、context-source content 和 stream serialization budget 按 UTF-8 byte 计量。History block text 和许多 name/ID 使用 `.length`。
- 匹配的 image header 能确认声明格式的 signature，但不能确认图片可完整 decode；Web client 还会在浏览器中实际解码图片。
- History page 是 saved branch 上的有界 display projection，不是 Pi 的完整 model context。Coverage marker 表示内容存在于已保存 branch，不代表 turn 成功。
- `TurnInfo`、`TurnProjection` 和可选的 `SessionInfo.nativeExecution` 具有不同的 identity 与 lifecycle；Dwell turn catalog 和 native Pi execution metadata 是不同记录。
