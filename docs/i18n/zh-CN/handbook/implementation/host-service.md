# Host 后台服务

[English](../../../../handbook/implementation/host-service.md) | 简体中文

[Implementation handbook](README.md) · [Documentation](../README.md)

<a id="behavior"></a>

## 用户行为

Dwell 作为单个 Host 进程运行，只监听固定的本地回环地址。它可以在前台运行，也可以由当前用户的 macOS launchd 或 Linux systemd user service 管理。服务管理操作负责安装、启动、检查、重启、停止和卸载后台 Host。启动 Dwell 不要求先选择项目目录或模型，也不要求先配置 Pi；只有运行 Pi 会话才需要这些条件。

生产模式和开发模式使用独立的本地状态目录，但共用监听地址，因此不能同时运行。服务管理始终针对生产 Host。可选的浏览器 HTTPS 访问需要单独配置本地代理。

<a id="ownership"></a>

## 模块职责与数据

命令行层把服务操作交给操作系统适配层。只有当服务注册项内容和管理器记录都与当前 Dwell checkout 匹配时，适配层才管理它。launchd 或 systemd 负责后台进程和重启策略；Dwell 负责私有数据、SQLite Catalog、Pi 运行实例配置和会话进程。

服务注册项保存 Node 与 Dwell 入口文件的绝对路径；移动其中任一项后都要重新安装。Pi 的 provider 凭据和配置目录设置必须由用户服务管理器提供；交互式 shell 的环境不会复制到后台服务。

<a id="execution"></a>

## 执行流程

1. Dwell 先取得本地回环监听地址，再打开持久状态。竞争中的第二个 Host 会在写入共享数据目录之前失败。
2. 安装时会校验用户拥有的路径，并写入权限受限的系统服务注册项。Linux 会重新加载用户服务管理器。安装不会创建 Dwell data 目录、启动 Host 或启用登录/开机自启。
3. 启动时请求管理器运行已注册进程，然后检查经过认证的 Host readiness。Host 必须报告与管理器一致的进程身份和 production mode，启动才算成功。
4. 停止时只操作已验证的服务注册项。Dwell 会关闭 streams、拒绝新工作、处理已接收操作、关闭 Pi 子进程与 storage，最后释放监听地址。Restart 会依次执行停止和启动。
5. 卸载前先停止服务。Linux 会先禁用 unit，再移除注册项。两个平台都会保留 Dwell 数据；Linux lingering 设置保持原样。

<a id="mechanisms"></a>

## 内部机制

私有目录和服务注册文件会检查当前用户所有权、安全的文件类型与严格权限。Dwell 会将注册文件内容及管理器加载路径与预期服务进行比较。无关注册项不会被覆盖；重复安装匹配项不会产生变化；已知的旧版 Linux 注册项可原子升级。管理器重新加载失败时，已写入的注册项会保留以便重试。

如果服务已运行，重复启动会检查 readiness，但不会重启它。本次请求新启动的服务若始终未就绪，Dwell 会尝试停止该进程；原先已运行的实例保持不变。停止会等待管理器确认进程已结束，不会随意终止其他进程。Status 综合管理器状态与 Host readiness。Linux 会分别报告开机自启和 lingering；查询失败时标为未知。Linux 还会在进程失败后按间隔自动重启。

<a id="technology"></a>

## 技术取舍

Host 使用 Node 内置的 HTTP 和 SQLite 能力，并把 Pi 作为子进程运行。操作系统用户服务提供后台执行能力，不需要提高 Host 权限。服务管理器通过固定可执行路径和参数列表调用，不拼接 shell 命令。管理器可能加载来自其他文件的同名 unit，因此需要核对注册项身份。

平台启动设置并不相同。macOS 安装会创建用户服务注册项，但不会启用登录自启。Linux 安装会重新加载 systemd，而开机启用由用户决定；注销后继续运行还取决于 user lingering。服务已安装、已就绪和开机后会运行是不同状态。

<a id="verification"></a>

## 验证场景

- 在任一平台安装，都会为当前 Node 可执行文件和 checkout 创建私有注册项。重复安装会保留原项，不启动 Dwell，也不启用自启。
- 管理器中的同名 entry 如果指向其他位置，不会被操作，也不会替换服务注册项。
- 进程身份不匹配、运行于 development mode 或 Host 尚未就绪时，readiness 检查失败。清理只会停止本次请求新启动的服务。
- Stop 会等待受管服务结束，不会影响无关进程。Uninstall 会在停止后移除自己的注册项，并保留数据与 Linux lingering。
- Linux status 区分运行实例 readiness、开机自启和 lingering；某项查询失败不会遮住其他结果。
