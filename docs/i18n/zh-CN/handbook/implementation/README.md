# Implementation 实现手册

[English](../../../../handbook/implementation/README.md) | 简体中文

[Implementation](README.md) · [Handbook](../README.md)

<a id="start"></a>

## 理解 implementation

先读 [运行中的系统](overview.md)，再追踪一个完整 workflow，随后深入负责相关步骤的模块。正文用文字解释当前 implementation 的 input、decisions、state changes、outcomes、failure paths 和 cleanup。Source citations 直接打开相关 declarations。

准确 public interfaces 见 [Reference](../reference.md)，fields/limits 见 [contracts](../contracts.md)。查找某个 file/function 的文字解释，使用 [coverage](coverage.md) 和 [source atlas](../source-map.md)。

<a id="workflows"></a>

## 追踪完整 workflow

| 阅读 | 追踪 state changes |
| --- | --- |
| [Startup 与 session lifetime](workflow-lifecycle.md) | CLI → listener → pairing → session creation → model/images → close/reopen → shutdown |
| [一条 message](workflow-message.md) | Browser request → admission → durable intent → RPC → settlement → saved result，以及各 interruption points |
| [Observation 与 reconnect](workflow-observation.md) | Subscription → live projection → saved branch → reconciliation → reconnect/resync |

第一次阅读时，先完整走完 message workflow，再进入单个模块章节。Overview 区分 Pi 及其 session files，与 Dwell 的进程管理、请求记录和 browser client。

<a id="modules"></a>

## 深入职责与 functions

| 章节 | 职责 |
| --- | --- |
| [CLI 与 local files](cli.md) | 命令解析、本地 HTTP administration、paths 与 permissions |
| [Operating-system services](services.md) | Registration ownership、readiness、boot 与 stop behavior |
| [HTTP 与 SSE transport](http.md) | Admission、route dispatch、有界 bodies、streaming 与 shutdown |
| [Authentication 与 authority](authentication.md) | Pairing、credential state、browser binding 与 HTTPS authority |
| [Directory 与 model discovery](discovery.md) | Directory listing、isolated probes 与 capability extraction |
| [Shared data 与 validation](validators.md) | Field checks、identities、image decoding 与 event/history contracts |
| [Catalog 与 durable records](catalog.md) | Schema validation、migrations、transactions 与 turn transitions |
| [Session coordination](sessions.md) | Pi process 管理、请求接受、dispatch、cancellation 与 recovery |
| [Pi process 与 execution](runtime.md) | Launch、readiness、prompt disposition、native execution 与 stop |
| [JSONL RPC transport](rpc.md) | Correlation、buffering、deadlines 与 transport failure |
| [读取 Pi session files](history.md) | Branch reading、scan budgets、identity、cursors 与 images |
| [Session events](events.md) | Visible messages/tools、replay、limits 与 subscriptions |
| [Browser coordination](browser-controller.md) | Session views、async generations、pending requests 与 model selection |
| [Browser event state](browser-events.md) | SSE decoding、reducer state 与 live/saved reconciliation |
| [Rendering 与 assets](browser-rendering.md) | Markdown、DOM reuse、conversation grouping、HTML/CSS 与 asset serving |
| [Composer 与 attachments](browser-input.md) | Keyboard/viewport behavior、draft ownership 与 image previews |
| [Build 与 verification machinery](tooling.md) | Package contents、documentation checks、Pi 与 Chrome acceptance |

<a id="citations"></a>

## 如何使用 source 与 verification citations

Relative links 打开同一 checkout 或 repository view 中的 source。`#L…` anchor 标识核对过的 declaration 或 behavior；GitHub 支持跳行，部分 local Markdown viewers 只打开文件。Symbol 名称仍可见，viewer 忽略行号时也能搜索。Helper group 附近的 citation 可能指向该 group 的起点；source atlas 提供每个 declaration 的独立行号和 explanation section。

Verification links 指向相关 tests 与 [test atlas](../test-map.md)。Code 改变时同步更新 prose、source positions 和两种语言；需要运行的 checks 见 [coverage 与维护](coverage.md#verification)。
