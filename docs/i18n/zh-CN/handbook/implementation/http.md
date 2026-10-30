# HTTP host 与 SSE

[English](../../../../handbook/implementation/http.md) | 简体中文

[实现索引](README.md) · [HTTP 概览与路由参考](../http-auth.md) · [Authentication internals](authentication.md)

Loopback HTTP host 负责 request validation、route dispatch 和 response cleanup。Session service 负责 session 行为；每个 SSE writer 管理一个 response。Authority selection 和 durable browser credential 见 [Authentication](authentication.md)。

<a id="request-validation"></a>
## 请求校验与 response helper

[http.ts](../../../../../src/server/http.ts) 中的小型 helper 定义了 request boundary。[fail](../../../../../src/server/http.ts#L31) 将校验或策略判断转换为 AccessError，使外层 handler 统一生成稳定的错误 envelope。[cookieToken](../../../../../src/server/http.ts#L34) 只有在所选 cookie 名称恰好出现一次时才接受它。[browserRequest](../../../../../src/server/http.ts#L42) 要求 browser POST 的 Origin 完全匹配，并带有 Dwell request marker；Origin 必须匹配哪个 authority 由 access layer 选择。

[readJson](../../../../../src/server/http.ts#L47) 接受带可选 UTF-8 charset 的 JSON，拒绝压缩 body，并分别限制 Content-Length 声明值和实际读取的字节数。请求中断会变成带类型的 400 错误。解析后的值必须是非 null object，不能是 array 或 primitive；函数再把 enumerable entries 复制为普通 record，供路由校验。大多数请求限制为 8 KiB。Turn submission 的 JSON envelope 可到 8 MiB，以容纳 image references；message text 则单独限制为 8 KiB UTF-8。

[send](../../../../../src/server/http.ts#L84) 写入 status 和 JSON body。[parseHistoryCursor](../../../../../src/server/http.ts#L88) 只允许一个非空且不超过 1536 个字符的 cursor，并拒绝重复、混合或其他不支持的 query parameter。Directory browsing 的 path query 在 route handler 中单独校验。

<a id="host-lifecycle"></a>
## Host 启动、活动请求与关闭

[startHost](../../../../../src/server/http.ts#L102) 接受 port、data directory、mode、clock、session environment/extensions 和 heartbeat interval 等内部 embedding/test seams。Public CLI 不暴露 port 或 data-directory override。函数校验 port，创建 protocol version 2 的 status metadata、全新的 instance ID 和 sessions 可用/tasks 不可用的 capability flags，并在 host 局部变量中保存 authentication、sessions、stopping state、活动 handler 与 SSE stream。

嵌套的 [revalidateEventStreams](../../../../../src/server/http.ts#L130) 会在 credential 变化后检查现有 writer。[openEventStream](../../../../../src/server/http.ts#L134) 将 writer 绑定到当前 request 的 authorization check，订阅 session event hub，并以订阅快照启动。订阅 callback 会 enqueue 每个 frame；onClose callback 会把 writer 从 host set 中移除。如果订阅或启动失败，会先关闭 writer 再返回错误。Stream 保持打开期间会重新检查 authorization；cookie 和 bearer 规则见 [Authentication](authentication.md#browser-session-auth)。

嵌套的 [handle](../../../../../src/server/http.ts#L167) 在进入 request pipeline 前设置 response 安全 headers。它先拒绝重复的 Host、Origin、Authorization、Cookie、Dwell binding/request marker 和 Last-Event-ID headers；再选择 configured authority，拒绝 cross-origin Origin 和 HTTPS lane 上的 bearer credential；随后检查 host 生命周期和 URL 长度。Query parsing 仅支持 directory path 或 saved-history cursor。精确的 Host 与 proxy-header 规则见 [authority selection](authentication.md#authority-and-cookies)。

Handler 识别已知 route family 并确定所需 method。未知路由返回 404；method 错误的已知路由返回 405 和 Allow header。受保护路由会先完成身份验证，再解析 body 或调用 service。GET 拒绝 transfer-encoded 或非空 body。Pi executable 配置仅限 CLI；browser POST 会再次校验 Origin/request marker。每个路由随后执行专属的 shape check，再调用 session service。具体 branch 如下。

<a id="route-dispatch"></a>
### Route-specific branch

| Route family | Dispatch 与 boundary |
| --- | --- |
| Pi executable 配置 | `POST /api/v1/runtime` 仅允许本地 CLI。`RuntimeConfiguration` object 只包含 `executable` 和可选 `entryPoint`；`sessions.configure` 会验证并保存 Pi 配置。 |
| Directory 与 global model discovery | GET /directories 接受一个非空 path query；省略时使用 host home。GET /models 将 isolated global model list 放入 models object。POST /model-capabilities 在 discovery 前校验 provider/model pair。 |
| Session catalog 与 lifecycle | GET /sessions 返回 catalog。POST 只接受 requestId、directory，以及成对出现的 provider/model。Ready 结果返回 201；failed creation 返回 503；interrupted creation 返回 409。单个 session 的 GET 返回已保存 metadata；open 和 close 是 body 为空 object 的 POST。Context 是 GET；它从 Pi process 读取，并在必要时先打开或恢复 Pi session。 |
| Session model operations | GET /sessions/:id/models 返回当前打开的 Pi process 提供的 models。POST /model-capabilities 校验 provider/model pair；POST /model 会先用 shared session-model validator 校验 provider、model 和可选的 thinkingLevel，再将这些 settings 应用于 Pi session。 |
| Saved history | GET /history 只接受一个 cursor query。Image route 要求 safe integer index，对 entry ID 执行 percent-decode，并以 MIME type、length 和 inline disposition 返回选中的 saved bytes；不接受 client path。 |
| Event observation | GET /events 接受一个 Last-Event-ID header。Session service 会校验 session/cursor，并在 HTTP writer 提交 SSE headers 前返回 initial subscription snapshot，因此 unknown session 或 invalid cursor 仍可返回 JSON error。 |
| Turn 与 native execution operations | 不带 run ID 的 POST /turns 校验完整 turn request，并单独将 message text 限制为 8 KiB UTF-8；新 admission 返回 202，request-key retry 返回 200。GET /turns/:run 返回 metadata；GET /result 解析 history-backed result；POST /abort 要求空 object。Native-execution abort 也使用空 object POST。 |

JSON body 解析完成后，session operation 会清除五秒 socket deadline；已准入的 session/RPC work 有自己的 deadline。Body 和 header reading 仍有界。

Public GET 中，health 表示进程可响应；browser assets 来自固定的内存 map；status 仍要求 credential。Browser pairing 和 mutation 使用 [LocalAuth](authentication.md#browser-session-auth) 中说明的流程。Logout 和 revocation 会立即重新校验现有 event stream。

Server 将 header 限制为 8 KiB，并为 header、request 和 socket 设置五秒期限。它先绑定 127.0.0.1，再准备持久化 state。CreateServer 的 request callback 会把每个 handle promise 加入 active set，并在 fulfilled 或 rejected 后移除。这样 shutdown 能拒绝新请求、关闭 stream observer 和 socket、等待已准入的 handler、停止 sessions、排空 authentication writes 并释放 listener。Close 操作是幂等的。初始化失败时也走同一清理路径，避免失败启动后占用 port。

Headers 发出前的错误会变成 JSON envelope。AccessError 和 SessionError 保留 status 与 code；rate limit 会添加 Retry-After。SSE startup error 中，unauthenticated 映射为 401，其他启动失败映射为 503。未知异常使用通用 500 message。若 headers 已发出，handler 会 destroy response，因为此时不能安全切换协议或再写 JSON。

<a id="sse-frame-and-connection"></a>
## SSE framing、queue 与 response ownership

[SseStartError.constructor](../../../../../src/server/sse.ts#L11) 保留安全的 public startup code。[encodeFrame](../../../../../src/server/sse.ts#L30) 校验共享 StreamFrame，限制 event name 字符集，拒绝 cursor 中的换行或 NUL，然后写出 event、可选 id 和 JSON data 行。Event-frame 数据不会复制进共享 hub state。

[createSseConnection](../../../../../src/server/sse.ts#L48) 拥有一个 ServerResponse，并在 closures 中保存 queue、queued-byte count、started/blocked/closed/ending flags、subscription cleanup、timers 和任何 pre-start failure。256 KiB 上限同时计算 queued buffers 和 Node writableLength。发送 headers 前，invalid frame 或过大的初始 snapshot 会变成 SseStartError。开始 streaming 后，encoding error 和 overflow 只会 destroy 当前 response。

<a id="sse-lifecycle-and-overflow"></a>
### SSE callbacks 与 state transition

内部 cleanup group 各有不同职责。[detach](../../../../../src/server/sse.ts#L66) 移除 response listeners；[stopTimers](../../../../../src/server/sse.ts#L72) 清除 heartbeat 和 error-flush timer；[release](../../../../../src/server/sse.ts#L79) 只执行一次，清空 accounting、移除 listeners、unsubscribe，并隔离清理异常；[terminate](../../../../../src/server/sse.ts#L101) 先释放 ownership，再选择正常结束或 destroy。[authorized](../../../../../src/server/sse.ts#L119) 将 authorization exception 转为拒绝。[totalBufferedBytes](../../../../../src/server/sse.ts#L127) 汇总 response 和 queue 占用。[enqueueBuffer](../../../../../src/server/sse.ts#L130) 入队前检查共享上限，开始发送后再驱动 pump。

[pump](../../../../../src/server/sse.ts#L146) 在尚未 started、正受 backpressure 阻塞、已关闭或 startup 已失败时停止。每次 write 前都会重新校验 authorization。response.write 返回 false 时，writer 会进入 blocked 状态，直到收到 drain。嵌套的 [onDrain](../../../../../src/server/sse.ts#L171) 清除阻塞并继续 pump；[onCloseResponse](../../../../../src/server/sse.ts#L176) 在 client disconnect 后 release；[onErrorResponse](../../../../../src/server/sse.ts#L180) destroy 出错的 response。[heartbeatOnce](../../../../../src/server/sse.ts#L184) 重验授权后排入 comment frame；终止性 error flush 期间暂停 heartbeat。

返回的 [enqueue](../../../../../src/server/sse.ts#L198) 会校验并排入 frame。遇到 stream.error 时，它会停止后续 observation、unsubscribe，并最多尝试一秒刷新队列中的 error，之后才 destroy。返回的 [start](../../../../../src/server/sse.ts#L229) 安装 unsubscriber，在发送 headers 前校验并计算初始 snapshot 大小、确认当前授权，将 snapshot 放在 subscription 期间排队的 notification 之前，然后启动 heartbeat 或有期限的 error flush，并执行 pump。返回的 [revalidate](../../../../../src/server/sse.ts#L292) 在授权被撤销时立即终止 stream；[close](../../../../../src/server/sse.ts#L298) 只释放这个 observer，不会停止 Pi execution。

<a id="http-test-evidence"></a>
## Test evidence

[events-http.test.ts](../../../../../tests/events-http.test.ts#L421) 通过 loopback sockets 覆盖 route admission、snapshot 顺序、observer disconnect、expiry/revoke、cursor validation 和 slow-reader isolation。[access.test.ts](../../../../../tests/access.test.ts#L357) 与 [auth.test.ts](../../../../../tests/auth.test.ts#L75) 检验 authentication 变化如何重新校验已打开的 stream。测试使用本地 synthetic fixture，不访问 provider。
