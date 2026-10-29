<a id="cli-local-files-and-os-services"></a>

# CLI、本地文件和操作系统服务

[English](../../../handbook/cli-service.md) | 简体中文

详细文字解释：[Implementation](implementation/cli.md).

[文档索引](README.md) · [命令参考](reference.md)

<a id="entry-point-and-command-grammar"></a>

## Entry point 和命令语法

[`src/cli.ts`](../../../../src/cli.ts) 将 `process.argv.slice(2)` 传入 `runCli`，捕获未知 failure，打印一条带前缀的 error，并将 exit status 设为 1。它不会隐式安装 service 或启动 provider。

[`arguments.ts`](../../../../src/clients/cli/arguments.ts) 返回一个带判别字段的 `Command` union。没有参数时表示 `serve`；顶层和受支持的 command 前缀都能显示 help。`parseOptions` 会分离具名值和位置参数、拒绝重复 options，并验证唯一的 `--dev` flag。`requiredValue` 拒绝空值；`absolutePath` 要求 executable 和 entry point 使用绝对路径。

Service commands 必须且只能接受 install、uninstall、start、stop、restart、status 之一。它们始终作用于 production。`pi configure` 只接受具名 executable/entry-point options 和可选的 `--dev`。其余 commands 只接受可选的 `--dev`；没有公开的 port 或 data-directory override，也没有 session-management CLI。

[`main.ts`](../../../../src/clients/cli/main.ts) 分发已解析的 command。Status/configuration 结果以 JSON 打印；pairing 会打印 code 和 expiry；service management 会打印状态文本。前台 serving 会动态导入 HTTP Host 并安装 SIGINT/SIGTERM handlers。启动期间收到的 signal 会被记下，等启动完成后再处理。若 port 已占用，会返回可操作的 error，说明固定 listener 和 mode 冲突。

<a id="local-http-client"></a>

## 本地 HTTP client

[`status.ts`](../../../../src/clients/cli/status.ts) 实现 `localRequest`：读取 private credential、构造 loopback URL、序列化 POST bodies、使用 abort deadline、拒绝 redirects，并返回解析后的 unknown JSON。在本地会拒绝带有 body 的 GET。默认 request timeout 为 3 秒。

Timeout 提示 Host 可能已经完成操作。Network errors 会包含地址和启动 command。401 会说明 development/production credential 不匹配。非 JSON responses 和 error responses 分开处理。`errorMessage` 只提取有效的公开 message；每个 wrapper 都会验证自己的预期 response：HostStatus、pairing code/expiry，或 `{ok:true}`。

[`runtime.ts`](../../../../src/clients/cli/runtime.ts) 将 configuration 的 deadline 提高到至少 60 秒，因为验证 executable 可能比 status 耗时更久。它向 `/api/v1/runtime` POST 并验证返回的 RuntimeConfiguration。修改 configuration 前，service 要求关闭所有 open sessions。

<a id="data-path-and-private-file-rules"></a>

## 数据路径和私有文件规则

[`local/paths.ts`](../../../../src/local/paths.ts) 选择 `~/.local/share/pi-dwell` 或 `~/.local/share/pi-dwell-dev`。`canonicalDestination` 会解析已存在的祖先目录，即使最终 destination 尚不存在。`validateDataDirectory` 会拒绝位于 home Obsidian vault 内的路径，并沿祖先目录检查 `.git` 或 `.obsidian`，以免 alias 绕过 repository/vault 隔离。`hasCode` 会安全地缩窄 filesystem errors。

[`local/files.ts`](../../../../src/local/files.ts) 集中处理 storage operations：

| Function | 约定 |
| --- | --- |
| `prepareDataDirectory` | Canonicalize，使用 0700 创建；要求目标是当前 user 拥有、权限严格为 owner-only 的 directory。 |
| `readPrivateFile` | 使用 NOFOLLOW 和 NONBLOCK 只读打开；要求目标是单链接 regular file，由当前 user 拥有且权限严格为 0600，大小不超过 1 MiB。 |
| `createPrivateFile` | 使用 NOFOLLOW，以 0600 独占创建，随后 write、sync 并 close。 |
| `replacePrivateFile` | 验证现有 file；写入并 sync 一个唯一的 private sibling temporary file；rename、sync parent，并清理临时文件。 |
| `readCredential` | 读取已有 state，并验证 64-hex credential。 |

不安全的既有路径会被拒绝并保持不变。Atomic replacement 提供单个文件的一致更新；它不覆盖 SQLite、JSON files 和 Pi side effects 的跨资源事务。

<a id="service-configuration-and-injected-test-seams"></a>

## Service configuration 和注入式测试接口

[`service/service.ts`](../../../../src/service/service.ts) 是 OS-service adapter。`runServiceCommand` 解析路径并分发单项 action。`ServiceCommandOptions` 允许 tests 注入 platform、home、executable、entry point、user ID、command runner、readiness probe 和 polling deadlines。这些是内部 TypeScript seams，不是 CLI flags。

`resolvePaths` 只接受 macOS 和 Linux。它会验证 home 是 user 拥有的绝对路径，executable 和 entry-point 路径为不含 control characters 的绝对路径，验证 user ID 和正数 polling 参数，并按本地隔离规则验证 state、registration 和 log destinations。

| 平台 | Registration | Manager identity | 输出 |
| --- | --- | --- | --- |
| macOS | `~/Library/Application Support/Pi Dwell/io.pi-dwell.host.plist` | `gui/<uid>/io.pi-dwell.host` | `~/Library/Logs/Pi Dwell/host.stdout.log` 和 `host.stderr.log` |
| Linux | `~/.config/systemd/user/pi-dwell.service` | user manager 中的 `pi-dwell.service` | systemd journal |

`ensureDirectories` 使用 lstat 检查每个路径组件，拒绝 symlinks 和非本 user 所有的路径，验证 owner access，并在适用时要求最终目录为 private。创建期间发生 race 时会再次检查。`ensureServiceDirectories` 应用对应平台的目录布局。

<a id="generated-registrations"></a>

## 生成的 registrations

`launchAgentContent` 生成 plist，其中显式包含 Node/entry-point/serve arguments、HOME、working directory 和 log paths。它使用 RunAtLoad、失败退出后重启以及 5 秒 throttle。Registration 位于 LaunchAgents 之外；仅安装并不会启用 login autostart。`plistEscape` 会保护 XML 值。

`systemdUnitContent` 生成 Type=simple unit，显式指定 HOME、ExecStart、working directory、failure 后重启、5 秒 restart delay、10 秒 stop timeout、journal output 以及 WantedBy=default.target。它允许每 60 秒启动 5 次。安装只会注册文件，不会启用 boot startup 或 user lingering。

`systemdQuote` 处理 command quoting、percent expansion 和可选的 dollar escaping。WorkingDirectory 是遵循不同 parsing rules 的 scalar：当前实现使用未加引号的值，对 `%` 做 escape，并追加 `/.` 以保护尾随空格/backslashes。Legacy registrations 只在与旧版生成内容完全相同时才会识别；不会把任意相似文件视为本服务拥有。

<a id="ownership-before-mutation"></a>

## Mutation 前验证 ownership

`readPrivateRegistration` 不跟随 symlinks 地打开文件，并要求其为 private、owner-readable、单链接 regular file，且由当前 user 拥有。它同时按 stat size 和实际读取长度检查 64 KiB 上限。

`writePrivateRegistration` 只接受完全匹配的当前文件或已知 legacy file。Linux 上，首次创建前、升级前，以及另一个 installer 以相同内容抢先独占创建时，都会检查已加载的 manager identity。文件内容匹配并不授权管理由他方加载的 unit。

`upgradeRegistration` 写入并 sync private temporary file，重新检查旧内容，atomic rename、sync directory，并清理临时文件。`verifyRegistration` 比较生成内容是否完全匹配；特定操作可允许已知 legacy file。`removeRegistration` 会在 unlink 前再次检查 ownership/content。

`inspectLinux` 解析 LoadState、FragmentPath、MainPID 和 ActiveState，拒绝重复 fields，并要求 registration path 与预期相符。只有 inactive 且 PID 为 0 的 legacy bad-setting unit 才可修复。`inspectMac` 解析 launchctl output，并通过 `validateLaunchdIdentity` 验证 registration path、executable 和每个 argument。两个 adapter 都不会把同名的外部 process 当作 Dwell。

<a id="start-readiness-stop-and-uninstall"></a>

## 启动、readiness、停止和卸载

`defaultRunner` 通过 execFile 调用 manager commands，deadline 为 5 秒，output cap 为 128 KiB。`runRequired` 会把失败的 exit code 转换为 manager-specific errors。不会执行 shell command string。

`startService` 验证 registration、准备所需目录、重新加载 Linux manager 并检查当前 state。只有需要时才会 bootstrap/kickstart launchd，或启动 systemd。`waitForReady` 在 10 秒 startup budget 内每 150 ms polling。仅凭 manager 报告 PID 正在运行并不足够：authenticated HTTP status 必须匹配该 PID、production mode，并带有非空 instance identity。

如果 command 启动了 service，但 readiness 检查失败，会尝试停止该 service。若 service 在操作前已运行，则不会仅因 readiness 检查失败而停止它。Cleanup failures 会与原始 startup error 一并报告。

`stopService` 验证 ownership、重新加载 Linux manager，并使用 bootout 或 systemctl stop。`waitForStopped` 会等待 macOS 上的 registration 被卸载，或 Linux unit 变为 inactive/failed 且 PID 为 0。`restart` 先执行已验证 ownership 的 stop，再执行 start。

`uninstall` 会停止 service，在禁用 Linux autostart 前重新检查 registration，只删除本服务拥有的 registration，然后重新加载 manager。它保留 Dwell data，并在发生部分失败时报告已完成的阶段。它不会禁用 user lingering，因为该设置由 user manager 中的多个 services 共用。

<a id="reporting-state"></a>

## 状态报告

`runtimeStatus` 区分 installed/unloaded、stopped、failed、starting、stopping、running-but-not-ready 和 running-and-ready。`linuxAutostart` 解析 UnitFileState，区分持久启用和仅 runtime 启用。`linuxLingering` 查询 logind。这些启动信息的 query 失败时会报告为 unknown。

`status` 汇总 runtime、autostart、lingering 和 legacy-registration upgrade hint。`install` 会分别报告 created/updated/unchanged；更新 registration 时不会重启已有 process。

<a id="tests-to-read"></a>

## 测试参考

[cli.test.ts](../../../../tests/cli.test.ts) 覆盖 parsing 和 command behavior；[runtime-cli.test.ts](../../../../tests/runtime-cli.test.ts) 覆盖已配置 executable 的 requests；[service.test.ts](../../../../tests/service.test.ts) 覆盖注入式 platform managers 及 identity/readiness checks；[service-boot.test.ts](../../../../tests/service-boot.test.ts) 覆盖 Linux ordering、migration、boot-state reports 和 parser behavior。[host.test.ts](../../../../tests/host.test.ts) 与 [auth.test.ts](../../../../tests/auth.test.ts) 通过 Host 验证 state 和 credential boundaries。
