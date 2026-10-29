# Authority 与 browser authentication

[English](../../../../handbook/implementation/authentication.md) | 简体中文

[实现索引](README.md) · [HTTP request handling](http.md) · [Authentication 概览](../http-auth.md)

Dwell 有两条 credential lane：用于本地管理的长期 CLI bearer credential，以及给 Web client 使用的 paired browser session。可选 HTTPS access 使用精确配置的 proxy authority，并使用相同的 browser pairing 和 cookie binding。

<a id="authority-and-cookies"></a>
## Authority 选择与 browser cookie

[readBrowserOrigin](../../../../../src/server/access.ts#L8) 只在 production 读取可选的 access.json。Private file 必须只包含 version 1 和一个 canonical HTTPS browserOrigin。Path、query string、fragment、wildcard host、非 canonical 拼法、额外 key 和过长文本都会导致启动失败。缺少配置意味着没有 HTTPS lane；development 忽略该文件。

[requestAccess](../../../../../src/server/access.ts#L65) 在精确匹配的 loopback Host 和唯一配置的 HTTPS Host 之间选择。Forwarded metadata 不会选择 authority。Local-authority 请求若携带 Forwarded 或 X-Forwarded-* 会被拒绝，因此 proxy 不能借助伪造的 loopback Host 进入 local credential lane。Configured proxy 必须保留 Host；TLS 在 Dwell 外部终止，而 listener 仍保持 loopback。

所选 authority 决定 browser cookie 名称和是否启用 Secure。[browserCookie](../../../../../src/server/access.ts#L94) 设置 Path=/、HttpOnly、SameSite=Strict 和 Max-Age。HTTPS cookie 使用 __Host prefix 和 Secure，且不设置 Domain；local cookie 按 host mode 区分，但不带 Secure。Cookie 内含随机 bearer secret，同时 request 还需要与 origin 绑定的 browser binding key。

<a id="browser-session-auth"></a>
## LocalAuth state 与 pairing

[AccessError.constructor](../../../../../src/server/auth.ts#L25) 保存对外 status 和 code。[digest](../../../../../src/server/auth.ts#L32) 在持久化前对 browser secrets 做 hash。[parseSessions](../../../../../src/server/auth.ts#L36) 将 browser-session 文件视为 untrusted input：校验 version 和精确 object shape，最多允许 100 条记录，检查两个 SHA-256 hex hash 与安全正整数 expiry，并拒绝重复 cookie hash。Invalid 或 unsupported state 会保留在原处，并导致启动失败。

[LocalAuth.constructor](../../../../../src/server/auth.ts#L97) 接收已校验的 durable state，并创建只在内存中的 pairing-code、rate-limit、queue 和 storage-fault state。[LocalAuth.open](../../../../../src/server/auth.ts#L104) 准备 private data directory；文件不存在时，以 exclusive create 创建 32-byte 随机 CLI token 和空 session file；随后经由 private-file boundary 读取它们。既有的 unsafe 或 malformed file 会保留原样并报错。[LocalAuth.isCli](../../../../../src/server/auth.ts#L121) 先校验 bearer 格式，再执行 timing-safe token comparison。[LocalAuth.available](../../../../../src/server/auth.ts#L130) 在 persistence failure 后停止 browser-auth 操作。[LocalAuth.isBrowser](../../../../../src/server/auth.ts#L139) 要求 cookie 与 browser-binding 值格式正确，对二者分别 hash，并匹配未过期的存储记录。

[LocalAuth.createPairing](../../../../../src/server/auth.ts#L158) 清理过期 pending code，将内存 map 限制为 10 个，并从排除易混字符的 alphabet 中生成八位、区分大小写的 code。Map 只存 code hash 与五分钟 expiry；发生碰撞时重新生成。每个持久化 browser session 的有效期为 30 天。Pairing attempts 和 code 都只在内存中，restart 后会清空。

所有 durable mutation 都经过 [LocalAuth.serialize](../../../../../src/server/auth.ts#L181)，也就是一个 promise queue。即使某项 action rejected，queue tail 也会恢复，因此后续 mutation 仍可执行。[LocalAuth.save](../../../../../src/server/auth.ts#L190) 原子替换 private browser-session 文件，只有写入成功后才更新内存 sessions。Save 失败会让 browser authentication 停用，直到修复 state 并重启。HTTP error path 也会重新验证 active stream，因此 failed write 导致 authorization 不可用后，browser observer 会立即关闭。

[LocalAuth.redeem](../../../../../src/server/auth.ts#L204) 串行执行每分钟 20 次的滚动限流、code expiry/use 校验、过期 session 清理和 100 个 browser 的上限检查。它先写入新的 cookie/browser-key hash pair，再消耗 code 并返回原始 cookie token。[LocalAuth.logout](../../../../../src/server/auth.ts#L241) 移除一个 token 和所有过期行。[LocalAuth.revoke](../../../../../src/server/auth.ts#L252) 先持久化空列表，再清空 pending code。[LocalAuth.drain](../../../../../src/server/auth.ts#L260) 允许 shutdown 等待所有已准入的 queued write。

<a id="http-authentication-integration"></a>
## HTTP admission 与 stream revalidation

HTTP [handle](../../../../../src/server/http.ts#L167) 先检查重复的 security-sensitive header，再委托 requestAccess 选择 Host。Request 若带 Origin，必须与所选 authority 完全一致。HTTPS lane 会完全拒绝 Authorization，让 CLI bearer credential 只能留在 loopback address。受保护的 session/status route 接受有效 CLI token，或 browser cookie 加匹配的 browser-binding key。Browser POST 还必须带匹配的 Origin 和 Dwell request marker；Pi executable configuration 只允许 CLI 操作。

Pairing creation 和 browser revocation 要求 CLI credential。Pair redemption 对所选 browser origin 开放，但会先校验精确 code 和 browser-key shape，再调用 LocalAuth.redeem。只有 session durable save 成功后，handler 才会发送 Set-Cookie。Logout 会校验 cookie/browser binding 仍然匹配，移除该 browser、过期其 cookie，并重新验证 event stream。Revoke 会原子清空全部 persisted session 和 pending code，然后关闭所有 browser authorization 已失效的 stream。

例如，CLI 先创建短时 pairing code；浏览器再携带 browser key、匹配的 Origin 和 Dwell request marker redeem code。Response 会设置 HttpOnly cookie。后续 GET 携带该 cookie 与 browser key；browser POST 还会带 Origin 和 request marker。只有 cookie、没有匹配 browser key 时会被拒绝。

[openEventStream](../../../../../src/server/http.ts#L134) 捕获 request headers，并在 write 和 heartbeat 前重新检查相同 credential。[revalidateEventStreams](../../../../../src/server/http.ts#L130) 会在 logout 或 revoke 后立即关闭受影响的 stream，即使没有 event 或 heartbeat 到达。Stream writer 的 queue、expiry check 和 response cleanup 见 [HTTP 与 SSE](http.md#sse-lifecycle-and-overflow)。

<a id="authentication-test-evidence"></a>
## Test evidence

[auth.test.ts](../../../../../tests/auth.test.ts#L21) 覆盖 code collision 与大小写、private initialization、restart persistence、cookie binding、expiry、logout/revoke、storage failure 和损坏 state。[access.test.ts](../../../../../tests/access.test.ts#L121) 覆盖 production HTTPS pairing、Host/Origin 校验、拒绝 forwarded header、cookie flags、configuration validation，以及 revoke 后立即关闭 SSE。[events-http.test.ts](../../../../../tests/events-http.test.ts#L534) 使用 synthetic local session 检查 browser revoke、logout、expiry 和 authentication storage failure 时 stream 的关闭行为。
