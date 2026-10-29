<a id="error-reference"></a>

# 错误参考

[English](../../../handbook/errors.md) | 简体中文

[手册索引](README.md) · [完整参考](reference.md)

错误码是与 HTTP 状态或 stream event 一同传递的普通字符串。各层定义自己的 code，有些名称会在不同层重复使用。

<a id="start-with-the-symptom"></a>

## 从症状入手

| 你看到的情况 | 通常表示什么 | 安全的下一步 |
| --- | --- | --- |
| 浏览器提示 storage 不可用（`storage`，状态 `0`）。 | 浏览器无法在 `localStorage` 中写入并验证本地 binding；尚未向 Host 发出请求。 | 为 Dwell origin 允许站点存储，然后重新加载。这是浏览器本地状态，与 Host catalog 分开。 |
| Host 返回 `401 unauthenticated` 或 `403 cli_required`。 | 浏览器 pairing 已过期或被撤销、缺少浏览器身份，或者调用了 CLI 专用路由但没有本地 CLI credential。 | 使用本地 pairing 流程重新连接浏览器。CLI 专用设置请使用本地 CLI，并确认目标是相同的 Dwell mode。不要把 CLI credential 粘贴到浏览器请求中。 |
| Pairing 返回 `invalid_pairing`、`rate_limited` 或 `pairing_limit`。 | 一次性 code 错误、过期、已使用，或已达到尝试次数/待处理 code 上限。 | 使用本地 CLI 创建新的 pairing code。被限速后等待返回的重试时间；pairing code 五分钟后过期。 |
| 重试后出现 `409 request_conflict`。 | 相同的 `requestId` 已绑定到不同的目录/model 或 message/images。 | 只有请求完全相同时才复用该 ID。不同操作使用新的 UUID。原操作会保留；不要据此推断它已回滚。 |
| turn 仍处于 active 状态（`409 session_busy` 或 `turn_pending`）。 | Dwell 正在保护已有 turn 或 native Pi execution 的 session，或者 turn 尚未结束。 | 检查 turn/session 状态并等待其结束，或明确 abort 对应的 run。不要只为绕过 busy 状态，就给相同工作换一个 ID 再提交。 |
| 请求返回 `429`，例如 `history_busy`、`subscriber_limit` 或 `model_discovery_busy`。 | 有界 read、event subscription 或 discovery slot 正被占用。 | 如果响应包含 `Retry-After`，按它等待；否则等当前操作结束后重试。当前 HTTP handler 对 `pairing_limit` 设置 300 秒，对其他 `429` 响应设置 60 秒。 |
| History 返回 `410 history_unavailable`。 | Dwell 预期此 session 有已保存的 Pi history，但无法读取记录的文件。 | 保留 session 和原有 Pi history。重新打开或重试前，确认相同的 session file 存在且可读。不要创建 replacement session 并把它当作旧对话。 |
| History 返回 `409 history_changed` 或 `400 invalid_cursor`。 | 有界 read 期间 saved file 发生变化、history cursor 已无效，或者 event cursor 格式错误或属于其他 session。过期、超前或旧 epoch 的 event cursor 会改为返回 resync 和 snapshot。 | 重新加载最新 history，或重连 event stream 以接收新的 snapshot。History page cursor 和 event cursor 是不同的值。 |
| History 返回 `409 invalid_history` 或 `413 history_limit`。 | 无法安全投影 native JSONL branch/records，或者 saved history 超过 reader 配置的限制。 | 保留 native file 并记下 session ID。使用下面列出的源码和测试诊断其形状/大小；先不要编辑或删除文件。 |
| turn 状态为 `interrupted` 且错误为 `outcome_unknown`，或 UI 提示无法确认是否已发送。 | Host 已持久化记录 turn 进入 `dispatching`，但无法确定 Pi 的最终结果。Prompt 可能已到达 Pi，也可能没有。Dwell 不会自动重放它。 | 先检查现有 turn 和 saved history。使用相同的 `requestId` 重试以取回保留的 turn；只有在核对旧操作后、并且确实要再执行一次时，才使用新 ID。 |
| turn 以 `execution_rejected` 或 `provider_error` 进入 `failed`。 | Pi 明确拒绝 prompt，或 Pi 将 execution 结束为失败。这些是 terminal turn outcomes，不是 HTTP error code。 | 阅读 turn 的 message 并检查 saved history。相同 `requestId` 的重试会取回同一条记录；有意发起新尝试时需要新 request ID。 |
| Session/model discovery 返回 `runtime_unavailable`、`runtime_mismatch` 或 `model_discovery_failed`。 | Pi 无法启动、未按要求恢复存储的 session/model，或返回不受支持的 discovery 输出。 | 检查本地配置的 Pi executable/version 和所选 model。诊断时保留 Dwell session 及其 native history。 |
| 出现 `503 storage_unavailable` 或带有该 code 的 `stream.error`。 | Dwell 无法持久化 session/turn/auth state。turn dispatch 之后会刻意阻止 replay，因为 execution 可能已经发生。 | 停止提交新工作。保留 catalog 和 session files；停止 Host 后检查 storage 是否可用，再诊断具体出错的文件或数据库操作。不要把删除 catalog 或轮换 credentials 当作通用修复手段。 |
| SSE 关闭、报告 decoder error，或通过 `resync` frame 重连。 | 浏览器收到了格式错误或过大的 stream data、连接已断开，或者服务器的有界 replay window 已不再包含该 cursor。 | 让 client 重连并接收新的 snapshot。`resync` 是恢复控制 frame，不代表 turn 失败。 |

<a id="how-an-error-reaches-the-caller"></a>

## 错误如何到达调用方

HTTP handler 将 `AccessError` 和 `SessionError` 转成 `{ "error": { "code", "message" } }` JSON，并使用异常携带的状态码。请求验证和访问检查位于[HTTP Host](../../../../src/server/http.ts)；session 操作位于 [SessionService](../../../../src/sessions/service.ts)。因此，即使相同的 `code` 也存进 turn，session error 仍有 HTTP 状态码。

浏览器的 [`ApiError`](../../../../src/clients/web/transport.ts) 会保留响应状态、code 和 message。如果无法读取兼容的 JSON error body，则会用返回状态合成 `http`。浏览器 storage failure 会在发出任何 fetch 之前合成状态为 `0` 的 `storage`。面向浏览器显示的文本通常直接取自服务器的 `message`，而不是另一套 UI error-code namespace。

SSE 还有两条错误路径。服务器端 stream 启动可以通过 [`SseStartError`](../../../../src/server/sse.ts) 返回 HTTP error。stream 开始后，`stream.error` 和 `projection.error` 是带有 `code` 与 `message` 的普通 event payload；它们没有 HTTP 状态码。浏览器的 [`SseDecodeError`](../../../../src/clients/web/events.ts) 属于本地 protocol validation，同样没有 HTTP 状态码。

Pi RPC 又有所不同。相关联的 Pi response 若包含 `success: false`，会转成 [`RpcCommandError`](../../../../src/runtime/pi-rpc.ts)，其中带有 command 和 Pi 的拒绝文本，而非 Dwell 的 status/code 对。Broken pipe、timeout、格式错误的 record 或关闭的 RPC connection 都是普通 `Error`；如果它们发生在 dispatch 之后，execution outcome 可能未知。service 会在 turn ledger 中记录这条边界，而不会自动重放 prompt。

<a id="http-error-envelope-catalog"></a>

## HTTP error envelope 目录

下列内容包括当前通过 HTTP JSON error envelope 发出的字面 code，以及两个 session 创建 outcome code。表中列出的是源码使用的 status。标注处的同一 code 可能对应多个 status/含义。

<a id="request-shape-routing-and-host-availability"></a>

### 请求形状、路由和 Host 可用性

| 错误码 | HTTP 状态 | 含义 |
| --- | ---: | --- |
| `aborted` | 400 | Host 读取请求 body 时，client 中断了请求。 |
| `body_too_large` | 413 | 请求 body 或 message 超过该路由的字节上限。 |
| `duplicate_header` | 400 | 某个安全敏感请求 header 出现多次。 |
| `invalid_input` | 400 | JSON body、identifier、model selection 或操作专属值未通过验证。 |
| `invalid_json` | 400 | Body 不是有效 JSON。 |
| `invalid_cursor` | 400 | History cursor 的解析、签名或边界检查失败，或者 event cursor 格式错误或跨 session。过期的 event cursor 通常触发 resync，而不是此 error。 |
| `method_not_allowed` | 405 | 路由存在，但要求使用其他 HTTP method；响应中会包含 `Allow`。 |
| `not_found` | 404 | 路由或请求的 saved image 不存在。更具体的 session/turn 查询会使用各自的 code。 |
| `unexpected_body` | 400 | 向 GET 发送了 body；对于要求空对象的 POST 操作，非空对象则返回 `invalid_input`。 |
| `unexpected_query` | 400 | 路由收到不支持的 query parameter，或 query 形状无效。 |
| `unsupported_encoding` | 415 | 不接受压缩后的 request body。 |
| `unsupported_media_type` | 415 | JSON 路由要求 `application/json`，可选 UTF-8 charset。 |
| `url_too_long` | 414 | Request target 超过 Host 的 URL 上限。 |
| `unavailable` | 503 | Host/session service 正在启动或停止。 |
| `internal_error` | 500 | 未分类 failure 到达 Host 边界；响应返回通用 message，不包含底层错误细节。 |

来源：[HTTP handler](../../../../src/server/http.ts)。此列表涵盖 handler 中的字面 JSON-envelope code；在请求可被服务之前发生的底层启动/配置异常，可能只是普通 Error。

<a id="access-and-pairing"></a>

### 访问控制和 pairing

| 错误码 | HTTP 状态 | 含义 |
| --- | ---: | --- |
| `forbidden_origin` | 403 | Origin/request marker 与打开 Dwell 时使用的浏览器 origin 不匹配。 |
| `forbidden_host` | 403 | 请求的 Host 既不是本地 listener，也不是配置的浏览器 origin。 |
| `forbidden_proxy` | 403 | 携带 proxy-forwarded headers 的请求尝试使用本地 listener 的 Host lane。 |
| `local_credential_required` | 403 | CLI credential 经安全浏览器 origin lane 发送；CLI credential 应用于本地地址。 |
| `cli_required` | 403 | 此操作明确限定使用本地 CLI credential。 |
| `unauthenticated` | 401 | 此路由没有有效的 browser session 或本地 CLI credential。 |
| `invalid_pairing` | 401 | 一次性 pairing code 无效、过期或已兑换。 |
| `pairing_limit` | 429 | 待处理 pairing code 过多；handler 的 `Retry-After` 为 300 秒。 |
| `rate_limited` | 429 | pairing 尝试过多；handler 的 `Retry-After` 为 60 秒。 |
| `session_limit` | auth 中为 429 | 已达到 browser-session 上限；这与下文的 Dwell open-session 上限不同。 |
| `storage_unavailable` | 503 | 无法读取或保存 authentication state。 |

来源：[request access](../../../../src/server/access.ts)、[pairing 和 browser-session state](../../../../src/server/auth.ts)、[HTTP boundary](../../../../src/server/http.ts)。Pairing code 是一次性 credential，不是诊断 error code。

<a id="session-turn-history-and-discovery-operations"></a>

### Session、turn、history 和 discovery 操作

这些 error 由 `SessionService` 或其委托的 history/discovery reader 引发，然后由 HTTP Host 以相同 status 和 code 返回。下文所说的“stored turn error”指 `TurnInfo.error` 字段；它不是 HTTP status。

| 错误码 | HTTP 状态 | 含义 |
| --- | ---: | --- |
| `directory_changed` | 409 | 保存的 project path 现在解析到了不同的 canonical directory。 |
| `directory_unavailable` | 403 或 500 | 所选目录不可读，或 directory browser 本身发生 failure。 |
| `discovery_cleanup_failed` | 503 | 无法清理临时隔离的 model-discovery state 或其 Pi process。 |
| `history_busy` | 429 | 有界 saved-history read queue 已满。 |
| `history_changed` | 409 | 读取期间 native history file 发生变化。 |
| `history_limit` | 413 | Saved history 超过 record、byte、depth 或 branch 限制。 |
| `history_unavailable` | 410 | 预期的 native history file 无法读取或已不可用。 |
| `home_directory_unavailable` | 503 | Dwell 无法确定 discovery 所需的 Host home directory。 |
| `invalid_catalog` | 500 | Catalog record 包含无效 identity 或 path。 |
| `invalid_cursor` | 400 | History pagination 或 event subscription 提供了无效 cursor。 |
| `invalid_directory` | 400 | 所选 project path 不是已存在的绝对目录。 |
| `invalid_history` | 409 | Saved JSONL/branch identity 无效、不一致，或被多个文件认领。 |
| `invalid_model` | 400 | Model-capabilities discovery request 中的 provider/model pair 无效。 |
| `invalid_runtime` | 400 | 配置的 Pi executable/entry point 无效。 |
| `model_capabilities_failed` | 503 | Isolated Pi model-capability discovery 失败或未返回可用结果。 |
| `model_catalog_too_large` | 413 | Pi 可用 model 列表超过配置的数量上限。 |
| `model_config_too_large` | 413 | 本地 Pi model 配置超过 discovery 输入上限。 |
| `model_discovery_busy` | 429 | 两个 model-capability discovery slot 都已被占用。 |
| `model_discovery_failed` | 502 或 503 | Pi 无法提供受支持的 model 列表。已打开 session 中列举 model 时使用 `502`；顶层 discovery failure 使用 `503`。 |
| `model_not_found` | 404 | 请求的 model 在此已打开 session 中不可用。 |
| `model_unavailable` | 400 | Pi 未选择请求的 model；service 会安全关闭该 runtime。 |
| `model_change_failed` | 503 | Pi 未确认 model change；runtime 会安全关闭。 |
| `native_abort_failed` | 503 | Pi 无法可靠确认 native execution 已停止。 |
| `native_execution_stale` | 409 | 此 execution ID 已不再指向当前/运行中的 native execution。 |
| `request_conflict` | 409 | `requestId` 被用于不同的创建设置或 turn content。 |
| `result_limit` | 413 | 完整的 saved turn result 对单个响应来说过大或过深；请使用分页 history。 |
| `result_unavailable` | 410 | 无法读取 turn result 或其某个记录的 history entry。 |
| `runtime_busy` | 409 | session 处于 open 状态时不能修改 Pi runtime 配置。 |
| `runtime_mismatch` | 503 | Pi 未恢复或保留预期的 session/model state。 |
| `runtime_unavailable` | 503 | Pi 未配置、无法启动，或当前操作无法使用 Pi。 |
| `session_busy` | 409 | 存在 active turn/native execution，或 runtime 未处于此操作所需的 idle 状态。 |
| `session_changed` | 409 | 读取 model data 期间 runtime/session 发生变化。 |
| `session_interrupted` | 409 | Session creation 被中断；响应包含其 Dwell session ID。 |
| `session_limit` | sessions 中为 409 | 已达到八个 open Dwell sessions 的上限。先关闭一个 idle session。 |
| `session_not_found` | 404 | 未知的 Dwell session ID。 |
| `session_not_open` | 409 | 读取或修改 session 专属 model list 前，先 open 该 session。 |
| `session_not_ready` | 409 | Session 未处于 model change 所要求的 ready 状态。 |
| `session_start_failed` | 503 | Session creation 失败；响应包含用于检查的、仍被保留的 Dwell session ID。 |
| `shutting_down` | 503 | Dwell shutdown 期间正在排空 session operations。 |
| `storage_unavailable` | 503 | 无法保存 durable catalog/turn/session metadata。不会自动 replay 工作。 |
| `stream_overloaded` | 503 | 初始 SSE snapshot 会超过 response buffer 上限。 |
| `stream_unavailable` | 503 | Session stream 设置失败或超出容量。 |
| `subscriber_limit` | 429 | 已达到每个 session 的 event subscriber 上限。 |
| `turn_interrupted` | 409 | Turn 已没有 live execution owner；检查其 terminal record/history。 |
| `turn_not_found` | 404 | 此 Dwell session 中没有该 run ID。 |
| `turn_pending` | 409 | Turn result 尚未结束。 |
| `unsupported_image_model` | 400 | 所选 model 不接受 image input。 |
| `unsupported_pi_version` | 503 | 配置的 Pi version 未提供 Dwell 所需的 discovery interface。 |

来源：[session operations 和 API mapping](../../../../src/sessions/service.ts)、[native JSONL read errors](../../../../src/runtime/pi-history.ts)、[history-page cursor/branch checks](../../../../src/sessions/history.ts)、[directory 和 model discovery](../../../../src/server/session-discovery.ts)、[SSE startup errors](../../../../src/server/sse.ts)。Code 和 status 定义在各 error constructor 中；具体 message 可能因 failure site 不同而变化。

<a id="non-http-error-codes-and-outcomes"></a>

## 非 HTTP 错误码和结果

<a id="durable-turn-errors"></a>

### Durable turn 错误

Turn ledger 的 `error` 类型为 `{ code, message } | null`；`TurnStatus` 是另一个独立字段。Schema 接受任意非空 code 和 message，而不是固定 code union，因为 session error 也可能被保留在 failed turn 上。

| Stored code | 通常的 turn status | 含义 |
| --- | --- | --- |
| `not_dispatched` | `interrupted` | Recovery 发现 turn 仍处于 `accepted`；prompt 发送前 Host 已 shutdown/restart。 |
| `outcome_unknown` | `interrupted` | Dwell 已持久化将 turn 标为 `dispatching`，但 Host 无法确定最终结果；prompt 可能已到达 Pi，也可能没有。 |
| `execution_rejected` | `failed` | Pi 对 `prompt` command 返回了相关联的否定响应。 |
| `provider_error` | `failed` | Pi 以 failed outcome 和 error message 结束了 run。 |
| 其他 service code | 取决于 failure point | Service finalize turn 时可能记录 `SessionError`。应同时读取 code 和 status；不要把 stored code 当作 HTTP response 解读。 |

Turn recovery 区分 `accepted` 与 `dispatching`：`accepted` turn 尚未进入发送步骤；若 shutdown 与 RPC call 发生竞态，`dispatching` turn 的结果仍属未知。只有 accepted turns 会变为 `not_dispatched`；结果不确定时不会自动 replay。来源：[turn dispatch 和 finalization](../../../../src/sessions/service.ts)、[启动时的 interruption transaction](../../../../src/storage/catalog.ts)、[turn contract](../../../../src/shared/turns.ts)。

<a id="stream-and-browser-local-codes"></a>

### Stream 和浏览器本地错误码

| Code family | Codes | 含义和恢复方式 |
| --- | --- | --- |
| Server `stream.error` event payload | `state_unavailable`、`storage_unavailable` | SSE response 开始后，这些 code 没有 HTTP status。`state_unavailable` 表示无法同步 session snapshot；重连以获取新的 snapshot。`storage_unavailable` 表示 durable write failure。 |
| SSE startup error | `unauthenticated`、`stream_unavailable`、`stream_overloaded` | 这些是 stream 启动前引发的 `SseStartError` code。HTTP Host 将 `unauthenticated` 映射为 401，另外两个映射为 503。 |
| Pi live-event projection | `invalid_pi_event` | Event 的形状/content 无法投影到 live view。这不表示 saved native history 损坏，也不表示 Pi execution 失败。 |
| Browser SSE decoder | `frame_too_large`、`malformed_sse`、`invalid_json`、`invalid_frame`、`event_mismatch`、`id_mismatch` | 浏览器拒绝了 stream framing、JSON、frame schema、event name 或 cursor ID。这些是本地 `SseDecodeError` 值，不是 Host response code。应重连/resync，不要把它们当作 turn result。 |
| Browser API wrapper | `storage`、`http` | `storage` 是本地 browser-binding storage failure，状态为 `0`；若 response body 不含兼容的 `{error:{code,message}}` envelope，则使用 `http` 作为 fallback。普通 server codes 会原样传递。 |
| Resync reason | `cursor_stale`、`cursor_ahead`、`epoch_changed`、`replay_limit` | Server 无法从提供的 cursor 继续 event replay，于是发送新的 snapshot。这些是 `resync` frame 上的控制原因，不是 error code。 |

来源：[event projection 和 stream errors](../../../../src/sessions/events.ts)、[server SSE transport](../../../../src/server/sse.ts)、[browser SSE decoder](../../../../src/clients/web/events.ts)、[browser API wrapper](../../../../src/clients/web/transport.ts)。

Pi RPC transport errors，例如 `Pi RPC connection closed`、`Pi RPC record exceeds 8 MiB` 或 RPC timeout，都是普通 JavaScript errors，不是稳定的 code 值。Command rejection 则不同：`RpcCommandError.command` 标识 Pi RPC command，`.rejection` 包含 Pi 返回的文本。参见 [Pi RPC](../../../../src/runtime/pi-rpc.ts) 和 [Pi process lifecycle](../../../../src/runtime/pi-process.ts)。

<a id="test-map"></a>

## 测试索引

| 范围 | 覆盖当前 failure boundary 的测试 |
| --- | --- |
| Host routing、access errors、auth 和 pairing | [access](../../../../tests/access.test.ts)、[auth](../../../../tests/auth.test.ts)、[host](../../../../tests/host.test.ts) |
| Session 和 turn HTTP envelopes | [sessions HTTP](../../../../tests/sessions-http.test.ts)、[turns HTTP](../../../../tests/turns-http.test.ts)、[images HTTP](../../../../tests/images-http.test.ts) |
| Saved history、cursor 和 cancellation errors | [history HTTP](../../../../tests/history-http.test.ts)、[history service](../../../../tests/history-service.test.ts)、[Pi history](../../../../tests/pi-history.test.ts)、[history cancellation](../../../../tests/history-cancellation.test.ts)、[history budget](../../../../tests/pi-history-budget.test.ts) |
| SSE replay、overload 和 browser decoding | [server event HTTP](../../../../tests/events-http.test.ts)、[session events](../../../../tests/session-events.test.ts)、[event hub](../../../../tests/events.test.ts)、[browser SSE](../../../../tests/web-events.test.ts) |
| Pi RPC 和 runtime failure | [runtime failure](../../../../tests/runtime-failure.test.ts)、[runtime](../../../../tests/runtime.test.ts) |
| Durable turn results 和 restart recovery | [turns](../../../../tests/turns.test.ts)、[turn catalog](../../../../tests/turn-catalog.test.ts)、[turn recovery](../../../../tests/turn-recovery.test.ts) |
| 浏览器处理 Host errors 和 retry states | [web client](../../../../tests/web-client.test.ts) |

类型清单和 endpoint schema 见[共享契约](contracts.md)。详细 dispatch/recovery algorithm 见[sessions 和 storage](sessions-storage.md)；路由和 access checks 见[HTTP 和 authentication](http-auth.md)。
