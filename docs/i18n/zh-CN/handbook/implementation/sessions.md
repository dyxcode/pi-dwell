<a id="session-service-implementation"></a>

# Session service

[English](../../../../handbook/implementation/sessions.md) | 简体中文

[实现文档索引](README.md) · [Session 概览](../sessions-storage.md) · [系统流程](../system.md)

`SessionService` 在 host 侧协调 Dwell session records/turn 与每个 open Dwell session 对应的 Pi process。它启动并观察 Pi session、读取其保存的 JSONL history、跟踪 extension 启动的 native execution，并发布 session event。

<a id="session-identity-and-recovery"></a>

## Identity、启动与恢复

[`SessionError`](../../../../../src/sessions/service.ts#L55) 携带 HTTP status、稳定 error code 和 message。[`SessionService.constructor`、`SessionService.create` 与 `SessionService.runtimeCount`](../../../../../src/sessions/service.ts#L231) 建立 service。`create` 准备 private data directory、打开 `SessionCatalog`、在 recovery 前验证已存 sessions/turns，将遗留 `creating` sessions 和 nonterminal turns 标记为 interrupted；validation 或 reconciliation 出错时，会先关闭 catalog 再抛出。`runtimeCount` 统计存活的 Pi child process 对象，不统计 catalog rows。

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

`SessionService.constructor` 会复制传入 environment（或 host environment）、extension paths、clock 和内部 checkpoint callback。其 maps 跟踪 PiProcess 对象、observers、history identity baselines、native executions、合并的 native-state refresh、active turns 和 storage-faulted sessions；catalog 保存 durable state，maps 保存 process coordination。[`configure`](../../../../../src/sessions/service.ts#L259) 与其他 mutation 串行执行；Pi process 或 Dwell turn 存在时拒绝修改配置，验证绝对 Pi path 后保存，并将验证失败规范化为 `invalid_runtime`。

[`#configuration`、`#admit`、`#mutate` 和 `#read`](../../../../../src/sessions/service.ts#L1446) 定义 configuration lookup、admission 与并发规则。`#configuration` 返回已保存的 executable/entry-point pair，缺失时抛出 `runtime_unavailable`。`#admit` 在 shutdown 开始后拒绝新操作。`#mutate` 将 mutation 串接在同一 promise queue 中，并在成功或失败后重置 tail，因此某次 rejection 不会阻塞后续操作。`#read` 最多允许两个 service-level history/result read，并为 shutdown 跟踪它们；它将 `HistoryReadError` 映射为 `SessionError`，转换 shutdown 导致的 `AbortError`，并在 `finally` 释放 read slot。底层 Pi session-file scanner 另有一个 Dwell host-process 级预算：最多两个 active scan 和八个 waiter；见 [History](history.md#history-scan-budget)。

<a id="sessions-discovery-and-observation"></a>

## Directory、model discovery 与 event subscription

[`listSessions` 和 `getSession`](../../../../../src/sessions/service.ts#L282) 同步检查 admission，再通过 `#view` 转换 catalog rows。[`listDirectories`](../../../../../src/sessions/service.ts#L292) 在未传 path 时使用 host home directory（`HOME`；Windows 使用 `USERPROFILE`）。如果无法确定 home，会返回 `home_directory_unavailable`。Discovery error 保留其 public status/code；其他 filesystem error 原样抛出。

[`listAvailableModels`](../../../../../src/sessions/service.ts#L315) 要求已保存 Pi executable 配置，并将同时发生的 global discovery 合并为一个 in-flight promise；成功或失败后都会清除。[`listSessionModels`](../../../../../src/sessions/service.ts#L340) 要求 stored、未 fault 的 session 持有 ready/running Pi process。它按 process object 合并 reads，并在返回前确认同一 process 仍打开；Pi 或解析失败会变为 `model_discovery_failed`。[`getSessionModelCapabilities`](../../../../../src/sessions/service.ts#L383) 校验 provider/model request，要求 active Pi session 的 registry 中存在精确匹配项，只返回 provider、model ID、image support 和 thinking levels。[`getModelCapabilities`](../../../../../src/sessions/service.ts#L403) 使用 isolated global discovery，合并相同 provider/model request，最多允许两个不同检查；超出时返回 `model_discovery_busy`。

[`subscribeEvents`](../../../../../src/sessions/service.ts#L442) 先从 durable state 构造当前 session view 及 current/latest turn projection，再向 `SessionEvents.connect` 注册 listener。它将无效 cursor、每个 session 或全局 subscriber 超限、stream capacity 不足分别映射为 `invalid_cursor`、`subscriber_limit` 和 `stream_unavailable`。[`#publishState`](../../../../../src/sessions/service.ts#L473) 发布 session-only 或 session-plus-turn view。Event projection 是状态变更之后的 observation；如果失败，会发出受限的 `state_unavailable` stream error，不会撤销已经保存的 mutation。[`#storageFault`](../../../../../src/sessions/service.ts#L496) 在进程内标记一次 session storage fault，并向 stream 发出 `storage_unavailable`；修复存储并重启 host 之前，后续 durable turn 操作都会拒绝。

<a id="sessions-create-open-close"></a>

## Create、open、close 与 model selection

[`createSession`](../../../../../src/sessions/service.ts#L506) 在 mutation queue 内执行。它先校验 request UUID、absolute directory 和成对提供的 provider/model，再 hash 原始 request payload。访问 directory 前先按 request key 查询，因此原 directory 消失后仍可识别相同请求；同一 key 对应不同 payload 时返回 `request_conflict`。新 key 会先验证配置、通过 `#directory` 规范化 path、清理退出的 child、执行最多八个 open Pi processes 的限制，再插入 `creating` row 并启动 Pi。启动成功返回 `ready`；启动异常记录为 `failed` 并返回 session view。启动前的 durable insert 让 recovery 能区分创建中断与记录缺失。

[`openSession`](../../../../../src/sessions/service.ts#L694) 将 `#open` 排入 mutation queue。`#open` 复用 ready Pi process，拒绝 running process，清理退出的 child，检查 process capacity/configuration，并确认保存的 project directory 仍解析为原 canonical path。若预期的 Pi session file 缺失，则记录 `history_unavailable`，拒绝创建替代 Pi session。否则先捕获完整 history-identity baseline，再用已验证的 Pi session file 或已存 Pi session ID 启动 Pi；只有创建新 Pi session 时才提供已保存的 provider/model。随后验证 Pi 返回的 session ID、model 和 session file。重开时以 Pi session 中已保存的 model/thinking state 为准；新 Pi session 在没有 native execution 活动时可以恢复已保存的 thinking level。检查完成后才保存 `ready` metadata。Pi process 启动后的 mismatch 或 catalog 写入失败都会停止该 process、注销 observers 并从 process map 移除。

[`setSessionModel`](../../../../../src/sessions/service.ts#L587) 只接受 ready 且 idle 的 Dwell session。若 provider/model 已相同，且没有请求不同 thinking level，则为 no-op。否则打开或复用 Pi process，读取变更前 state，只在需要时调用 `set_model`，可选调用 `set_thinking_level`，再读取 Pi state 确认 session 和 model。持久化确认后的 provider/model/thinking 后才返回。Pi 明确拒绝不可用 model 或缺少 API key 时返回 `model_unavailable`；其他未确认结果会停止 Pi process 并返回 `model_change_failed`。Pi 已改变 model 但 catalog 保存失败时，也会停止 process。

[`closeSession`](../../../../../src/sessions/service.ts#L698) 在 active Dwell turn 或 Pi run 时拒绝关闭。停止 Pi process 前，它保存当前 Pi session-file pointer 和 history-expectation state；若 settled native execution 有 baseline，也会刷新 history coverage。之后停止 process、detach listeners、删除 process mapping 并返回 durable session view。[`getContext`](../../../../../src/sessions/service.ts#L729) 打开 Dwell session，请求 Pi 当前 model-context messages，刷新 saved-history metadata 后返回。它们是 Pi 的 working context；`getHistory` 读取已保存的 Pi-session branch。

[`#directory`](../../../../../src/sessions/service.ts#L1553) 要求 path 为 absolute、存在且是 directory，并返回 `realpath`；失败或非目录会变为 `invalid_directory`。[`#prune`](../../../../../src/sessions/service.ts#L1569) 停止并释放 failed/exited Pi process、detach observers，并在另一 process 使用 capacity 前发布新 view。[`#view`](../../../../../src/sessions/service.ts#L1514) 验证存储值，再将 durable Dwell-session state 与 Pi-process state 映射为 public `SessionInfo`：process `starting`/`stopping` 映射为 API `runtimeState` `opening`/`closing`；process `ready`/`running` 映射为 `ready`；`failed` 保持 `failed`；缺失/退出的 process 为 `closed`。它根据 durable expectation/error 推导 history state，隐藏 storage-fault detail，并补入 native execution 与 active/latest turn IDs。[`#stored`](../../../../../src/sessions/service.ts#L1506) 验证 Dwell session ID、存在性和 stored identity；[`#storedTurn`](../../../../../src/sessions/service.ts#L1093) 验证 run ID 及所属 session。

[`#rememberHistory`](../../../../../src/sessions/service.ts#L2020) 跳过 failed/exited Pi processes；否则读取 Pi 当前 state，将 session-file path 与最新 catalog record 合并，再由 `#history` 验证文件。它保存最新 Pi session-file pointer；saved history 一旦存在，`historyExpected` 就保持 true。若预期的 history 消失，则记录 unavailable-history message。Catalog 写入后才发布；写入失败会 fault session 并返回 `storage_unavailable`。

<a id="sessions-history-results"></a>

## Saved history、image 与 turn result

[`getHistory`](../../../../../src/sessions/service.ts#L741) 使用有界 read lane。Pi session file 不存在时，如果 active turn 的首次 history 尚未生成，可以返回 `pending`；若已预期有 file 则返回 `history_unavailable`。没有 file 时 cursor 无效。空结果仍含 active/latest turn IDs 和空 context projection。Pi session file 存在时，service 标记 active turn 的 history 已生成，再将 Dwell session ID、Pi session ID、project directory、cursor 和 shutdown signal 传给 `HistoryPages.read`。

返回的 page 也用于将 live output 与已保存的 Pi-session content 对齐。只有 storage healthy、latest turn 已 terminal、有 saved entry IDs 且所有 IDs 都位于所选 branch 时，durable turn 才有 coverage。Native execution 的预期 assistant keys 只从完整文件计算；identity unknown、diff 超限或 diff 为空都会阻断 coverage。所有预期 keys 和 settled leaf 都在当前 branch 上，才报告 coverage。Observer 仍 active 且读取完整时，service 会刷新下次 native execution 的 baseline。Response 包含 page entries、file revision/leaf、context sources、截断状态、turn IDs 和已证明的 coverage IDs。

[`getHistoryImage`](../../../../../src/sessions/service.ts#L857) 通过已验证的 Pi session file、branch entry ID 和 entry 内 image index 定位图片。预期 file 缺失时返回 `history_unavailable`；没有预期 file 或图片不在 active branch 时返回 `null`。[`getTurnResult`](../../../../../src/sessions/service.ts#L964) 只接受已 settled turn。Completed turn 没有 saved entries 时返回空结果；其他缺失/空结果返回 `result_unavailable`。它在 history budget 下重读 Pi JSONL，精确选择已存的 entry IDs，并在 ID 缺失时失败。JSON serialization 深度失败或结果超过 8 MiB 时返回 `result_limit`，提示客户端改读分页 history。

[`#history`](../../../../../src/sessions/service.ts#L1580) 执行 Pi session-file boundary 检查。Dwell session 尚未记录 Pi session file 时，只在其所属 directory 中查找与 Pi session ID 匹配的文件名，并拒绝多个匹配项。它解析 file 和 parent directory，阻止文件逃逸 owner directory，使用 no-follow/nonblocking flags 打开，要求 regular file，并验证 Pi v3 header 中的 session ID 与 project directory。缺失文件返回 `undefined`；malformed 或 foreign file 返回 `invalid_history`。[`#savedHistory`](../../../../../src/sessions/service.ts#L1638) 将预期存在但缺失的 file 映射为 `history_unavailable`，然后调用可选带 abort settings 的有界 JSONL reader。[`#identityForEntries`、`#identityForHistory` 和 `#captureHistoryIdentity`](../../../../../src/sessions/service.ts#L1657) 区分完整已知 baseline（包括已知为空）与不完整/无法读取的 baseline。调用者主动 abort 会向上传递；其他 baseline read failure 会产生 unknown identity，并让 live content 保持可见。

<a id="sessions-turn-state-machine"></a>

## Durable turn admission 与 dispatch

[`submitTurn`](../../../../../src/sessions/service.ts#L882) 先校验 session、request shape 和 images，再计算 payload hash。同一 `(sessionId, requestId)` 若内容相同，返回原有 `TurnInfo` 和 `created: false`；若 payload 不同则 conflict。若 storage fault、有 local/catalog turn active、Pi 正在执行 native work 或 Pi 未配置，则拒绝新工作。Service 先插入 `accepted` turn，清除所选的 live native-execution projection，安装 `ActiveTurn` slot、发布新 view，最后用 `setImmediate` 安排 `#executeTurn`。HTTP acknowledgment 表示 durable admission；Pi 的最终 outcome 会单独报告。

`#executeTurn` 是核心 turn transition。它先运行可选的内部 `accepted` checkpoint，重读 turn/storage state，并将 dispatch 前的 shutdown 记录为 `aborted`。它合并 host shutdown signal 与 turn history-cancel signal，通过 mutation queue 打开或复用 Pi process，并确认此前预期存在的 Pi session history 仍可读取。若当前 Pi model 不支持图片，就拒绝 image input。发送前保存 Pi entry IDs 与 assistant-message identity counts，作为对比 baseline。

Dispatch 顺序具有明确的持久化边界：先在一个事务里将 turn 设为 `dispatching` 并将 session 设为 `historyExpected: true`；然后发布 view 并执行 `dispatching` checkpoint；重读 turn/storage；响应 cancellation 或 shutdown；启动 live event projection；以 passive observer 订阅 Pi；调用 `PiProcess.startRun`；标记 slot 已 dispatched；最后等待 prompt acceptance。若 Pi 返回 `handled`，service 会 detach turn observer，因为 extension 后续工作由 native execution 记录。若返回 `started`，先持久化 `running` 并执行 running checkpoint。Settlement 后等待可能存在的共享 abort；cancellation 结果不确定时不伪装成功。Extension-handled input 交给 `#completeHandledTurn`；普通执行则刷新 history、记录 admission 后新出现的 Pi entry ID，并保存 Pi outcome。只有 failed outcome 会写入 provider error。

遇到异常时，只有 dispatch 前已确认的 shutdown 才会将 turn 记为 `aborted`。已关联的 `prompt` command rejection 是确定拒绝，记为 `failed`；dispatch 后的其他错误记为 `interrupted`，其余错误记为 `failed`。`SessionError` 始终保留自己的稳定 code 和 message。其他错误才使用 fallback：dispatch 后且没有明确 rejection 时为 `outcome_unknown`；dispatch 前或明确 prompt rejection 时为 `execution_rejected`。`outcome_unknown` 表示 Pi 可能已经处理 prompt。Outcome 保存失败会标记 `#storageFault`；dispatched 或 storage-faulted Pi process 会停止。`finally` 会在首次 turn 未 dispatch 且此前没有 Pi session file 时清除推测性的 `historyExpected`；随后观察 outstanding abort、移除匹配 slot、结束 live projection 并发布 durable state。Prompt 不会自动重放。

[`#completeHandledTurn`](../../../../../src/sessions/service.ts#L1326) 处理 extension 消费 input、但没有普通 model turn 的情况。它校验 Pi session identity，读取 session file、当前 model/thinking 和现有 history，只记录相对 admission 新增的 entry。它先保存 session metadata，再将 turn 标记为 completed；保存失败会触发 storage fault，不能报告一个未记录的完成结果。[`getTurn`](../../../../../src/sessions/service.ts#L958) 在检查 admission/storage 后返回 public stored turn；调用方通过 `turnView` 隐去私有 identity。

<a id="sessions-cancellation-and-native-execution"></a>

## Cancellation 与 native Pi execution

[`abortTurn`](../../../../../src/sessions/service.ts#L1014) 校验 run ID，并原样返回 terminal turn。Nonterminal turn 必须有匹配的内存 execution slot。Cancellation intent 会先持久化：未 dispatch 的 turn 立即变为 `aborted`；已 dispatch 的 turn 保持当前 status，直到 Pi settle。已 dispatch 时调用 `#abortRuntime`；否则取消 history preparation。保存失败会触发 storage fault 并停止所属 Pi process。[`#abortRuntime`](../../../../../src/sessions/service.ts#L1124) 合并同一 slot 的重复 abort；Pi abort command rejection 时设置 `abortFailed` 并停止 process。Shutdown 可能不 await 此 promise，因此函数会立即附加 rejection observer。

[`abortNativeExecution`](../../../../../src/sessions/service.ts#L1049) 通过当前 native-execution ID 定位目标。它拒绝 malformed、stale 或非 running ID；Dwell session ID 本身不能标识一个 native execution。Service 会确认 Pi process 报告相同 execution，共享进行中的 abort promise，并在 Pi 拒绝 abort 时停止 process。如果 abort 和 process stop 都失败，则返回 `native_abort_failed`。

[`#observeRuntime`](../../../../../src/sessions/service.ts#L1686) 注册三条 observer lane：process-state change 发布 Dwell session state；native-execution notice 更新 ephemeral session view（attach 时已在运行的 execution 标记为 file-baseline-only）；passive Pi records 仅在该 Pi process 报告 native execution 时进入 live projection。Disposer 会移除 listeners、释放此 process 所属的 baseline，并在不完整 baseline 无法恢复时阻断 settled-native coverage。Observer exception 不会停止 Pi process。

[`#nativeExecutionEvent`](../../../../../src/sessions/service.ts#L1720) 处理 start 与 settlement。相同 ID 的重复 running start 会忽略。新 record 会复制已知 history identity，开启独立 native event projection 并发布状态。如果 Dwell live counts 可用，会优先于过期文件 baseline；baseline unknown/ambiguous 时会阻断 coverage。Settlement 会记录 Pi outcome，并将 error 限制在 2,048 字节；随后结束 live projection。只有 live identity 完整且没有 unidentified assistant message 时，才从 baseline 计算 expected keys。它更新已知 message counts、排队验证 saved history，并请求刷新 Pi state。`SessionService` 在内存中跟踪这些 native execution 并投影到 session state；它们不是 durable turn-ledger row。

[`#refreshNativeHistory`](../../../../../src/sessions/service.ts#L1806) 使用 shutdown-aware queue 读取 saved Pi-session history，仅在同一 native execution 仍 settled 且 process observer 仍附着时更新 coverage。它尽可能从 baseline 推导 expected message keys，只从完整文件刷新下一 baseline。[`#scheduleNativeStateRefresh`](../../../../../src/sessions/service.ts#L1831) 每个 session 最多保持一个 refresh loop；后续 settlement 替换一个 pending request。嵌套 `run` callback 处理最新 request，并在结束时清除跟踪的 promise。[`#refreshNativeSessionState`](../../../../../src/sessions/service.ts#L1861) 读取 Pi state，仅当 process/execution 仍为当前对象、session/model 未在读取期间变化且 Pi 确认相同 session 时才应用。已确认的 model/thinking 变化会保存；写入失败会 fault session。其他 observer failure 不改变 settled execution outcome。

<a id="sessions-shutdown-and-private-helpers"></a>

## Shutdown 与 state helper

[`shutdown`](../../../../../src/sessions/service.ts#L1377) 幂等执行。它停止新 admission，标记并 abort pre-dispatch turns、abort 共享 history signal，再等待 mutation queue。之后记录 cancellation intent，为 dispatched work 发起 abort，并并发停止 Pi child processes；待各 slot cleanup 后，detach observers、清空 process maps、关闭 event hub，drain 已 admission 的 reads、native refresh 和 discovery promises，最后关闭 SQLite。若 Pi-session metadata 未能全部保存则报告错误。[`#checkStorage`](../../../../../src/sessions/service.ts#L1101) 在 session storage fault 后拒绝后续 turn-state mutation；[`#writeTurn`](../../../../../src/sessions/service.ts#L1110) 组合 catalog update 和 event publication，并将写入失败变为 sticky storage fault。

相关可执行行为见 [session lifecycle tests](../../../../../tests/sessions.test.ts)、[turn/catalog tests](../../../../../tests/turn-catalog.test.ts)、[session event integration tests](../../../../../tests/session-events.test.ts) 与 [history service tests](../../../../../tests/history-service.test.ts)。
