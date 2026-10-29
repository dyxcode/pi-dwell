<a id="session-service-implementation"></a>

# Session service

[English](../../../../handbook/implementation/sessions.md) | 简体中文

[实现文档索引](README.md) · [Session 概览](../sessions-storage.md) · [系统流程](../system.md)

`SessionService` 是 host 侧协调器，负责持久化 Dwell identity、每个打开 session 对应的 Pi process、saved history 读取、durable turn、native Pi execution 和 event 发布。它不拥有 Pi conversation transcript：catalog 保存 session metadata 与 turn outcome；Pi native session file 才是对话内容的权威来源。当前实现的 API 仍然是 session、turn 和 native execution；Thread / Run / Schedule 仍是单独的设计方向。

<a id="session-identity-and-recovery"></a>

## Identity、启动与恢复

[`SessionError`](../../../../../src/sessions/service.ts#L55) 携带 HTTP status、稳定的 error code 和 message。[`SessionService.constructor`、`SessionService.create` 与 `SessionService.runtimeCount`](../../../../../src/sessions/service.ts#L231) 建立 service。`create` 先准备 private data directory 并打开 `SessionCatalog`，然后验证全部已存 session/turn，再把遗留的 `creating` session 和 nonterminal turn 标记为 interrupted。如果验证或 reconciliation 失败，它会先关闭 catalog 再抛出错误。`runtimeCount` 统计当前存活的 child-process 对象，不是 catalog 中的 session 数量。

模块级 helper 定义了 identity 与 view 规则：

| Declaration | 行为 |
| --- | --- |
| [`turnPayloadIdentity`](../../../../../src/sessions/service.ts#L81) | 没有图片时对 message text 计算 SHA-256；有图片时对带版本的对象进行 hash，并按顺序包含 text、image type、MIME type 和数据。相同 request key 但 attachment 不同会得到不同 identity。 |
| [`validateStored`](../../../../../src/sessions/service.ts#L93) | 将无效的 Dwell/request/Pi session ID，或非 absolute 的 directory/session-file path 视为 catalog 损坏。 |
| [`isMessageAfterBaseline`](../../../../../src/sessions/service.ts#L147) | 解析 `digest:occurrence`，只接受小写 SHA-256 digest、安全整数 occurrence，且 occurrence 必须大于保存的计数。 |
| [`messageKeysAfterBaseline`](../../../../../src/sessions/service.ts#L159) | 计算 baseline 之后的 saved assistant-message identity。超过 1,024 个时返回 `undefined`，让后续 coverage 判断 fail closed。 |
| [`messageKeyDelta`](../../../../../src/sessions/service.ts#L169) | 将 digest 计数差展开为 occurrence key；计数倒退或结果超过 1,024 个时返回 `undefined`，不猜测 identity。 |
| [`turnView`](../../../../../src/sessions/service.ts#L183) | 从存储的 turn 中移除私有 payload digest，再暴露为 `TurnInfo`。 |
| [`active`](../../../../../src/sessions/service.ts#L188) | 将 `accepted`、`dispatching`、`running` 定义为 nonterminal turn status。 |
| [`truncateUtf8`](../../../../../src/sessions/service.ts#L192) | 按 Unicode code point 截断字符串，并限制 UTF-8 字节数，用于 native execution error 文本。 |

`SessionService.constructor` 会复制传入 environment（或 host environment）、extension paths、clock 和内部 checkpoint callback。不同 map 分别跟踪 runtime、observer、history identity、native execution、合并中的 native-state refresh、active turn 和 storage-faulted session；catalog 保存持久状态，这些 process-local map 跟踪当前 runtime 与协调信息。[`configure`](../../../../../src/sessions/service.ts#L259) 通过 mutation queue 串行执行；只要还有 runtime 或 turn，就拒绝更改。它验证绝对 Pi 配置路径，将验证失败转换为 `invalid_runtime`，随后保存确认过的路径。

[`#configuration`、`#admit`、`#mutate` 和 `#read`](../../../../../src/sessions/service.ts#L1446) 定义 admission 与 concurrency 边界。`#admit` 在 shutdown 开始后拒绝新操作。`#mutate` 将 mutation 接入一个 promise queue，并在成功或失败后都重置 queue tail，因此失败的 mutation 不会阻塞后续操作。`#read` 最多允许两个 service-level history/result read，跟踪它们供 shutdown drain，将 `HistoryReadError` 映射为 `SessionError`，并转换 shutdown 引发的 `AbortError`。底层 native-history scanner 另有 process-wide 两个 active、八个 waiter 的限制，见 [History](history.md#history-scan-budget)。

<a id="sessions-discovery-and-observation"></a>

## Directory、model discovery 与 event subscription

[`listSessions` 和 `getSession`](../../../../../src/sessions/service.ts#L282) 同步检查 admission，再通过 `#view` 转换 catalog rows。[`listDirectories`](../../../../../src/sessions/service.ts#L292) 在未传 path 时使用 host home directory（`HOME`；Windows 使用 `USERPROFILE`）。如果无法确定 home，会返回 `home_directory_unavailable`。Discovery error 保留其 public status/code；其他 filesystem error 原样抛出。

[`listAvailableModels`](../../../../../src/sessions/service.ts#L315) 要求 Pi runtime 已配置，并把并发 global discovery 合并到同一个 promise。该 promise 只在 discovery 执行期间共享，并会在成功或失败后清除。[`listSessionModels`](../../../../../src/sessions/service.ts#L340) 要求 session 已存、没有 storage fault，且 runtime 为 ready/running。它按 runtime 对象合并读取，并在返回前确认同一个 runtime 仍然打开。Pi 或解析失败会转换为 `model_discovery_failed`。[`getSessionModelCapabilities`](../../../../../src/sessions/service.ts#L383) 校验 provider/model request，并要求 active session registry 中存在完全匹配项；返回值仅含 provider、model ID、image support 和 thinking levels。[`getModelCapabilities`](../../../../../src/sessions/service.ts#L403) 执行 isolated global discovery，按 provider/model 合并相同请求，并且最多允许两个不同检查同时执行；额外的 distinct request 会得到 `model_discovery_busy`。

[`subscribeEvents`](../../../../../src/sessions/service.ts#L442) 先从 durable state 构造当前 session view 及 current/latest turn projection，再向 `SessionEvents.connect` 注册 listener。它将无效 cursor、每个 session 或全局 subscriber 超限、stream capacity 不足分别映射为 `invalid_cursor`、`subscriber_limit` 和 `stream_unavailable`。[`#publishState`](../../../../../src/sessions/service.ts#L473) 发布 session-only 或 session-plus-turn view。Event projection 是状态变更之后的 observation；如果失败，会发出受限的 `state_unavailable` stream error，不会撤销已经保存的 mutation。[`#storageFault`](../../../../../src/sessions/service.ts#L496) 在进程内标记一次 session storage fault，并向 stream 发出 `storage_unavailable`；修复存储并重启 host 之前，后续 durable turn 操作都会拒绝。

<a id="sessions-create-open-close"></a>

## Create、open、close 与 model selection

[`createSession`](../../../../../src/sessions/service.ts#L506) 在 mutation queue 内执行。它先校验 request UUID、absolute directory，以及 provider/model 是否同时提供，然后 hash 原始 request payload。它在访问目录之前按 request key 查询，因此即使原目录后来消失，重试仍可识别原请求；同一个 key 对应不同 payload 会得到 `request_conflict`。新请求会先验证配置、由 `#directory` 规范化目录、prune 已退出的 child、检查八个 open runtime 的上限，再插入 `creating` row，最后才启动 Pi。成功返回 `ready`；启动异常会被记录为 `failed` 并返回 session view。启动前的 durable insert 让恢复逻辑能够区分“创建中断”和“根本没有记录”。

[`openSession`](../../../../../src/sessions/service.ts#L694) 将 `#open` 放进 mutation queue。`#open` 复用 ready runtime，拒绝 running runtime，prune 已退出的 child，检查容量和配置，并确认保存的目录仍解析到相同 canonical path。如果系统已记录 history 应存在但文件缺失，它会保存 history-unavailable error，并拒绝启动一个空白 Pi transcript。否则它先捕获完整 history identity baseline，再使用已验证的 resume file 或存储的 Pi session ID 启动 Pi；只有新建 transcript 时才向 Pi 提供保存的 provider/model。随后验证 Pi 返回的 session identity、model 和 session file。重开已有 transcript 时，以 Pi native model/thinking 状态为准；新 transcript 则可在没有 native execution 正在运行时恢复已保存的 thinking level。所有检查通过后才保存 `ready` metadata。Pi 启动后的 mismatch 或 catalog 写入失败都会停止 Pi、注销 observer 并从 runtime map 移除该进程。

[`setSessionModel`](../../../../../src/sessions/service.ts#L587) 只接受有效 request，且 session 必须 `ready` 并空闲。如果 provider/model 已相同且没有请求不同的 thinking level，则直接 no-op。否则它打开或复用 Pi，先检查 session state；只有目标 model 不同才调用 `set_model`，可选调用 `set_thinking_level`，再读取 state 确认 session 和 model。持久化确认后的 provider/model/thinking 值后才返回。Pi 对 `set_model` 返回明确的 model 不存在或缺少 API key rejection 时，映射为 `model_unavailable`；其他未确认结果会停止 runtime 并返回 `model_change_failed`。如果 Pi 已改变 model 但 catalog 保存失败，也会停止 Pi，避免运行一个未记录的选择。

[`closeSession`](../../../../../src/sessions/service.ts#L698) 遇到 active Dwell turn 或 Pi run 时拒绝关闭。停止 runtime 前先保存 Pi session-file pointer 和 history expectation；如果 native execution 已结束且有 baseline，还会刷新 history coverage。之后停止 Pi、detach listeners、删除 runtime mapping 并返回 durable session view。[`getContext`](../../../../../src/sessions/service.ts#L729) 打开 session、请求 Pi 当前 model context messages、刷新 saved-history metadata，然后返回这些 messages。它们表示 Pi 当前的 working context；saved branch 由 `getHistory` 读取。

[`#directory`](../../../../../src/sessions/service.ts#L1553) 要求目录为 absolute、存在且实际为 directory，并返回 `realpath`；失败或非目录路径统一为 `invalid_directory`。[`#prune`](../../../../../src/sessions/service.ts#L1569) 停止已经 `failed` 或 `exited` 的 runtime、detach observers、释放 map 中的 runtime，并发布新 view。[`#view`](../../../../../src/sessions/service.ts#L1514) 先校验 stored record，再将持久化状态与 live runtime state 映射为 public `SessionInfo`：starting/stopping 对应 opening/closing，ready/running 对应 ready，failed runtime 保持 `failed`，缺失或退出的 runtime 对应 `closed`。它根据 durable expectation/error 推导 history state，将 storage-fault detail 替换为稳定的修复提示，并添加 native execution 与 active/latest turn ID。[`#stored`](../../../../../src/sessions/service.ts#L1506) 验证 Dwell session ID、存在性和存储 identity；[`#storedTurn`](../../../../../src/sessions/service.ts#L1093) 对 run ID 及所属 session 做相同检查。

[`#rememberHistory`](../../../../../src/sessions/service.ts#L2020) 遇到 failed/exited runtime 时直接跳过；否则先读取 Pi 当前 state，将 session-file path 与 catalog 最新记录合并，再通过 `#history` 验证文件。它随后保存最新 file pointer；一旦 history 曾经存在，`historyExpected` 会保持为 true。若原本预期的 history 消失，则记录 unavailable-history message。只有保存成功后才 publish。Catalog 写入失败会标记 session storage fault 并返回 `storage_unavailable`，因此 close/context 操作不会误示 metadata 已安全保留。

<a id="sessions-history-results"></a>

## Saved history、image 与 turn result

[`getHistory`](../../../../../src/sessions/service.ts#L741) 通过有界的 read lane 执行。Pi 文件缺失时，如果 active turn 尚未 materialize history，可以返回 `pending`；否则，当 session 记录 `historyExpected` 时返回 `history_unavailable`。没有 history 的 session 不接受 cursor。Empty response 也包含 active/latest turn ID 和空的 context projection。文件存在时，service 标记 active turn 的 history 已 materialize，再将 session、Pi identity、directory、cursor 和 shutdown signal 传给 `HistoryPages.read`。

这个 page 也是 reconciliation live output 与 saved content 的证据。只有 storage healthy、latest turn 已 terminal、有 saved entry ID，且所有 ID 都在当前 saved branch 中时，durable turn 才算 covered。Native execution coverage 则要求文件完整、identity baseline 已知、diff 不超过上限且非空；只有所有预期 identity 均出现在当前 branch，且 settled leaf 仍在该 branch 上，才报告 coverage。若 observer 仍 active 且读取完整，service 会更新下一次 native run 使用的 identity baseline。响应返回 entries、native revision/leaf、context source、截断状态、turn ID，以及已证明的 coverage ID。

[`getHistoryImage`](../../../../../src/sessions/service.ts#L857) 通过已经验证的 saved file、branch entry ID 和 entry 内 image index 定位图片。如果 history 预期存在但文件缺失，会报 `history_unavailable`；如果从未记录 history，或图片不在 active branch 上，则结果为 `null`。[`getTurnResult`](../../../../../src/sessions/service.ts#L964) 只接受已 settled turn。Completed turn 没有 saved entries 时返回空结果；其他无内容或缺失内容的情况返回 `result_unavailable`。它在 history budget 下重读 native JSONL，按已保存的 entry ID 精确选取记录，并在 ID 缺失时失败。JSON serialization 深度超限或结果超过 8 MiB 时返回 `result_limit`，提示客户端改读分页 history。

History 文件边界由 [`#history`](../../../../../src/sessions/service.ts#L1580) 执行：如果 session 尚未记录 history 存在，它只会在 Dwell 所属 session directory 中查找与 Pi session ID 匹配的文件名；多个匹配项会被拒绝。它解析文件与父目录的 realpath，阻止文件逃逸所属目录，使用 no-follow/nonblocking flags 打开，要求 regular file，并根据 session ID、working directory 验证 Pi v3 header。文件缺失返回 `undefined`；错误或属于其他项目的文件变为 `invalid_history`。[`#savedHistory`](../../../../../src/sessions/service.ts#L1638) 会更严格地将“已预期但缺失”转换为 `history_unavailable`，然后使用可选 abort 参数调用受限 JSONL reader。[`#identityForEntries`、`#identityForHistory` 和 `#captureHistoryIdentity`](../../../../../src/sessions/service.ts#L1657) 区分完整且已知的 baseline（包括已知为空）与不完整/无法读取的 baseline。调用者主动 abort 时会向上传递；普通 baseline 读取失败会产生 unknown identity，并让 live content 保持可见。

<a id="sessions-turn-state-machine"></a>

## Durable turn admission 与 dispatch

[`submitTurn`](../../../../../src/sessions/service.ts#L882) 先校验 session、request shape 和 images，再计算 payload hash。同一个 `(sessionId, requestId)` 且内容相同的重试返回原 `TurnInfo` 与 `created: false`；内容不同则 conflict。若 storage fault、local/catalog turn active、Pi 正在执行 native work，或 Pi 未配置，则拒绝新工作。Service 先插入 `accepted` turn，再清除当前 session 的 native live-execution projection（旧 run 仍留在 Pi saved history），安装 `ActiveTurn` slot、发布 view，最后用 `setImmediate` 调度 `#executeTurn`。HTTP acknowledgment 确认 durable admission；Pi 的最终 outcome 会单独记录。

`#executeTurn` 是核心 state transition。它先调用可选的内部 `accepted` checkpoint，重读 turn 和 storage 状态，并在 dispatch 前遇到 shutdown 时记录为 `aborted`。它将 host shutdown signal 与 turn 的 history-cancel signal 合并，通过串行 mutation queue 打开 Pi，确认之前已预期的 native history 仍可读取。当前 Pi model 不支持图片时拒绝 image input。发送 prompt 之前，它保存所有已见 Pi entry ID 与 assistant-message identity 计数，作为稳定 baseline。

Dispatch 顺序具有明确的持久化边界：先在一个事务里将 turn 设为 `dispatching` 并将 session 设为 `historyExpected: true`；然后发布 view 并执行 `dispatching` checkpoint；重读 turn/storage；响应 cancellation 或 shutdown；启动 live event projection；以 passive observer 订阅 Pi；调用 `PiProcess.startRun`；标记 slot 已 dispatched；最后等待 prompt acceptance。若 Pi 返回 `handled`，service 会 detach turn observer，因为 extension 后续工作由 native execution 记录。若返回 `started`，先持久化 `running` 并执行 running checkpoint。Settlement 后等待可能存在的共享 abort；cancellation 结果不确定时不伪装成功。Extension-handled input 交给 `#completeHandledTurn`；普通执行则刷新 history、记录 admission 后新出现的 Pi entry ID，并保存 Pi outcome。只有 failed outcome 会写入 provider error。

遇到异常时，只有“shutdown 发生在 dispatch 前”会记为 `aborted`。已关联的 `prompt` command rejection 是确定的拒绝，记录为 `failed`；dispatch 后的其他错误记录为 `interrupted`，其余失败记录为 `failed`。无论状态如何，`SessionError` 都保留自己的稳定 code 和 message。只有其他错误才使用 fallback code：dispatch 后且没有明确 prompt rejection 时使用 `outcome_unknown`；dispatch 前或明确 prompt rejection 时使用 `execution_rejected`。dispatch 后的 fallback 表示外部副作用可能已经发生。如果无法持久化 outcome，则标记 `#storageFault`。已经 dispatched 或 storage-faulted 的 runtime 会停止。`finally` 会清除“首次 turn 尚未 dispatch 且没有 history”的推测性 `historyExpected`；等待 outstanding abort；只删除仍然是当前 slot 的记录；结束 live turn projection 并发布 durable state。系统不会自动重放 prompt。

[`#completeHandledTurn`](../../../../../src/sessions/service.ts#L1326) 处理 extension 消费 input、但没有普通 model turn 的情况。它校验 Pi session identity，读取 session file、当前 model/thinking 和现有 history，只记录相对 admission 新增的 entry。它先保存 session metadata，再将 turn 标记为 completed；保存失败会触发 storage fault，不能报告一个未记录的完成结果。[`getTurn`](../../../../../src/sessions/service.ts#L958) 在检查 admission/storage 后返回 public stored turn；调用方通过 `turnView` 隐去私有 identity。

<a id="sessions-cancellation-and-native-execution"></a>

## Cancellation 与 native Pi execution

[`abortTurn`](../../../../../src/sessions/service.ts#L1014) 校验 run；若 turn 已 terminal 则原样返回。对于 nonterminal turn，必须存在相同 run ID 的内存 execution slot。它先持久化 cancellation intent：尚未 dispatch 的 turn 立即变成 `aborted`；已 dispatch 的 turn 保持当前 status，等待 Pi settle。已 dispatch 时调用 `#abortRuntime`；否则取消 history preparation。如果保存 cancellation 失败，service 标记 storage fault 并停止所属 runtime，避免不可靠的 cancel endpoint 把工作遗留在后台。[`#abortRuntime`](../../../../../src/sessions/service.ts#L1124) 为一个 slot 合并重复 abort；abort command 失败时设置 `abortFailed` 并 stop Pi。由于 shutdown 可能不 await 这个 promise，它会立刻附上 rejection observer。

[`abortNativeExecution`](../../../../../src/sessions/service.ts#L1049) 只针对当前 native execution ID。无效或 stale/non-running ID 会被拒绝；session ID 本身不能选中 Dwell turn。Service 确认 runtime 报告相同 native execution，复用正在执行的 abort promise；Pi abort request 失败时升级为进程 stop。如果两种方式都失败，返回 `native_abort_failed`。

[`#observeRuntime`](../../../../../src/sessions/service.ts#L1686) 注册三条 observer lane：state change 发布 session state；native-execution notice 更新 ephemeral native record（如果 attach 时已经在运行，则标记为 file-baseline-only）；passive Pi record 仅在 Pi 当前报告 native execution 时进入 live projection。Disposer 会移除全部 listener；如果 runtime 仍属于该 session，则释放它的 history identity；settled native run 若仍需要 baseline，则阻止 coverage 并清除 baseline。Observer 不拥有也不会停止 Pi。

[`#nativeExecutionEvent`](../../../../../src/sessions/service.ts#L1720) 处理 start 与 settlement。相同 ID 的重复 running start 会忽略。新 record 会复制已知 history identity，开启独立 native event projection 并发布状态。如果 Dwell live counts 可用，会优先于过期文件 baseline；baseline unknown/ambiguous 时会阻断 coverage。Settlement 会记录 Pi outcome，并将 error 限制在 2,048 字节；随后结束 live projection。只有 live identity 完整且没有 unidentified assistant message 时，才从 baseline 计算 expected keys。它更新已知 message counts、排队验证 saved history，并请求刷新 Pi state。这些 native execution 是 process-local observation，不是 turn-ledger row。

[`#refreshNativeHistory`](../../../../../src/sessions/service.ts#L1806) 使用 shutdown-aware queue 读取 saved history，仅在相同 native execution 仍已 settled 且 runtime observer 仍附着时更新 coverage。若有可能，它从 baseline 推导 expected message keys，并只从完整文件刷新下一次 identity baseline。[`#scheduleNativeStateRefresh`](../../../../../src/sessions/service.ts#L1831) 每个 session 最多保持一个 refresh loop；后续 settlement 会替换一个待处理 request，而不会无限增长队列。其嵌套的 `run` callback 逐个处理最新 request，并在结束后从跟踪集合移除自身 promise。[`#refreshNativeSessionState`](../../../../../src/sessions/service.ts#L1861) 只有在 runtime/execution 仍然是当前对象、observer 仍附着、读取前后 session/model 一致且 Pi session ID 正确时，才保存已确认的 model/thinking 变化。保存失败会触发 storage fault；其他 observer failure 不改变已经 settled 的 execution outcome。

<a id="sessions-shutdown-and-private-helpers"></a>

## Shutdown 与 state helper

[`shutdown`](../../../../../src/sessions/service.ts#L1377) 是幂等的。它先停止新 admission，持久化并 abort 尚未 dispatch 的 turn，abort 共享 history signal，然后等待 mutation queue。之后逐个处理 active slot，记录 cancellation intent，为已 dispatch 的工作发起 abort，并并发停止所有 child process；再等待每个 slot 完成 cleanup。接着 detach observers、清空 runtime map、关闭 event hub，等待已 admission 的 reads、native refresh 和 discovery promise drain，最后关闭 SQLite。如果 runtime metadata 未能全部保存，会抛出最终错误。`#configuration` 返回已保存的 executable/entry point，缺失时为 `runtime_unavailable`；`#checkStorage` 在 session storage fault 后拒绝后续 turn-state mutation；`#writeTurn` 包装 catalog update 与 event publication，并将写入异常转换为 sticky storage fault。

[`#publishState`](../../../../../src/sessions/service.ts#L473) 在 durable write 后发布 best-effort event view；[`#storageFault`](../../../../../src/sessions/service.ts#L496) 标记 session fault 并通知其 stream。[`#mutate`](../../../../../src/sessions/service.ts#L1462) 与 [`#read`](../../../../../src/sessions/service.ts#L1476) 在 rejection 后释放 queue 或 read slot。[`#stored`](../../../../../src/sessions/service.ts#L1506) 和 [`#storedTurn`](../../../../../src/sessions/service.ts#L1093) 校验 durable lookup；[`#view`](../../../../../src/sessions/service.ts#L1514) 生成 public session projection；[`#directory`](../../../../../src/sessions/service.ts#L1553) 规范化 project path；[`#prune`](../../../../../src/sessions/service.ts#L1569) 释放 failed/exited runtime；[`#history`](../../../../../src/sessions/service.ts#L1580) 校验候选 native file；[`#savedHistory`](../../../../../src/sessions/service.ts#L1638) 则通过有界 reader 读取预期存在的 history。

相关可执行行为见 [session lifecycle tests](../../../../../tests/sessions.test.ts)、[turn/catalog tests](../../../../../tests/turn-catalog.test.ts)、[session event integration tests](../../../../../tests/session-events.test.ts) 与 [history service tests](../../../../../tests/history-service.test.ts)。
