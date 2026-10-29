# Build、packaging 与 verification machinery

[English](../../../../handbook/implementation/tooling.md) | 简体中文

[Implementation](README.md) · [Handbook](../README.md)

<a id="execution"></a>

## Repository 如何运行

Node 通过 erasable syntax 直接运行 TypeScript entry point，没有 emitted server bundle。TypeScript 的 noEmit configuration 在 strict rules 下检查 server、browser、tests 和 scripts。Browser modules 由 [browser rendering](browser-rendering.md) 中的固定 asset machinery 单独准备。

Package scripts 区分 lint、format verification、type checking、documentation checking 与默认 Node tests。Package 保持 private；files allowlist 包含 production source、project READMEs 和两种语言的 handbook，dependencies 在 package.json 与 lockfile 中固定。Biome 检查配置中的 source/test/script/JSON paths，不格式化这些 Markdown chapters。默认 check path 使用 synthetic local fixtures，不依赖 provider credentials。

Source / verification：[package.json](../../../../../package.json) · [tsconfig.json](../../../../../tsconfig.json) · [biome.json](../../../../../biome.json) · [src/clients/web/script.ts](../../../../../src/clients/web/script.ts)

<a id="package"></a>

## 验证实际 package file set

`check-package.mjs` 显式列出每个允许的 English handbook page，并派生 matching Chinese paths。它创建临时 npm cache，以 dry-run JSON mode 运行 npm pack，禁用 lifecycle scripts；验证返回 manifest shape，并拒绝 source-path pattern 或准确 public allowlist 之外的文件。第二轮要求文档和关键 runtime assets 都存在。Finally 无论成功失败都会移除自己创建的 temporary directory。

新增 handbook page 时更新明确列表及 Chinese mirror，使 package check 要求两个文件都存在。

Source / verification：[scripts/check-package.mjs](../../../../../scripts/check-package.mjs)

<a id="docs"></a>

## 验证 links、source positions 与 explanation coverage

`check-docs.ts` 用 `files` 递归枚举两个 public handbook trees，要求 relative Markdown file sets 相同。`read` 读取 UTF-8，`explicitAnchors` 提取显式 IDs，`headingAnchors` 生成 heading slugs 和重复 heading suffixes。Checker 比较新 implementation mirrors 的 explicit anchors，并拒绝重复 explicit IDs。

`checkLink` 在 repository 内解析 relative links、检查 target 存在、验证 Markdown anchors 和 source line/range bounds，跳过 external URLs。Marked lexer 遍历真正的 Markdown links/images，避免把示例文本误判成 citation。Implementation chapters 允许 Mermaid fences，拒绝 source-code fences；普通 command/payload examples 继续放在 usage chapters。

`callables` 用已安装的 TypeScript parser 枚举 named functions、带 body 的 methods、constructors 和 accessors。嵌套 `visit` 跟踪 class/function ownership，`record` 记录准确 declaration line。两个 source atlases 必须包含每个 production file，并为每个 callable 提供唯一 explanation link 和当前行号。Symbol 删除或行号过期都会使检查失败。每个 callable citation 必须指向其实际 source file，explanation section 必须提及该 callable（constructor 可以使用 class 名称），以发现指向已有但无关 section 的链接。Anonymous callbacks 和 arrow locals 放在所属操作正文中解释。

在 [文档维护](coverage.md#verification) 时，对照 implementation 与 tests 复核 behavioral explanations 和翻译。

Source / verification：[scripts/check-docs.ts](../../../../../scripts/check-docs.ts) · [Source atlas](../source-map.md)

<a id="pi-check"></a>

## 检查指定 installed Pi binary

`check-pi.ts` 接受一个 absolute Pi executable，或 absolute Node executable 加 absolute Pi entry point。无效或多余 arguments 显示 usage，并产生非零 exit code。它用 child Node process 运行 runtime test file，file-level budget 为 60 秒，通过 test-only environment variables 传入指定 paths；每个 test 仍保留自己的 timeout。

Child 继承 standard IO。启动 error 报告无法开始 tests；SIGINT/SIGTERM handlers 转发 TERM，exit callback 移除 handlers 并传播 exit code。它通过 synthetic runtime fixtures 验证指定 binary；默认 suite 使用 pinned dependency。Live provider checks 单独运行。

Source / verification：[scripts/check-pi.ts](../../../../../scripts/check-pi.ts) · [tests/runtime.test.ts](../../../../../tests/runtime.test.ts) · [tests/fixtures/pi-environment.ts](../../../../../tests/fixtures/pi-environment.ts)

<a id="browser-check"></a>

## Real-browser verification infrastructure

`check-web.ts` 用真实 headless Chrome 连接 temporary Dwell host 和 synthetic Pi environment。它选择 HTTP、HTTPS 或两者，创建 test model/configuration files 与 host directories，使用 temporary profile 启动 Chrome，再连接 debugging WebSocket。HTTPS fixture 在本地终止 TLS 并转发 loopback host，不测试用户的 remote network。

`record` 验证 decoded objects。`BrowserPage.constructor` 按 response IDs 找到 pending commands，并记录 Runtime.exceptionThrown。`open` 启用 Page、Runtime、Network domains。`call` 分配 ID、设置 15 秒 timeout、发送 command，完成时清理 timeout。`evaluate` 等待按值返回的 JavaScript result 并报告 exception details；`until` 最多轮询 20 秒，超时时输出 UI diagnostics。`click`、`type` 驱动 DOM interactions，type 还 dispatch input event。

Layout helpers 检查 composer、sidebar labels/widths、new-session heading、action icons 与 status/close geometry。`assertQuietProcessPresentation` 检查 thinking/tools、multiline commands 和 disclosure focus/scroll。`assertSavedRendererCacheAndImageGeneration` 检查 node reuse 与 stale image callbacks；`assertOlderAssistantGroupScrollAnchor` 检查旧消息展开；`assertNoPartialOrRecoveryRow` 检查残留 recovery presentation；`assertInputGrows`、`checkMobileKeyboard` 检查 textarea 与 viewport。`stagePngImages` 通过 canvas 生成真实 PNG fixtures 并 dispatch file-selection change；`saveScreenshotIfRequested` 只在配置时写 screenshots。

Scenario body 覆盖 pairing、session creation/selection、plain/image prompts、model/thinking、rendering、reconnect、close/reopen、host restart 与 revocation。Finally 关闭 debugging sockets、有界升级停止 Chrome、关闭 host/proxy，并移除 temporary Pi environment。Browser tests 覆盖 headless Chrome 中的 synthetic interactions。实体设备的 keyboard 与 viewport behavior 需要在相应设备上测试。

Source / verification：[scripts/check-web.ts](../../../../../scripts/check-web.ts) · [tests/fixtures/https-proxy.ts](../../../../../tests/fixtures/https-proxy.ts) · [tests/fixtures/pi-environment.ts](../../../../../tests/fixtures/pi-environment.ts)

<a id="test-map"></a>

## 怎样阅读 test suite

[Test atlas](../test-map.md) 列出各 test file 与静态命名 scenarios。HTTP tests 通过 loopback 验证 admission；catalog tests 验证 durable constraints；runtime tests 验证 subprocess/protocol boundaries；browser reducer/renderer tests 隔离 state/DOM behavior。Recovery fixtures 在指定 transition points 停止 owner；synthetic processes 可以发送 malformed、提前或中断的 protocol events，这些情况用 live provider 很难稳定重现。

先读行为解释，再通过 test link 查看 scenario 的 assertions 与 fixtures。新增行为时增加对应 boundary checks。

Source / verification：[tests/fixtures/turn-owner.ts](../../../../../tests/fixtures/turn-owner.ts) · [tests/turn-recovery.test.ts](../../../../../tests/turn-recovery.test.ts) · [tests/runtime-failure.test.ts](../../../../../tests/runtime-failure.test.ts)
