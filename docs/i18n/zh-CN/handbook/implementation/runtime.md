<a id="pi-runtime-implementation"></a>

# Pi process

[English](../../../../handbook/implementation/runtime.md) | 简体中文

[实现文档索引](README.md) · [RPC transport](rpc.md) · [Saved history](history.md) · [Dwell/Pi integration 概览](../runtime.md)

`PiProcess` 负责一个 child process 及其打开的 Pi session。Pi 负责 agent loop、tools、provider calls、extensions 和 native session format。Dwell 验证 process boundary，并区分 durable Dwell turn 与 Pi extension/native execution；subscribers 观察 records，但不控制 execution。

<a id="runtime-types-and-boundary-validation"></a>

## Process state 与 boundary validation

[`RuntimeState`、`PiOptions`、`SessionState`、`RunResult`、`NativeExecutionResult`、`ActiveExecution` 和 `PiEntry`](../../../../../src/runtime/pi-process.ts#L19) 定义 process boundary。Dwell work 可结束为 completed、failed、aborted 或 handled；独立发起的 native execution 还可能 interrupted。`ActiveExecution` 明确区分 Dwell run 和 ephemeral native execution ID。[`SUPPORTED_PI_VERSION`](../../../../../src/runtime/pi-process.ts#L18) 当前固定为 `1.4.0`。

[`sessionState`](../../../../../src/runtime/pi-process.ts#L99) 验证 `get_state`：session ID、可选 session file、streaming/compacting flag、安全非负 message count、thinking level，以及可选 selected model。[`isSelectedModel`](../../../../../src/runtime/pi-process.ts#L133) 只接受非空 provider 和 ID。[`sessionEntries`](../../../../../src/runtime/pi-process.ts#L143) 验证 `get_entries` 返回 array、唯一 entry ID、非空 type、null/string parent，以及 null 或有效 leaf ID；saved-history parent chain 会在 [History](history.md#native-jsonl-snapshot-and-validation) 中做更严格的检查。

[`verifyPiConfiguration`](../../../../../src/runtime/pi-process.ts#L172) 接受 executable 和可选 Node entry point；要求 path 为 absolute 且不包含 control character，通过 `realpath` 解析后，使用给定 working directory/environment 执行 `--version`。它限制命令 deadline/output，并要求 version 精确匹配。Path、spawn 或读取 version 失败会转换为简明配置错误。返回值为 canonical executable/entry-point path；provider credential 保留在 owner 提供的 child environment 中。

<a id="runtime-startup-and-session-handshake"></a>

## 启动并验证 Pi child

[`PiProcess.constructor`](../../../../../src/runtime/pi-process.ts#L232) 注册 stderr、RPC 和 process-lifecycle listeners。Private stderr tail 限制为 16 KiB，不会复制进 public error。Child `error` event 标记启动失败。收到 `close` 时，意外退出会把 Pi process 标记为 failed、关闭 RPC、中断活动 work 并清理 dialogs；请求停止后 state 变为 `exited`。共享 closed promise 只有在 OS child 确实关闭后才 resolve。

[`PiProcess.start`](../../../../../src/runtime/pi-process.ts#L274) 要求 executable、project、session directory、可选 entry point 和 extension paths 都是 absolute。传入的 Pi session ID 必须有效，且不能与 `resumeFile` 同时提供；`resumeFile` 用于打开已有 Pi session，session ID 要求创建具有该 identity 的新 Pi session，两者都省略时由 Pi 为新 session 选择 ID。Provider/model 必须同时提供或同时省略。Request/shutdown deadline 是 1 到 60,000 ms 的安全整数。它验证 project、private session directory、现存 Pi session file 及其 parent directory，然后再次核对 Pi version，并以 `0700` mode 递归创建 session directory。它传入 `--mode rpc` 和 `--session-dir`；新 Pi session 可附加 provider/model，此外按输入加入 `--session` 或 `--session-id`，并逐个加入 extension。`resourcePolicy: "isolated"` 会追加六个 `--no-*` flags，关闭 extensions、skills、prompt templates、themes、MCP 和 context files；默认设置允许 Pi 加载 native resources。Child 通过无 shell 的 spawn 启动，并连接 stdin/stdout/stderr pipes。

Pi 必须先返回 `get_state`，startup 才算完成。若 Pi process 正在 streaming、compacting 或有 pending messages，且打开期间没有 native extension execution，则 `start` 会拒绝。它要求已选择 model，验证指定 Pi session file/session ID/new-session model，并确认 process 仍处于合法的 `starting`/`ready`/`running` state。全部通过后才将 `starting` 改为 `ready`。Spawn 后任何错误都会先调用 `stop`，关闭未完成初始化的 child。

<a id="runtime-observation-and-process-state"></a>

## Process state 与 observer lifecycle

[`state`、`pid`、`stderrTail` 和 `activeExecution`](../../../../../src/runtime/pi-process.ts#L393) 暴露当前 state、child PID、有界 diagnostics 和 work owner。`activeExecution` 只对 native work 返回 execution ID；Dwell turn 仍由 durable service slot 拥有。

[`subscribe`](../../../../../src/runtime/pi-process.ts#L411) 注册 Pi-record listener，默认标记为 interactive。返回的 unsubscribe 函数移除该 listener；如果没有 interactive listener 剩余，会取消待处理 extension dialog。[`subscribeState`](../../../../../src/runtime/pi-process.ts#L420) 注册 state listener 并立即发送当前 state。[`subscribeNativeExecution`](../../../../../src/runtime/pi-process.ts#L426) 注册 execution listener，并立即发送当前 running native execution 或最近一次 settled native event。Listener failure 由通知 helper 隔离，因此 observer detach/failure 不会停止 Pi。

[`getState`](../../../../../src/runtime/pi-process.ts#L439) 请求 `get_state` 并通过 `sessionState` 验证；malformed state 会使 RPC channel 失败，因为 Dwell 无法继续依赖 Pi-process state contract。[`#setState`](../../../../../src/runtime/pi-process.ts#L784) 忽略重复值，并通知 listener snapshot，允许 callback 安全修改订阅集合。[`#notifyStateListener`](../../../../../src/runtime/pi-process.ts#L869) 捕获同步 throw 和 rejected promise。[`#notifyNativeExecutionListener`](../../../../../src/runtime/pi-process.ts#L857) 对 native events 做同样处理。普通 Pi-record callback 由 `#onRecord` 保护。

<a id="runtime-model-and-context-operations"></a>

## Model、thinking 与 context 操作

[`getAvailableModels`](../../../../../src/runtime/pi-process.ts#L449) 要求 Pi process 为 ready/running，并通过 `parsePiSessionModels` 验证当前 Pi session registry。[`getAvailableThinkingLevels`](../../../../../src/runtime/pi-process.ts#L455) 要求列表非空、最多七项、均为支持 level 且不重复；malformed data 会使 RPC connection 失败。[`setThinkingLevel`](../../../../../src/runtime/pi-process.ts#L478) 验证 shared level，并要求 Pi process ready 且 idle，然后调用 `set_thinking_level`，返回 Pi 确认的 state。

[`setModel`](../../../../../src/runtime/pi-process.ts#L487) 校验 provider/model 长度，并要求 Pi process ready 且 idle。它发送 `set_model`，要求 Pi 回传完全匹配的 provider 和 ID。无效或不同的回传会使 RPC channel 失败；Dwell 只持久化 Pi 确认的选择。Typed Pi rejection 仍作为普通 error 抛出，以便 `SessionService` 区分 model 不可用与缺少 API key。

[`getMessages`](../../../../../src/runtime/pi-process.ts#L516) 验证 Pi `get_messages` 返回的数组项均为带 string role 的 record，然后返回该数组；它表示当前 working context，不是完整 Pi-session branch。[`getEntries`](../../../../../src/runtime/pi-process.ts#L532) 通过 `sessionEntries` 验证当前 native entries 与 leaf，结构 malformed 时 fail RPC。[`supportsImages`](../../../../../src/runtime/pi-process.ts#L542) 要求 Pi process ready 且 idle，并行读取 state 和 model registry，查找精确匹配的已选 provider/model，验证 input-type list 后检查是否含 `image`。Capability data malformed 会使 RPC 失败；transport 和 command failures 会继续向上抛出。

[`parsePiSessionModels`](../../../../../src/runtime/pi-models.ts#L6) 是 Pi 1.4 registry 的严格 public-metadata projection。其嵌套 `invalid` callback 生成统一 malformed-metadata error。Parser 限制 registry 数量和序列化总量，要求 provider/ID pair 唯一，校验 reasoning/input field 和可选 thinking-level map，最终只输出 provider、ID、image support 与 thinking level。Model 不支持 reasoning 时只提供 `off`；Pi 用 `null` 表示关闭的 level；扩展 level `xhigh`/`max` 必须有 registry 显式映射。Provider header、credential 和 private registry field 不会进入返回值。

<a id="runtime-dwell-run-lifecycle"></a>

## Dwell prompt acceptance 与 settlement

[`startRun`](../../../../../src/runtime/pi-process.ts#L578) 分开处理 prompt acceptance 与最终 settlement。它要求 Pi process ready 且 idle；拒绝超过 1 MiB 的 message、无 image 的空 text 和格式错误的 image array。发送 `prompt` 前先安装 `Run` record 并将 process state 设为 `running`，因为 Pi event 可能先于关联的 prompt response 到达。它返回 `accepted`（`started` 或 `handled`）与 `settled`（最终 `RunResult` 或 transport/process rejection）。两个 promise 都提前附加 rejection observer，允许调用者分别等待。

Prompt response 必须包含受支持的 disposition；malformed disposition 会 fail RPC channel。若是 `handled`，Dwell run 会在收到 acknowledgement／转交 ownership 时以 handled 结束；Pi 若已开始 agent work，则由独立的 native execution record 表示其后续。即使 native follow-up 在 acknowledgement 前已经开始，handled Dwell settlement 也不会等待 native execution settle。若 native work 已经结束，其独立 native record 可立即发布对应 outcome。若是 `started`，已观察到 settlement 时会在 acknowledgement 后完成，否则保持 active。这些分支保留了“Pi event 先于 prompt acknowledgement”的竞态结果。

[`run`](../../../../../src/runtime/pi-process.ts#L648) 是 text-only wrapper：等待 prompt acceptance 后返回 settlement。[`abort`](../../../../../src/runtime/pi-process.ts#L654) 仅在 Pi process state 为 `running` 时发送 Pi abort command。`SessionService` 负责持久化 cancellation intent 和 recovery；`abort` 控制 Pi process。

[`#finish`](../../../../../src/runtime/pi-process.ts#L705) 和 [`#rejectRun`](../../../../../src/runtime/pi-process.ts#L713) 仅在 run 仍拥有 process slot 时生效。它们清除 slot 和 pending dialogs，将 running process 恢复为 ready，并且只 settle 一次。[`#fail`](../../../../../src/runtime/pi-process.ts#L721) 对 failed/exited state 幂等；它保存 error、标记 process failed、关闭 RPC、中断活动 work 并开始停止 process。

<a id="runtime-rpc-events-and-native-execution"></a>

## Pi event handling 与 native execution

[`#onRecord`](../../../../../src/runtime/pi-process.ts#L730) 是异步 Pi record 的 owner callback。`agent_start` 在没有 Dwell run 时开始 native run；在 Dwell work 中标记首个 agent start，或在后续 follow-up 开始时转交 ownership。`agent_settled` 校验 aborted flag，结合 Pi settlement 与 message/provider error 得出 completed/failed/aborted outcome，并结束相应 native 或 Dwell run。Assistant `message_end` 会校验 message envelope，并根据 `stopReason` 更新当前 run 的 error/aborted state。`extension_ui_request` 交由 `#uiRequest`。之后每个 record 都发给 listener snapshot；callback failure 会吞掉，保证 observation 不控制 Pi execution。

[`#beginNativeRun`](../../../../../src/runtime/pi-process.ts#L792) 为 Pi-process native execution 创建 UUID、取得 active slot、将 state 设为 running 并发布 `started`。

[`#finishNativeRun`](../../../../../src/runtime/pi-process.ts#L800) 仅在同一个 native run 仍占有 slot 时完成：它清除 run 和 dialogs，将 running 的 Pi process 恢复为 `ready`，并发布结果。[`#transferHandledRun`](../../../../../src/runtime/pi-process.ts#L808) 在 resolve Dwell result 前，将 handled Dwell run 转交给新的 native-execution ID；若 agent 已 settle，则立即发布独立的 native outcome。[`#interruptRun`](../../../../../src/runtime/pi-process.ts#L835) 在 process 丢失时清理活动 work：Dwell settlement 以结果不确定的错误 reject，native work 则发布为 `interrupted`。[`#publishNativeExecution`](../../../../../src/runtime/pi-process.ts#L851) 保存最近一次 event 供后续 subscriber 使用，并向每个 listener 发送 clone。

<a id="runtime-extension-dialogs-and-shutdown"></a>

## Extension dialog 与 shutdown

[`respondToUi`](../../../../../src/runtime/pi-process.ts#L659) 只接受待处理的 dialog ID 和符合 dialog method 的回应：`confirm` 需要 boolean，其他 dialog 需要 string value，也可发送 cancellation。String 最多 1 MiB。写入 `extension_ui_response` 前先删除 pending dialog 和 timer；未知/已回答 ID 或 response shape 不符会在本地拒绝。

[`#hasInteractiveObservers`](../../../../../src/runtime/pi-process.ts#L878) 检查是否仍有可回应 UI 的 record listener。[`#cancelDialogs`](../../../../../src/runtime/pi-process.ts#L882) 通过 `respondToUi` 取消所有 pending ID；最后一个 interactive observer detach 时会调用它。[`#uiRequest`](../../../../../src/runtime/pi-process.ts#L887) 要求 ID 和 method name 为 string；不支持的 dialog method 会静默忽略。支持的 `confirm`、`select`、`input`、`editor` request 会继续验证；重复 ID、无效字段或超过 32 个 pending dialog 会被拒绝；timeout 不超过 RPC deadline；没有 interactive observer 时立即取消。[`#clearDialogs`](../../../../../src/runtime/pi-process.ts#L925) 在 run 完成或 process close 时清除所有 timer 与 pending record。

[`stop`](../../../../../src/runtime/pi-process.ts#L682) 通过共享 `#stopping` promise 实现幂等。[`#stop`](../../../../../src/runtime/pi-process.ts#L687) 若 child 已退出则等待 close 后返回；否则除非 state 已是 `failed`，会先设为 `stopping`，然后关闭 RPC、向 stdin 发送 EOF，并按有界 deadline 依次调度 SIGTERM 和 SIGKILL，等待实际 `close` event。两个 escalation timer 都会在 `finally` 清除；stop promise 会在 child process 关闭后才 resolve。

Pi-process 行为见 [Pi process tests](../../../../../tests/runtime.test.ts)、[transport/failure tests](../../../../../tests/runtime-failure.test.ts) 与 [model metadata tests](../../../../../tests/pi-models.test.ts)。
