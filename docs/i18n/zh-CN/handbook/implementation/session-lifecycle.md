# 会话生命周期

[English](../../../../handbook/implementation/session-lifecycle.md) | 简体中文

[Implementation handbook](README.md) · [Documentation](../README.md)

<a id="behavior"></a>

## 用户行为

Dwell 会话是一段 Pi 对话和项目目录的持久身份。无论 Pi 子进程运行还是休眠，打开的工作区都会显示为标签页。Host 重启后，标签页继续可用，但不会提前启动 Pi。

Host 最多允许同时运行 8 个 Pi 子进程。显式关闭前必须先停止正在进行的工作。关闭保留 Catalog 记录；若已配置 Distill，保存的历史此后才可进入蒸馏与保留清理流程。

<a id="ownership"></a>

## 模块职责与数据

Dwell 的私有 SQLite Catalog 保存 Dwell 与 Pi 身份、规范化项目路径、Pi 可执行文件配置、已选模型与 thinking level，以及生命周期状态、工作区打开状态与时间、轮次元数据。运行中的进程、RPC 连接和观察器只存在于内存中，Host 停止后随之消失。配置 Distill 后，持久的工作区 hold 会独立于子进程租约保护会话源。

Pi 拥有 agent loop、provider 调用、tools、extensions、有效 prompt 上下文、当前分支，以及原生 JSONL 对话。Dwell 记录会话文件的预期位置和身份，不另存对话记录。项目目录仍是 Pi 的工作目录；Pi 配置目录与凭据来自 Host 环境。SQLite 与 Pi 文件有各自的提交边界。

<a id="execution"></a>

## 执行流程

1. Host 启动时校验并迁移 Catalog，协调未完成的创建与轮次，并为已打开的工作区恢复 Distill hold。标签页继续显示，但不会提前启动 Pi 子进程。
2. 创建会话时规范化现存项目目录、检查 Pi 配置、分配独立的 Dwell 与 Pi 身份，并在启动 Pi 前提交创建记录。相同重试身份和设置返回原记录；同一身份配不同设置会被拒绝。
3. Pi 以 RPC mode 启动，使用所选项目作为工作目录、私有会话目录、Host 环境和已验证可执行文件。新会话使用预分配的 Pi 身份和可选模型；未指定时由 Pi 使用默认值。
4. Dwell 等待 Pi 状态，并检查会话身份、有效模型和会话文件后，才将会话标为可用。启动失败会被记录，子进程也会停止。
5. 重新打开前校验项目路径和原生会话文件。Pi 会继续打开已有文件；真正为空的会话则沿用原身份。预期文件缺失或无效时会拒绝打开，不会创建替代对话。
6. 工作区休眠时仍可读取保存的历史。发送 prompt、更改模型设置或读取实时上下文时，Dwell 按需启动 Pi。
7. 只有显式 Close 才会关闭工作区。若 Pi 仍在运行，Dwell 先停止它，再取得最终的历史边界。Dwell 持久化关闭决定，再请 Distill 在同一事务内解除 hold 并将该边界入队。重启会补做已记录的关闭，但不会因为 Pi 子进程退出而擅自关闭工作区。

<a id="mechanisms"></a>

## 内部机制

Pi 配置使用绝对可执行文件路径和可选绝对 Node entry point。Dwell 解析路径并验证 Pi 1.4.0 后保存。修改可执行文件配置前，必须关闭全部托管 Pi 运行实例，并等待所有活动轮次结束；每次启动子进程时都会重新检查路径和版本。

Catalog schema 带版本。启动时先校验，再在单个 SQLite immediate transaction 中执行 migration，随后检查新 schema 和 foreign-key 关系。失败会 rollback。损坏、版本不支持或权限不安全的 Catalog 会阻止启动，原文件保持不变。Transaction 可保护相互关联的 Catalog 更新和唯一性约束，但不涵盖 Pi JSONL 写入。

默认不回收空闲 Pi。Host 将 `DWELL_IDLE_TIMEOUT_MS` 设为正整数毫秒后，达到空闲时长且没有 Dwell 轮次、原生执行、RPC 请求或对话框等待处理时，才会停止子进程。工作区、保存的历史和 Distill hold 都会保留。

Session mutation 通过 Host admission queue 串行执行。Catalog 约束保证一个重试身份只对应一项创建请求，并限制每个会话只有一个活跃 Dwell 轮次。若 Pi 已执行操作、Dwell 尚未记录结果时进程崩溃，重启后该轮次标记为 interrupted。由于 Pi history 可能已经包含结果，Dwell 不会重放请求。

每次启动或重新打开时，Pi 从用户配置目录和所选项目加载原生资源，并应用上下文规则、信任设置、exclusions、extensions、skills、prompt templates、themes 与 MCP 配置。重新打开会刷新启动时加载的资源文件。Hosted execution 使用 Host 配置的 provider access。Host 以被动方式观察执行。没有交互消费者时，Dwell 的 Pi 适配层会向扩展对话框返回取消响应；浏览器没有终端对话框界面。

<a id="technology"></a>

## 技术取舍

Node 内置 SQLite 保存 Host 自有的身份和生命周期状态，Pi JSONL 则是权威对话历史。这样 Dwell 可以持久化自己的协调信息，而无需维护另一份对话记录。由于两者分属不同文件，崩溃可能让 Pi history 超前于 Dwell 轮次记录；状态不确定的工作会保持 interrupted。

Dwell 通过 stdio JSONL RPC 子进程监督完整 Pi coding-agent 运行实例。Response 与异步 Pi event 分开关联。格式错误、过大、无法匹配或超时的记录会使受管运行实例失败。进程隔离保留 Pi 原生资源与 extension 加载；Dwell 负责关闭子进程、校验状态和恢复。此边界固定支持 Pi 1.4.0；没有 interactive RPC consumer 时会取消 terminal-specific extension interaction。

<a id="verification"></a>

## 验证场景

- 相同重试身份和设置会返回同一个 Dwell 会话；设置变化会在启动第二个 Pi 进程前被拒绝。
- 新建的空会话即使还没有对话文件，也可用原 Pi 身份关闭并重新打开。已有会话会继续使用保存文件和有效模型。
- 预期文件被删除或损坏时，重新打开失败；Dwell 不会在旧身份下创建新空对话。
- 子进程报告错误会话或模型时，会在就绪前停止。路径无效或 Pi 版本不支持时无法启动，持久结果仍可查询。
- 运行时修改资源不会改变已打开进程；重新打开会载入当前 Pi 资源并继续遵守信任设置与 exclusions。
- Host 重启后，已打开的标签页仍可用，中断的操作不会重放。下一条 prompt 会恢复原生会话文件。重启或空闲回收均不会安排关闭蒸馏。
