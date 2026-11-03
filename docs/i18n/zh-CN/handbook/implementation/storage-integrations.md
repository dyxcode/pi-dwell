<a id="storage-integrations"></a>

# Local storage integrations

[English](../../../../handbook/implementation/storage-integrations.md) | 简体中文

[Implementation index](README.md) · [Session files](history.md) · [Catalog](catalog.md)

Dwell 托管 Pi 并读取 Pi native session files。配置 Distill binding 后，Dwell 的读取与 hosted process 会参与 Distill source cleanup 的 coordination。Binding 使用 Distill public Node API 及配置的 database。

<a id="integration-configuration"></a>

## Configuration 与 API opening

[`readIntegrations`](../../../../../src/integrations/configuration.ts) 读取 Dwell data directory 下的 private `integrations.json`。文件不存在时采用 standalone operation。文件要求 version 1 与已知字段；`absolutePath` 检查不含 NUL 的 local absolute path。现有 private-file 检查负责 owner-only permissions、regular-file ownership 与 configuration size limit。

`startHost` 先打开配置的 storage，再创建 SessionService，并保留 connection 直到 session shutdown 完成。Configuration 或 import 失败会使 startup 失败。Shutdown 等待已接受的 requests 与 Pi processes，释放 source access，关闭 storage adapter，最后关闭 listener。

[`openDistill`](../../../../../src/integrations/distill.ts) import 配置的 local module，再以 database path 调用 `openHostStorageV1`。`isDistillStorage` 一次性检查 API version 1 及 read、host-use、recovery、receipt、close methods，然后返回 Distill 的 API instance。Dwell 的 structural types 描述 public contract；database 与 source record 的验证由 Distill 负责。

<a id="source-read-coordination"></a>

## Short reads 与 Pi process lifetime

[`SessionSourceAccess`](../../../../../src/sessions/source-access.ts) 分别管理两种 access。Constructor 只通过 Distill 的 exact-child-exited check 恢复 attached reservation；无法确认 child 状态的 opening 继续保留。

`read` 使用 Pi session ID、实际 file path 与 working directory 获取 short source-read lease，并在整个 history reader 执行期间持有它。`#releaseRead` 在读取成功或失败后释放 lease；release 失败时保留记录，供 shutdown 重试。读取与 release 同时失败时，`AggregateError` 保留两个 error。Distill access gate 正被占用时，`SourceAccessError` 转为 `source_busy`，原 file observation 保持不变。

`begin` 在读取 saved history 或 spawn Pi 之前建立 durable host-use reservation。Fresh session 尚无 file path 时，提供 Pi ID 与 working directory。返回的 `onSpawn` callback 绑定实际 child PID，并由 close promise 在 child 确认关闭后释放 reservation；如果 attach 本身失败，确认 close 后可以放弃该 opening。`abandon` 只释放从未 spawn child 的 reservation。因此，hosted Pi process 持有 durable reservation，同时允许其他 short reads 使用 global gate。

`#release` 在 durable operation 成功或 reservation 已不存在时移除 pending release；若 release 被拒绝且 reservation 仍存在，则保留它供重试。`drain` 在 session reads 与 stop operations 结束后尝试每个 pending read 和 host-use release，再用一个 `AggregateError` 汇总失败。尚未关闭的 child 也计入该报告。Host 意外退出后，Distill 保留无法确认的记录；仅经过一段时间不会释放它们。

`SessionService.#checkHistory` 通过 `read` 执行实际 history read。`#open` 在检查 saved content 前调用 `begin`，把 `onSpawn` 传给 `PiProcess.start`，并在退出时放弃未 spawn 的 opening。Pi startup 在第一次 readiness RPC 前调用 callback；callback 失败时，先停止并等待 child 关闭，再返回 startup error。关闭 idle session 时，即使可选的 history refresh 返回 file 或 access error，仍会停止 Pi；已有 file observation 继续保留。

Verification：[source access](../../../../../tests/session-source-access.test.ts)、[Pi lifecycle](../../../../../tests/distill-sessions.test.ts)、[Host configuration](../../../../../tests/integrations-host.test.ts)、[adapter contract](../../../../../tests/distill-adapter.test.ts) 与 [spawn/close callback](../../../../../tests/runtime-spawn.test.ts)。实际 Distill acceptance 使用配置的 built module 和 synthetic storage。
