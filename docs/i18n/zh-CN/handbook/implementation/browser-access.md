# Browser access

[English](../../../../handbook/implementation/browser-access.md) | 简体中文

[实施手册](README.md)

<a id="behavior"></a>

## 行为

主机上的浏览器可直接打开 Dwell。远程浏览器使用配置好的私有 HTTPS 地址，能否连接由 tailnet policy 决定。浏览器不保存 Dwell 凭据。

<a id="ownership"></a>

## 归属

私有代理负责远程访问范围和 TLS。Dwell 只监听回环地址，区分浏览器请求与本地 CLI 管理。CLI token 由 Host 私有保存，不交给浏览器。

<a id="execution"></a>

## 执行

Host 核对请求到达的地址；代理路径必须是预期的 HTTPS 转发，不接受标记为 public Funnel 的流量。API 请求通过同源检查后才能读取会话或提交操作。

<a id="mechanisms"></a>

## 机制

浏览器通过专用 request marker 调用 API。修改操作还需要精确匹配的 Origin；可用的 Fetch Metadata 必须指明同源。标记用于阻止跨站调用，不是凭据。

<a id="technology"></a>

## 取舍

只有可信本机进程能直接访问回环监听器。远程访问依赖受限的私有代理；放宽 tailnet policy 就会扩大 Dwell 访问范围。不要启用 public Funnel。

<a id="verification"></a>

## 验证

新浏览器不需要存储凭据就能读取会话并订阅事件。跨站访问、public Funnel 和远程 CLI bearer 请求应被拒绝。
