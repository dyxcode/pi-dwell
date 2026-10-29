# 理解运行中的系统

[English](../../../../handbook/implementation/overview.md) | 简体中文

[Implementation](README.md) · [Handbook](../README.md)

<a id="reading-model"></a>

## 从职责建立整体理解

Dwell 是围绕外部 Pi coding-agent runtime 的 host process。CLI 启动或管理 host；browser 发送 authenticated HTTP commands 并观察 SSE。`SessionService` 协调 runtime ownership、记录 durable metadata。Pi 执行 model/tool work 并写入 native conversation files；browser 将这些 records 与 live events projection 成界面。

先读 [message workflow](workflow-message.md) 贯通一条完整路径，再从 [implementation index](README.md) 深入模块。

Source / verification：[`startHost`](../../../../../src/server/http.ts#L102) · [`SessionService`](../../../../../src/sessions/service.ts#L205) · [`PiProcess`](../../../../../src/runtime/pi-process.ts#L215)

<a id="processes"></a>

## Processes 与 lifetimes

Host 拥有 HTTP listener、authentication service、catalog connection、session coordination、live event buffers 和受监督的 Pi children。一个 child 对应一个打开的 hosted Pi session，browser tab 不拥有这个 child。多个 browser connections 可以观察同一 host state。关闭 browser 停止 observation；关闭 session 则释放 runtime 并保留 saved state。

Process state 与 durable session state 不同：catalog row 可以 ready，而 runtime 已 closed。Host restart 后按需打开 runtimes，interrupted prompts 保持中断状态。Service manager 可以重启 Dwell；当前 execution state 来自新的 host process。当前 HTTP API 仍报告 task scheduling unavailable。

Source / verification：[`SessionService.#view`](../../../../../src/sessions/service.ts#L1514) · [`SessionService.#open`](../../../../../src/sessions/service.ts#L1912) · [`isHostStatus`](../../../../../src/shared/protocol.ts#L14)

<a id="state"></a>

## 四类 state

| State | Authority | 能证明什么 |
| --- | --- | --- |
| Catalog 与 turn ledger | Dwell SQLite | Session/request identities、configuration、lifecycle、cancellation intent 与 recorded outcomes |
| Conversation 与 branches | Pi JSONL | Saved messages、tools、branch ancestry 与 context evidence |
| Runtime 与 live event projection | 当前 host process | 当前执行与有界内存中可 replay 的 observation |
| Drafts 与 presentation | Browser | 未发送输入、attachment drafts、选中的 views 与本地交互状态 |

Ledger row 保存 saved entries 的 references，不复制 text 或 images。Completed outcome 与 result content 可读是两件事；SSE 是有界 observation，不是 transcript archive；browser state 无法宣布 turn 完成或回滚 tool effect。

记录 dispatch intent 的 SQLite transaction 无法原子地包含外部进程或 Pi JSONL append，因此 Dwell 在 crash 后表达 interruption 与 unknown outcome。Native Pi extensions 也可能在 Dwell turn 之外执行，这些 executions 保留独立的 ephemeral identities。

Source / verification：[`SessionCatalog.markTurnDispatching`](../../../../../src/storage/catalog.ts#L781) · [`SessionService.getTurnResult`](../../../../../src/sessions/service.ts#L964) · [`SessionService.#observeRuntime`](../../../../../src/sessions/service.ts#L1686)

<a id="boundaries"></a>

## 输入跨越 validation 与 ownership boundaries

Browser input 依次经过本地交互规则、transport、HTTP admission、shared runtime validation、service ownership、catalog constraints 和 Pi protocol。每层检查不同条件：JSON shape、authorization、session 是否存在、idle ownership、dispatch 和 execution outcome。

Host 将 provider calls 与 agent loop 交给完整 Pi runtime。安装的 Pi 1.4.0 是明确的 compatibility boundary。Session resources 使用 Pi native loading rules，isolated probes 则有单独限制。Route/field/limit 查阅 [Reference](../reference.md) 和 [contracts](../contracts.md)，模块解释说明这些规则在何处生效。

Source / verification：[`startHost`](../../../../../src/server/http.ts#L102) · [`isTurnCreateRequest`](../../../../../src/shared/turns.ts#L85) · [`verifyPiConfiguration`](../../../../../src/runtime/pi-process.ts#L172)

<a id="terms"></a>

## 需要区分的相近概念

Dwell session ID 标识 host metadata，Pi session ID 标识 native conversation。Request ID 用于 submission deduplication；runId 标识已记录的 Dwell turn；native execution ID 标识没有对应 request 的 Pi work。History revision 为 pagination 标识 saved content；SSE cursor 标识 host event epoch 中的位置。Model context 是 Pi 当前使用的输入；saved history 是向用户展示的 persisted branch。

[Glossary](../glossary.md) 提供简明查询。

Source / verification：[src/shared/sessions.ts](../../../../../src/shared/sessions.ts) · [src/shared/turns.ts](../../../../../src/shared/turns.ts) · [src/shared/history.ts](../../../../../src/shared/history.ts) · [src/shared/events.ts](../../../../../src/shared/events.ts)
