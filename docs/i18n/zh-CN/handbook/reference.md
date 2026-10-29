<a id="reference"></a>

# 技术参考

[English](../../../handbook/reference.md) | 简体中文

[文档目录](README.md)

通过本页查找准确命令、配置、API contract 和实现细节。若想了解何时使用某个功能，从[使用指南](guide.md)开始。

<a id="cli-commands"></a>

## CLI 命令

所有命令都在 checkout 内使用 `npm run dwell -- <command>` 执行。

| 命令 | 效果 | Mode |
| --- | --- | --- |
| `--help` | 输出支持的语法 | 无 |
| `serve` | 启动 foreground host | Production；可选 `--dev` |
| `status` | 返回通过 authentication 的 HostStatus JSON | Production；可选 `--dev` |
| `pair` | 创建 single-use pairing code | Production；可选 `--dev` |
| `auth revoke` | 撤销全部 browser 和 pending pairing code | Production；可选 `--dev` |
| `pi configure --executable <absolute> [--entry-point <absolute>]` | 验证并保存外部 Pi 配置；要求先关闭已打开的 session | Production；可选 `--dev` |
| `service install` | 注册 user service | Production |
| `service start` | 启动并等待通过 authentication 的 readiness 检查 | Production |
| `service stop` | 停止归该安装管理的 service | Production |
| `service restart` | 先停止再启动归该安装管理的 service | Production |
| `service status` | 报告 manager state/readiness；Linux 还报告 boot 设置 | Production |
| `service uninstall` | 停止 service、移除 registration、禁用 Linux unit autostart，并保留数据 | Production |

不提供 command argument 时，默认执行 `serve`。`npm start` 在 foreground 运行 production host；`npm run dev` 通过 Node watch 运行 development host。CLI 不提供公开的 port/data-directory override 或 session 管理命令。解析和错误行为见 [CLI internals](cli-service.md)。

<a id="configuration-and-state-locations"></a>

## 配置与 state 的存放位置

| 项目 | 位置或来源 | 含义 |
| --- | --- | --- |
| Production data | `~/.local/share/pi-dwell` | Dwell 管理的 local state |
| Development data | `~/.local/share/pi-dwell-dev` | 独立的 credential/catalog/native session |
| `auth-token` | Data directory | Private local CLI bearer credential |
| `browser-sessions.json` | Data directory | Browser credential 的 hash 和 expiry |
| `catalog.sqlite` | Data directory | Runtime configuration、session catalog、durable turn ledger |
| `sessions/<Dwell session ID>/` | Data directory | Pi native JSONL session file |
| 可选的 `access.json` | Production data directory | 额外的 canonical HTTPS browser origin |
| Pi authentication、model、setting 与 resource | Host user 下的 Pi native configuration | 由 Pi 管理，用于 hosted execution |

Data directory 必须位于 repo 和 Obsidian vault 之外，并且只允许 owner 访问。Private JSON/credential 文件要求属于当前 user、是 single-link regular file，且权限为 0600。参见[本地文件实现](cli-service.md#data-path-and-private-file-rules)。

Runtime executable 配置通过 CLI/API 存入 SQLite，不使用用户手动维护的 `runtime.json`。Provider credential 配置在 Pi 或 service environment 中，不写入 public repo 文件。

<a id="optional-https-origin"></a>

## 可选 HTTPS origin

Dwell 仍然监听 loopback。单独管理的 HTTPS reverse proxy 可以提供一个已配置的 browser origin。Proxy 必须终止 TLS、保留配置的 Host authority，并将访问限制在预期 client 范围内。Dwell 不负责创建 proxy 或配置 network permission。

Production data directory 创建后，按下面的准确 schema 配置其中的 private `access.json`，并替换为实际 canonical origin：

```json
{
  "version": 1,
  "browserOrigin": "https://dwell.example"
}
```

该文件必须是归 service user 所有、权限为 0600 的 regular file。Origin 不带结尾斜杠、path、query 或 fragment。修改后重启 service，将 proxy target 设为 `http://127.0.0.1:8787`，再在 HTTPS 地址下为 browser pairing。Local origin 和 HTTPS origin 各有独立的 browser binding/cookie。CLI bearer authentication 仍只允许使用 local 地址。

准确的 application behavior 和 acceptance check 见 [HTTP access internals](http-auth.md#authority-and-https-configuration)。

<a id="http-api-and-payload-contracts"></a>

## HTTP API 与 payload contracts

- [完整 route、method、authentication 与 response 语义](http-auth.md#complete-route-map)
- [Shared types、validation 与限制](contracts.md)
- [Session/turn state 与 persistence](sessions-storage.md)
- [Error code 与恢复建议](errors.md)
- [SSE framing 与 connection 限制](http-auth.md#sse-writer-and-backpressure)

Context GET 会按需打开或重新打开 Pi；history GET 读取已保存文件，不打开 Pi。成功的 turn submission 确认 admission；completion 单独报告。Pi JSONL 提供已保存的 conversation 内容。Native extension execution 与 durable Dwell turn 使用不同 identity 和 stop route。

<a id="code-and-test-reference"></a>

## Code 与 test 参考

- [源码与 symbol 索引](source-map.md)：每个 production 源文件、local import、module declaration、class member 和具名 function declaration。
- [测试索引](test-map.md)：每个 test/fixture 文件及具有静态名称的 scenario。
- [开发](development.md)：脚本、toolchain 配置、检查和修改流程。
- [概念表](glossary.md)：统一解释 UI、HTTP protocol 和实现中的术语。
