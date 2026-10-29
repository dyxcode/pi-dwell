<a id="development-and-verification"></a>

# 开发与验证

[English](../../../handbook/development.md) | 简体中文

[文档索引](README.md) · [源码索引](source-map.md) · [测试索引](test-map.md)

<a id="repository-layout"></a>

## 仓库布局

| 路径 | 职责 |
| --- | --- |
| `src/cli.ts` | Executable entry point |
| `src/clients/cli/` | 管理命令的 parsing、dispatch 和本地 HTTP client |
| `src/clients/web/` | HTML/CSS、browser module serving、transport、state、rendering 和 interactions |
| `src/server/` | HTTP routes、origin/authentication policy、SSE 和 discovery |
| `src/sessions/` | Session/turn coordination、event projection 和 saved-history projection |
| `src/runtime/` | 外部 Pi supervision、JSONL RPC、native history 和 identity |
| `src/storage/` | SQLite catalog 和 durable turn ledger |
| `src/shared/` | Shared data contracts 和 runtime validators |
| `src/local/` | Private paths 和 filesystem operations |
| `src/service/` | launchd/systemd user-service adapter |
| `tests/` | Node tests 及 synthetic subprocess/provider fixtures |
| `scripts/` | Package、installed-Pi 和 browser acceptance checks |
| `docs/` | 公开文档和已翻译的 README |

[Source atlas](source-map.md) 列出所有 source files 及其具名声明。[Test atlas](test-map.md) 列出每个 test file、fixture 和静态命名的 scenario，方便按测试覆盖情况查找，而不必从文件名猜测。

<a id="toolchain-and-configuration"></a>

## 工具链和配置

[`package.json`](../../../../package.json) 声明 ESM private package、MIT license、Node >=22.19.0、精确的 dependency pins 和 command scripts。[`package-lock.json`](../../../../package-lock.json) 锁定 transitive graph。`marked` 是 runtime Markdown parser；Pi packages 是用于 exact-version tests/types 的 development dependencies，而 hosted execution 使用外部配置的 Pi binary。

[`.npmrc`](../../../../.npmrc) 设置 exact dependency saving、禁用 lifecycle scripts，并禁用自动 audit/funding output。使用 `npm ci --ignore-scripts` 按 lockfile 安装。该 repository 未定义 npm publication workflow。

[`tsconfig.json`](../../../../tsconfig.json) 使用 NodeNext module resolution、显式 `.ts` imports、no emit、strict checking、仅可擦除语法、unchecked-index protection、exact optional properties、unused-symbol checks，以及对 scripts 的 JS checking。Node 直接执行 TypeScript；Web asset module 会剥离并重写 browser modules。

[`biome.json`](../../../../biome.json) 覆盖 source、tests、scripts 和 root JSON；使用两个空格缩进、100 字符行宽、双引号和分号。`npm run check:docs` 检查 handbook links、anchors、source positions 和 explanation coverage。

[`.gitignore`](../../../../.gitignore) 排除 dependencies、build/test outputs、本地 agent guidance 和 runtime/credential paths。公开文档放在 `docs/`；私有 agent instructions 和 operational records 保持在 public package 之外。

<a id="commands-and-what-they-establish"></a>

## 命令及其验证范围

| 命令 | 检查或执行内容 |
| --- | --- |
| `npm run lint` | 运行 Biome lint，并将 warnings 视为 errors。 |
| `npm run format:check` | 只读的 Biome formatting check。 |
| `npm run typecheck` | TypeScript no-emit checking。 |
| `npm test` | Node 的 `tests/*.test.ts` suite。 |
| `npm run check` | 按顺序运行以上四项 checks。 |
| `npm run format` | 重写已格式化文件；应有意执行。 |
| `npm run check:package` | 对照 public-file boundary dry-run 检查 package 内容。 |
| `npm run check:pi -- /absolute/path/to/pi` | 使用已安装的 standalone Pi 做 offline compatibility 检查。 |
| `npm run check:pi -- /absolute/path/to/node /absolute/path/to/pi-cli.js` | 使用 Node entry point 执行相同 compatibility 检查。 |
| `npm run check:web -- /absolute/path/to/chrome` | 使用 synthetic Host/Pi fixtures 进行真实 browser acceptance，覆盖 HTTP 和 HTTPS。 |

默认 check 不需要 provider access 或 credentials。Browser 和 installed-binary checks 需要外部 executables，因此单独运行。交互式 Dwell sessions 则不同：它们使用已配置的 Pi environment，也可能调用 providers/tools。

<a id="the-three-verification-scripts"></a>

## 三个验证脚本

[`check-package.mjs`](../../../../scripts/check-package.mjs) 使用禁用 lifecycle scripts 的模式和临时 cache，执行 `npm pack` dry-run JSON。它会按 allowlist 验证所有返回路径，并断言必需文件存在。finally block 会删除 temporary directory。此检查验证 packaging，不会发布 package。

[`check-pi.ts`](../../../../scripts/check-pi.ts) 要求提供一个绝对 executable path，可选再提供一个绝对 entry point，然后通过 fixture environment overrides 启动 runtime test file。Runner budget 为 60 秒；各 scenario 仍保留自己的 timeout。SIGINT 会转发给 child。Offline fixtures 会验证 installed binary 的 protocol compatibility，不会联系 provider account。

[`check-web.ts`](../../../../scripts/check-web.ts) 通过 DevTools WebSocket protocol 驱动真实 Chrome process。它启动隔离 fixtures，通过真实 HTTP/HTTPS pages 执行 pairing，测试 conversation/model/image/stream/lifecycle behavior，并使用临时 browser profiles。可选 executable positional argument 会覆盖 macOS Chrome 默认位置。`--http` 或 `--https` 选择一种 mode；未指定时两种都会运行。`DWELL_WEB_SCREENSHOT_DIR` 可选用于保存 acceptance screenshots。私有测试产物应保存到 repository 之外的本地位置。

<a id="reading-tests-by-boundary"></a>

## 按边界阅读测试

| 范围 | 起始测试 |
| --- | --- |
| Entry point 和 client protocol | `cli`、`runtime-cli`、`host` |
| Authentication/origins/service ownership | `auth`、`access`、`service`、`service-boot` |
| Catalog 和 lifecycle | `catalog`、`sessions`、`sessions-http`、`turn-catalog` |
| Turn execution 和 recovery | `turns`、`turns-http`、`turn-recovery`、`native-executions` |
| RPC/runtime/model registry | `runtime`、`runtime-failure`、`pi-models`、`session-models`、`session-discovery` |
| Native 和 projected history | `pi-history`、`pi-history-budget`、`history`、`history-service`、`history-http`、`history-context`、`history-cancellation` |
| Events 和 streaming | `events`、`events-http`、`session-events`、`web-events` |
| Browser rendering 和 images | `web`、`web-client`、`conversation`、`images`、`images-http` |

上面的名称省略了 `.test.ts`。完整的 [test atlas](test-map.md) 包含各 scenario 和链接，也列出用于确定性 Pi failures、extension-handled input、native follow-ups、owner death 和 HTTPS proxy behavior 的 fixtures。

<a id="make-a-behavior-change"></a>

## 修改行为

1. 定义可观察的 behavior 和相关 boundary cases。阅读对应章节、source、contracts 和现有 tests。
2. 实现前先添加或调整一个针对该 behavior 且预期失败的 test。相关 boundary 是重点时，使用真实 loopback sockets 或 subprocesses。
3. 在拥有该 decision 的 module 中实现。未验证前将不可信值保持为 `unknown`；wire representation 变化时更新 shared contracts。
4. 先运行 targeted test，再运行 `npm run check`。内容变化时运行 package checks；RPC compatibility 变化时运行 installed-Pi checks；browser integration 变化时运行 browser acceptance。
5. 审查 diff，并同步更新 user-facing behavior、API reference 和 internals。分别记录 synthetic acceptance 与 live provider/device acceptance。

例如，image admission 涉及 shared validation、HTTP body bounds、turn payload identity、browser previews、Pi prompt projection 和 saved-image reads。沿着这条 data path 更新受影响的边界。

<a id="maintain-the-documentation"></a>

## 维护文档

`docs/handbook/` 中的英文页与 `docs/i18n/zh-CN/handbook/` 中的简体中文页使用相同文件名一一对应。行为变化时同时更新两种语言。中文正文保留重要概念和代码标识的 English 原文。维护逐页语言切换和原始 heading 的显式 anchor，确保中文标题不会破坏跨页链接。Package check 要求每个已列入清单的 handbook 页面都同时具备两种语言版本。

将任务说明放入 Guide/Tutorials，精确 contracts 放入 Reference，实现理由放入 Internals。让页面相互链接，并在权威位置定义每项 limit。对照定义它们的 constants，重新检查重复出现的 compatibility requirements。

Source 和 test atlases 是当前 declaration 和 test name 的 snapshot。代码移动时，刷新受影响的条目和行锚点，并对照 `src/` 与 `tests/` 下的文件核验覆盖范围。Source line anchor 只是导航辅助；当前 revision 的源码仍是权威依据。

运行 `npm run check:docs` 验证两种 handbook file sets、local links/anchors、source line positions 和 callable-to-explanation coverage。[Implementation coverage](implementation/coverage.md) 解释维护约定，[tooling](implementation/tooling.md) 解释 checker。
