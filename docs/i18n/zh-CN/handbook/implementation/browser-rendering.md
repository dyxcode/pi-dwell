<a id="browser-rendering"></a>
# Browser rendering 内部机制

[English](../../../../handbook/implementation/browser-rendering.md) | 简体中文

本章说明浏览器如何呈现 Pi session：HTML shell、固定的 browser module 集合、安全的 Markdown 转换、Pi history pages 与当前 SSE observations，以及 DOM 更新方式。Controller 与 network lifecycle 见 [Browser controller](browser-controller.md)；SSE framing 与 state reduction 见 [Browser events](browser-events.md)。Host 提供已保存的 history branch；renderer 将该 page 与有界的当前 observations 组合后显示。

<a id="page-shell-styles-browser-assets"></a>
## Page shell、样式与 browser assets

[`HOST_PAGE`](../../../../../src/clients/web/page.ts#L1) 是 host 返回的英文 HTML shell。它包含 pairing gate、隐藏的 application shell、navigation 与 open-session status strip、conversation/history 区域、composer，以及用于关闭 session、创建 session、选择 model、查看 host 信息和预览图片的 native dialog。稳定的 element ID 构成它与 `client.ts` 的启动契约：`el()` 会检查必需元素是否存在、DOM class 是否正确，然后才绑定 listeners。Shell 定义了语义化 label、live status region、键盘 focus 目标、受限的八字符 pairing pattern、同源 script/stylesheet references 和 native `dialog`。

[`STYLE`](../../../../../src/clients/web/page.ts#L138) 与 HTML 放在同一 module 中，由 host 一并提供。CSS variables 定义 paper/surface 配色、字体栈和状态颜色；layout rules 组成 desktop 双栏 shell、有界宽度的 conversation、message 间距、composer、disclosure 和 dialog。后续规则组继续调整 conversation group、tool/thinking disclosure、image chip、session status tab、history recovery message 和 command preview。在 760 px 及以下，sidebar 转为默认 inert 的 drawer，dialog 转为 bottom sheet，conversation 与 composer 收紧以适配 touch。更窄或更矮的 viewport 也有额外约束。`focus-visible` outline、screen-reader-only label、安全区 padding、`dvh` 和 reduced-motion 规则服务于键盘与移动端使用。`page.ts` 的运行时值是 HTML/CSS 常量，不包含 callable declaration；CSS class 契约由 controller 和 renderer 使用。

[`modules`](../../../../../src/clients/web/script.ts#L6) 是从公开 browser URL 到仓库 TypeScript module 的固定映射，包含 client、browser helpers 及其 shared protocol modules；request path 不会被拿来选择 filesystem path。 [`BROWSER_ASSETS`](../../../../../src/clients/web/script.ts#L26) 只读取映射中的 entries，使用 Node 原生 type stripper 移除 TypeScript syntax，将相对 import 中的 `.ts` 改成 `.js`，并把固定版本的 `marked` import 改为 `/vendor/marked.js`。然后它把实际安装的 `marked` module 放入该 vendor path。 [`BROWSER_SCRIPT`](../../../../../src/clients/web/script.ts#L38) 是 `/client.js` 的入口文本。HTTP GET handler 中的 [`http.ts`](../../../../../src/server/http.ts#L477) 会在 `/` 返回 HTML `HOST_PAGE`，在已知 allowlisted asset path 返回对应 JavaScript，在 `/style.css` 返回 CSS `STYLE`；其他 paths 会继续进入 authentication。 [browser asset tests](../../../../../tests/web.test.ts#L6) 检查同源加载、编译后的 import、module 集合，以及 server authentication code 不在公开列表中。

<a id="dom-identity-reconciliation"></a>
## DOM identity 与 reconciliation

每次 render 都会生成一个期望的 `DocumentFragment`；现有 conversation DOM 则可能包含 focus、打开的 `<details>`、image callbacks 或正在保留的 preview。 [`elementIdentity`](../../../../../src/clients/web/dom.ts#L3) 按优先级读取第一个存在的 identity attribute：`data-key`、`data-entry-id`、`data-session-id`，并把 namespace 和 tag name 纳入 identity。 [`compatible`](../../../../../src/clients/web/dom.ts#L12) 只允许复用 node 类型相同的节点；element 还必须具有相同 namespace 和 tag。 [`synchronizeAttributes`](../../../../../src/clients/web/dom.ts#L19) 删除过期 attributes，并复制变化后的目标 attributes。 [`hasSamePreserveMarker`](../../../../../src/clients/web/dom.ts#L29) 检查两版 DOM 是否具有相同的显式 `data-preserve` marker。

[`reconcileElement`](../../../../../src/clients/web/dom.ts#L35) 会原位更新兼容的 element。当 identity 与 render version 都相同，或 preserve marker 相同，就保留当前 subtree；否则递归 reconciliation children。它将 `onclick` 替换为新 render 提供的 handler，并在兼容的 disclosure 仍存在时保留原本打开的 `<details>`。 [`reconcileChildren`](../../../../../src/clients/web/dom.ts#L56) 先索引已有的 keyed elements，再按 identity 匹配 keyed 新节点，按兼容类型和原顺序匹配 unkeyed nodes。preserve marker 不同时会丢弃旧节点。函数会按目标顺序移动或插入 nodes，并移除不再使用的旧节点。这样 renderer 可以使用“重新生成目标树”的接口，同时保留稳定的交互节点。

node identity 与 `data-render-version` 相同时会跳过 child traversal，但 attributes 和父节点中的位置仍会更新。Version 改变时才更新 children。相同的 preserve marker 会完整保留当前 element 及其 descendants；controller 用这一点保护仍在异步加载图片的 placeholder。Conversation renderer 为 saved/live groups 提供稳定的 `data-key`；具体 message 到 DOM 的规则见下文。

<a id="markdown-explicit-dom"></a>
## 将 Markdown 转成显式 DOM

[`record`](../../../../../src/clients/web/markdown.ts#L4) 只接受非 null、非 array 的 object，并将其转换为 plain record 供 token inspection；[`text`](../../../../../src/clients/web/markdown.ts#L9) 只在 unknown value 是 string 时返回其值。 [`entities`](../../../../../src/clients/web/markdown.ts#L12) 解码有限的一组 named entities 和 numeric code points；非法 Unicode scalar value 会变成 replacement character。解码后的内容仍按文本处理，不会变为 markup。 [`safeLink`](../../../../../src/clients/web/markdown.ts#L33) 基于当前 page URL 解析目标，只接受 `http:`、`https:` 和 `mailto:`。无效或不支持的目标仍生成一个没有 `href` 的 anchor-shaped node，其中内容作为文本显示。

[`renderMarkdown`](../../../../../src/clients/web/markdown.ts#L42) 调用 `marked.lexer` 获取 GFM tokens，然后递归把支持的 token 结构构造成 DOM nodes。其 nested [`renderMarkdown.append`](../../../../../src/clients/web/markdown.ts#L45) 将递归深度限制为 64、visited token 限制为 12,000。Renderer 会忽略非展示 token，并构造 code figure 和可选 language label、可横向滚动的 table、有序/无序列表和禁用的 task checkbox、link、heading、paragraph、emphasis、blockquote、换行及分隔线。Nested [`renderMarkdown.append.row`](../../../../../src/clients/web/markdown.ts#L77) 构造 table cells，只应用三种已识别的 alignment。文本通过 `textContent` 或 `createTextNode` 写入；raw HTML token 显示为文本，没有任何 token string 被赋给 `innerHTML`。Markdown image token 不会加载 `<img>`：它会创建一个以 alt text（或 “Image”）作为标签的 anchor。如果 `safeLink` 接受目标，该 anchor 就是可点击链接，会在新 tab 打开并带有 `noopener noreferrer`；目标无效或 scheme 不支持时，anchor 没有 `href`。Saved transcript image 则由单独的 authenticated image renderer 加载。未知 token 若有子 tokens 会继续递归，否则显示为文本。

<a id="saved-grouping-tool-pairing"></a>
## Saved entry 分组与 tool result 配对

[`groupConversationEntries`](../../../../../src/clients/web/conversation.ts#L14) 将有序 history page 整理成 user groups 和 assistant response groups。其 nested [`groupConversationEntries.flushResponse`](../../../../../src/clients/web/conversation.ts#L19) 会在遇到 user entry 前关闭当前 response，并在 page 结束时再 flush 一次。所有非 user role 都留在 response group 中，包括 assistant message、tool result、bash record、context、diagnostic 和 extension message；tool 或 context record 不会被误当成新的 user 边界。

[`pairToolResults`](../../../../../src/clients/web/conversation.ts#L44) 先按 `toolCallId` 对 saved `toolResult` entries 排队，再按 entry/block 顺序遍历 tool-call blocks，每次消费一个匹配结果。返回值包含以 saved entry ID 加 block index 为 key 的 lookup、已匹配的 result IDs，以及未匹配的 result entries。队列 offset 能处理重复的 call ID，而不会让一个 result 配给多个 call。Orphan result 仍会显示为独立 disclosure，而不会被隐藏。[conversation tests](../../../../../tests/conversation.test.ts#L91) 覆盖了这些分组和配对规则。

几个小型 DOM helpers 让 node construction 保持一致：[`node`](../../../../../src/clients/web/conversation.ts#L84) 创建 element 并使用 `textContent`；[`keyed`](../../../../../src/clients/web/conversation.ts#L95) 写入 reconciliation key 和可选 saved-entry identity；[`markdown`](../../../../../src/clients/web/conversation.ts#L101) 跳过空文本，并把非空文本交给 safe renderer。 [`appendImage`](../../../../../src/clients/web/conversation.ts#L105) 让 callback 按 entry/index 创建图片节点，再添加来源 identity attributes；缺少必要 metadata 或 callback 失败时显示 “Saved image unavailable”。[`appendMarkdownBlocks`](../../../../../src/clients/web/conversation.ts#L125) 保持 block 顺序，同时将 thinking 和 tool-call blocks 留给专门的 renderer。

<a id="message-thinking-context-rendering"></a>
## Message、thinking 与 context rendering

[`thinkingPresentation`](../../../../../src/clients/web/conversation.ts#L137) 将简短的首行 Markdown heading 或 bold line 用作 disclosure title，并从正文中移除该标题。若标题为空、只是 inline 内容、不是纯 heading/bold line，或超过 72 个 UTF-16 code units，就保留通用的 “Thinking” 标题和完整原文。 [`thinkingDisclosureKey`](../../../../../src/clients/web/conversation.ts#L145) 使用 native message identity 和 content index 生成 key，使 live output 转入 saved history 时可保留 disclosure 的打开状态。 [`thinkingDisclosure`](../../../../../src/clients/web/conversation.ts#L149) 创建默认关闭的 `<details>`，并通过 `renderMarkdown` 显示正文。

[`renderLiveMessageBlock`](../../../../../src/clients/web/conversation.ts#L164) 有两个分支。Thinking block 变为带 message/content-index metadata 的 keyed disclosure。Text block 根据 message 累积文本重建有效 range 的可见字符串；结果为空时返回 `null`。Ranges 让 UI 按 native content 顺序显示 thinking 与面向用户的文本，同时不会把 thinking 混入 response text。 [`thinkingDetails`](../../../../../src/clients/web/conversation.ts#L193) 为 saved thinking block 应用相同的 identity 规则。 [`appendTruncated`](../../../../../src/clients/web/conversation.ts#L309) 在 saved entry 被 history projection 截短时添加简短提示。

[`renderUser`](../../../../../src/clients/web/conversation.ts#L314) 为每条 user entry 创建一个 article，设置 scroll anchor，渲染文本/图片 blocks，并附上截断提示。 [`renderAssistant`](../../../../../src/clients/web/conversation.ts#L326) 为整个 response group 创建一个 article。已配对的 result entry 会被跳过，因为其内容显示在原始 tool call 的 disclosure 下；每个 saved entry 仍有 anchor；extension/custom、context、diagnostic 和 `role: null` entries 交由 `renderSpecial`；孤立的 tool result 显示为 orphan disclosure；bash execution records 使用 shell disclosure；普通 assistant blocks 则按顺序遍历。`role: null` 会按 diagnostic 处理，并显示为默认折叠的 “Saved history note”。Tool-call disclosure 会关联 native owner/call identity 相同的 live tool，因此即使 saved result 尚不完整，也能展示当前运行状态。图片由调用方提供的 scoped image renderer 加载，文本走 safe Markdown。

[`renderSpecial`](../../../../../src/clients/web/conversation.ts#L410) 将 custom extension output 显示为带标签的普通消息。Context、diagnostic 与 `role: null` entries 会显示为默认折叠、标题与角色相符的 disclosure；null role 归类为 diagnostic，标题是 “Saved history note”。[`renderContext`](../../../../../src/clients/web/conversation.ts#L438) 只有在存在 sources 或截断提示时才创建 session-context disclosure。每个 instruction source 按 path 单独设 key，显示其 truncation status，并作为 Markdown 渲染；caption 说明这是保存在 Pi 中的 instruction snapshot。 [`renderSavedConversation`](../../../../../src/clients/web/conversation.ts#L478) 无状态地组合 saved view：有 context 时先渲染 context，再按 group 渲染 user/assistant entries，最后返回 fragment。它的默认 image callback 显示占位信息；应用会传入 authenticated loader。

<a id="tool-disclosures-command-summaries"></a>
## Tool disclosure 与 command 摘要

[`appendRawOutput`](../../../../../src/clients/web/conversation.ts#L205) 跳过 thinking/tool-call blocks，将 saved images 交给 image callback，并把文本放入 `<pre>`；若结果没有文本也没有图片，则显示 “No output saved”。[`bashCommand`](../../../../../src/clients/web/conversation.ts#L226) 只在 saved tool name 为 `bash` 时解析 JSON，并且只接受带 string `command` field 的 object；格式错误时退回通用 tool 渲染。

[`toolRun`](../../../../../src/clients/web/conversation.ts#L244) 为 saved call/result、live tool、shell command 或 orphan result 创建 keyed disclosure。错误默认展开。Shell summary 使用 [`appendToolCommand`](../../../../../src/clients/web/tool-command.ts#L28)，其他 tool 显示其名称。状态文字区分 error、completed、running、saved shell output、orphan result 和缺失的 saved result。Disclosure body 会根据现有数据展示 tool input、saved/live output、saved images 和 truncation note。Shell execution 的 output blocks 取自 owner record，并移除 call block，因为该 projection 将 call 和 output 放在同一条记录中。

[`ActionIcon`](../../../../../src/clients/web/icons.ts#L3) 是有限的 control symbol 集合。 [`actionIcon`](../../../../../src/clients/web/icons.ts#L5) 从固定 path table 创建小型 inline SVG，设置 `aria-hidden` 将其标为装饰元素，并用当前文字颜色绘制 stroke；不会发起图片请求，也不依赖 icon font。 [`labelWithIcon`](../../../../../src/clients/web/icons.ts#L31) 构造 text span 与 SVG，添加共享 button class，再按 `leading` 参数调整先后顺序并替换 button children。可见文字仍是 accessible label；如果操作含义需要更多上下文，调用方会单独设置 button 的 `aria-label`。

[`commandLines`](../../../../../src/clients/web/tool-command.ts#L9) 按 CRLF、CR 或 LF 切分文本，并移除末尾换行产生的一个最终空 segment。 [`commandPresentation`](../../../../../src/clients/web/tool-command.ts#L15) 对 multiline command 选择首个非空且 trim 后的行作为摘要，计算物理行数，并加上 `$` 前缀；单行 command 则保留原始内容。 [`appendToolCommand`](../../../../../src/clients/web/tool-command.ts#L28) 将摘要作为文本添加；multiline command 还会添加行数，并返回一份独立的完整 command `<pre>` 供调用方放入 disclosure。折叠行显示摘要和行数，展开后可读完整命令。[conversation tests](../../../../../tests/conversation.test.ts#L12) 覆盖行尾符、空行、thinking 标题 fallback 和稳定 key。

<a id="saved-group-rendering-cache"></a>
## Saved group renderer cache

[`SavedConversationRenderer.clear`](../../../../../src/clients/web/conversation.ts#L511) 使 cached entries、group signatures 和 keyed shells 全部失效。 [`SavedConversationRenderer.render`](../../../../../src/clients/web/conversation.ts#L517) 只有在 entries array identity 改变时才重新分组，为每组保存 JSON signature 和 native owners，并单独计算 context sources 的 signature。其 nested [`SavedConversationRenderer.render.append`](../../../../../src/clients/web/conversation.ts#L537) 会为未变化的 group 复用浅层 shell，供上层 DOM reconciler 保留现有 subtree；发生变化时则完整重绘该 group，并设置新的 render version。属于某个 saved group 的 live tools 会纳入 signature，因此运行/完成状态变化时只重绘相关 group，其他 saved groups 保持不变。cache 会保留已完成内容的 Markdown DOM 和 image callbacks；随后 `reconcileChildren` 继续保留 keyed nodes、focus 和 disclosure state。
