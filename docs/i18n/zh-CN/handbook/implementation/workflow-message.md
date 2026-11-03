# 追踪 message：从提交到 saved result

[English](../../../../handbook/implementation/workflow-message.md) | 简体中文

[Implementation](README.md) · [Handbook](../README.md)

<a id="starting"></a>

## 起始状态与 browser decision

假设 authenticated browser 已选择一个 Dwell session，并准备普通 text 或有效 image drafts。`submit` 首先获取当前选中的 session；若没有选中 session、browser 尚未处理完上一次发送或停止请求，或该 session 正在切换 model，则直接返回。如果 Dwell request 或 extension 发起的 Pi work 正在执行，同一控件走对应 stop path，而不创建新 prompt。否则读取 text/images，检查 image readiness/capability，并形成可使用同一 identity retry 的 request。

如果 browser 因网络错误或无效 response 无法确认 Host 是否已接受 message，就保留该次提交的 request ID、text 和 images。等待确认期间，该 session 的输入框只读，附件不能修改，其他 sessions 也不能提交。Retry 使用保留的 request ID 和内容重发，让 Host 识别重复请求并返回已有 turn。

有效的 HTTP success response，或包含相同 session ID 与 request ID 的 SSE update，都可以确认请求已被接受；随后 browser 清除 pending submission、输入框 draft 和附件。收到 408 以外的 4xx rejection 时，browser 解除 pending 状态，保留 draft 供修改，再次提交时生成新的 request ID。401 则会让 browser 返回 pairing，并清理附件 drafts。提交的 text 保留原始空白。附件处理详见 [browser input](browser-input.md)。

Source / verification：[`submit`](../../../../../src/clients/web/client.ts#L1718) · [`navigation`](../../../../../src/clients/web/client.ts#L554) · [`stream`](../../../../../src/clients/web/client.ts#L1412) · [tests/web-client.test.ts](../../../../../tests/web-client.test.ts) · [tests/images-http.test.ts](../../../../../tests/images-http.test.ts)

<a id="admission"></a>

## HTTP admission 与 durable acceptance

HTTP 在调用 `SessionService.submitTurn` 前检查 authority、authentication 与有界 request body。HTTP handler 调用共用的 [`isTurnCreateRequest`](../../../../../src/shared/turns.ts#L85)，检查请求是否只包含必填的 `requestId`、`message` 和可选的 `images`。它验证 request ID 是否符合 UUID 格式，检查 message 长度及 slash-command 限制，并验证图片格式、数量和大小。请求必须包含非空白 text 或至少一张 image。Service 在 mutation queue 中再次验证，从原始 message 加 images 计算 payload identity，并查询该 session 的已有 request。Identity 一致返回原 turn，同一 request ID 对应不同 payload 则返回 request_conflict。

新工作必须通过 storage fault、active turn/native execution 和 Pi executable configuration 检查。Service 向 SQLite 插入 accepted turn，预留内存 active slot、publish state，并用 `setImmediate` 安排执行。HTTP 以 202 确认接受新 turn，以 200 返回已有的一致 request。Deduplication 位于 busy checks 之前，因此运行期间仍能找回已经接受的 request。

Source / verification：[`startHost`](../../../../../src/server/http.ts#L102) · [`SessionService.submitTurn`](../../../../../src/sessions/service.ts#L906) · [`turnPayloadIdentity`](../../../../../src/sessions/service.ts#L85) · [tests/turns.test.ts](../../../../../tests/turns.test.ts) · [tests/turns-http.test.ts](../../../../../tests/turns-http.test.ts)

<a id="dispatch"></a>

## 准备 history，再记录 dispatch intent

`#executeTurn` 再检查 accepted record 和 stopping state，经串行 mutation path 启动或恢复 Pi，验证应当存在的 history。带 images 时，在 dispatch 前查询 active model capability。有界 saved-history read 记录执行前 entry IDs 和 native-message occurrence counts，随后用它们区分旧内容与本次新保存的 work。

Catalog transaction 将 turn 设为 dispatching，并记录 history 从此应当存在。Durable intent 保存后，service 才开始 event projection、安装 passive Pi-record observer 并调用 `startRun`。真正 dispatch 前再次检查 cancellation/stopping。发送前的 database failure 会阻止 prompt 发送；记录 dispatch intent 后发生 crash 时，Pi 是否收到或执行 prompt 可能未知；recovery 保留这种不确定性。

长时间 model run 不被包在 database transaction 或全局 mutation queue 内。Per-session slot 仍阻止重叠 admission，而其他 session operations 可以继续。

Source / verification：[`SessionService.#executeTurn`](../../../../../src/sessions/service.ts#L1165) · [`SessionCatalog.markTurnDispatching`](../../../../../src/storage/catalog.ts#L845) · [tests/turn-recovery.test.ts](../../../../../tests/turn-recovery.test.ts) · [tests/history-cancellation.test.ts](../../../../../tests/history-cancellation.test.ts)

<a id="execution"></a>

## Acceptance、events 与 settlement

`PiProcess.startRun` 在写 prompt 前安装 run state，因为 Pi events 可能先于 RPC response 到达。返回的 accepted promise 将 prompt 分为 started 或 handled；settled promise 报告 lifecycle outcome。`PiRpc` 按 pending IDs 匹配 command responses；`PiProcess` 解释 Pi execution events 并通知 subscribers。

Started prompt 使 durable turn 进入 running。Handled prompt 可能被 extension 消费而不产生标准 assistant response；service 解除该 turn 的 event observer，并依据 saved evidence 完成 handled path。独立 extension follow-up 作为 native execution 观察，不被改称用户的 durable turn。Browser 也可能在 POST 返回前收到 updates，因此 submission、event 与 refresh paths 分别管理 in-flight 与 observed state；具体顺序见 browser controller 章节。

Source / verification：[`PiProcess.startRun`](../../../../../src/runtime/pi-process.ts#L578) · [`SessionService.#completeHandledTurn`](../../../../../src/sessions/service.ts#L1348) · [tests/runtime.test.ts](../../../../../tests/runtime.test.ts) · [tests/native-executions.test.ts](../../../../../tests/native-executions.test.ts)

<a id="results"></a>

## 保存 outcome 并定位 result content

Settlement 后，service 等待尚未完成的 abort attempt，记录 Pi history reference，再读取 saved history，选择 baseline 中不存在的 entry IDs。它提交 terminal outcome 和这些 IDs。Provider failure 使用 provider_error，successful/aborted work 记录对应 outcome。Finally 解除 observers、只释放匹配的 active slot、结束 event projection，并 publish final state。

`getTurn` 读取 durable status；`getTurnResult` 对 active turn 返回 turn_pending，再从 saved native history 解析 recorded entry IDs。Completed turn 没有 entries 时返回空结果。Source 或 referenced entry 缺失返回 result_unavailable；result 过大或过深时引导 caller 使用 paginated history。

Browser 通常将 paginated history 与 live projection 一起渲染。Native identities 证明内容已保存时逐项替换 live content，只有建立 saved coverage 才清除剩余 live data。[Observation workflow](workflow-observation.md) 解释为何 settlement 本身不够。

Source / verification：[`SessionService.#executeTurn`](../../../../../src/sessions/service.ts#L1165) · [`SessionService.getTurnResult`](../../../../../src/sessions/service.ts#L988) · [tests/turns.test.ts](../../../../../tests/turns.test.ts) · [tests/history-service.test.ts](../../../../../tests/history-service.test.ts)

<a id="failures"></a>

## 沿同一流程理解 interruption

| Interruption point | 可观察结果 |
| --- | --- |
| Admission 后 POST response 丢失 | 用同一 identity retry，可以找回原 turn，避免重复提交 |
| Dispatch 前取消 | 持久化 aborted，取消 queued history work，无需发送 prompt |
| 已知 prompt rejection | 将已知 rejection 记录为 failure |
| Dispatch 后 Pi process 或 RPC transport 丢失 | 记录 interruption/unknown outcome，停止 Pi process，不自动 replay |
| 无法写入 final bookkeeping | 标记 session storage fault，保留错误边界并停止不安全执行 |
| Completion 后 saved content 被移除 | Turn 可以仍为 completed，而 result/history 不可用 |

例如 tool 可能已经修改文件，随后 Pi 或 Dwell crash，留下 side effect 而没有 final reply。Request deduplication 防止同一 identity 的再次 admission；tool effects 发生在该 transaction 之外。

Source / verification：[`SessionService.abortTurn`](../../../../../src/sessions/service.ts#L1040) · [`SessionService.#storageFault`](../../../../../src/sessions/service.ts#L509) · [tests/turn-recovery.test.ts](../../../../../tests/turn-recovery.test.ts) · [tests/turns-http.test.ts](../../../../../tests/turns-http.test.ts)
