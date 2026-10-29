<a id="glossary"></a>

# 术语表

[English](../../../handbook/glossary.md) | 简体中文

[手册索引](README.md) · [完整参考](reference.md)

Session、turn、run、native execution、event sequence 和 history cursor 分别指向不同的记录或标识符，即使它们会同时出现在 UI 或 API 中。

<a id="product-and-runtime"></a>

## 产品与 runtime

| 术语 | 在 Dwell 中的含义 |
| --- | --- |
| **Dwell** | 本 repo 中的本地 host 与 browser client。Dwell 维护自己的 session/turn catalog、启动 Pi 进程，将 runtime 活动转换为有大小限制的 HTTP/SSE protocol，并生成 Pi saved history 的 projection。它不额外实现一套 model runtime。 |
| **Pi** | Dwell 使用的已安装 `@earendil-works/pi-coding-agent` package 和 executable。Pi 负责 model/provider 行为、native session format 以及 extension/native execution。Dwell 通过受支持的 Pi 1.4.0 RPC protocol 与配置的 executable 通信。 |
| **Host** | 提供 Dwell loopback HTTP 接口、管理内存中 active session service 的 Node 进程。Host 停止后，SQLite catalog 和 Pi JSONL 文件仍可保留在磁盘上。 |
| **Pi process / runtime** | 为 Dwell session 或 isolated model discovery 提供 Pi RPC 通信的子进程。Runtime 关闭后，Dwell session 仍可保存在 storage 中。 |
| **Pi RPC** | Pi 通过 child process 的 stdin/stdout 使用的、以换行分隔的 JSON request/response/event protocol。Dwell 用生成的 RPC ID 关联 command responses；RPC IDs 是 transport detail，不是 Dwell request ID、turn ID 或 native execution ID。 |

<a id="sessions-turns-and-identifiers"></a>

## session、turn 与标识符

| 术语 | 含义与区别 |
| --- | --- |
| **Dwell session** | 持久化的 Dwell record，用于关联一个 project directory、一个 Pi session identity/native file、选定的 provider/model/thinking level，以及 Dwell 的 turns。关闭 session 会停止 live runtime；不会删除 record 或 transcript。 |
| **Dwell session ID (`session.id`)** | Dwell routes、session records、turns、saved-history responses 和 stream frames 使用的 UUID。由 Dwell 生成，并作为 API 层的 session key 保留。 |
| **Pi session ID (`session.piSessionId`)** | 记录在 Pi JSONL session file 中的 native session UUID。Dwell 用它验证候选文件是否属于此 Pi conversation。它不能与 Dwell session ID 互换使用。 |
| **Session status** | 持久化的创建结果：`creating`、`ready`、`failed` 或 `interrupted`。描述 Dwell session record。 |
| **Runtime state (`runtimeState`)** | 当前 process lifecycle projection：`closed`、`opening`、`ready`、`failed` 或 `closing`。描述 live Pi child；session 为 `ready` 时，其 runtime 仍可因未打开而处于 `closed`。 |
| **History state (`historyState`)** | Dwell 对 saved transcript 可用性的判断：`empty`、`available` 或 `unavailable`。仅凭此状态无法判断 Pi process 是否已打开。 |
| **Turn** | 一次由 Dwell 持久化提交的 prompt operation，包含 `requestId`、生成的 `runId`、status、可选 error，以及归属该 operation 的 saved native entry IDs。一个 turn 不是整个 session transcript。 |
| **Run ID (`runId`)** | 标识持久化 turn record 的生成 UUID。Routes 使用它读取 result 或请求 abort。它与调用方的 `requestId` 和 Pi-native execution ID 都不同。 |
| **Request ID (`requestId`)** | Client 提供的 UUID，用于让 session creation 和 turn submission 具备 idempotency。相同 ID 和相同 payload 的重复请求会取回原 operation；若 settings/content 已变，则返回 `request_conflict`。它不是 run ID。 |
| **Payload identity** | 与 session/turn request 一起保存在内部的 SHA-256 identity，供 Dwell 判断重试是否完全相同，或相同 `requestId` 是否被用于不同 settings、text 或 images。Clients 不会发送或选择此 digest。 |
| **Native execution** | 通过 Pi 的 native extension/UI path 发起的工作，而非 Dwell turn submission。Dwell 会观察其开始/结束，并可用当前 native execution ID 请求 abort。它在 lifecycle/identity 上独立于 Dwell turn ledger。 |
| **Native execution ID** | Dwell 的 `PiProcess` adapter 为一次被观察到的 native execution 创建的临时 UUID。runtime 被替换后，该 ID 不保证继续有效，也不标识 Dwell turn。过期 ID 会被拒绝，不会转而 abort 当前碰巧在运行的工作。 |
| **Active turn** | 当前处于 `accepted`、`dispatching` 或 `running` 的那个 Dwell turn。SQLite partial unique index 强制每个 session 最多有一个 active Dwell turn。 |
| **Latest turn** | 最新的 Dwell turn record；它可能已经是 terminal 状态。“Latest”不代表 active。 |

Session 和 turn contracts 位于 [`shared/sessions.ts`](../../../../src/shared/sessions.ts) 和 [`shared/turns.ts`](../../../../src/shared/turns.ts)；持久化 records 和 indexes 位于 [`storage/catalog.ts`](../../../../src/storage/catalog.ts)。

<a id="execution-and-recovery-language"></a>

## 执行与恢复术语

| 术语 | 含义与区别 |
| --- | --- |
| **Accepted** | Durable turn row 已存在，但 Dwell 尚未记录它进入 dispatch。Host recovery 时，accepted row 可安全地变为带有 `not_dispatched` 的 `interrupted`。 |
| **Dispatch / dispatched** | Dwell 在调用 Pi 的 `prompt` RPC 前，会先持久化写入 `dispatching`。此 marker 有意采取保守判断：即使 shutdown 与实际 RPC call 发生竞态，只要在写入后崩溃，就按结果不确定处理。此后 RPC 中断或 Host 停止，都无法证明 model 是否执行了 prompt。 |
| **Running** | Pi 已确认 prompt 开始；在 run 结束或被标记 interrupted 前，turn 仍为 active。 |
| **Settled** | Pi 返回最终 run outcome（`completed`、`failed`、`aborted` 或 `handled`），Dwell 正在记录结果 state/history coverage。Settled 表示 runtime run 已结束，并不保证 saved-history projection 一定可用。 |
| **Interrupted / `outcome_unknown`** | Dispatch 后，turn 结束时已没有可靠的 live owner 或 final result。对 Dwell ledger 来说它是 terminal 状态。Dwell 不会自动 replay。 |
| **`not_dispatched`** | 对 durable `accepted` turn 的 recovery 分类；该 turn 尚未越过记录下来的 dispatch 边界。它表示 prompt 未由该 turn 发送。 |
| **Handled prompt** | Pi extension 通过 Pi extension flow 接受并处理 prompt，而不是产生普通 prompt run outcome。Dwell 会协调 saved history，并将完成结果与标准 model result 分开记录。 |
| **Turn cancellation** | 针对指定 run 的 Dwell abort request。`cancellationRequested` 表示请求已提出，但单凭它不能证明 Pi 已停止。应检查 terminal status/outcome。 |
| **Runtime closure** | 停止某个 session 的 Pi child。这与 abort 单个 turn/native execution 不同，也与关闭/删除持久化 Dwell session record 不同。 |

具体 transition rules 位于 [catalog](../../../../src/storage/catalog.ts)；prompt/abort coordination 位于 [SessionService](../../../../src/sessions/service.ts) 和 [PiProcess](../../../../src/runtime/pi-process.ts)。

<a id="saved-history-context-and-branches"></a>

## Saved history、context 与 branch

| 术语 | 含义与区别 |
| --- | --- |
| **Pi session file / native history** | Pi 的 JSONL file，包含 native session metadata、entries、parent links 和 branch selection。Dwell 从该文件构建 saved history，不会用自己的 transcript format 取代它。 |
| **Session catalog** | Dwell SQLite `catalog.sqlite` 中的 records，保存 runtime configuration、session identity/status 和 turn state。它不是 Pi transcript，也不包含完整的 conversation messages。 |
| **History entry** | 一个由 Pi-native JSONL entry 投影而来的对象。API 保留 native entry ID 和 parent link，并把受支持的 content 转为 display blocks；projection 可能标记 content 已截断或不受支持。 |
| **Branch** | 从 native session 当前选中的 leaf 回溯到 root 的 parent-linked path。History page 根据该 active path 构建；JSONL file 也可能包含其他 branches 上的 entries。 |
| **Leaf ID (`leafId`)** | 当前选为 native branch tip 的 Pi entry ID。它不是 Dwell session ID，并可能随 Pi branch 变化而改变。 |
| **Saved-history projection** | Dwell 对 active native branch 生成的有界、分页 display representation。它不保证等同于准确的 in-memory model context，也不保证包含所有 hidden/native fields。 |
| **Context (`GET …/context`)** | Pi 通过 `getMessages()` 返回的当前 runtime message list。这是 live-runtime view；请求会按需打开或重新打开 session runtime。它不是分页的 saved transcript。 |
| **Context sources** | Dwell 从 Pi 保存的 system/compaction context metadata 中投影的 preview，例如 instruction sources。它既不同于 `GET …/context` message list，也不同于完整 user/assistant transcript；内容可能被截断。 |
| **History revision** | 对 native file 的 device/inode identity 和完整 JSONL byte prefix 计算的 SHA-256 fingerprint。Dwell 将 page cursors 绑定到 revision，以避免 pagination 静默跨越已变化的文件。 |
| **History cursor (`nextCursor`)** | 不透明的签名分页 token，绑定到同一个 Dwell session、byte prefix 和 saved-history revision。签名 key 属于当前 service instance，因此 service restart 后旧 token 可能失效。只将它作为 history 的 `cursor` query parameter 传递。它与 SSE `Last-Event-ID` 不同；被拒绝时应重新加载第一页。 |
| **Turn coverage (`coveredTurnId`)** | 最新的 terminal Dwell turn，其记录的 entry IDs 均已证实存在于 saved active branch 上。Turn 可能先进入 terminal 状态，之后才确认 saved-history coverage。 |
| **Native-execution coverage** | `coveredNativeExecutionId` 标识已证实存在于 saved branch 上的 terminal native Pi execution。它是 coverage marker，不是 entry ID，也不是 durable turn。 |

Native file reader 位于 [`pi-history.ts`](../../../../src/runtime/pi-history.ts)；branch projection、signed page cursors 和 context-source extraction 位于 [`sessions/history.ts`](../../../../src/sessions/history.ts)。Response types 位于 [`shared/history.ts`](../../../../src/shared/history.ts)。

<a id="events-snapshots-and-cursors"></a>

## 事件、snapshot 与 cursor

| 术语 | 含义与区别 |
| --- | --- |
| **SSE** | Server-Sent Events，即 Host 到 browser 的 stream，用于发送 snapshots 以及增量 session/turn/live-message/tool 变化。Browser 可使用最近接受的 event cursor 重连。 |
| **Snapshot** | 有界的 point-in-time session/event projection，用于初次连接或重新同步之后。它包含 session 和 turn metadata 以及有界 live projection；不是完整 saved transcript。 |
| **Event cursor** | 形式为 `sessionId:epoch:sequence` 的 stream resume ID。`epoch` 标识当前 in-memory event stream generation，`sequence` 为 frames 排序。它用于 SSE `id`/`Last-Event-ID`，不用于 history pagination。 |
| **Event epoch** | Server 为一个 in-memory event-hub generation 生成的 UUID。Epoch 改变时，server 会发送 `resync` frame 和新的 snapshot，而不会从另一个 generation replay events。 |
| **Sequence** | 一个 session 的 event epoch 内单调递增的数字。它只用于 stream frame 排序，不是 turn number 或 Pi JSONL entry ID。 |
| **Replay window** | 为 reconnect 保留在内存中的有界 event history。如果 cursor 超前、过期、来自另一 epoch 或已超出 replay window，server 会通知 client 重新同步。 |
| **Resync frame** | 说明无法继续增量 replay 原因的 SSE `resync` control frame（`cursor_stale`、`cursor_ahead`、`epoch_changed` 或 `replay_limit`）。它不带普通 event cursor，也不是 error result。 |
| **Live projection** | 对当前正在 stream 的 assistant message 和 tools 生成的有界、临时 view。它可能被截断，并非权威的 saved-history record。 |
| **Projection limit/error** | 一种 stream event，用于报告 live metadata 已达上限，或传入的 Pi event 无法转换。它描述 live-view pipeline，不一定代表持久化 JSONL file 或 model outcome。 |

Contracts 位于 [`shared/events.ts`](../../../../src/shared/events.ts)；per-session hub 和 cursor/replay rules 位于 [`sessions/events.ts`](../../../../src/sessions/events.ts)；有界 writer 和 browser decoder 分别位于 [`server/sse.ts`](../../../../src/server/sse.ts) 与 [`clients/web/events.ts`](../../../../src/clients/web/events.ts)。

<a id="model-and-diagnostic-terms"></a>

## model 和诊断术语

| 术语 | 在本仓库中的含义 |
| --- | --- |
| **Provider** | Pi 的 model-provider identifier，与 model ID 配对。Dwell 存储/显示该选择，但不定义 provider authentication semantics。 |
| **Model ID** | 某个 provider 下 Pi 的 model identifier。不同 provider 下出现相同文本，仍代表不同选择。 |
| **Model capability** | 针对一个 provider/model pair 发现的 metadata，包括是否接受 images 以及支持哪些 thinking levels。 |
| **Thinking level** | Pi 支持的偏好值：`off`、`minimal`、`low`、`medium`、`high`、`xhigh` 或 `max`。可用值取决于 model capabilities；它不是 turn status。 |
| **Image support** | 用来表示所选 model 能否接受 image input 的 capability metadata。Dwell 在 dispatch 前验证此项，并且仍会在 request boundary 验证和限制 image data。 |
| **HTTP status** | 数值 response status，例如 400 或 503。它描述 HTTP request outcome，与 Dwell session/turn status strings 分开。 |
| **Error code** | HTTP error、turn record 或 stream event 中按层定义的诊断字符串。相同拼写可能出现在多个层中，且不一定有 HTTP status。 |
| **Pairing code** | 本地 CLI 创建、用于 browser pairing 的一次性短 credential。它是安全敏感输入，不是 error code 或 request ID。 |
| **Request/turn idempotency** | 相同 `requestId` 和相同 payload 指向原 operation 的保证。它可避免 retry 时重复创建/执行，但不会让 Dwell replay 结果不确定的 Pi prompt。 |

具体 status/code 行为见 [shared contracts](../../../../src/shared/sessions.ts)、[thinking/model capabilities](../../../../src/shared/thinking.ts) 和[错误参考](errors.md)。
