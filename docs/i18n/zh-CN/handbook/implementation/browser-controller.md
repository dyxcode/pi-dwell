<a id="browser-controller"></a>
# Browser controller 内部机制

[English](../../../../handbook/implementation/browser-controller.md) | 简体中文

[`client.ts`](../../../../../src/clients/web/client.ts) 通过 host 协调 browser controls 操作 Pi session。它通过 shared guards 验证 API payload，跟踪 drafts 和 generations，并展示 saved Pi history 与当前 SSE observations，同时向 host 提交请求。Host 管理 Pi process，并从 Pi native session history 读取已保存 transcript。Page contract 和 renderer 见 [Browser rendering](browser-rendering.md)；SSE parsing/reduction 与基于 identity 的 saved/live join 见 [Browser events](browser-events.md)；输入与图片 drafts 见 [Browser input](browser-input.md)。下文 API path 均相对于 `/api/v1`。

<a id="dom-contract-coordinator-state"></a>
## DOM contract 与 coordinator state

[`el`](../../../../../src/clients/web/client.ts#L40) 查找必需 element，并在元素缺失或 DOM class 不符时抛错。 [`node`](../../../../../src/clients/web/client.ts#L45) 使用 `textContent` 创建 element，避免把 server text 当作 HTML 解析。Module 加载时，controller 会捕获 shell controls、初始化 [`setupComposer`](browser-input.md#composer-sizing-and-viewport-adaptation)，创建一个 [`SavedConversationRenderer`](browser-rendering.md#saved-group-rendering-cache)，并连接 model/image helpers。Page 的 element IDs 定义在 [`HOST_PAGE`](../../../../../src/clients/web/page.ts#L1)。

Coordinator 分别维护 session catalog（`sessions`、`selected`）、当前 SSE [`ConversationState`](browser-events.md#state-bounds-protocol-errors)、saved history（`entries`、`nextCursor`、context）、turn metadata、文本 drafts、image drafts、model capability caches、pending create/send requests、open/close dialogs 和 connection timers。失效计数器按异步工作的归属来保护状态：`authAttempt` 使较早 authentication attempt 发出的请求失效；`generation` 在 selected session 或 page lifecycle 改变时隔离 stream、history 和 image 工作；`selectionGeneration` 隔离依赖当前 session selection 的操作。`sessionRefreshGeneration` 与 `sessionStateGeneration` 防止并发 refresh 和较新的 session 更新被旧 catalog 响应覆盖。`openIntentGeneration`、`closePreparationGeneration`、`closeAttemptGeneration` 分别约束 open/close 操作；`browseAttempt` 与 `modelAttempt` 约束 directory/model dialog reads。Callback 会在 await 后检查捕获的 counter，因此旧 selection、登录或 dialog response 不会覆盖当前状态。`pendingSend` 与 `pendingCreate` 在响应结果不确定时保留 request ID 和 payload 选择；`sending`、`historyPending`、`openingSessions`、`changingModel`、`closingSession` 等 request flags 用来阻止冲突操作。

[`showImage`](../../../../../src/clients/web/client.ts#L185) 设置 preview image 的 `src`、alt text 和标题，然后打开 image dialog。 [`releaseImages`](../../../../../src/clients/web/client.ts#L241) 在每个 resolved promise 完成时撤销 saved-image object URL，清空 request cache，增加 `imageGeneration` 并使 saved-group render shells 失效。它与 `Attachments` 自己管理的 draft URLs 分开清理。

<a id="browser-http-transport"></a>
## Browser HTTP transport

Browser API wrapper 位于 [`transport.ts`](../../../../../src/clients/web/transport.ts)。 [`ApiError`](../../../../../src/clients/web/transport.ts#L3) 在 message 外保存 HTTP status 和 host error code；[`ApiError.constructor`](../../../../../src/clients/web/transport.ts#L6) 初始化这些字段。 [`binding`](../../../../../src/clients/web/transport.ts#L12) 从 `dwell.browser-binding.v1` 读取 browser binding，只接受 64 位小写 hex；需要创建时生成 32 个 cryptographically random bytes，并验证 localStorage 确实保存了该值。Storage/crypto 出错会转换为 status 为 0 的 `storage` error。 [`headers`](../../../../../src/clients/web/transport.ts#L33) 总是接受 JSON；存在有效 binding 时增加 `X-Dwell-Browser`。 [`responseError`](../../../../../src/clients/web/transport.ts#L39) 只解析预期的 `{ error: { code, message } }` shape；body 无法读取或结构不符时，返回带 response status 的通用 `http` error。

[`api`](../../../../../src/clients/web/transport.ts#L60) 发送 `cache: no-store` 的同源 JSON `GET` 或 `POST`。POST 会增加 `Content-Type: application/json` 和 `X-Dwell-Request: 1`；只有存在 browser binding 时才使用 `same-origin` credentials，否则设为 `omit`。GET timeout 为 15 秒，POST 为 60 秒。成功的 JSON 仍以 `unknown` 返回，因此每个 controller 调用方都要通过相应 shared runtime guard 后才能使用。 [`message`](../../../../../src/clients/web/transport.ts#L77) 返回普通 `Error.message`；非 Error throw 则使用通用错误文字。固定 binding key 是 [`BINDING_KEY`](../../../../../src/clients/web/transport.ts#L2)。Browser asset tests 会检查编译后的 transport 包含预期 binding/request headers，而且不含 Node imports 或 cookie credentials（[`web.test.ts`](../../../../../tests/web.test.ts#L16)）。

Pairing 是唯一先创建本地 binding 的流程：pair-form handler 将精确 trim 后的 pairing code 与 browser key 发到 `/auth/pair`，成功后清空输入，再调用 `connect()`。Authentication 始终由 host 管理；browser 不保存 provider credential。任何操作收到 401 都进入同一个 disconnect 流程。

<a id="model-capability-state-image-gate"></a>
## Model capability state 与 image gate

Capability cache 按 `[sessionId, provider, model]` 三元组索引。 [`resetCapabilities`](../../../../../src/clients/web/client.ts#L86) 增加 `capabilityGeneration`，并清空成功结果、共享中的 in-flight requests 和失败记录。 [`activeSession`](../../../../../src/clients/web/client.ts#L331) 返回当前 catalog 中的 selected item。 [`savePreference`](../../../../../src/clients/web/client.ts#L323) 更新内存 preference object，并尝试将其保存到 `dwell.web.preferences.v1`；若 storage 失败，当前内存中的 UI 仍可使用。启动时只接受长度不超过 200 的 string preferences；`select()` 会保存 selected session ID。 [`modelCapabilityKey`](../../../../../src/clients/web/client.ts#L334) 仅在三项 identity 都存在时生成稳定 tuple key。

[`requestModelCapabilities`](../../../../../src/clients/web/client.ts#L343) 优先返回 cache 中的结果或已有 promise，因此同一 session/model 的并发 UI 操作共享一次 host read。它向 `/sessions/{id}/model-capabilities` 提交 provider/model，验证响应 shape 及 provider/model identity；仅当 generation 仍有效时缓存结果、记录 failure。`finally` 只会删除属于自己的 in-flight promise，并更新 navigation。 [`probeCurrentModel`](../../../../../src/clients/web/client.ts#L383) 只在 authenticated、Pi process 处于 ready 且 provider/model 已选择时运行；它不会重复已完成、正在运行或失败的 probe，并且只处理仍匹配当前 authentication/generation 的 401。

`Attachments` 构造时传入的 image-button handler 随后会被 controller 的 guarded handler 替换。如果已确认当前 model 支持图片，就打开 picker；若上次 capability read 失败，会重试，并且只有在 authentication、selection、generation、provider/model 和支持结果都仍匹配时才打开。`navigation()` 会在支持状态未知、检查中、检查失败或明确不支持时禁用新 intake，同时保留移除已有附件的操作。`submit()` 若已知当前 model 不支持图片，会在发送前再次拦截。Probe 失败时，新 image intake 会保持禁用，直到确认 model 支持图片。

<a id="session-labels-status-navigation"></a>
## Session label、status 与 navigation

[`label`](../../../../../src/clients/web/client.ts#L411) 用本地记住的名称（或 directory 最后一个 component）、model ID 和可选 thinking level 组成标签。 [`runtimeOpen`](../../../../../src/clients/web/client.ts#L418) 表示 Pi process state 不是 `closed`；tab logic 因此将 opening、ready、failed 和 closing session 都视为 open。 [`nativeRunning`](../../../../../src/clients/web/client.ts#L421) 只在 Pi-native extension execution 正在运行时返回其 ID。 [`sessionBusy`](../../../../../src/clients/web/client.ts#L424) 合并该路径与 Dwell active turn 状态。

[`status`](../../../../../src/clients/web/client.ts#L427) 优先采用 native execution status；否则 selected session 使用 live reducer state，其他 session 使用本地 turn cache，并把 active、interrupted、failed、aborted、opening/creating、completed 和 idle 映射为用户可读状态。 [`TabStatus`](../../../../../src/clients/web/client.ts#L449) 是更紧凑的视觉分类；[`tabStatus`](../../../../../src/clients/web/client.ts#L450) 和 [`tabStatusLabel`](../../../../../src/clients/web/client.ts#L458) 将文字状态映射为五种 tab style 和 accessible description。`statusPaths` 提供固定 SVG path， [`tabSymbol`](../../../../../src/clients/web/client.ts#L481) 将其构造成 aria-hidden icon。

[`synchronizeTabSlots`](../../../../../src/clients/web/client.ts#L497) 为仍打开的 sessions 保留原有 slot，删除已关闭 session 的 slot，再为新 session 分配最低可用的正整数。 [`openTabIds`](../../../../../src/clients/web/client.ts#L509) 按 catalog 顺序返回仍 open 的 tabs。 [`closeBlockedReason`](../../../../../src/clients/web/client.ts#L512) 在未认证，或 send/不确定 send/model change/image intake/session creation/其他 open 操作尚未结束时阻止开始 close。

[`showError`](../../../../../src/clients/web/client.ts#L522) 将 401 交给 `disconnect()`，因为 browser pairing 已无效；其他 errors 显示在 live notice region。 [`clearNotice`](../../../../../src/clients/web/client.ts#L530) 清空此区域。 [`nav`](../../../../../src/clients/web/client.ts#L534) 打开或关闭 mobile drawer，协调 `inert`、scrim、`aria-expanded`，并把键盘 focus 放到对应导航按钮。

[`navigation`](../../../../../src/clients/web/client.ts#L543) 是衍生 UI 的更新过程。它为 catalog 中的每个 session 重建 sidebar row，为 Pi process 尚未关闭的 session 生成 status tab，然后调用 `reconcileChildren` 保留稳定的 session/tab nodes。Nested [`navigation.slotNumber`](../../../../../src/clients/web/client.ts#L549) 将 slot map 格式化成数字。Sidebar activation 调用 `openFromSidebar`；status tab 选择对应 session；再次激活当前 tab 则显示 close control。该函数还更新当前 directory/model labels，并依据 authentication、Pi process state、active turn、model probe、draft 和 request state 计算 model choice、text input、image intake 及 send/stop/retry 控件状态，同时设置 accessibility labels、tooltips 和 disabled properties。

<a id="opening-closing-concurrency-checks"></a>
## 打开、关闭与并发检查

[`updatedSession`](../../../../../src/clients/web/client.ts#L719) 替换或追加 catalog entry，增加 `sessionStateGeneration`，并返回变更前的 open-tab 顺序。 [`neighborAfterClose`](../../../../../src/clients/web/client.ts#L729) 优先选择关闭项后面仍打开的 tab，再向前寻找，最后退回第一个 open session。 [`reconcileClosedRuntime`](../../../../../src/clients/web/client.ts#L744) 处理 Pi process 在外部关闭的 selected session；必要时关闭已失效的确认 dialog，提示另一浏览器已关闭该 session，并选择相邻 session。

[`userMessageSnippet`](../../../../../src/clients/web/client.ts#L753) 查找最新的 saved user entry，将其文本 blocks 合并并规范空白，最多保留 100 个 Unicode characters，供 close confirmation 展示。 [`showCloseError`](../../../../../src/clients/web/client.ts#L766) 在 dialog 内显示错误。

[`prepareClose`](../../../../../src/clients/web/client.ts#L770) 仅针对当前 selected 的 open session 执行，并要求没有其他操作阻止关闭。它捕获 authentication、selection、state 和 preparation generations；并行读取新 session metadata 和最新 history page，然后在打开确认框前复查所有 captured state。如果请求期间已有新的 session state，`sessionSnapshot` 会重新读取，避免依赖旧响应。Dialog 会记录用户查看过的确切 active Dwell run ID 或 running native execution ID；如果 session 正忙，就显示 “Stop and close?”。因此确认时不会误停在确认后新启动的 response；新 response 必须重新查看并确认。History 读取失败不会阻止确认，authentication failure 除外。

[`sessionSnapshot`](../../../../../src/clients/web/client.ts#L854) 和 [`turnSnapshot`](../../../../../src/clients/web/client.ts#L860) 会同时校验响应 shape 与所请求的 identity。 [`turnIsActive`](../../../../../src/clients/web/client.ts#L866) 将 accepted、dispatching、running 视为 active。 [`waitForTurnAndRuntime`](../../../../../src/clients/web/client.ts#L869) 每 250 ms 检查一次确切 run/session，最长等待 60 秒；authentication 改变、出现新的 response、Pi process 关闭，或 turn 与 active-turn pointer 均结束时退出。 [`finishClose`](../../../../../src/clients/web/client.ts#L894) 关闭 dialog，清除 armed state；若刚关闭的是当前 session，则选择相邻 open session。

[`confirmSessionClose`](../../../../../src/clients/web/client.ts#L900) 对已审阅的 `closeTarget` 每次只执行一次。它先刷新 session，再按记录的 execution lane 处理：native execution 使用其 ID 发出 abort，并以 150 ms 间隔等待，最长 15 秒；Dwell active turn 会重新读取状态，必要时 abort，然后通过 `waitForTurnAndRuntime` 等待结束；看似 idle 的目标也会再读一次。遇到不同或新 run 时中止 close，要求用户重新确认。只有 work settle 后才发送 `/close`。响应不确定或操作失败时，dialog 保留错误并读取 authoritative state；如果 session 的 Pi process 已关闭，就结束流程而不重复 close mutation。Generation checks、disabled confirmation buttons 和 `attempted` flag 防止重复或并发操作。Close dialog 的 `cancel`/`close` listeners 会调用 [`dismissCloseDialog`](../../../../../src/clients/web/client.ts#L2130) 和 [`resetCloseDialog`](../../../../../src/clients/web/client.ts#L2117)：清除 target、恢复按钮和 focus，并处理排队的 native dialog close events。

[`openFromSidebar`](../../../../../src/clients/web/client.ts#L1012) 要求已认证且图片 intake 已完成。Pi process 既非 closed 也非 failed 时直接选择 session；closed 或 failed 的 Pi process 则通过 `/sessions/{id}/open` 启动。响应通过验证后，只有 open intent、selection generation 和 authentication 仍有效时才会切换过去。`openingSessions` 防止对同一 session 重复启动，`finally` 保证移除 opening 标记。

<a id="conversation-rendering-saved-images"></a>
## Conversation rendering 与 saved images

[`identifyLiveThinking`](../../../../../src/clients/web/client.ts#L1048) 会在 final message 或 snapshot 给出 native identity 后，更新当前 live thinking disclosures 的 message/content identity。它与 saved renderer 的 `thinkingDisclosureKey` 保持一致，使 live-to-saved handoff 可保留 disclosure state。

[`historyImage`](../../../../../src/clients/web/client.ts#L251) 立即返回 loading button，然后按 selected session、entry ID 和 image index 请求 saved image。Request 会通过 `imageQueue` 串行处理，通过 `imageCache` 去重；请求附带 browser-binding headers，有 15 秒 timeout 和 5 MiB blob 上限。Response content type 必须与 history block 的 MIME 一致。Selection/generation checks 会丢弃迟到响应。成功的 blob 变为 object URL；`onload` 只有在 placeholder 仍连接到 DOM 时才插入图片，并在读者接近底部时保持 scroll position。点击图片会通过 `showImage` 打开 preview。Fetch/blob/cache rejection 会显示 retry button：删除失败的 cache entry、使 render shells 失效并重新渲染；401 会走 authentication error path。如果 object URL 已成功取得，但浏览器图片 decoder 触发 `onerror`，placeholder 只改为 “Saved image cannot be displayed.”，不会提供 retry，也不会清除 cache。

[`renderConversation`](../../../../../src/clients/web/client.ts#L1060) 先构造期望的 conversation fragment，再与当前 DOM reconciliation。渲染前记录读者是否接近底部、当前 focus 的 disclosure key、已展开 disclosure keys，以及可见 entry/key 的 scroll anchor。未选择 session 时渲染空状态；有 session 时追加 cached saved history/context，恢复 disclosure state，并且只有在 history page 尚未覆盖当前 run 时才展示独立的 live response。`visibleLiveContent` 按 native identity 去除已出现在 saved history 中的 live items，不根据文本是否相同去重。Server 未提供 order metadata 时，controller 使用有界的 observation-order list。Live messages 按序展示 text/thinking blocks；live tool disclosure 尽可能解析 bash 摘要，并显示 partial input/output 和当前状态。Turn/native errors 和 history retry state 也出现在 conversation 中。调用 `reconcileChildren` 后，如果原 disclosure 被替换，函数会恢复 focus；原本就在底部时继续跟随最新内容，否则调整 scroll，使选定 anchor 留在之前的屏幕位置。Message/tool DOM 的细节见 [Browser rendering](browser-rendering.md#saved-group-rendering-cache)。

<a id="saved-history-recovery"></a>
## Saved history 与 recovery

`historyRecovery.latest` 和 `.older` 分别记录 failure count/retry timer；`historyPending` 确保 browser 同时只发出一个 history request。 [`historyProblem`](../../../../../src/clients/web/client.ts#L1246) 决定显示“最新内容”还是“较旧页面”的 retry state。 [`resetHistoryRecovery`](../../../../../src/clients/web/client.ts#L1250) 取消相应 retry timer，清除 failure/queued flags；重置 latest 时还会清除 coverage tracking 和 content-failed latch。 [`uncoveredHistoryRun`](../../../../../src/clients/web/client.ts#L1266) 只在 history page 尚未证明覆盖时返回当前 native execution 或 terminal Dwell run；仍 active 的工作不会误报为缺失的 terminal history。

[`scheduleHistoryRecovery`](../../../../../src/clients/web/client.ts#L1277) 在一秒后安排 generation-bound retry；selection/auth/suspension 改变后，callback 不会继续读取。 [`loadHistory`](../../../../../src/clients/web/client.ts#L1286) 请求最新 page，或以 `nextCursor` 请求较旧 page。它会验证 session identity、忽略过期 generation、前置未见过的 older entries，并使用 `mergeHistoryEntries` 将非 pending 的 latest page 合入现有 branch。最新请求返回 `status: "pending"` 时，会保留当前显示的 `entries`、`nextCursor` 与 context snapshots；但仍将 pending page 附加到 reducer state 以重新计算 coverage。Cursor 失效时会重置 pagination 并排队重新读取最新页。Non-pending latest history 还会更新 context snapshots 和 reducer coverage。如果同一个 terminal run 仍未被覆盖，controller 会统计成功的 latest reads，并最多每秒重读，直到第三次读取。第三次之后，只有 `liveTruncated`、history page 的 `incompleteTail` 或 `projection.error` 提供可能丢失内容的证据时，才设置 saved-content failure notice；单独缺少 coverage 不会触发该 notice。其他 transient failures 会自动重试一次，之后提供用户可点击的 retry。401 会 disconnect。`finally` 会恢复 pagination controls，并优先处理一个排队的 latest read，其次才处理 older-page read。

<a id="sse-connection-selection-lifecycle"></a>
## SSE connection 与 selection lifecycle

[`stopStream`](../../../../../src/clients/web/client.ts#L1385) abort 当前 fetch/read 并清除 reconnect timer。 [`scheduleStreamRender`](../../../../../src/clients/web/client.ts#L1391) 将连续 stream frames 合并到一个 animation frame，更新 navigation 和 conversation DOM。

[`stream`](../../../../../src/clients/web/client.ts#L1399) 以 browser binding、`Accept: text/event-stream`、no-cache 参数，以及可用时的最后一个 cursor 请求 `/sessions/{id}/events`。它验证 HTTP response 与 content type，增量读取 response，经 `SSEDecoder` 解码文本，拒绝改变 session ID 的 frame，再使用 `reduceFrame` 应用每个 frame。Run identity 改变时重置 display order 和 coverage retries。Message/tool observations 会以去重后的方式加入有界 fallback order。Session metadata 更新 tabs，并可能触发 model-capability probe。若 `pendingSend` 的 request ID 和 session 与 turn acknowledgement 一致，即使 POST response 已丢失，SSE 也能确认成功、清除文字和图片。Snapshot、resync 和 terminal events 会触发 saved-history read。Stream errors 进入同一 catch path；非 authentication failures 清除 reconnect cursor 并在两秒后重试，401 则 disconnect。`finally` 会释放 reader lock；abort 或 stale generation 会直接退出，不安排 retry。

[`select`](../../../../../src/clients/web/client.ts#L1519) 是 session transition 的边界。它只接受 Pi process 尚未关闭的 target，保存旧 session 的文本 draft，停止旧 stream，推进 selection/render generation，关闭过期 model UI，清除 capability state，切换 session-specific image draft，撤销 saved-image URLs，清空 context/live/history state，保存 selected-session preference，恢复新 session 的文本 draft，重绘并重置 scroll，然后启动 model probe、SSE stream 和最新 history read。迟到的工作会因 generation 不匹配而失效。 [`connection`](../../../../../src/clients/web/client.ts#L1553) 设置 connection badge 文本。

[`refresh`](../../../../../src/clients/web/client.ts#L1556) 读取 authoritative session catalog，并在替换前检查 authentication、refresh generation 和 `sessionStateGeneration`，以免覆盖较新的 SSE/session mutation。它会分配 slots，处理被外部关闭的 session；如果保存的 preference 对应 Pi process 尚未关闭，就优先选择，否则选择第一个仍打开的 session；还会为后台 sessions 读取未见过的 latest-turn metadata。 [`poll`](../../../../../src/clients/web/client.ts#L1620) 避免并发 poll，并在 authenticated、未暂停时安排五秒后的下一次 catalog refresh。

[`disconnect`](../../../../../src/clients/web/client.ts#L1642) 重置 browser state：dispose image drafts，清除 capability state，撤销 saved-image URLs，关闭 image/new/model/close/host dialogs，推进 auth/selection generations，停止 SSE，重置 recovery 和 polling，隐藏 app 并显示 pairing gate。 [`connect`](../../../../../src/clients/web/client.ts#L1666) 验证 `/status`，记录 host mode，显示 app、刷新 sessions；若当前 selected session 仍存在，就恢复对应 stream，再开始 polling。Authentication 失败或 attempt 已过期时回到 pairing gate；`finally` 会恢复 retry button。

<a id="sending-stopping-safe-retry"></a>
## 发送、停止与安全重试

[`submit`](../../../../../src/clients/web/client.ts#L1705) 有三个明确分支。如果 Pi-native extension execution 正在运行，就使用确切 native execution ID abort；否则若 Dwell turn active，就使用对应 turn ID abort。两个分支都会验证响应并在 `finally` 释放 send lock。空闲时，当前 session 已有 `pendingSend` 就继续使用它；否则捕获新 UUID request ID、textarea 原文和有序 image payload。它会阻止从另一个 session 重试未确认的消息；已知当前 model 只支持文本但携带图片时拒绝发送；附件仍在 intake 或文本/图片都为空时返回。文本若超过 8 KiB UTF-8，或 trim 前导空格后以 `/` 开头，也会被拒绝。有效 body 包含 request ID、message 和可选 images。

确切的 pending body 会留在内存中，直到匹配的 HTTP response 或 SSE turn acknowledgement 确认结果。成功后清除文本 draft 和 attachments，刷新 catalog 并重新读取 history。多数 4xx 是明确拒绝，会清除 retry；408、网络错误和其他未知结果会保留原 request ID 与 bytes，使重试仍是同一个逻辑 request。Notice 会提示结果尚未确认。最终验证仍由 host 的 shared request guard 执行；见 [turn submission](../../../../handbook/contracts.md#turn-submission)。

例如，host 已接收 turn、但 POST response 丢失时，browser 会保留原 request ID、文本和图片 payload。若之后收到 `turn.updated` 中匹配的 acknowledgement，就确认成功并清除 draft；若未收到 acknowledgement，点击 Retry 时会以相同 request identity 和内容重试，由 host 确认该请求的结果。

<a id="directory-selection-session-creation-model-picker"></a>
## Directory 选择、session 创建与 model picker

[`browse`](../../../../../src/clients/web/client.ts#L1808) 读取 `/directories`（可带编码后的 path），并通过 `isHostDirectoryListing` 验证。`browseAttempt` 和 authentication attempt 确保响应仍属于打开中的创建 dialog；pending creation 期间禁止改目录。Parent/child buttons 使用 host 返回的 path 再次调用 `browse`。Listing 被截断时，UI 会提示用户输入完整路径；目录枚举由 host 执行。 [`newSession`](../../../../../src/clients/web/client.ts#L2042) 打开 dialog，以 active session 的 directory 初始化 input 并读取对应 listing；如果已有不确定的 creation，则不覆盖它。

[`createSession`](../../../../../src/clients/web/client.ts#L2050) 将 directory 与 UUID request ID 放入 `pendingCreate`，禁用编辑，再只向 `/sessions` 发送这两个值；model/thinking choice 在之后单独完成。通过验证的成功响应会清除 pending request、关闭 dialog、刷新 catalog 并选择新 session。响应不确定时保留同一 ID 与 directory，供 retry 确认同一创建操作。明确的 4xx 和 `session_start_failed` 会清除它。`finally` 会按 pending state 恢复 button 与 directory input。

[`renderModels`](../../../../../src/clients/web/client.ts#L1857) 按 provider/model 文本过滤已加载的 models，生成显示 selected state 的 accessible buttons。 [`showModels`](../../../../../src/clients/web/client.ts#L1885) 确认 model control 当前可用，捕获 session/auth generations，重置 capability state，打开 dialog，读取 `/models`，验证 session identity，并将 options 中的 capability 信息写入 cache。只有 session/dialog 仍匹配时才渲染结果。 [`showThinking`](../../../../../src/clients/web/client.ts#L1936) 请求所选 model 的 capabilities。若只返回一个 thinking level，就直接应用；否则显示所有 levels 和当前选择。其 nested button callbacks 提交捕获到的 model/level pair。

[`changeModel`](../../../../../src/clients/web/client.ts#L1997) 对未变化的选择直接关闭 dialog；否则禁用冲突操作，并在一次 session mutation 中提交 provider、model 和 thinking level。返回的 session 需通过验证后才替换 catalog state。响应失败或不确定时，函数读取 authoritative metadata，不会自动重放 mutation。`finally` 释放 model lock、更新 navigation，并在需要时刷新 picker。Model discovery、thinking levels 和 image capability 来自 Pi-backed host endpoints，而非 browser 内置 model list。

<a id="event-bindings-page-lifecycle"></a>
## Event bindings 与 page lifecycle

定义完 coordinator functions 后，module 会绑定 pairing、retry、logout、host details、model picker、creation dialog、close dialog、image dialog、notice、history pagination 和 sidebar controls。这些 callbacks 通过上文 helper 执行 state transition。Pairing form 先持久化随机 binding，再请求 `/auth/pair`；logout 请求 `/auth/logout` 后调用 `disconnect`。Fine-pointer 布局下，Enter 会提交，但 Shift/IME composition 时不会；touch keyboard 保留原生 Enter 行为。Clipboard 图片文件交给 `Attachments.paste`，普通文本继续使用原生 input。Textarea input handler 保存 selected session draft 并调用 composer resizer。

[`resetCloseDialog`](../../../../../src/clients/web/client.ts#L2117) 清除 tab armed state、已审阅 target、按钮状态和 error，重绘后把 focus 放到 active tab 或 new-session control。 [`dismissCloseDialog`](../../../../../src/clients/web/client.ts#L2130) 关闭并 reset dialog。原生 `close` event 可能延迟触发，因此 listener 会检查是否有更新的 close target 已经替换当前 target。

[`responsive`](../../../../../src/clients/web/client.ts#L2251) 在 760 px breakpoint 改变时更新 drawer `inert` state；desktop 始终允许操作主区域和 rail。`pagehide` 会标记 browser 已暂停，推进 stream generation，中断 observation 并清除 catalog polling。 [`resume`](../../../../../src/clients/web/client.ts#L2273) 恢复 browser observation：清除旧 timers，使 capability/model work 失效，关闭 picker，撤销 saved-image URLs，清掉旧 cursor，再 probe selected model、重开 stream、读取 history、poll sessions 并 resize composer。Back-forward-cache 的 `pageshow`、`online` 和可见状态的 `visibilitychange` 都走这一条路径。Resume 只恢复 observation；再次发送 pending prompt 需要用户显式 Retry。

Browser boundary tests 验证实际 shell、公开 browser module 集合、authenticated directory/model discovery 和 pairing routes（[`web-client.test.ts`](../../../../../tests/web-client.test.ts#L5)、[`web.test.ts`](../../../../../tests/web.test.ts#L16)）。事件、history、图片及 session contracts 各自在相邻章节与 reference pages 中链接到对应测试。
