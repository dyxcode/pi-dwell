# Browser pairing and access

[English](../../../../handbook/implementation/pairing.md) | 简体中文

[Implementation handbook](README.md) · [Documentation](../README.md)

<a id="behavior"></a>

## 用户行为

Dwell 将本地 CLI 管理与浏览器访问分开。Host 首次启动时会创建私有且长期有效的 CLI 凭据。CLI 使用它申请浏览器配对码、配置 Pi、查看 Host 状态或撤销浏览器访问。配对码由 8 个区分大小写的字符组成，排除容易混淆的字符，5 分钟后过期且只能使用一次。

浏览器会话有效期为 30 天，并可跨 Host 重启保留；待用配对码和尝试计数只保存在内存中。Host 最多保留 10 个待用码，每分钟最多接受 20 次格式正确的兑换尝试，最多保存 100 个已配对浏览器。格式错误的兑换数据不会计入频率上限。浏览器可以注销自己；本地 CLI 可以撤销全部浏览器和待用配对码。

<a id="ownership"></a>

## 模块职责与数据

Host 持有 CLI 凭据和持久浏览器会话记录。它保存 browser cookie 与绑定 key 的 hash 及过期时间；Raw CLI 凭据放在权限受限的本地文件中。每个浏览器会生成随机绑定 key，保存在按 origin 隔离的浏览器存储里。Session cookie 设置为 HttpOnly、host-only 和 SameSite=Strict。

本地 authority 接受 CLI 和已配对浏览器。可选远程访问通过 production 中配置的 HTTPS origin 与本地 TLS 终止代理提供；Dwell 仍只绑定本地回环地址。代理必须保留 Host。转发头和设备身份头不会授予访问权限；外部 authority 拒绝 CLI 凭据。

<a id="execution"></a>

## 执行流程

1. 本地 CLI 申请短期配对码。Dwell 只在内存中保存它的 hash 和过期时间。
2. 浏览器从本地或已配置的 HTTPS authority 提交配对码及按 origin 隔离的绑定 key。
3. Host 检查精确的 Host；如果请求带 Origin，也检查其精确匹配。随后串行处理兑换、过期和频率校验，先保存浏览器记录，再消费配对码或设置 cookie。
4. 后续浏览器请求必须同时携带 cookie 和匹配的绑定 key。浏览器写操作还需要正确 Origin 与 Dwell 请求标记。Pi 可执行文件配置仍由本地 CLI 管理。
5. Logout 删除当前浏览器。全局 revoke 先保存空会话列表，再清除待用配对码。两种操作都会重新检查授权并关闭受影响的事件流。

<a id="mechanisms"></a>

## 内部机制

Cookie 不区分 localhost 端口，而浏览器存储按 origin 隔离。独立绑定 key 能阻止只拿到复制 cookie 的人通过认证。Key 与 cookie 在持久化前都会 hash；一次性配对码在内存中也以 hash 表示。兑换过程串行执行，因此并发提交同一个配对码最多只能有一次成功。只有浏览器记录原子保存后才签发会话。若保存失败，Host 不会返回 cookie，并会暂停浏览器认证，直到修复存储并重启。

本地 HTTP 与配置好的 HTTPS 使用不同 cookie policy。HTTPS cookie 设置 Secure 并限定在准确的主机名下；本地 HTTP 不能使用 Secure cookie。精确 Host 决定 authority，Origin 必须与之匹配。带转发元数据的本地 authority 请求会被拒绝，避免代理伪造 Host 后进入 CLI 管理路径。开发模式没有外部 HTTPS authority；production 私有配置只接受一个规范的 HTTPS origin。

格式错误或不安全的认证状态会阻止启动，并保留原有文件。成功的状态变更会清理过期记录。过期会话会在下一次授权检查时失效；Logout 和 revoke 还会立即关闭现存事件流。

<a id="technology"></a>

## 技术取舍

本地 CLI 管理使用随机 bearer 凭据；浏览器使用 cookie 加独立绑定 key。这样 CLI secret 不会进入浏览器存储或 URL，cookie 仍可设置为 HttpOnly。Hash 与原子文件替换保护持久化的浏览器凭据，并为配对、注销和撤销提供明确的保存边界。

远程浏览器流量先经过可信的本地 HTTPS 代理，由代理终止 TLS，再转发到 Dwell 的本地回环监听器。Dwell 校验配置好的 authority 和精确 origin；代理身份声明不会授予应用访问权限。传输加密与 tailnet/device policy 由代理负责，访问 Dwell 仍需要浏览器配对。代理需要保留 Host；Dwell 收到的是明文回环连接，无法自行验证 TLS。

<a id="verification"></a>

## 验证场景

- 并发兑换同一个有效配对码时最多建立一个会话。已使用、过期或大小写不同的配对码会失败。
- 缺少匹配绑定 key 的 cookie 会被拒绝。配对会话可跨 Host 重启保留；清除按 origin 隔离的浏览器存储后需要重新配对。
- Host 或 Origin 不匹配、HTTPS authority 未配置，或本地 authority 带转发元数据，都不会授予访问权限。
- 缺少 origin protection 的浏览器写操作会失败。Logout 和 revoke 会移除授权并关闭活跃事件流。
- 会话保存失败时不会签发 cookie，且持久状态不变。格式错误的状态文件会阻止启动而不被替换。
