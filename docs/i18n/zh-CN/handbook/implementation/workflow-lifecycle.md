# 追踪 startup、pairing 与 session lifetime

[English](../../../../handbook/implementation/workflow-lifecycle.md) | 简体中文

[Implementation](README.md) · [Handbook](../README.md)

<a id="startup"></a>

## 从 CLI 到 ready listener

Entry point 将 arguments 交给 `runCli`，`parseCommand` 选择 foreground serving、本地 administration 或 OS service management。Service installation 注册 OS 如何启动同一个应用；只有 foreground serve 才按需 import host。

`startHost` 验证 port，在准备 private state 前绑定 loopback listener。绑定成功后才加载 access configuration、authentication 和 sessions，防止第二个 host 在已有进程占用 port 时修改 shared files。Initialization 或 stopping 时 requests 得到 unavailable response。Development/production 使用不同 data locations，但共享 public port。

Session service startup 打开并验证 catalog、reconcile interrupted records，并按需启动 Pi process。Listener ready 表示服务可访问。Provider credentials 在 model calls 中使用，saved sessions 在 reopen 时检查。

Source / verification：[`runCli`](../../../../../src/clients/cli/main.ts#L9) · [`startHost`](../../../../../src/server/http.ts#L102) · [`SessionService.create`](../../../../../src/sessions/service.ts#L240) · [tests/host.test.ts](../../../../../tests/host.test.ts)

<a id="pairing"></a>

## 从 local authority 到 browser access

本地 CLI 读取 owner-only bearer token 并请求短期 pairing code。Browser 创建 binding key，将 code 与 key 提交，redemption 持久化后获得 HttpOnly session cookie。Authentication 保存 hashes，不保存签发的原始 browser credentials。串行 redemption 防止同一个 code 的并发请求都成功；write 失败不能消耗可用 code。

后续 browser requests 结合 cookie 与 browser-binding header；mutations 还需要预期 origin 和 request marker。CLI bearer 与 browser access 是不同路径。可选 production HTTPS 改变 browser authority 和 cookie policy，不用 proxy identity headers 替代 authentication。Revocation 使 browser credentials 失效并关闭 streams；browser 返回 pairing，不把 authentication failure 当成临时 network outage。

Source / verification：[`LocalAuth.redeem`](../../../../../src/server/auth.ts#L204) · [src/server/access.ts](../../../../../src/server/access.ts) · [tests/auth.test.ts](../../../../../tests/auth.test.ts) · [tests/events-http.test.ts](../../../../../tests/events-http.test.ts)

<a id="create"></a>

## 先建立 identity，再启动 Pi

Browser directory picker 列出 host 上的 directories。Creation 提交 request ID 与 directory；API client 还可提供 provider/model pair。`createSession` 验证 request，并在访问 filesystem 前根据最初 admission values 计算 identity，因此 directory 后来消失时，matching retry 仍可找到原 record。

新 request 会 canonicalize directory、清理退出的 children、检查八个 Pi process 的限制，并插入包含独立 Dwell/Pi IDs 的 creating record，然后启动 Pi。新的 empty session 可能尚无 JSONL，所以 catalog identity 独立于 transcript 存在。Launch failure 时，service 尝试持久化 failed 并返回内部 view；HTTP route 将此 failed view 转为包含 session ID 的 503 error，不返回成功 session response。若 failed record 本身写入失败，creation reject，先前 creating record 留待 restart recovery。

新的 Pi session 可以使用 Pi 配置的 defaults。一旦存在 native history，reopen 使用其 identity 与实际 model/thinking state，不将新 session 的显式 model flags 反复强加到 resumed transcript。Pi process 章节解释 readiness verification 与 startup resource discovery。

Source / verification：[`SessionService.createSession`](../../../../../src/sessions/service.ts#L506) · [`SessionService.#open`](../../../../../src/sessions/service.ts#L1912) · [tests/sessions.test.ts](../../../../../tests/sessions.test.ts) · [tests/session-models.test.ts](../../../../../tests/session-models.test.ts)

<a id="model"></a>

## Model selection 与 image preparation

Model picker 从选中 live session 的 registry 获取 models，因此 extension-provided models 也可出现。Capability reads 只暴露 public provider/id、thinking levels 与 image support，不通过切换 model 探测能力。Browser 按当前 selection 和 capability identity 排除过期 response。确认选择后交给 service：检查 active Dwell work，并要求 Pi process 空闲后才应用 model/thinking，再读取 Pi 实际 state 后保存 metadata。

Image drafts 保留在 browser memory，并关联所属 session。Intake 检查 file size/type、读取 canonical content，draft 删除或清空时释放 preview resources。Turn admission 再验证 JSON-safe images，execution 检查 selected model 的 image support。Saved images 保存在 Pi native JSONL，通过 authenticated entry/index references 提供读取。

Source / verification：[`SessionService.setSessionModel`](../../../../../src/sessions/service.ts#L587) · [`changeModel`](../../../../../src/clients/web/client.ts#L1997) · [src/clients/web/attachments.ts](../../../../../src/clients/web/attachments.ts) · [tests/session-models.test.ts](../../../../../tests/session-models.test.ts) · [tests/images-http.test.ts](../../../../../tests/images-http.test.ts)

<a id="close"></a>

## Stop、close 与 reopen

Stop 针对 active durable turn 或特定 native execution；close session 则停止 Pi process。Browser close flow 可以请求取消并等待 Pi 空闲，但 service 的 close operation 本身拒绝 active work，不隐式取消。停止 idle child 前，会记住 history 并更新相关 native execution coverage。

Reopen 根据记录的 session identity 与 file 启动 Pi。已知 history 缺失或无效时产生 unavailable/error，不创建一个表面 identity 相同的替代空对话。读取 saved history 不需要 Pi process，但读取当前 model context 可能启动 Pi。

Source / verification：[`SessionService.closeSession`](../../../../../src/sessions/service.ts#L698) · [`SessionService.getContext`](../../../../../src/sessions/service.ts#L729) · [`prepareClose`](../../../../../src/clients/web/client.ts#L770) · [`confirmSessionClose`](../../../../../src/clients/web/client.ts#L900) · [tests/history-service.test.ts](../../../../../tests/history-service.test.ts)

<a id="shutdown"></a>

## 有序 shutdown 与 restart recovery

Host 的 repeated close calls 共享一个 promise。它关闭 streams、拒绝新 work，在 admitted bookkeeping 结束前保留 listener，然后 shutdown sessions、drain authentication writes，最后释放 port。Session shutdown 将未 dispatch 的工作标记 aborted，取消 queued history reads，等待 mutation coordination，并停止 Pi processes。Pi stop 关闭 input，再按有界等待升级 TERM/KILL。

Catalog 保持打开，直到 tracked turn finalization、reads 和 discovery/refresh operations settled。Restart 将未完成 durable work reconcile 为 interrupted，不再次调用。

Source / verification：[`startHost`](../../../../../src/server/http.ts#L102) · [`SessionService.shutdown`](../../../../../src/sessions/service.ts#L1377) · [`PiProcess.stop`](../../../../../src/runtime/pi-process.ts#L682) · [tests/turn-recovery.test.ts](../../../../../tests/turn-recovery.test.ts) · [tests/host.test.ts](../../../../../tests/host.test.ts)
