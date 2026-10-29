<a id="pi-runtime-implementation"></a>

# Pi runtime process

[English](../../../../handbook/implementation/runtime.md) | 简体中文

[实现文档索引](README.md) · [RPC transport](rpc.md) · [Saved history](history.md) · [Runtime 概览](../runtime.md)

`PiProcess` 拥有一个 child process 和一个 Pi session。Pi 继续负责 agent loop、tools、provider calls、extensions 和 native session format。Dwell 验证 subprocess boundary，区分 durable Dwell turn 与 extension/native execution 的 owner，并提供只观察、不拥有 execution 的 listener。

<a id="runtime-types-and-boundary-validation"></a>

## Runtime state 与 boundary validator

[`RuntimeState`、`PiOptions`、`SessionState`、`RunResult`、`NativeExecutionResult`、`ActiveExecution` 和 `PiEntry`](../../../../../src/runtime/pi-process.ts#L19) 定义 process boundary。Dwell work 可结束为 completed、failed、aborted 或 handled；独立发起的 native execution 还可能 interrupted。`ActiveExecution` 明确区分 Dwell run 和 ephemeral native execution ID。[`SUPPORTED_PI_VERSION`](../../../../../src/runtime/pi-process.ts#L18) 当前固定为 `1.4.0`。

[`sessionState`](../../../../../src/runtime/pi-process.ts#L99) 验证 `get_state`：session ID、可选 session file、streaming/compacting flag、安全非负 message count、thinking level，以及可选 selected model。[`isSelectedModel`](../../../../../src/runtime/pi-process.ts#L133) 只接受非空 provider 和 ID。[`sessionEntries`](../../../../../src/runtime/pi-process.ts#L143) 验证 `get_entries` 返回 array、唯一 entry ID、非空 type、null/string parent，以及 null 或有效 leaf ID；saved-history parent chain 会在 [History](history.md#native-jsonl-snapshot-and-validation) 中做更严格的检查。

[`verifyPiConfiguration`](../../../../../src/runtime/pi-process.ts#L172) 接受 executable 和可选 Node entry point；要求 path 为 absolute 且不包含 control character，通过 `realpath` 解析后，使用给定 working directory/environment 执行 `--version`。它限制命令 deadline/output，并要求 version 精确匹配。Path、spawn 或读取 version 失败会转换为简明配置错误。返回值为 canonical executable/entry-point path；provider credential 保留在 owner 提供的 child environment 中。

<a id="runtime-startup-and-session-handshake"></a>

## 启动并验证 Pi child

[`PiProcess.constructor`](../../../../../src/runtime/pi-process.ts#L232) 注册 stderr、RPC 和 process lifecycle listener。Stderr tail 限制为 16 KiB，供 private diagnostics 使用，不会自动放入 public error。Child `error` event 标记启动失败。收到 `close` 时，unexpected exit 会使 runtime failure；随后关闭 RPC、中断当前 run、清理 dialog；若 state 是 stopping，则改为 exited。共享 closed promise 只有在 OS child 确实 close 后才 resolve。

[`PiProcess.start`](../../../../../src/runtime/pi-process.ts#L274) 校验 executable、cwd、session、entry point 和 extension path 均为 absolute。显式 session ID 必须有效，且不能与 `resumeFile` 同时提供；`resumeFile` 用于重开已有 transcript，显式 session ID 指定新 session identity，而两者都省略也可创建由 Pi 管理的新 session。Provider/model 必须同时提供或同时省略。Request 和 shutdown deadline 必须为 1 到 60,000 ms 之间的安全整数。它解析并验证 project directory，校验 private session directory，也验证 resume file 与其所属目录。再次验证 Pi version 后，创建 session directory，并构造 RPC mode、Dwell session directory、新 session 的可选 model、native resource mode 和 extension path 参数。Hosted session 默认使用 Pi native resource discovery；只有 `resourcePolicy: "isolated"` 才添加关闭 extensions、skills、prompt templates、themes、MCP 和 context files 的 Pi flag。Child 通过无 shell 的 spawn 启动，并使用 stdin/stdout/stderr pipe。

Pi 必须先返回 `get_state`，startup 才算完成。如果 state 正在 streaming、compacting 或 pending message 不为零，且打开期间没有 native extension execution，就会拒绝启动。它要求 Pi 已选择 model，并验证 resume file/session ID/new-session model；同时确保 process 仍处于合法的 starting/ready/running 状态。全部通过后才从 starting 进入 ready。Spawn 后任何失败都会先调用 `stop`，避免留下半初始化 child。

<a id="runtime-observation-and-process-state"></a>

## Process state 与 observer lifecycle

[`state`、`pid`、`stderrTail` 和 `activeExecution`](../../../../../src/runtime/pi-process.ts#L393) 暴露当前 state、child PID、有界 diagnostics 和 work owner。`activeExecution` 只对 native work 返回 execution ID；Dwell turn 仍由 durable service slot 拥有。

[`subscribe`](../../../../../src/runtime/pi-process.ts#L411) 注册 Pi-record listener，默认标记为 interactive。返回的 unsubscribe 函数移除该 listener；如果没有 interactive listener 剩余，会取消待处理 extension dialog。[`subscribeState`](../../../../../src/runtime/pi-process.ts#L420) 注册 state listener 并立即发送当前 state。[`subscribeNativeExecution`](../../../../../src/runtime/pi-process.ts#L426) 注册 execution listener，并立即发送当前 running native execution 或最近一次 settled native event。Listener failure 由通知 helper 隔离，因此 observer detach/failure 不会停止 Pi。

[`getState`](../../../../../src/runtime/pi-process.ts#L439) 发送 `get_state` 并通过 `sessionState` 验证；若 state malformed，会 fail RPC channel，因为 runtime contract 已不可相信。[`#setState`](../../../../../src/runtime/pi-process.ts#L784) 忽略重复 state，并遍历 listener snapshot，以容许 callback 中修改注册集合。[`#notifyStateListener`](../../../../../src/runtime/pi-process.ts#L869) 同时捕获同步 throw 与 rejected promise。[`#notifyNativeExecutionListener`](../../../../../src/runtime/pi-process.ts#L857) 对 native event 做相同处理。普通 Pi-record callback 则在 `#onRecord` 中保护。

<a id="runtime-model-and-context-operations"></a>

## Model、thinking 与 context 操作

[`getAvailableModels`](../../../../../src/runtime/pi-process.ts#L449) 仅允许 ready/running runtime，并通过 `parsePiSessionModels` 验证 active-session registry。[`getAvailableThinkingLevels`](../../../../../src/runtime/pi-process.ts#L455) 要求列表非空、最多七项、全部属于支持集合且不重复；malformed data 会使 RPC connection 失败。[`setThinkingLevel`](../../../../../src/runtime/pi-process.ts#L478) 校验共享 thinking-level type，拒绝 busy/non-ready runtime，调用 Pi 的 `set_thinking_level`，然后返回 Pi 确认的 state value。

[`setModel`](../../../../../src/runtime/pi-process.ts#L487) 校验 provider/model 长度和 runtime idle/ready，发送 `set_model`，并要求 Pi 回传完全相同的 provider 和 ID。无效或不同的回传会使 RPC channel 失败；Dwell 只持久化 Pi 确认过的选择。普通的 typed Pi command rejection 仍作为一般 error 抛出，使 `SessionService` 能区别 model 不可用/API key 缺失。

[`getMessages`](../../../../../src/runtime/pi-process.ts#L516) 验证 Pi `get_messages` 返回的数组元素均为带 string role 的 record，然后返回该数组；它表示当前 working model context，不是完整 branch。[`getEntries`](../../../../../src/runtime/pi-process.ts#L532) 通过 `sessionEntries` 校验当前 native entry set 与 leaf；结构损坏会 fail RPC。[`supportsImages`](../../../../../src/runtime/pi-process.ts#L542) 要求 runtime ready 且 idle，并行读取 state 与 model registry，查找完全匹配的 active provider/model，验证 input type list 后返回是否包含 `image`。Malformed capability data 会 fail RPC；一般 transport/command failure 则正常传播。

[`parsePiSessionModels`](../../../../../src/runtime/pi-models.ts#L6) 是 Pi 1.4 registry 的严格 public-metadata projection。其嵌套 `invalid` callback 生成统一 malformed-metadata error。Parser 限制 registry 数量和序列化总量，要求 provider/ID pair 唯一，校验 reasoning/input field 和可选 thinking-level map，最终只输出 provider、ID、image support 与 thinking level。Model 不支持 reasoning 时只提供 `off`；Pi 用 `null` 表示关闭的 level；扩展 level `xhigh`/`max` 必须有 registry 显式映射。Provider header、credential 和 private registry field 不会进入返回值。

<a id="runtime-dwell-run-lifecycle"></a>

## Dwell prompt acceptance 与 settlement

[`startRun`](../../../../../src/runtime/pi-process.ts#L578) 将 prompt acceptance 与最终 execution settlement 分开。它拒绝 busy/non-ready state、超过 1 MiB 的 message、没有 image 的空 text，以及格式错误的 image array。发送前先设置 `Run` record 并将 state 改为 running，因为 Pi event 可能早于 correlated prompt response 到达。它返回两个受观察的 Promise：`accepted` resolve 为 `started` 或 `handled`；`settled` resolve 为最终 `RunResult`，或因 transport/process failure reject。提前附加 rejection observer 允许调用者在不同时间分别等待它们而不产生 unhandled rejection。

Prompt response 必须包含受支持的 disposition；malformed disposition 会 fail RPC channel。若是 `handled`，Dwell run 会在收到 acknowledgement／转交 ownership 时以 handled 结束；Pi 若已开始 agent work，则由独立的 native execution record 表示其后续。即使 native follow-up 在 acknowledgement 前已经开始，handled Dwell settlement 也不会等待 native execution settle。若 native work 已经结束，其独立 native record 可立即发布对应 outcome。若是 `started`，已观察到 settlement 时会在 acknowledgement 后完成，否则保持 active。这些分支保留了“Pi event 先于 prompt acknowledgement”的竞态结果。

[`run`](../../../../../src/runtime/pi-process.ts#L648) 是简化的 text-only wrapper：先等 acceptance，再返回 settlement promise。[`abort`](../../../../../src/runtime/pi-process.ts#L654) 只在 runtime running 时发送 Pi abort command。Durable cancellation request 和恢复语义由 `SessionService` 拥有；此 method 只控制 child。

[`#finish`](../../../../../src/runtime/pi-process.ts#L705) 和 [`#rejectRun`](../../../../../src/runtime/pi-process.ts#L713) 仅在该 run 仍拥有 process slot 时生效。它们清除 active slot 和待处理 dialog，将 running process 恢复为 ready，并只 settle 一次。[`#fail`](../../../../../src/runtime/pi-process.ts#L721) 对 failed/exited state 幂等；它保存 error、设为 failed、关闭 RPC、中断当前 work，并发起 process stop。

<a id="runtime-rpc-events-and-native-execution"></a>

## Pi event handling 与 native execution

[`#onRecord`](../../../../../src/runtime/pi-process.ts#L730) 是异步 Pi record 的 owner callback。`agent_start` 在没有 Dwell run 时开始 native run；在 Dwell work 中标记首个 agent start，或在后续 follow-up 开始时转交 ownership。`agent_settled` 校验 aborted flag，结合 Pi settlement 与 message/provider error 得出 completed/failed/aborted outcome，并结束相应 native 或 Dwell run。Assistant `message_end` 会校验 message envelope，并根据 `stopReason` 更新当前 run 的 error/aborted state。`extension_ui_request` 交由 `#uiRequest`。之后每个 record 都发给 listener snapshot；callback failure 会吞掉，保证 observation 不控制 Pi execution。

[`#beginNativeRun`](../../../../../src/runtime/pi-process.ts#L792) 生成 process-local UUID，获取 active slot、设置 running 并发布 `started`。[`#finishNativeRun`](../../../../../src/runtime/pi-process.ts#L800) 清除匹配 slot/dialog，恢复 ready 并发布 settled outcome。[`#transferHandledRun`](../../../../../src/runtime/pi-process.ts#L808) 用 native execution 替换 handled Dwell slot 后再 resolve Dwell result；如果 agent 已 settled，会立即发布对应 native settlement。[`#interruptRun`](../../../../../src/runtime/pi-process.ts#L835) 在进程丢失时清除 active work：Dwell settlement 会以不确定错误 reject；native work 则发布带 error 的 `interrupted`。[`#publishNativeExecution`](../../../../../src/runtime/pi-process.ts#L851) 保存最近一次 event 供迟到 subscriber 使用，并发送 clone。Service 将这些 notice 映射为 ephemeral session state，不会制造 durable turn record。

<a id="runtime-extension-dialogs-and-shutdown"></a>

## Extension dialog 与 shutdown

[`respondToUi`](../../../../../src/runtime/pi-process.ts#L659) 只接受待处理的 dialog ID 和符合 dialog method 的回应：`confirm` 需要 boolean，其他 dialog 需要 string value，也可发送 cancellation。String 最多 1 MiB。写入 `extension_ui_response` 前先删除 pending dialog 和 timer；未知/已回答 ID 或 response shape 不符会在本地拒绝。

[`#hasInteractiveObservers`](../../../../../src/runtime/pi-process.ts#L878) 检查是否仍有可回应 UI 的 record listener。[`#cancelDialogs`](../../../../../src/runtime/pi-process.ts#L882) 通过 `respondToUi` 取消所有 pending ID；最后一个 interactive observer detach 时会调用它。[`#uiRequest`](../../../../../src/runtime/pi-process.ts#L887) 要求 ID 和 method name 为 string；不支持的 dialog method 会静默忽略。支持的 `confirm`、`select`、`input`、`editor` request 会继续验证；重复 ID、无效字段或超过 32 个 pending dialog 会被拒绝；timeout 不超过 RPC deadline；没有 interactive observer 时立即取消。[`#clearDialogs`](../../../../../src/runtime/pi-process.ts#L925) 在 run 完成或 process close 时清除所有 timer 与 pending record。

[`stop`](../../../../../src/runtime/pi-process.ts#L682) 通过共享 `#stopping` promise 实现幂等。[`#stop`](../../../../../src/runtime/pi-process.ts#L687) 若 child 已退出则等待 close 后返回；否则除非 state 已是 `failed`，会先设为 `stopping`，然后关闭 RPC、向 stdin 发送 EOF，并按有界 deadline 依次调度 SIGTERM 和 SIGKILL，等待实际 `close` event。两个 escalation timer 都会在 `finally` 清除；stop promise 会在 child process 关闭后才 resolve。

Runtime 行为见 [Pi process tests](../../../../../tests/runtime.test.ts)、[transport/failure tests](../../../../../tests/runtime-failure.test.ts) 与 [model metadata tests](../../../../../tests/pi-models.test.ts)。
