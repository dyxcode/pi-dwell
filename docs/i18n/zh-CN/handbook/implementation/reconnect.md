# 重新连接会话并恢复实时状态

[English](../../../../handbook/implementation/reconnect.md) | 简体中文

[Implementation](README.md) · [Handbook](../README.md)

<a id="behavior"></a>

## 行为

浏览器重新连接后，继续观察同一个由 Host 持有的 Pi 会话。SSE 实时流传送会话状态变化、持久化轮次摘要、assistant 和 tool 输出投影，以及 Pi 原生 extension 执行状态。它展示执行进度；完整对话内容仍从 Pi 对话记录读取。

连接恢复时，Dwell 会重放浏览器最后接受的游标之后的事件，或发送新的快照。游标若属于旧 stream epoch、领先当前序号、早于保留的重放范围，或重放内容超出大小预算，server 会发送 resynchronization frame，再发送快照。浏览器随后重新读取已保存的历史，使当前快照与原生对话记录对齐。

快照描述当前执行和近期实时内容；完整 conversation branch 由 saved-history pages 提供。因此，即使早期事件已离开重放范围，重新连接仍可恢复会话视图。

<a id="ownership"></a>

## 所有权

SQLite 保存持久化的会话和轮次元数据。Pi 拥有执行过程和原生 JSONL history。事件中心在进程内维护有界 projection，包括会话状态、当前或最近轮次以及 Pi 实时事件；游标和重放 frames 也只保存在这里。

SSE transport 将已验证事件编码为 frames，处理每条连接的缓冲与 backpressure，并在写入期间重新检查浏览器授权。Subscriber 断开时只会移除监听器，Pi 进程和正在运行的轮次仍由 Host 管理。

浏览器将实时投影和最后接受的游标与 saved-history pages 合并。Stream updates 与 history reads 各自保持更新顺序，因此 settlement frame 可能早于对应的已保存条目到达。

<a id="execution"></a>

## 执行顺序

浏览器打开会话 stream 时，会发送最后接受的游标（如果有）。Host 会校验游标是否属于所选会话，读取持久化的会话和轮次视图，并将它们同步到进程内投影；随后计算初始 frames 并注册 subscriber。快照和重放的边界与订阅注册在同一个同步步骤中确定。

没有游标时，Host 发送快照。如果游标属于当前 epoch 且仍在重放范围内，Host 只发送后续 frames。游标属于其他 epoch、领先 stream、早于保留范围，或超出初始重放预算时，Host 会发送 resynchronization 和新快照。Host 重启或清理闲置 stream 后重建时，epoch 会变化。

浏览器增量解码 SSE frames，核对事件 envelope 与游标，并按序更新状态。发现 gap 时，实时投影会标为 incomplete。快照、重新同步，以及轮次或原生执行结束时都会触发 saved-history read；native identities 对上后，已保存条目会替换相应的实时项目。

会话选择、授权、history 和图片请求各自使用独立的浏览器 generation。切换会话或使 history 失效时，对应 generation 会递增；迟到的响应和图片回调会被丢弃，旧的 image object URLs 会释放。

<a id="mechanisms"></a>

## 内部机制

每条 stream 都有 epoch 和递增序号。游标由会话、epoch 与序号组成，因此只适用于对应的 stream history。每条 stream 最多保留 1,000 条事件或 1 MiB 重放数据。旧事件被清理后，新的快照会恢复当前状态。

生成初始 frames 前，事件中心先从持久化目录对齐会话和轮次元数据。计算 frames 和注册 subscriber 同步执行，因此不会在创建快照与开始订阅之间漏掉状态变化。重放 records 只存在于当前进程；Host 重启后，由目录数据和原生 JSONL 恢复会话视图。

浏览器会丢弃来自其他会话或 epoch 的增量事件。新的快照可以为所选会话建立新的 epoch。重复序号和同一 epoch 中较旧的快照会被忽略。若较小的快照仍与已显示文本兼容，浏览器会保留已有前缀。遇到 gap 或 epoch 变化时，实时输出会标为 incomplete，直到 history 确认哪些内容已经保存。

<a id="technology"></a>

## 技术选择

SSE 提供单向、有序的执行进度，不会让浏览器成为运行实例 owner。游标支持短暂断线后的有界重放；长时间中断和 stream 重建则由快照恢复。重放数据留在内存中，避免增加 event database；持久化目录和 JSONL 读取共同重建权威会话视图。

事件中心限制 stream 数量、事件数量、请求内容大小和 subscriber 数量。Transport 还限制每条连接的写入缓冲，慢速或断开的观察者因此不会无限占用 Host memory，也不能控制 Pi 执行。

<a id="verification"></a>

## 验证场景

使用仍在保留范围内的游标重连。浏览器只收到后续 frames，顺序连续，并继续显示同一实时执行。

使用已经清理的游标重连，或在 Host restart 后连接。Host 发送新快照；Saved-history pages 恢复对话视图，尚未确认保存的实时区间会标为 incomplete。

收到重复事件、来自其他会话的事件，或同一 epoch 中较旧的快照。浏览器保留所选会话的最新状态。

History 或图片请求仍在等待时切换会话。旧请求迟到的结果不会改变新会话的消息或图片预览。

轮次 settle 时，saved entries 仍在读取。实时输出继续显示，直到 native identities 证明历史已覆盖它；随后每条已保存消息只显示一次。
