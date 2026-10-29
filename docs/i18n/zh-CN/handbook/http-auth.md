<a id="http-authentication-and-discovery"></a>

# HTTP、认证与发现

[English](../../../handbook/http-auth.md) | 简体中文

详细文字解释：[Implementation](implementation/http.md).

[手册索引](README.md) · [源码索引](source-map.md)

<a id="files-and-responsibilities"></a>

## 文件与职责

| 文件 | 职责 |
| --- | --- |
| [`server/http.ts`](../../../../src/server/http.ts) | Listener 生命周期、请求验证、route 分发、response headers、错误处理与 shutdown |
| [`server/access.ts`](../../../../src/server/access.ts) | 本地/HTTPS authority 选择、配置验证、cookie 属性 |
| [`server/auth.ts`](../../../../src/server/auth.ts) | CLI credential 验证、pairing、浏览器认证、串行化持久化 |
| [`server/sse.ts`](../../../../src/server/sse.ts) | 每个 response 的 SSE 编码、backpressure、认证复查与清理 |
| [`server/session-discovery.ts`](../../../../src/server/session-discovery.ts) | host 目录浏览，以及隔离的全局 model/capability 发现 |

<a id="request-pipeline"></a>

## 请求处理流程

`startHost` 创建 Node HTTP server，header 上限为 8 KiB，header、request 和 socket deadline 均为五秒。session 操作通过 admission 后，会清除 socket timeout；RPC 有自己的 deadline。server 在写入数据之前先绑定 loopback。

每个 response 都以 `Cache-Control: no-store`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer` 和严格的 CSP 开始。Script、style 和连接只允许 same-origin；图片使用 blob URL；禁用 frame、base URL 和表单提交。HTML、CSS 和固定的浏览器 module map 直接提供，不会根据任意文件系统路径读取资源。

`handle` 按以下顺序处理请求：

1. 拒绝重复的安全敏感 header：Host、Origin、Authorization、Cookie、两个 Dwell header，以及 Last-Event-ID。
2. 选择本地或已配置的 HTTPS authority，拒绝 cross-origin 请求，并拒绝 HTTPS lane 上的 CLI Authorization。
3. 拒绝处于启动/停止阶段的请求，以及长度超过 2048 个字符的 request target。
4. 解析 path 和有限支持的 query 格式。目录浏览只接受一个 `path`；history 只接受一个非空、最长 1536 个字符的 `cursor`。其他 query 都会失败。
5. 确定允许的方法。未知 path 返回 404；方法不正确则返回带 `Allow` 的 405。
6. 验证受保护 route 的身份；拒绝 GET body；强制 runtime 配置只能由 CLI 使用，并检查浏览器 mutation 请求。
7. 解析受限大小的 JSON，应用对应操作的 validator，再委托给 service。
8. 将 typed error 映射成公开 error envelope。未知异常返回通用 500；如果 headers 已发送，则销毁 response。

`readJson` 接受 `application/json`，可带 UTF-8 charset；拒绝 Content-Encoding；同时检查声明长度与实际接收的字节数；body 只接受 object，array 和 primitive 都会被拒绝。大多数 body 上限为 8 KiB；turn submission 的 JSON 上限为 8 MiB，其中 message UTF-8 文本另有 8 KiB 上限。

<a id="complete-route-map"></a>

## 完整 route 表

下表中的 API path 都相对于 `/api/v1`。**Either** 表示使用本地 bearer authentication，或使用浏览器 cookie 加 binding key。浏览器 POST 操作还要求匹配的 Origin 和 `X-Dwell-Request: 1`。空 body 表示 JSON object `{}`，并不表示省略 Content-Type。

| 方法和 route | 认证 | 输入和结果 |
| --- | --- | --- |
| `GET /`（API prefix 之外） | Public，检查 authority | Host 页面 |
| `GET /style.css`、浏览器 asset map（prefix 之外） | Public，检查 authority | 固定的 CSS/JS 资源 |
| `GET /healthz`（prefix 之外） | Public，检查 authority | `{status: "ok"}`；表示进程可用，不表示 provider 已就绪 |
| `GET /status` | Either | HostStatus，包括 mode、PID、instance 和 capabilities |
| `POST /auth/pairings` | CLI | `{}` → 201 pairing code 和过期时间 |
| `POST /auth/pair` | Browser origin/request marker；无需先登录 | `{code, browserKey}` → session cookie 和 `{ok: true}` |
| `POST /auth/logout` | Browser | `{}` → 移除此浏览器、清除 cookie、重新验证 streams |
| `POST /auth/revoke` | CLI | `{}` → 移除所有浏览器及待处理 pairing code，并重新验证 streams |
| `POST /runtime` | 仅 CLI | 绝对路径 executable 和可选 entryPoint → 验证后保存的配置 |
| `GET /directories[?path=…]` | Either | Canonical host directory、parent、子目录和截断标志 |
| `GET /models` | Either | 封装在 `models` 中的全局隔离发现结果 |
| `POST /model-capabilities` | Either | Provider/model → thinking levels 和图片支持情况 |
| `GET /sessions` | Either | Session list |
| `POST /sessions` | Either | requestId、directory、可选的 provider+model → 201 ready session；创建失败/中断时返回 typed error |
| `GET /sessions/:id` | Either | SessionInfo |
| `POST /sessions/:id/open` | Either | `{}` → 重新打开后的 SessionInfo |
| `POST /sessions/:id/close` | Either | `{}` → 已关闭的 SessionInfo |
| `GET /sessions/:id/context` | Either | 当前 Pi context projection；必要时会打开或重新打开 runtime |
| `GET /sessions/:id/models` | Either | Session-scoped model registry，包括 extension models |
| `POST /sessions/:id/model-capabilities` | Either | Provider/model → session-scoped capability metadata |
| `POST /sessions/:id/model` | Either | Provider/model 和可选 thinkingLevel → 生效后的 SessionInfo |
| `GET /sessions/:id/history[?cursor=…]` | Either | native branch history 的分页 projection |
| `GET /sessions/:id/history/:entry/images/:index` | Either | 验证后的 native saved image bytes，附 MIME type 和长度 |
| `GET /sessions/:id/events` | Either | SSE；可选 Last-Event-ID cursor |
| `POST /sessions/:id/turns` | Either | requestId、message、可选 images → 新 turn 返回 202，已存在的 turn 返回 200 |
| `GET /sessions/:id/turns/:run` | Either | Durable turn metadata |
| `GET /sessions/:id/turns/:run/result` | Either | 从 native history 解析出的 turn result |
| `POST /sessions/:id/turns/:run/abort` | Either | `{}` → cancellation outcome |
| `POST /sessions/:id/native-executions/:execution/abort` | Either | `{}` → 停止指定的 native execution |

Image entry ID 会进行 percent decode，并显式处理解码失败。Image index 必须是 safe integer。route 会从选定 session/entry 中解析内容；客户端不能提供文件系统路径。

Session creation 要求 provider 和 model 成对提供，或都不提供，并拒绝未知 key。Runtime 配置也拒绝未知 key。Turn 和 model payload 使用 shared validators，详见[contracts](contracts.md)。Session route 返回 typed service result，catalog object 不会进入 route response。

<a id="authority-and-https-configuration"></a>

## Authority 与 HTTPS 配置

`readBrowserOrigin` 通过 private-file reader 读取可选的、仅 production 使用的 `access.json`。准确结构为 `{ "version": 1, "browserOrigin": "https://host.example" }`；额外字段、非 canonical origin、path、query string、fragment、wildcard，以及超长文本都会被拒绝。Development mode 忽略此文件。

`requestAccess` 接受字面值 loopback authority 或唯一已配置的 HTTPS authority。如果请求使用本地 authority 且带有 Forwarded 或 X-Forwarded-*，就会被拒绝，避免 proxy 选择本地 credential lane。Forwarded headers 不会授予访问权限。Proxy 必须保留配置的 Host；TLS 在 Dwell 外部终止，listener 仍绑定 loopback。

本地 cookie 按 mode 命名。HTTPS cookie 使用 `__Host-` prefix 和 Secure。两种 cookie 都使用 Path=/、HttpOnly、SameSite=Strict 和有界 Max-Age。这些检查假设 host account 和本地 executable 环境可信；它们无法认证一个占据完全相同本地 origin 的恶意替代进程。

<a id="localauth-internals"></a>

## LocalAuth 内部机制

`open` 会准备 private state，并以 exclusive create 方式新建缺失的 `auth-token` 和 `browser-sessions.json`。已有文件会被读取并验证；格式错误的 state 会保留在原处，并导致启动失败。CLI token 为 32 个随机字节，编码为 64 个 hex 字符。`isCli` 会在 timing-safe comparison 前先检查格式。

Browser session 只持久化 cookie token 和 browser binding key 的 SHA-256 hash，以及过期时间。`parseSessions` 检查版本、exact keys、hash 格式、正的 safe expiry、重复 hash，以及最多 100 条记录的上限。`isBrowser` 验证提供的两个 secret，并要求它们匹配一对未过期记录。

Pairing 使用八次独立的密码学随机选择，字符表排除易混淆的 `0/O/o` 和 `1/I/i`。Code 区分大小写。内存 map 存储 code hash 和五分钟过期时间；发生碰撞时会重新生成。创建时会清理过期 code，并最多允许十个待处理 code。

`redeem`、`logout` 和 `revoke` 通过 promise chain 串行执行。某次 action 被拒绝不会破坏后续 queue。HTTP shape 验证后，redeem 每滚动一分钟最多允许 20 次尝试；它会清理过期 browser record，检查 100 个 session 的上限，写入有效期 30 天的新 browser session，成功后再删除 pairing code。持久化失败会使 browser authentication 进入故障状态，直到修复并重启；成功写入之前不会把新 state 安装到内存中。

`logout` 移除一个 token 和过期 session。`revoke` 保存空列表并清除待处理 code。`drain` 让 host shutdown 等待已通过 admission 的 authentication write。Pairing code 和 rate-limit counter 仅保存在内存中，重启后会重置。

<a id="sse-writer-and-backpressure"></a>

## SSE writer 与 backpressure

Event hub 拥有排序和 replay；`createSseConnection` 拥有单个 HTTP response。`encodeFrame` 在编码 event/id/data 行之前，验证 shared frame、安全 event name 和不含换行的 cursor。

每个 connection 都有 queue、字节计数、blocked/started/closed/ending 标志、unsubscribe callback、heartbeat 和 error-flush timer。256 KiB 预算同时计算排队的 buffer **和** response 的 writableLength。初始 snapshot 超限会在 headers 发送前抛出 `SseStartError`；开始 streaming 后发生 overflow，则会销毁这个慢 connection。

`start` 会把初始 frames 放到 subscription 期间排队的通知之前，检查 authorization 和合并预算，设置 SSE headers，然后启动 pump。`pump` 在每次写入前重新检查 authorization；如果 `response.write` 表示 backpressure，就暂停。`drain` 恢复写入。Heartbeat 默认每 15 秒发送一次，也会复查认证。

`stream.error` 会断开 observation，尝试 flush error，并将 flush 时长限制在一秒内。`release` 只执行一次，清理 timer、queue 和 listeners；unsubscribe/onClose 异常不会传播给 producers。Revocation 和 logout 会显式重新验证所有 active streams；heartbeat/write 时也会检测 expiry。Observer 断开不会停止它所观察的 Pi execution。

<a id="directory-discovery"></a>

## 目录发现

`listHostDirectories` 默认从 host home 开始，接受最长 4096 个字符的绝对路径。它会解析所选路径，确认它是目录，然后枚举可读的子目录和目录 symlink。隐藏名称和过长名称会跳过；不可访问的子项也会跳过。结果按名称排序；位于 root 时 parent 为 null，否则返回 canonical parent。

扫描最多检查 10,000 个条目或包含 500 个目录，然后停止并标记截断。它提供的是有界目录浏览，不是任意文件内容 API。路径不存在会产生 invalid-directory error；权限错误与通用发现失败会分别处理。

<a id="global-model-discovery"></a>

## 全局 model 发现

全局发现与[session/storage](sessions-storage.md)中说明的 active session registry 不同。它会创建 private temporary workspace，其中包含隔离的 agent、cwd、package 和 session 目录。它会从 HOME/PI_CODING_AGENT_DIR 确定配置的 Pi agent directory，并只复制允许列表中的配置文件：auth、OAuth、settings、models 和 model-store JSON。

每个文件最多 8 MiB，合计最多 16 MiB，并以 private 权限写入。子进程环境会指向该 workspace、设置 offline mode 和纯文本终端输出，并为这次 probe 禁用 native resource discovery。临时本地 credential 不得写入日志或文档。

`discoverPiModels` 会验证 executable 版本，处理 RPC entry 与 CLI entry 的区别，并以 15 秒 timeout 和 1 MiB 输出上限运行 Pi 的 offline model-list 命令。Parser 会去除 terminal control sequences、定位已知 table columns、验证 provider/model 长度及 yes/no 标志、拒绝重复 model ID，并将列表限制在 10,000 个 model。

`discoverPiModelCapabilities` 会为指定 model 启动隔离的 Pi process，验证最终生效的 selection，并读取 thinking levels 和图片支持情况。两条路径都会移除 temporary state；capability 路径也会停止其 child。即使发现操作已得到结果，清理失败仍会明确报告。

<a id="error-and-test-map"></a>

## 错误与测试索引

公开 error 使用 `{error: {code, message}}`。AccessError 和 SessionError 会保留自己的 status 和 code。SSE 初始化错误中，unauthenticated 映射为 401，其他初始化失败映射为 503。Rate limit 会附带 Retry-After（待处理 code 达到上限时为 300 秒，其他情况为 60 秒）。未知内部错误不会暴露 stack trace。

传输与认证边界可读 [host.test.ts](../../../../tests/host.test.ts)、[auth.test.ts](../../../../tests/auth.test.ts) 和 [access.test.ts](../../../../tests/access.test.ts)；操作 route 可读 [sessions-http.test.ts](../../../../tests/sessions-http.test.ts)、[turns-http.test.ts](../../../../tests/turns-http.test.ts)、[history-http.test.ts](../../../../tests/history-http.test.ts) 和 [images-http.test.ts](../../../../tests/images-http.test.ts)；stream 测试见 [events-http.test.ts](../../../../tests/events-http.test.ts)；隔离发现见 [session-discovery.test.ts](../../../../tests/session-discovery.test.ts)。
