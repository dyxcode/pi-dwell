# 追踪 live events、saved history 与 reconnect

[English](../../../../handbook/implementation/workflow-observation.md) | 简体中文

[Implementation](README.md) · [Handbook](../README.md)

<a id="subscribe"></a>

## 订阅但不接管执行

选择 session 后，browser 建立 authenticated event connection，同时独立读取 history。Server 围绕 current snapshot 与 bounded replay 安装 subscription；client 在应用前验证 frame。Observer 断开不取得取消 execution 的权限；被动 observer 收到 extension UI request 也不代表批准。

SSE writer 将 JSON 包成带 event IDs 的 frames，发送 heartbeat comments、遵守 output backpressure，并关闭 slow/revoked connections。Browser reducer 跟踪 session、epoch、sequence；过期或重复 frames 不能重复应用 visible changes。属于不同 active run 的 frame 可以推进 cursor，同时丢弃其 live payload，保持 stream position 而不改变 visible projection。Selection generation 防止旧 asynchronous connection 写入新的 selection。

Source / verification：[`SessionService.subscribeEvents`](../../../../../src/sessions/service.ts#L442) · [src/server/sse.ts](../../../../../src/server/sse.ts) · [src/clients/web/events.ts](../../../../../src/clients/web/events.ts) · [tests/events-http.test.ts](../../../../../tests/events-http.test.ts) · [tests/web-events.test.ts](../../../../../tests/web-events.test.ts)

<a id="projection"></a>

## 建立有界 live projection

Pi records 被 projection 为 session/turn updates、message blocks 与 tool progress。Event hub 裁剪 visible strings 和 tool collections，记录 truncation，并限制 replay retention。Thinking 与普通 text 保留 content order，private provider signatures 不被 projection。Live tool identity 包含 ownership，防止两个 assistant messages 复用 call ID 时被合并。

Client 将有效 deltas 应用到 local projection，并按 animation frame 合并 rendering。Keyed DOM reconciliation 保留兼容 nodes、展开 disclosures、selection 和 image callbacks，增长的 message 可以更新内容而不重建整个 conversation。Projection 保存在内存中；saved history 提供 durable content。

Source / verification：[src/sessions/events.ts](../../../../../src/sessions/events.ts) · [src/clients/web/conversation.ts](../../../../../src/clients/web/conversation.ts) · [src/clients/web/dom.ts](../../../../../src/clients/web/dom.ts) · [tests/conversation.test.ts](../../../../../tests/conversation.test.ts) · [tests/web-events.test.ts](../../../../../tests/web-events.test.ts)

<a id="saved"></a>

## 读取 persisted branch

History reads 验证 saved file identity、session header 与 directory，并遵守 scan budgets。Reader 从最后 persisted leaf 沿 parent relationships 选择 branch，不把文件全部行按时间当作当前对话。Trailing incomplete record 会被报告，不被当成完整 entry。Message fingerprints 加 occurrence counts 区分相同内容的重复 messages，tool ownership 跟随对应 assistant identity。

`HistoryPages` 生成有界 display entries、signed cursors 与 context evidence。Cursor 绑定 source/revision、byte prefix 和 page boundary index，branch 改变或文件被替换时不能悄悄沿用旧 view。Append-aware 逻辑在证明旧 page boundary 仍然属于相应内容时可保留稳定的旧页。Caller 根据 result 中的 truncation、incomplete-tail 和 coverage fields 判断完整性。

Source / verification：[`readSavedHistory`](../../../../../src/runtime/pi-history.ts#L336) · [`HistoryPages.read`](../../../../../src/sessions/history.ts#L380) · [tests/pi-history.test.ts](../../../../../tests/pi-history.test.ts) · [tests/history.test.ts](../../../../../tests/history.test.ts)

<a id="reconcile"></a>

## 用匹配的 saved evidence 替换 live content

执行过程中，message/tool result 可能同时存在于 live projection 和 saved page。Reconciliation 使用 native message identities 与 scoped tool identities 替换对应项目，不只比较显示 text。内容相同但 native occurrence 不同的 messages 仍然独立；未完成 live tool 可以在 saved result 可读之前保留当前进度。

Settlement 后，client 可能仍需读取 history。它保留 uncovered live work 并安排有界 recovery，不因 turn terminal 就清空。Server coverage flags 标明哪个 terminal turn/native execution 的预期内容已被证明存在于 saved branch。Client 也区分 active execution counts 与旧 baselines，防止 completed predecessor 隐藏新 follow-up。

History 删除或无法确认 result 时，展示 unavailable/partial evidence，并保留已记录的 durable outcome。

Source / verification：[`renderConversation`](../../../../../src/clients/web/client.ts#L1060) · [`loadHistory`](../../../../../src/clients/web/client.ts#L1286) · [`SessionService.getHistory`](../../../../../src/sessions/service.ts#L741) · [tests/session-events.test.ts](../../../../../tests/session-events.test.ts) · [tests/history-service.test.ts](../../../../../tests/history-service.test.ts)

<a id="reconnect"></a>

## Reconnect、resync 与 browser wake-up

Server 支持 reconnect 时携带最后已知 event cursor。Caller 提供 cursor，且 server 保留 matching epoch 与 sequence range 时，可以 replay 有界 events。当前 browser 在 stream failure 和 wake-up 后清空 cursor，因此这些 recovery paths 请求 fresh snapshot 并重新加载 history，不依赖 replay。Cursor stale/ahead、epoch 改变或超过 replay limit 时返回 resync，让 client 从 fresh state 重建 observation。Saved history 单独读取，新 snapshot 不是完整 transcript。

Page wake-up 与 refresh 恢复 connectivity 和 selected-session views，不重放 prompt。Authentication failure 返回 pairing；network outage 保留可恢复本地 state 并 retry observation。迟到 response 按 selection/generation 检查，防止切换 session 后显示旧 session history。Retry observation 与 submit new work 的区别，是 refresh、reconnect、host restart 共同需要保持的 invariant。

Source / verification：[`stream`](../../../../../src/clients/web/client.ts#L1399) · [`resume`](../../../../../src/clients/web/client.ts#L2273) · [src/sessions/events.ts](../../../../../src/sessions/events.ts) · [tests/events.test.ts](../../../../../tests/events.test.ts) · [tests/web-events.test.ts](../../../../../tests/web-events.test.ts)
