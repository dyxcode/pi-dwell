<a id="tutorials"></a>

# 实践教程

[English](../../../handbook/tutorials.md) | 简体中文

[文档目录](README.md) · 前提：[快速上手](quick-start.md)

完整 workflow 见本组教程，较短的操作片段见[示例](examples.md)，功能行为说明见[使用指南](guide.md)。

<a id="continue-a-conversation-after-leaving-the-browser"></a>

## 离开 browser 后继续对话

**目标：**区分 browser connection 与 host 管理的 session。

1. 配对 browser，并在一个你熟悉的目录中创建 session。
2. 发送一个简短问题，等待回复。
3. 关闭 browser tab，保持 Dwell service 运行。
4. 使用相同 browser profile，再次打开同一个 origin。选择已有 session，不要重新创建。
5. 阅读已保存的对话，并针对上一次回复继续提问。

Service 管理 runtime；关闭 tab 只会断开 observation。新的 browser profile 或另一个 origin 需要单独 pairing。未发送的 image draft 位于 browser memory，不属于这次 persistence 操作所验证的内容。

**代码路径：**browser transport → HTTP session/history/event routes → SessionService → Pi JSONL。参见[系统流程](system.md#live-output-saved-history-and-reconnect)。

<a id="change-model-and-inspect-thinking"></a>

## 切换 model 并查看 thinking

**目标：**为单个 session 选择 model，同时保留 Pi 的 global default。

1. 打开一个 ready session，等待它处于 idle 状态。
2. 打开 composer 中的 model picker，选择可用的 provider/model。
3. 如果该 model 提供 thinking level，从返回的 level 中选择一个并确认。
4. 检查 composer 是否显示实际生效的选择。
5. 发送 prompt。如果 Pi 输出了可见 thinking 内容，展开对应的 thinking disclosure。
6. 关闭 session，再明确重新打开，检查实际生效的 model/thinking 设置。

Picker 使用 active session 的 registry，其中可以包含受支持的 extension-provided model。可用 thinking level 取决于所选 model。支持 thinking 的 model 不一定会在每条 response 中输出可见 thinking。重新打开已保存的 transcript 时，以 Pi 保存的 state 为准。

**代码路径：**[Web model picker](web-client.md) → session model/capability 操作 → [Pi runtime](runtime.md)。

<a id="send-an-image-and-find-it-in-saved-history"></a>

## 发送图片并在 saved history 中找到它

**目标：**区分 attachment draft 与已经保存的 image。

1. 在 idle session 中选择支持 image 的 model。
2. 通过 attachment 控件添加 PNG、JPEG、WebP 或 GIF，或直接粘贴图片。
3. 检查 draft preview，移除不需要的 attachment。
4. 输入问题并发送。最多允许四张图片，合计 5 MiB。
5. 等待 turn settle，并确认图片出现在 saved history 中，再重新打开页面查看已保存的对话。

提交之前，image draft 位于 browser memory。Pi 保存消息后，通过需要 authentication 的 route 从 native history 读取图片。图片以 ordered array 与文本一起发送；composer 不表示任意的 inline text/image 交错结构。

**代码路径：**attachments → shared image validation → turn admission → Pi prompt → saved image route。参见 [Contracts](contracts.md) 和 [Web](web-client.md)。

<a id="stop-work-and-close-a-session"></a>

## 停止工作并关闭 session

**目标：**理解 cancellation 与保留下来的 history。

1. Session 工作期间，使用 **Stop** 请求 cancellation。
2. 等待 state settle。Tool 可能已经完成部分操作；cancellation 不会撤销已发生的 side effect。
3. 关闭 session tab 并确认。如果仍有 active work，dialog 会询问是否 stop and close。
4. 从 session list 选择已关闭的 session，并明确重新打开。
5. 发起新工作前，先阅读 saved history。

关闭 session 会释放 runtime，同时保留 catalog 和 native conversation。Native extension execution 与提交的 Dwell turn 使用不同的 cancellation identity。单纯 connection 中断不构成 cancellation request。

**代码路径：**close dialog → abort route → session settlement → runtime stop。参见 [Sessions/storage](sessions-storage.md)。

<a id="trace-a-feature-through-the-code"></a>

## 沿源码追踪一个功能

**目标：**通过一个可观察行为理解 repo。

先以“提交一条消息”为例：

1. 在 [Web client](web-client.md) 中找到 composer send 路径及其 pending request identity。
2. 在 [HTTP](http-auth.md) 中找到 `POST /sessions/:id/turns`，检查 authentication、byte limit 和 `isTurnCreateRequest`。
3. 在 [Sessions/storage](sessions-storage.md) 中沿着 `submitTurn`、request-key 查找和 dispatch transition 阅读。
4. 在 [Runtime](runtime.md) 中追踪 prompt RPC correlation 与 event delivery。
5. 顺着 event hub、SSE writer、browser reducer 和 renderer 回到页面。
6. 找到 terminal bookkeeping 和 saved-history coverage。注意为什么可以先观察到 live reply，之后才得到完整 saved history。
7. 阅读 [turns.test.ts](../../../../tests/turns.test.ts)、[turns-http.test.ts](../../../../tests/turns-http.test.ts) 和 [turn-recovery.test.ts](../../../../tests/turn-recovery.test.ts)。修改行为前先运行相关 test file。

通过[源码索引](source-map.md)定位 symbol，通过[测试索引](test-map.md)查找相关 scenario。相同阅读方法也适用于 model switching、cancellation 和 browser pairing。
