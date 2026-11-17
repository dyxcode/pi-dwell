# 停止执行并关闭 Pi 运行实例

[English](../../../../handbook/implementation/stop-work.md) | 简体中文

[Implementation](README.md) · [Handbook](../README.md)

<a id="behavior"></a>

## 行为

停止操作针对一次执行：可以是有持久化记录的 Dwell 轮次，也可以是 extension 启动、带有进程内原生执行标识的 Pi run。关闭空闲会话会停止 Pi 子进程，同时保留 Dwell 会话和原生对话记录。Host 关闭流程会协调全部会话。

取消操作先记录意图。Prompt dispatch 前，轮次会直接结算为 aborted，Pi 不会收到这项工作。Dispatch 后，服务会请求 Pi abort 并等待执行结算；如果 Pi 先完成，completed 结果可能先确定，而取消意图仍会保留。

关闭运行实例会保留会话、记录最新原生历史，并停止空闲的 Pi 子进程。重新打开时会使用相同的 Pi 身份和已保存的文件。浏览器断开不会停止由 Host 持有的执行。

<a id="ownership"></a>

## 所有权

SQLite 持久化 Dwell 轮次的 lifecycle 和取消意图。会话服务负责判断目标轮次是否仍 active，并协调其 Pi 运行实例。

Pi 拥有 execution loop，并返回 abort 结果。Pi 进程适配层管理一个子进程、它的 RPC connection，以及当前执行。原生执行记录只反映进程内观察到的状态，不属于持久化轮次或请求标识。浏览器提交当前轮次或原生执行的标识，Host 据此识别过期的停止请求。

会话目录数据库保留会话身份、项目目录、运行实例设置和 Pi 原生文件引用。关闭子进程会释放运行资源，同时保留这条会话记录和对话记录。

<a id="execution"></a>

## 执行顺序

取消轮次时，服务先确认会话和目标轮次仍有效，再提交取消意图。若尚未 dispatch，轮次会记为 aborted，并取消仍在队列中的准备阶段 history scan；执行 worker 在发送 prompt 前退出。

对于已 dispatch 的工作，服务通过当前运行实例向 Pi 发送 abort command，并等待结算。如果 abort response 超时或 Pi 拒绝请求，服务会停止子进程。Pi 的关联响应确认控制命令的处理情况；之后的 settlement event 才说明执行结果。Dispatch 后若子进程或 RPC connection 丢失，轮次会标记为 interrupted，因为结果不确定。

取消原生执行时，服务会确认所提供的标识仍对应当前活动的 Pi 原生 run。它先请求 Pi abort，无法确认时再停止子进程。过期标识不能停止之后启动的 extension run。

关闭会话与目录变更串行执行。要求没有活动中的 Dwell 轮次，且 Pi 运行实例处于 idle。服务会尽力刷新原生历史和会话状态，然后停止运行实例、移除观察器并发布关闭状态。

Host 关闭流程会停止新的准入，把 dispatch 前的轮次标为 aborted，为已 dispatch 的轮次请求 cancellation，并停止全部 Pi 子进程。关闭事件中心和目录数据库前，它会等待轮次清理以及已准入的 history reads。Host 重启后，仍未结束的轮次会标记为 interrupted，且不会自动重新启动。

<a id="mechanisms"></a>

## 内部机制

取消意图与轮次状态代表不同事实：前者记录用户提出了取消，后者记录实际观察到的结果。Pi 收到 prompt 后，Dwell 会保留活动槽位，直到执行和最终记录都完成，避免停止结果尚未确定时启动重叠工作。

Abort RPC response 确认的是控制命令；Pi 的 settlement event 才提供执行结果。如果 abort transport 失败，停止子进程会关闭 RPC connection，当前执行的结果可能不确定。即使没有最终 assistant response，工具也可能已经产生副作用。

Runtime stop 会先关闭 Pi input stream，再按有界时限升级进程 signals。Pi 有机会优雅退出，Host 也能回收子进程；子进程退出时会释放观察器和待处理请求。Extension 工作使用进程内标识，因此后续轮次不会沿用它的停止目标。

<a id="technology"></a>

## 技术选择

Pi RPC 提供运行实例原生的 abort 和 event protocol。Dwell 持有子进程边界，因此既能停止无响应的运行实例，也继续复用 Pi 的模型与工具执行。SQLite 跨重启保存轮次取消和恢复决策；原生执行观察则留在内存中。

长时间 Pi work 位于全局变更队列之外。取消和关闭流程会针对实际拥有该执行的运行实例操作，再等待清理完成。

<a id="verification"></a>

## 验证场景

在 dispatch 前取消轮次。它会结算为 aborted，Pi 不会收到 prompt。

Pi 仍在运行时，在 dispatch 后请求取消。意图立即可见；活动槽位保持占用直到结算，之后的轮次不会并行启动。

让 Pi 完成与停止请求同时发生。终态由 Pi 报告的 settlement 决定，取消意图仍会被记录。

某次原生执行结束、另一条 run 启动后，再用旧标识请求停止。新 run 会继续。停止当前原生 run 后，其状态会独立于轮次记录结算。

关闭空闲会话后重新打开。Runtime 会针对同一个 Pi 会话和 saved 对话记录重建。若在 dispatch 后关闭流程再 restart，该轮次会成为 interrupted，prompt 不会 replay。
