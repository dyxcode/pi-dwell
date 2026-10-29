<a id="web-client-internals"></a>

# Web client 内部机制

[English](../../../handbook/web-client.md) | 简体中文

详细文字解释：[Implementation](implementation/browser-controller.md).

Web client 是面向浏览器的对话界面，连接由 host 所拥有的 Pi session。使用[手册索引](README.md)浏览各章节，使用[项目 README](../README.md)了解项目概览。

浏览器负责 presentation 和短生命周期的 UI state。Host 负责 session catalog state、Pi runtime、native transcript file、turn admission 和 saved history。Client 发送 same-origin HTTP request 并观察 session event stream；它不会直接调用 model provider。除非特别说明，下文的 API path 都相对于 `/api/v1`。

<a id="runtime-path"></a>

## Runtime 路径

浏览器页面由 host 根据以下固定的源码模块集合提供：

1. [page.ts](../../../../src/clients/web/page.ts) 定义 HTML shell 和样式。
2. [script.ts](../../../../src/clients/web/script.ts) 暴露固定的浏览器 asset map。Node 会移除 TypeScript type，把本地 import 的 `.ts` 改写为 `.js`，并通过固定 vendor URL 提供 pinned `marked` module。
3. [client.ts](../../../../src/clients/web/client.ts) 将页面控件连接到 host API、session state、history renderer 和 SSE observer。
4. [transport.ts](../../../../src/clients/web/transport.ts) 在 API request 中加入 browser binding，并将失败 response 转换为 `ApiError`。
5. [events.ts](../../../../src/clients/web/events.ts) 解码 SSE frame，并将其规约为浏览器端 live state。
6. [conversation.ts](../../../../src/clients/web/conversation.ts) 将 saved 与 live Pi projection 转换为 DOM fragment；[dom.ts](../../../../src/clients/web/dom.ts) 协调这些 fragment，并保留稳定的可见节点。

`script.ts` 中的固定 allowlist 列出 client modules 及其 shared protocol dependencies；asset request 只能访问该集合。Browser asset 测试会检查对外 module 集合，并确认 auth implementation modules 保持私有。

<a id="source-map"></a>

## 源码索引

| 文件 | 职责 |
| --- | --- |
| [client.ts](../../../../src/clients/web/client.ts) | Main UI coordinator：认证、session 选择、API call、model 和 image capability state、SSE/history 生命周期、composer submission、close/reopen 流程及 event handler。 |
| [page.ts](../../../../src/clients/web/page.ts) | Static HTML shell、pairing gate、navigation、conversation 区域、composer、dialog 和 CSS。 |
| [script.ts](../../../../src/clients/web/script.ts) | 固定的 TypeScript module 到浏览器 asset 映射，以及 native type stripping。 |
| [transport.ts](../../../../src/clients/web/transport.ts) | Browser binding storage、request headers、JSON fetch wrapper 和 HTTP error decoding。 |
| [events.ts](../../../../src/clients/web/events.ts) | SSE text framing、event validation、浏览器 conversation state、排序、有界 live accumulation、resync、history merge 和 live/saved 去重。 |
| [conversation.ts](../../../../src/clients/web/conversation.ts) | Saved-message 分组、tool/result 配对、thinking disclosure、tool 与 context 显示、saved/live message DOM 及 unchanged-group cache。 |
| [dom.ts](../../../../src/clients/web/dom.ts) | 基于 identity 的 DOM reconciliation，保留兼容的 element、展开的 disclosure、handler 和标记子树。 |
| [markdown.ts](../../../../src/clients/web/markdown.ts) | Marked lexer 集成，以及安全构造受支持的 Markdown DOM。 |
| [attachments.ts](../../../../src/clients/web/attachments.ts) | 按 session 保存 image draft、验证、异步 decode、预览、移除和 object URL 清理。 |
| [input.ts](../../../../src/clients/web/input.ts) | Composer resize、viewport/keyboard 适配、scroll anchoring，以及受限的长按 Backspace 行为。 |
| [tool-command.ts](../../../../src/clients/web/tool-command.ts) | Bash command 摘要和完整的多行 disclosure。 |
| [icons.ts](../../../../src/clients/web/icons.ts) | 小型固定 inline SVG 控件图标，以及带文字和图标的 button label。 |

<a id="page-structure-and-interaction"></a>

## 页面结构与交互

Shell 包含 pairing gate 和默认隐藏的 application shell。连接后，application 包含 conversation sidebar、open-session status tab、notice 区域、可滚动 conversation 和 composer。Dialog 用于 session close、按目录创建、model 选择、host 详情和 image 预览。`page.ts` 中的 ID 是 `client.ts` 使用的 DOM contract；`el()` 会检查必需 ID 是否存在以及元素 class 是否符合预期。

Status tab 显示 Ready、Working、Needs attention、Stopped 或 Opening。再次选择某个 tab 后才会显示其 close 操作；Tab slot 分配给当前 runtime-open session，并在关闭后重用。

Stylesheet 与 HTML template 放在一起。宽度不超过 760 px 时，sidebar 会变成 drawer，composer 也会适配较小 viewport。Viewport declaration 请求 `interactive-widget=resizes-content`；如果键盘仍遮住内容，composer code 还会检查 `VisualViewport`。Page/client 中实现了 focus-visible style、semantic label、status text、native dialog 和 reduced-motion 规则。

Composer 只会在 fine pointer 设备上将 Enter 绑定为发送；按住 Shift 或输入法 composition 活动时不会发送。在 touch layout 中，Enter 留给键盘使用。Shift+Enter 插入换行。Textarea 会扩大到按 viewport 比例计算的高度上限，之后改为内部滚动；如果 conversation scroll 位置原本靠近底部，就保持跟随最新消息，否则固定读者当前查看位置。

Composer 还会对 Backspace 连续长按加速删除，但只适用于可信的、非 IME、无 modifier 且 caret 折叠的 key event。按住 1.2、2.4 和 4 秒后，如果浏览器支持 native deletion，每次删除长度依次增至 2、4 和 8 个字符；caret 移动时会重置。

<a id="browser-state-and-persistence"></a>

## 浏览器 state 与持久化

Main coordinator 将 session catalog、selected session、当前 live stream projection、saved history page、context preview、model capability、turn metadata、input draft、image draft、pending request 和 lifecycle generation 分开管理。Generation counter 用于忽略 session 切换、reconnect 或 authentication 变化后才返回的旧 response。

| State | Storage | 行为 |
| --- | --- | --- |
| Browser binding | `localStorage`，key `dwell.browser-binding.v1` | 32 个密码学安全随机 byte，以 64 个小写 hex 字符表示。Pairing 时创建，并通过 `X-Dwell-Browser` 发送。 |
| Selected session preference | `localStorage`，key `dwell.web.preferences.v1` | 当前 UI 会写入 selected ID。保存的 ID 只是 preference；仅当 session 的 `runtimeState !== closed` 时，client 才会选中它。 |
| Text draft | JavaScript `Map`，以 session ID 为 key | 在 session 之间切换时保存并恢复当前 textarea 内容。完整页面 reload 会丢失这些 draft。 |
| Image draft | 按 session ID 管理的 `Attachments` instance | 保存在内存中的 image payload 和 object URL，不写入 localStorage。在当前页面内切换 session 时仍与原 session 关联；authentication 丢失/logout 或成功发送后会清除。 |
| Pi session 和 transcript | Host-owned catalog 与 Pi native file | 浏览器通过 host API 列出并显示。它们在页面 reload 和浏览器断开后仍保留。 |

`transport.ts` 发送带 JSON 的 request，并设置 `cache: no-store`；只有存在 browser binding 时才发送 same-origin credential；GET timeout 为 15 秒，POST timeout 为 60 秒。POST 会添加 `Content-Type: application/json` 和 `X-Dwell-Request: 1`。收到 `{ error: { code, message } }` 后会转换为包含 HTTP status 和 host code 的 `ApiError`。其他失败会转换为有界的通用 message。若 browser storage 无法保存 binding，transport 会报告 pairing failure，且不会发送未持久化的 token。Wrapper 返回类型为 `unknown` 的 JSON；调用方使用对应的 shared guard 验证 response 后再使用。

<a id="connect-select-and-refresh"></a>

## 连接、选择与刷新

`connect()` 读取 `/api/v1/status`，用 `isHostStatus` 验证，然后刷新 `/api/v1/sessions`。Pairing form 会先创建或复用 browser binding，再将 pairing code POST 到 `/api/v1/auth/pair`。401 会让用户回到 pairing gate。浏览器不会保存 provider API key，也不会登录 provider。

首次选择 session 时，只有在保存的 selected ID 对应 runtime-open session 时才优先选它。否则选择第一个 open session；如果所有 session 都 closed，就不会自动打开任何已有 session。通过 sidebar 选择 closed 或 failed catalog item 属于显式操作：`openFromSidebar()` 会 POST 到 `/sessions/{id}/open`，验证返回的 session，刷新 navigation，然后选中它。

`select()` 是切换边界。它保存前一个 textarea draft，停止旧 stream，增加 client generation，重置 model capability 和 history-recovery state，将 image draft 关联到新 session，释放 saved-image object URL，清除可见 history/live state，再恢复该 session 的 text draft。随后它探测 model capability，启动 SSE request，并加载最新 saved history。较晚选择完成后才返回的 request 会被 generation/session 检查忽略。

认证期间，`poll()` 每五秒刷新一次 session list。Selected session 的 event stream 独立于这个 list poll。`session.updated` stream frame 可以更早更新 selected catalog entry；下次 poll 还会检测另一个浏览器或 Pi process 所作的更改。Poll 刷新 catalog；打开 closed session 需要从 sidebar 显式操作。

<a id="session-creation-and-model-selection"></a>

## Session 创建与 model 选择

New-session dialog 只要求选择目录。`browse()` 读取 host 的 directory listing，并在填充 parent/child 选项前验证其 shape。创建时只向 `/sessions` POST UUID request ID 和目录；model/thinking 选择稍后通过独立的 model picker 修改。Host 会使用 Pi native/default selection 启动 Pi。

如果 response 结果不确定，创建流程会通过 `pendingCreate` 使用同一个 request ID 重试。确认创建的 session 会在 refresh 后被选中。Host 提供目录选项并负责枚举目录。

Model picker 按 session 工作：

1. `showModels()` 请求 `/sessions/{id}/models` 并验证 response。列表来自为该 session 加载的 Pi runtime，也包括 extension 提供的 model。
2. Text search 在浏览器中筛选 provider 和 model ID。
3. `showThinking()` 请求或复用 `/model-capabilities`。它会提供该 model 支持的 thinking level 和图片能力。
4. 只有一个 thinking level 的 model 会直接选中该 level；否则用户从返回的选项中选择。
5. `changeModel()` 将 provider、model 和 thinking level 作为一次 session mutation 发送。如果 response 失败或状态不确定，它会刷新权威 session state，不会自动重放 mutation。

Session 工作中、有另一个 model mutation pending，或 send/create/image 操作阻止选择时，picker 会禁用。Capability result 按 session/provider/model 缓存，并在 model picker 打开、selected session 改变或页面 resume 时失效。Model capability 未知或正在检查，以及所选 model 不支持图片时，image intake 会保持禁用。切换到 text-only model 后，已有图片仍可移除。

<a id="message-submission-and-stopping"></a>

## Message submission 与停止

创建新 turn 前，`submit()` 会先处理两种忙碌状态：

- 如果 Pi 报告 native extension execution 正在运行，button 会发送针对该 native execution ID 的 abort request。
- 如果 Dwell 报告有 active turn，button 会针对该 turn ID 发送 abort request。

Idle 时，submission 包含 UUID `requestId`、textarea text 和可选 image record。Text 若超过 8 KiB UTF-8、trim 后为空且没有附图，或去掉开头空白后以 `/` 开头，都会被拒绝。此 composer 不提供 slash command。允许 image-only message。Shared request guard 也实施相同的限制，详见[contracts](contracts.md#turn-submission)。

Client 会将准确的 request ID、message text 和 image payload 保存在 `pendingSend` 中，直到确认结果。重试不确定的 request 时复用该 ID，因此 response 丢失不会创建新的逻辑 request。收到成功的 HTTP response 或匹配的 SSE turn acknowledgement 后，会清除 draft 和附件。大多数 4xx response 会清除 pending retry；HTTP 408 被视为结果不确定。Notice 会说明重试将复用相同 request。

<a id="image-attachment-lifecycle"></a>

## Image attachment 生命周期

`Attachments` 独立于 message text 管理 image file draft：

- File picker 和 paste handler 接受 PNG、JPEG、WebP 或 GIF；每条 message 最多四张图片，解码后总大小为 5 MiB。Shared guard 还将单张图片限制在 5 MiB，因此多图 request 实际受总量上限约束。
- File 先读取为 data URL，再转换为 JSON-safe image shape，根据 MIME 和 magic byte 检查，并由浏览器 decode，之后才加入。若用户在 decode 期间切换 session 或丢失 authentication，generation/session 检查会丢弃结果。
- Tray 使用临时 object URL 进行预览。移除某个 image 或清空该 session 时，会 revoke 对应 URL。
- JSON image data 仅在用户提交 message 时才发送到 host turn endpoint。Draft 期间没有单独的 upload request。
- Saved-image rendering 之后会按 session、entry ID 和 image index 请求 `/sessions/{id}/history/{entryId}/images/{index}`。它会检查返回的类型和大小，按顺序排队读取，并为 active conversation 缓存 object URL。切换 session 或 resume 页面时会 revoke 这些 URL。

Session 忙碌、send/model change pending、Pi image support 检查尚未完成，或所选 model 为 text-only 时，都会阻止 image intake。Capability probe 失败后，attach 控件可以再次触发检查。

<a id="sse-live-state-and-saved-history"></a>

## SSE、live state 与 saved history

`stream()` 使用 `Accept: text/event-stream` header 打开 `/sessions/{id}/events`，并在 `Last-Event-ID` 中发送当前 cursor。它要求 response 成功且 Content-Type 为 SSE。`SSEDecoder` 接受分片 UTF-8、LF/CRLF framing、多行 data 和 heartbeat。它将未完成 frame 限制在 256 KiB，验证 event metadata/JSON，并检查 event name/type 与 SSE ID/cursor 是否一致（resync frame 不带 ID）。每个 frame 都必须指向 selected session。

`reduceFrame()` 返回新 state，并保留输入不变。它会忽略其他 session 的 frame、重复 frame、过期 frame 或乱序 frame；cursor 有缺口时会将 projection 标记为不完整，直到 snapshot/resync 流程修复。浏览器会累积有界 live window，并按 native 内容顺序保留 message text range 和 thinking block。它最多累积 64 个 live message 和 64 个 tool；每个 live message 的 text 加 thinking 内容最多 64 KiB。该 client accumulation 与 shared snapshot projection 每条 stream 最多八个 tool 的限制不同。Shared event 上限和单位见[contracts](contracts.md#event-stream)。

Live output 会保留，直到 saved history 证明相匹配的 terminal turn 或 native execution 已位于 saved branch。Native message identity 用于将 live DOM content 交给其 saved entry。不同 native message 中重复的相同文本仍然分别显示；去重不依赖文本相等。

History request 使用 `/sessions/{id}/history`；读取更早页面时附加 server cursor。最新 page 只替换与当前 branch 不兼容的后缀，同时保留兼容的旧前缀。更早 page 会 prepend，且不会重复 entry ID。Pending history response 不会清除已有 saved state。Context-source preview 只会从非 pending page 更新。

浏览器在选择 session、收到 snapshot、resync、terminal turn update 或 native execution settlement 后加载最新 history。若缺少 terminal coverage marker，会进行有界次数的 re-read。History 读取失败时会安排一次 retry；反复失败后，conversation 会显示 retry row。如果存在 next cursor，就会显示 “Load earlier messages” 控件。

Transport 和普通操作失败显示在 notice 区域；model、creation 和 close 失败也会显示在各自 dialog 的反馈区域。401 会让浏览器返回 pairing gate。Turn/native execution 的 error metadata 显示在 conversation projection 旁，与 assistant text 分开。

<a id="conversation-rendering-and-safe-markdown"></a>

## Conversation rendering 与安全的 Markdown

Saved 和 live content 使用同一个 Markdown renderer。`renderMarkdown()` 使用 `marked.lexer()` 解析 GFM token，并显式构造 DOM node。Raw HTML token 会作为文本显示。Link 会被解析，并限制为 HTTP、HTTPS 和 mailto protocol；打开新 tab 时带有 `noopener noreferrer`。Markdown image syntax 会变成 safe text link；saved transcript image 则通过 authenticated image route 加载。Code block、table、task list、heading、list、quote、emphasis 和 inline code 都通过显式 element allowlist 渲染。Token traversal 深度达到 64 层或访问 12,000 个 token 后会停止。

`groupConversationEntries()` 会将所有 response-side entry 收在一起，直到下一个 user entry，因此 assistant text、tool result、extension message、context note 和 diagnostic 不会拆成多个 response bubble。`pairToolResults()` 按 call ID 以 FIFO 顺序匹配 native tool call 和 result；未匹配的 result 仍作为 orphan detail 可见。多行 saved Bash command 会显示第一条有意义的命令行和物理行数，并在 disclosure 中提供完整命令。Tool input/output 以可展开 detail 显示；error detail 默认展开。Custom extension message 保持可见；context、branch/conversation summary 和 diagnostic 使用各自的 disclosure 样式。

Thinking block 渲染为默认折叠的 `<details>`。如果文本以 Markdown heading 或不超过 72 个字符的粗体 heading 开头，该 heading 会成为 disclosure label，并从 body 中移除；否则 label 为 “Thinking”，完整内容保留在内部。Live 与 saved thinking 使用稳定的 native-message/content-index key，因此从 live 切换到 history 后，已展开的 disclosure 仍保持展开。Tool error 默认展开。

History 中的 “Context” disclosure 预览 Pi saved system context 报告的有界 project instruction source 集合；页面可能说明部分内容已省略或截断。这里不会展示完整 effective model prompt 或 runtime context。History contract 及 source/byte limit 见[contracts](contracts.md#saved-history)。

<a id="dom-and-scroll-continuity"></a>

## DOM 与滚动连续性

`SavedConversationRenderer` 会缓存未变化的 saved group，让 live event 可以复用 saved Markdown subtree。`reconcileChildren()` 会按 `data-key`、`data-entry-id` 或 `data-session-id` 匹配 element，并保留兼容 DOM node。这样可以保留已展开的 `<details>`、handler、可聚焦控件和显式标记的 subtree；preserve marker 或 render version 变化时才替换对应 node。

Rendering 前，`renderConversation()` 会记录读者是否靠近底部、可见的 history anchor、已展开的 disclosure 和当前聚焦的 tool summary。Reconciliation 后，仅当读者原本就在底部附近时才跟随底部；否则恢复 anchor 的屏幕位置。如果当前聚焦的 tool summary 被替换，focus 会移动到相同 key 的 summary。

<a id="close-reopen-and-browser-lifecycle"></a>

## Close、reopen 与浏览器生命周期

关闭 open session 分两步完成。选择当前 status tab 会显示 close 控件；随后 close dialog 会读取最新 session metadata 和一段简短的 saved user-message preview。如果 session 忙碌，提示会写 “Stop and close?”，确认流程会针对已捕获的 turn ID 或 native execution ID。Client 会在 abort 前再次检查该 identity，等待 settlement，并在期间出现新 run 时拒绝继续。随后它 POST `/close`。关闭后，runtime 会从 open-tab strip 移除，但 session catalog identity 和 saved Pi history 会保留。

重新打开必须从 sidebar 显式操作。即使某个已有 session ID 被保存为上次选择，页面 reload 也不会自动打开已关闭 session。Close error 会显示在 dialog 中，并刷新 session list，以确认 host 是否已经完成关闭。

已测试的 Pi handoff 是顺序执行的：关闭 Dwell runtime，用另一个 Pi process 操作相同的 native session identity，再通过 Dwell 重新打开以读取新追加的 transcript。该流程由 sessions test 覆盖。

`pagehide` 会停止浏览器的 stream 和 polling，但不会发送 abort 或 close request。页面通过 `pageshow`、`online` 或 visibility restoration 返回时，`resume()` 会让旧的 capability/model-picker 操作失效，释放 saved-image object URL，重新连接 selected stream，重载 history，并 poll session list。认证失效或选择忘记此浏览器时，会停止 stream 和 polling、清除内存中的 image draft，并返回 pairing gate；host-owned 工作会继续运行。

<a id="pi-extension-boundary"></a>

## Pi extension 边界

浏览器是 Pi runtime 行为的 passive observer。Dwell turn 和 native Pi extension execution 使用不同的 ID 与 lifecycle。Extension-handled input 可以在没有 model turn 的情况下结束；native extension execution 可以异步继续，浏览器通过 session state 和 stream event 观察其状态。浏览器可以 abort 已报告为 running 的 native execution，但不提供 Pi 的交互式 extension-dialog API。

Pi extension confirmation dialog 需要 interactive Pi observer。Runtime test “passive Pi observers do not keep dialogs open without an interactive observer” 验证：只有浏览器式的 passive observer 时，dialog 不会一直保持打开。浏览器 composer 也会拒绝 slash command input，因此它不是通用的 Pi terminal 或 command 界面。

<a id="tests-that-pin-this-behavior"></a>

## 测试覆盖

| 覆盖范围 | 证据 |
| --- | --- |
| Browser shell、same-origin asset、固定 asset 集合和仅按目录创建 session | [web.test.ts](../../../../tests/web.test.ts)、[web-client.test.ts](../../../../tests/web-client.test.ts) |
| Markdown、thinking disclosure、tool 分组/配对和 command 摘要 | [conversation.test.ts](../../../../tests/conversation.test.ts) |
| 分片 SSE、cursor 顺序/gap、resync、branch merge、coverage、上限及 native identity handoff | [web-events.test.ts](../../../../tests/web-events.test.ts) |
| Image signature、byte/count 上限、image-only message、model 支持、Pi delivery 和 saved image | [images.test.ts](../../../../tests/images.test.ts)、[history-context.test.ts](../../../../tests/history-context.test.ts) |
| 已加载的 extension model、各 model 的 thinking level，以及不切换 closed session 的 discovery | [session-models.test.ts](../../../../tests/session-models.test.ts) |
| Native extension execution 与 Dwell turn 分离；passive observer 和 interactive dialog 边界 | [native-executions.test.ts](../../../../tests/native-executions.test.ts)、[runtime.test.ts](../../../../tests/runtime.test.ts) |
| Pi transcript reopen、session close/reopen 和缺失 history 的安全处理 | [runtime.test.ts](../../../../tests/runtime.test.ts)、[sessions.test.ts](../../../../tests/sessions.test.ts) |
| 使用 synthetic Pi 环境和 Chrome CDP 的 desktop/mobile browser acceptance | [check-web.ts](../../../../scripts/check-web.ts) |
