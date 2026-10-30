# OS service management

[English](../../../../handbook/implementation/services.md) | 简体中文

[实现索引](README.md) · [CLI 与 service 概览](../cli-service.md) · [Development reference](../development.md)

Service adapter 通过 macOS launchd 或 Linux systemd 管理一个 production user service。它根据明确的 executable path 生成 registration，确认 manager 指向完全匹配的 registration，并在报告启动成功前检查 authenticated host readiness。Install 不会启用 login startup；Uninstall 删除 service registration，但保留 Dwell data 与 user lingering。

<a id="service-command-and-paths"></a>
## Command contract 与 path resolution

[runServiceCommand](../../../../../src/service/service.ts#L983) 只接受六个 SERVICE_ACTIONS，在解析完整的 ServicePaths record 后进行 dispatch。[ServiceCommandOptions](../../../../../src/service/service.ts#L58) 提供 platform、home、executable、entry point、user ID、command runner、readiness probe 和 polling limit 等内部 test seams；它们不是 CLI option。Restart 会在 stop 和 start 前验证当前 registration。已知的 Linux legacy registration 必须先升级。

[defaultRunner](../../../../../src/service/service.ts#L96) 使用 execFile 和 argument array，设置五秒 timeout、128 KiB output cap，不经过 shell。它将 process failure 规范化为包含 exit code 和捕获输出的 result。[validatePath](../../../../../src/service/service.ts#L119) 要求绝对路径且不含 control character，并解析 dot segment。[resolvePaths](../../../../../src/service/service.ts#L130) 只支持 darwin 与 linux；它解析并确认 home directory 属于当前用户，校验 executable 和 entry-point path，推导 production data、registration、log 与 manager target，并对本地目标执行 validateDataDirectory，同时校验 startup/polling duration 为正数。默认 readiness callback 会查询 authenticated local host status；注入的 runner/callback 让测试能模拟 manager 行为，而无需改变 public command syntax。

<a id="safe-service-directories"></a>
## Service directory 检查

[ensureDirectories](../../../../../src/service/service.ts#L197) 使用 lstat 逐级检查 path component。它拒绝 symlink、非 directory，以及不属于当前用户的 component。只有请求允许创建时才创建缺失目录；遇到 EEXIST race 会重新读取并检查。每个 component 都必须允许 owner read/write/search；macOS 专用 Application Support 和 log directory 的最终目录还必须为 private 0700。

[ensureServiceDirectories](../../../../../src/service/service.ts#L255) 选择 macOS Application Support/Logs tree 或 Linux systemd user-unit tree。Linux systemd directory 只检查 owner access，不强制采用 Dwell 专用 macOS directory 的 private-directory rule。Registration file 本身仍以 private mode 创建。

<a id="registration-generation"></a>
## 生成 launchd 与 systemd registration

Generator group 将 serialization 与 install 分开。[plistEscape](../../../../../src/service/service.ts#L275) 转义 XML text。[systemdQuote](../../../../../src/service/service.ts#L279) 转义 backslash、quote、percent specifier；序列化 command argument 时还会转义 dollar expansion。[launchAgentContent](../../../../../src/service/service.ts#L285) 生成固定的 Node、entry-point、serve arguments、working directory、HOME、private stdout/stderr log path、RunAtLoad、异常退出后重启以及五秒 throttle。写入 plist 并不等于 bootstrap 到 launchd。

[systemdUnitContent](../../../../../src/service/service.ts#L329) 生成 Type=simple、HOME、ExecStart、on-failure restart、五秒 restart delay、十秒 stop timeout、journal output、start-rate limit 和 WantedBy=default.target。它不会 enable unit，也不会强制在 default.target 后排序。WorkingDirectory 遵循 systemd scalar grammar，因此当前格式会转义 percent 并追加 /.，保留尾随空格和 backslash。[registrationContent](../../../../../src/service/service.ts#L360) 选择平台 generator。[isLegacyRegistration](../../../../../src/service/service.ts#L364) 识别精确的已知 Linux unit 旧格式。

<a id="registration-ownership"></a>
## Registration ownership、更新与 race handling

[fileOpenFlags](../../../../../src/service/service.ts#L372) 使用 read-only、no-follow 和 nonblocking flags，避免 symlink 改变目标或 FIFO 令检查卡住。[readPrivateRegistration](../../../../../src/service/service.ts#L376) 将缺失 path 视为 absent；否则要求它是 private、由当前用户拥有、单链接、且 owner 可读的 regular file。Stat size 和实际读取字节数都限制为 64 KiB，并始终关闭 handle。

[upgradeRegistration](../../../../../src/service/service.ts#L418) 写入随机名称的 exclusive 0600 sibling 并 sync，然后重读旧 registration 检查是否被并发替换；接着原子 rename 新内容、sync parent directory，并删除遗留 temporary path。[writePrivateRegistration](../../../../../src/service/service.ts#L450) 只接受完全匹配的 current registration 或精确已知的 legacy 内容。遇到无关内容会在 mutation 前拒绝。Linux 会在保留或替换 registration 前、首次创建前，以及另一 installer 通过 identical content 赢得 exclusive-create race 后，再次检查 loaded manager identity。若 manager 使用其他 file path 或 create race 发生冲突，就会在 daemon-reload 前中止。

[verifyRegistration](../../../../../src/service/service.ts#L506) 先检查 directory chain，再通过精确 content comparison 返回 absent/current/legacy。Status 和 stop 等操作可以检查已知的 legacy unit；start 和 restart 则要求当前生成版本。这一区别允许安全检查与停止，同时要求显式运行 install 升级后才能启动。

<a id="manager-command-adapter"></a>
## Manager command adapter 与 Linux boot state

[run](../../../../../src/service/service.ts#L527) 将固定 command 和 argument list 转交给注入的 runner。[commandError](../../../../../src/service/service.ts#L535) 依次选择 stderr、stdout、exit code 作为诊断。[runRequired](../../../../../src/service/service.ts#L542) 遇到非零结果时抛出该诊断。[reloadLinuxManager](../../../../../src/service/service.ts#L552) 仅在 Linux 执行 daemon-reload。

[unknownSetting](../../../../../src/service/service.ts#L557) 会将 informational query failure 报为有界的 “unknown”。[linuxAutostart](../../../../../src/service/service.ts#L562) 读取 systemd UnitFileState，区分 enabled、disabled、仅运行期 enablement、非持久状态，以及无效/失败的 query。[linuxLingering](../../../../../src/service/service.ts#L596) 读取 logind 的 Linger 值；query failure 同样报告为 unknown。[linuxBootStatus](../../../../../src/service/service.ts#L613) 并发执行两项独立、只读 query 并合并结果。Status reporting 和 install 都不会修改 lingering 或 enable autostart。

<a id="manager-identity-inspection"></a>
## Manager identity 检查

[inspectLinux](../../../../../src/service/service.ts#L618) 向 systemd 查询 LoadState、FragmentPath、MainPID 和 ActiveState。它拒绝重复 property、缺失或格式错误的值，以及不完全匹配 expected registration 的 FragmentPath。Unit 不存在时返回 undefined。Legacy-repair path 只有在 registration file 符合预期、unit inactive 且 PID 为零时才接受 bad-setting。

[parseLaunchdRegistration](../../../../../src/service/service.ts#L675) 从 launchctl output 中提取 path、program、argument lines、PID 和 state；本地的 value reader 负责读取 scalar field；若 state 缺失，则根据 PID 回退为 running 或 idle。[validateLaunchdIdentity](../../../../../src/service/service.ts#L700) 要求 registration path、executable 和三个 arguments 全部精确匹配。[inspectMac](../../../../../src/service/service.ts#L714) 执行 launchctl print，识别 manager 报告 service 不存在的情况，并在返回 state 前校验每个 loaded identity。

[managerProcessIsRunning](../../../../../src/service/service.ts#L727) 要求 PID 大于零且 state 名称与平台的 active 状态相符。[inspectManager](../../../../../src/service/service.ts#L732) 分发到正确的 adapter。这些检查可避免把同名的 foreign unit 或 LaunchAgent 当作 Dwell。

<a id="readiness-and-start"></a>
## Start 与 authenticated readiness

[readReadiness](../../../../../src/service/service.ts#L736) 调用配置好的 readiness probe。[validateReadyIdentity](../../../../../src/service/service.ts#L744) 要求 HTTP host process ID 与 manager PID 一致、运行模式为 production，且 instance ID 非空。单凭 manager state 不能证明预期的 Dwell process 拥有固定 listener。

[waitForReady](../../../../../src/service/service.ts#L757) 会轮询到 startup deadline。Manager 报告 process running 后，函数会在剩余时间内执行 authenticated HTTP check 并验证 identity；若需要重试，则记录最近一次 readiness issue。每轮等待配置 interval 与剩余 deadline 中较短者，超时后报告最后一次 issue。

[startService](../../../../../src/service/service.ts#L784) 在 manager 操作前验证 current registration 并准备需要的 directories。Linux 先 reload systemd，两个 adapter 再检查当前状态。macOS 对未加载的 job 执行 bootstrap，对已加载但未运行的 job 执行 kickstart；Linux 只启动未运行的 unit。已运行的 service 会检查 readiness，但不会被 restart。如果本次调用启动 service 后 startup 或 readiness 失败，函数会尝试 stop owned service，并将 cleanup failure 与原始错误一起报告。若命令执行前 service 已在运行，readiness failure 不会导致它被停止。

<a id="stop-uninstall-and-status"></a>
## Stop、install、uninstall 与 status

[waitForStopped](../../../../../src/service/service.ts#L832) 轮询直到 launchd 不再报告 job，或 Linux 报告 PID 为零且 state 为 inactive/failed。[stopService](../../../../../src/service/service.ts#L851) 要求 registration 属于本服务（包括已知 legacy 内容）；Linux 必要时 reload，然后只对该 manager identity 执行 launchctl bootout 或 systemctl stop。它不会 kill 任意 PID。当 owned registration 未加载时返回 false。

[removeRegistration](../../../../../src/service/service.ts#L866) 在 unlink 前立即重读内容，只会删除 current 或精确已知的 legacy registration。[install](../../../../../src/service/service.ts#L877) 校验生成内容、创建安全目录、写入或升级 owned file，然后 reload Linux。若 reload 失败，会保留已保存的 registration 并提示重试 install。Install 不会 start/restart process，也不会 enable autostart；Linux 报告实际 autostart 和 lingering state；macOS 将 login autostart 报告为 disabled，但不报告 registration 当前是否已加载。

[uninstall](../../../../../src/service/service.ts#L904) 会先 stop 并等待。Linux 随后再次确认 registration ownership，再 disable autostart，然后删除 registration 并 reload manager。每个失败都会说明已完成到哪一步，并尽可能保留后续 state。它会保留 Dwell data directory，也不会改动 user lingering。[runtimeStatus](../../../../../src/service/service.ts#L939) 报告 launchd/systemd service state 和 authenticated Dwell host readiness：未加载、已停止、failed、activating、deactivating、其他 not-ready 状态、ready，或 process running 但 host not-ready。Readiness failure 会写入 status text，不会使 command 失败。[status](../../../../../src/service/service.ts#L974) 合并 service status、Linux boot settings 和 legacy-upgrade 提示。

<a id="service-test-evidence"></a>
## Test evidence

[service.test.ts](../../../../../tests/service.test.ts#L69) 覆盖生成文件与权限、path escaping、隔离失败、ownership、FIFO/hard-link 防护、readiness identity、startup cleanup、平台 manager command 和 registration 删除。[service-boot.test.ts](../../../../../tests/service-boot.test.ts#L167) 覆盖 Linux ordering、拒绝 foreign unit、exclusive-create race、原子 legacy upgrade、特殊 working-directory 字符的 parser acceptance、live boot-state reporting、partial failure 和 uninstall 顺序。测试注入 manager response 并使用临时目录；不会安装真实 user service。
