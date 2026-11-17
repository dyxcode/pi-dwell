<a id="pi-dwell-documentation"></a>

# Pi Dwell 文档

[English](../../../handbook/README.md) | 简体中文

从使用 Dwell、理解功能行为，到沿着 browser 控件追踪 Pi execution 和 saved history，都可以在这里找到入口。请按当前想完成的任务选择章节。

<a id="quick-start"></a>

## 快速上手

[安装、配对并发送第一条消息](quick-start.md)。如果还没有运行过 Dwell，从这里开始。

<a id="guide"></a>

## 使用指南

[功能与日常使用](guide.md)：host 目录、session、model 与 thinking、图片、已保存的对话、context、cancellation、重新连接，以及当前限制。

<a id="tutorials"></a>

## 实践教程

[逐步完成完整流程](tutorials.md)：回到已有对话、切换 model、发送图片、停止并重新打开 session，以及沿代码追踪一个功能。

<a id="examples"></a>

## 示例

[可复用的操作示例](examples.md)：foreground/development mode、health check、revocation、日志、针对性检查，以及 turn payload 示例。

<a id="internals"></a>
<a id="implementation"></a>

## Implementation 实现手册

[按功能阅读实现](implementation/README.md)：每章独立解释模块职责、数据归属、完整流程、内部机制、技术取舍和验证场景。

| 想理解的功能 | 入口 |
| --- | --- |
| 创建、继续和命名会话 | [会话生命周期](implementation/session-lifecycle.md)、[共享名称](implementation/session-names.md) |
| 发送、停止与重连 | [发送消息](implementation/send-message.md)、[停止工作](implementation/stop-work.md)、[重连](implementation/reconnect.md) |
| 阅读内容与管理历史 | [历史与上下文](implementation/saved-history.md)、[Library](implementation/library.md)、[历史清理](implementation/history-retirement.md) |
| 搜索与阅读 Distill Memory | [Memory](implementation/memory.md) |

<a id="reference"></a>

## 技术参考

| 页面 | 内容 |
| --- | --- |
| [命令与配置](reference.md) | 完整 CLI 语法、state 存放位置、可选 HTTPS origin，以及参考导航 |
| [HTTP API](http-auth.md#complete-route-map) | 每个 route 的 method、authentication 要求、输入及 response 行为 |
| [Data contracts](contracts.md) | Shared types、validation、state 值和资源限制 |
| [错误参考](errors.md) | Error code、含义、诊断和恢复建议 |
| [概念表](glossary.md) | Pi/Dwell 的关键概念，以及相近概念之间的区别 |

<a id="development"></a>

## 开发

[开发与验证](development.md)介绍 repo 结构、配置、脚本、检查和修改流程。[测试与 fixture 索引](test-map.md)覆盖每个 test file、synthetic fixture 和具有静态名称的 test scenario。

<a id="scope-and-maintenance"></a>

## 范围与维护

这套文档覆盖 Dwell 当前源码及其面向用户的能力。已实现的兼容要求是 Node.js 22.19+ 和 Pi 1.4.0。Browser conversation client 与管理用 CLI 已可用；Distill Memory 与 source coordination、Current Library 均可按需启用；交互式 Dwell TUI 和 scheduled task 仍属于后续工作。

Guide 和 Tutorials 解释如何完成任务；Reference 定义准确接口；Implementation 解释每项功能如何工作。Source atlas 将源码声明连接到对应功能。

行为变化时同步更新相关章节；declaration 移动时刷新 source/test 索引的 anchor。
