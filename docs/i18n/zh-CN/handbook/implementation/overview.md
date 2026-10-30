# Dwell 如何托管 Pi

[English](../../../../handbook/implementation/overview.md) | 简体中文

[Implementation](README.md) · [Handbook](../README.md)

<a id="reading-model"></a>

## System structure

CLI 启动或管理 Dwell host。Host 在 child processes 中运行 Pi，通过 RPC 交换 commands 与 events。Browser clients 向 Host 发送 authenticated HTTP requests，并通过 SSE 接收更新。

先读 [message workflow](workflow-message.md) 贯通一个完整请求，再从 [implementation index](README.md) 深入各模块。

Source / verification：[`runCli`](../../../../../src/clients/cli/main.ts#L9) · [`startHost`](../../../../../src/server/http.ts#L102) · [`PiProcess`](../../../../../src/runtime/pi-process.ts#L215)

<a id="state"></a>

## Components 与职责

| System | Component | Responsibility | Data 与 state |
| --- | --- | --- | --- |
| Dwell host | [HTTP server](http.md) | 校验并分发请求，提供 HTTP responses 与 SSE streams | Listener、connections 与 stream writers |
| Dwell host | [Authentication service](authentication.md) | CLI authentication、browser pairing 与 access revocation | Credentials、browser-session records、待兑换 pairing codes 与 rate limits |
| Dwell host | [Session service](sessions.md) | 启停 Pi processes，接受请求并跟踪执行 | Host memory 中的 Pi process handles、待完成操作与 execution status |
| Dwell host | [Session catalog](catalog.md) | 保存 Pi configuration、Dwell session records 与提交的 turns | SQLite 中的 session mappings、request IDs、outcomes 与 Pi entry references |
| Dwell host | [Session events](events.md) | 将 Pi 输出转换为 client events，并保留有界 replay | Host memory 中的实时 message/tool state、event cursors 与 replay buffers |
| Pi | [Pi](runtime.md) | 执行 agent loop、model calls、tools 与 extensions，保存对话 | Pi process 中的 context，以及原生 JSONL session files |
| Browser | [Web client](browser-controller.md) | 提交用户输入，展示 Pi messages、tool results 与进度 | Drafts、attachment previews、selection 与显示内容 |

Source / verification：[`LocalAuth`](../../../../../src/server/auth.ts#L87) · [`SessionService`](../../../../../src/sessions/service.ts#L205) · [`SessionCatalog`](../../../../../src/storage/catalog.ts#L541) · [`SessionEvents`](../../../../../src/sessions/events.ts#L370) · [Web client](../../../../../src/clients/web/client.ts)

<a id="processes"></a>

## Pi sessions 与 processes

Dwell 为每个托管的 session 保存 catalog record，将自己的 session ID 与 Pi session ID、project directory 以及已创建的 session file 关联。继续该 session 时，Host 校验记录中的 directory 与 file，再启动 Pi 读取该文件。应当存在的 session file 缺失时，请求返回 `history_unavailable`。

Host 以独立 subprocess 运行 Pi，沿用 Pi CLI 的启动流程、进程环境与资源加载机制，保持 Pi extensions 的兼容性。`PiProcess` 封装 child process 及其 RPC connection。[Pi process 章节](runtime.md) 解释 executable configuration、version checks、启动与停止的实现。

Dwell 启动时读取 catalog，并按需启动 Pi processes。[Lifecycle workflow](workflow-lifecycle.md) 沿相关 functions 解释 session 创建、恢复和 shutdown。

Source / verification：[`SessionService.createSession`](../../../../../src/sessions/service.ts#L506) · [`SessionService.#open`](../../../../../src/sessions/service.ts#L1912) · [`PiProcess.start`](../../../../../src/runtime/pi-process.ts#L274)

<a id="boundaries"></a>

## 请求流程与 recovery

Browser 提交 message 后，Host 检查 authentication、request fields，以及 session 当前能否接受工作。它记录 request ID 与 payload hash 用于去重，再通过 Pi RPC 发送 prompt。使用同一 request ID 和 payload 重试时，返回已有 turn。准确的 routes、fields 与 limits 见 [Reference](../reference.md) 和 [contracts](../contracts.md)。

Host 在发送 prompt 前先向 SQLite 记录 `dispatching`。Database write 与 Pi execution 是两个独立操作：crash 后，Dwell 可能无法确定 Pi 是否已经收到 prompt 或完成某个 tool action。Restart recovery 将未完成 turns 标记为 interrupted，不重新发送对应 prompts。

执行过程中，Dwell 将 Pi events 转换为有界 SSE updates。它从 Pi JSONL files 读取已保存的 messages 与 tool results，并将 entry IDs 记录到对应的 Dwell turn。Browser 将这些 entries 与实时输出匹配，避免重复显示。已完成 turn 引用的内容被删除时，仍可能返回 `result_unavailable`。[Observation workflow](workflow-observation.md) 解释 history reads、内容匹配与 reconnect。

Pi extensions 可以在没有 Dwell request 的情况下发起工作。Dwell 使用独立的 native execution ID 跟踪这些工作，以报告进度、定位取消目标，并与其他请求区分。

Source / verification：[`SessionService.submitTurn`](../../../../../src/sessions/service.ts#L882) · [`SessionCatalog.markTurnDispatching`](../../../../../src/storage/catalog.ts#L781) · [`SessionService.getTurnResult`](../../../../../src/sessions/service.ts#L964) · [`SessionService.#observeRuntime`](../../../../../src/sessions/service.ts#L1686)

<a id="terms"></a>

## Dwell 使用的 identifiers

| Identifier | 用途 |
| --- | --- |
| Dwell session ID | 查找 Dwell catalog record，并通过 HTTP 指定 session |
| Pi session ID | 标识该 record 对应的 Pi conversation |
| Request ID | 识别重复提交的请求 |
| `runId` | 标识已接受请求对应的 Dwell turn |
| Native execution ID | 跟踪非 Dwell request 发起的 Pi work |
| History revision | 让 pagination 对应正在读取的 saved content |
| SSE cursor | 跟踪当前 host event epoch 中的 event position |

相关概念的定义见 [Glossary](../glossary.md)。

Source / verification：[src/shared/sessions.ts](../../../../../src/shared/sessions.ts) · [src/shared/turns.ts](../../../../../src/shared/turns.ts) · [src/shared/history.ts](../../../../../src/shared/history.ts) · [src/shared/events.ts](../../../../../src/shared/events.ts)
