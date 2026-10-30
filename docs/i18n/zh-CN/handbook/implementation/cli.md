# CLI、本地文件与数据路径

[English](../../../../handbook/implementation/cli.md) | 简体中文

[实现索引](README.md) · [CLI 与 service 概览](../cli-service.md) · [Command reference](../reference.md)

CLI 解析 administrative command，并通过 HTTP client 调用 host。它读取已有的本地 credential，并将 Dwell state 放在 repository 和 Obsidian vault 之外。只有 foreground serve 会加载 server module。

<a id="command-parsing"></a>
## Command grammar 与 validation

[parseOptions](../../../../../src/clients/cli/arguments.ts#L17) 将带名称的 option value 与 positional argument 分开，并识别一个可选的 --dev flag。它会拒绝重复 flag/option、缺失 value、未知 option 和不支持的 positional argument，由调用方处理报错。以两个短横线开头的 value 会被视为缺少 option value。[requiredValue](../../../../../src/clients/cli/arguments.ts#L47) 会拒绝缺失或只有空白字符的必需值；[absolutePath](../../../../../src/clients/cli/arguments.ts#L54) 会拒绝相对 executable path。

[parseCommand](../../../../../src/clients/cli/arguments.ts#L59) 返回 discriminated command union。无参数等同于 production serve。顶层和受支持的子命令 help 都是只读的。Service 只接受 install、uninstall、start、stop、restart 或 status 之一。Pi configure 只接受 executable、可选 entry-point 和可选 --dev。保留 auth revoke 写法作为 alias；session CRUD command 以及 public port、host、data-directory override 都不接受。Service action 始终使用 production path。

<a id="command-dispatch"></a>
## CLI dispatch 与 foreground host

[runCli](../../../../../src/clients/cli/main.ts#L9) 先解析命令，不会先读取 state。Help 会打印 command surface 然后退出。Service command 直接交给 runServiceCommand。其他命令会选择 production/development data path，再通过 CLI HTTP client dispatch status、pairing、browser revocation 或 Pi executable 配置。Status 和 configuration 输出经过校验的 JSON；pairing 输出短 code 与 expiry；revoke 输出确认信息，不会打印长期 bearer credential。

只有 serve 分支会动态 import startHost，让 administrative subcommand 不必加载 server 和 SQLite。它在等待启动前安装 SIGINT 和 SIGTERM handlers。嵌套 shutdown callback 会记住 host 对象尚未可用时收到的 signal；启动完成后关闭 host 一次；报告 shutdown failure；并在 close 完成后移除两个 handler。Listener 冲突会转换成可操作的错误信息，其中指出固定 port 和 production/development 冲突。[src/cli.ts](../../../../../src/cli.ts#L3) 是顶层 module：它把 process arguments 交给 runCli；command rejected 时打印一条带 prefix 的 error，并将 exit status 设为 1。

<a id="local-http-client"></a>
## Authenticated local HTTP client

[localRequest](../../../../../src/clients/cli/status.ts#L11) 先读取现有的 private auth-token，再生成指向 127.0.0.1 的请求，并选择固定或默认 port。POST body 序列化为 JSON；未提供 body 时表示空 object；GET body 会在本地报错。Fetch 设置 abort deadline、拒绝 redirect，并发送 JSON accept/authentication headers，不会将 bearer token 放入 URL。

Timeout message 会明确说明 host 可能已经完成操作，因此调用方应先检查 state 再重试。Network error 会写出 local address 和启动命令。401 会解释 production/development credential 不匹配。即使 HTTP status 成功，response 仍必须含有可解析的 JSON；非 JSON、格式不正确的 public error 和不兼容的 success data 会分别报告。[errorMessage](../../../../../src/clients/cli/status.ts#L86) 只会提取 public error.message 中非空字符串。

Typed wrapper 将每条 command 的预期 response 限定为具体形状。[readHostStatus](../../../../../src/clients/cli/status.ts#L101) 校验 HostStatus。[createPairing](../../../../../src/clients/cli/status.ts#L107) 校验八位 pairing alphabet 和 safe integer expiry。[revokeBrowsers](../../../../../src/clients/cli/status.ts#L126) 要求 response 是 object 且 `ok` 为 true。[configurationOptions](../../../../../src/clients/cli/runtime.ts#L6) 将 Pi executable configuration request timeout 至少提高到 60 秒，因为 executable verification 可能比 status 耗时更长。[configureRuntime](../../../../../src/clients/cli/runtime.ts#L13) 发送 Pi executable configuration 的 POST，并用 shared RuntimeConfiguration validator 校验 response。

<a id="data-directory-policy"></a>
## Data directory 选择与隔离

[dataDirectory](../../../../../src/local/paths.ts#L7) 为 production 选择 ~/.local/share/pi-dwell，为 development 选择 ~/.local/share/pi-dwell-dev。[hasCode](../../../../../src/local/paths.ts#L11) 安全检查 unknown filesystem error 的 code。[canonicalDestination](../../../../../src/local/paths.ts#L15) 解析 destination 中已经存在的部分；若最终 path 不存在，则递归解析 parent 后再追加最后一段。这使得目录创建前也能检查隔离约束，并防止通过 parent symlink 绕过检查。

[validateDataDirectory](../../../../../src/local/paths.ts#L27) 会在创建任何内容之前 canonicalize 请求路径。它拒绝 Obsidian vault 本身和其所有子目录，随后逐级检查 ancestor 并拒绝位于 .git 或 .obsidian marker 下的路径。Service registration 和 log destination 也复用该 validation。[prepareDataDirectory](../../../../../src/local/files.ts#L7) 再以 0700 权限递归创建所选目录，并通过 lstat 确认最终路径是当前用户拥有、且权限恰好为 owner-only 的 directory。

<a id="private-file-operations"></a>
## Private credential 与 state file

[readPrivateFile](../../../../../src/local/files.ts#L17) 使用 O_NOFOLLOW 和 O_NONBLOCK 以 read-only 方式打开文件。它要求文件是当前用户拥有的单链接 regular file，权限恰好为 0600，大小不超过 1 MiB，最后在 finally 中关闭 handle。Symlink、FIFO、hard link、权限过宽、文件过大或 owner 不匹配都会被拒绝；既有文件保持不变。

[createPrivateFile](../../../../../src/local/files.ts#L38) 使用 exclusive create、O_NOFOLLOW 和 0600 权限，写入 UTF-8 内容、sync 文件，并在失败时也关闭 handle。[replacePrivateFile](../../../../../src/local/files.ts#L52) 先校验既有 destination，再创建并 sync 唯一的 private sibling，rename 覆盖 destination，sync parent directory，并清理任何遗留 temporary file。原子替换只覆盖这一个文件，不会与 SQLite 或 Pi session file 形成 transaction。

[readCredential](../../../../../src/local/files.ts#L70) 通过相同的 private-file 校验读取 auth-token，trim 掉存储的换行，并要求恰好 64 个小写十六进制字符。它只读取已有 state。Credential 缺失时给出启动提示；格式错误或不安全的 token 会保留原样并报告。

<a id="cli-test-evidence"></a>
## Test evidence

[cli.test.ts](../../../../../tests/cli.test.ts#L23) 验证只读 help、production/development path 分离、拒绝已移除 command 和 multi-instance flag、authenticated status/pair/revoke，以及真实 child process 的 signal/port 行为。[runtime-cli.test.ts](../../../../../tests/runtime-cli.test.ts#L89) 检查 parser boundary、authenticated configure request，以及 malformed/failed server response。[auth.test.ts](../../../../../tests/auth.test.ts#L46) 检查 private initialization、持久 credential，以及拒绝 repository/vault data destination（包括 symlink alias）。
