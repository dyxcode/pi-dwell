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

[开始阅读 implementation handbook](implementation/README.md)：通过文字理解运行中的系统、追踪完整 workflows，并深入模块与 function behavior。Source/test citations 将解释链接到对应实现与 checks。

| 阅读路线 | 入口 |
| --- | --- |
| 理解系统 | [Processes、ownership 与 state](implementation/overview.md) |
| 追踪 workflow | [一条 message](implementation/workflow-message.md)、[startup/session lifetime](implementation/workflow-lifecycle.md)、[observation/reconnect](implementation/workflow-observation.md) |
| 深入模块 | [按职责组织的模块章节](implementation/README.md#modules) |
| 查找 function | [Source 与 explanation atlas](source-map.md) |
| 检查覆盖 | [43 个 production files 与 callable coverage](implementation/coverage.md) |

[System overview](system.md)、[CLI/service](cli-service.md)、[HTTP/authentication](http-auth.md)、[sessions/storage](sessions-storage.md)、[runtime](runtime.md)、[browser](web-client.md) 提供紧凑的概览与参考；implementation handbook 详细解释各 workflow 与 module。

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

这套文档覆盖 Dwell 当前源码及其面向用户的能力。已实现的兼容要求是 Node.js 22.19+ 和 Pi 1.4.0。Browser conversation client 与管理用 CLI 已可用；交互式 Dwell TUI、scheduled task 和 domain integration 仍属于后续工作。

Guide 和 Tutorials 解释如何完成任务；Reference 定义准确接口；Implementation 用文字解释 workflows、module logic 与 callable behavior。Function bodies 保留在源码中，通过 citations 和 source atlas 跳转核对。External dependency 只解释 Dwell 与其交互的边界。

行为变化时同步更新相关章节；declaration 移动时刷新 source/test 索引的 anchor。
