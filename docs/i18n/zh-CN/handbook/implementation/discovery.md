# Directory 与 Pi model discovery

[English](../../../../handbook/implementation/discovery.md) | 简体中文

[实现索引](README.md) · [HTTP discovery 概览](../http-auth.md) · [Session 与 storage 概览](../sessions-storage.md)

Directory browsing 为 session 创建返回 canonical host-directory metadata。Model discovery 会在 private temporary workspace 中检查已配置的 Pi model，并返回 public capability；它不导入 Pi core，也不联系 provider。

<a id="discovery-errors-and-home"></a>
## Error、host home 与 Pi configuration 目录

[SessionDiscoveryError.constructor](../../../../../src/server/session-discovery.ts#L47) 保存 HTTP boundary 使用的 status 和 code。[errnoCode](../../../../../src/server/session-discovery.ts#L54) 将 Node filesystem error 缩窄为字符串 code。[hostHomeDirectory](../../../../../src/server/session-discovery.ts#L60) 依次选择 HOME、Windows 上的 USERPROFILE，最后使用操作系统 home；它要求路径是绝对路径且不超过 4096 个字符，并返回 resolved path。[canonicalPathForPiAgentDirectory](../../../../../src/server/session-discovery.ts#L72) 只展开精确的 tilde 和 tilde-slash 写法。若设置 PI_CODING_AGENT_DIR，它必须是绝对路径且不超过同一长度上限；未设置时使用 host 的 .pi/agent 目录。

[directoryError](../../../../../src/server/session-discovery.ts#L90) 保留已有的 SessionDiscoveryError，并将 ENOENT/ENOTDIR 映射为 invalid-directory，将 EACCES/EPERM 映射为 status 403 的 directory-unavailable，其他 scan error 映射为通用 status 500。这样可以避免把原始 OS message 暴露为 public route contract。

<a id="directory-listing"></a>
## Host directory browser

[listHostDirectories](../../../../../src/server/session-discovery.ts#L112) 默认浏览传入的 home directory，并拒绝相对、空或过长路径。它使用 realpath 解析目标，并在枚举前确认目标是 directory。Response 中的 selected root 是 canonical path；只有 filesystem root 的 parent 才是 null。

枚举通过 opendir 和异步 scan 完成。隐藏名称和超过 255 个字符的名称会跳过；普通文件和指向文件的 symlink 不会返回。对于 directory 或 directory symlink，先通过 stat 确认 target 是 directory，再用 realpath 得到 canonical destination。若子目录在扫描期间消失、不可访问或是 broken link，会跳过该项而不导致整份列表失败。结果按显示名称排序。扫描超过 10,000 个 entries 或 500 个已收录 directories 时停止并设置 truncated；返回的是有界选择器，不是通用 file browser。

<a id="temporary-discovery-workspace"></a>
## Private temporary workspace 与 child environment

[createDiscoveryWorkspace](../../../../../src/server/session-discovery.ts#L187) 在操作系统的 temporary directory 下创建唯一目录，将 root 权限设为 0700，并创建彼此分开的 agent、cwd、package 和 session directories。它以 exclusive create 和 0600 权限写入最小 package metadata。准备失败时会移除部分 workspace，并返回安全的 discovery error。

[isolatedEnvironment](../../../../../src/server/session-discovery.ts#L226) 复制调用方 environment，但把 Pi agent 和 session state 指向 workspace，开启 offline mode、关闭 color、使用 dumb terminal，并移除 PI_MANAGED_INSTALL_ROOT。[discoveryEnvironment](../../../../../src/server/session-discovery.ts#L243) 为读取已复制 model configuration 的 child 加上 workspace package directory。最初的 version check 使用 isolated environment，但不会覆盖调用方的 PI_PACKAGE_DIR；model-list 和 capability child 则使用完整隔离后的 package setting。

[copyPiConfiguration](../../../../../src/server/session-discovery.ts#L250) 只复制存在的 auth.json、oauth.json、settings.json、models.json 和 models-store.json。它先通过 realpath 解析源路径，因此 allowlisted symlink 可以指向 regular target；随后以 O_NOFOLLOW 打开 canonical target，拒绝该路径的 final component 被替换成 symlink。它要求 regular file，并将每个文件限制为 8 MiB、总量限制为 16 MiB。目标文件在 private workspace 中以 exclusive create 和 0600 权限写入。缺少文件可以接受；其他读取、校验或写入错误会使 discovery 失败；每个已打开的 source handle 都在 finally 中关闭。Extensions、sessions、project data 和其他 profile files 不会复制。

<a id="global-model-list"></a>
## Global model-list subprocess

[runModelList](../../../../../src/server/session-discovery.ts#L293) 使用配置中的 executable 和可选 entry point 调用 execFile。它请求 offline model listing，并关闭 session loading、extensions、MCP、skills、prompt templates、themes 和 context files。Child 使用 temporary cwd 与 isolated environment，timeout 为 15 秒且超时后发送 SIGKILL，输出上限为 1 MiB。这里不会拼接或执行 shell command。

[discoverPiModels](../../../../../src/server/session-discovery.ts#L434) 先创建 workspace，再读取 host profile path；随后验证配置的 Pi version，并复制 allowlisted files。若配置的 entry point 是 Pi 的 rpc-entry.js，函数会改用同目录的 cli.js 作为 model-list entry point，因为 model listing 属于 CLI command；保存的 Pi 配置仍保留已配置的 RPC entry point。随后解析 child output、捕获经过消毒的 typed failure，并始终移除 workspace。Cleanup failure 优先于 probe result 或此前发生的 error。Unsupported Pi version 会得到专门错误；process stderr 和本地配置内容不会返回给调用方。没有得到 parsed result 也会显式报错。

<a id="model-list-parser"></a>
## Model table parsing 与 validation

Parser helpers 共用一个固定的六列 contract。[modelColumnPositions](../../../../../src/server/session-discovery.ts#L331) 按顺序查找 provider、model、context、max-out、thinking 和 images headings。[modelColumns](../../../../../src/server/session-discovery.ts#L343) 按这些位置切分 row，并排除预期的列间空隙。[parseModelList](../../../../../src/server/session-discovery.ts#L356) 先移除 terminal control sequences 并统一 line endings。任何以 “No models available.” 开头的行都会返回空列表。

其他输出要求存在一行切分后与预期名称完全一致的 header。Parser 会拒绝不支持的 header、格式错误的 row、空值或超长的 provider/model identifier、缺少 context/max-out cell，以及不为 yes/no 的 thinking/image 值。它也拒绝重复的 provider-plus-model pair，并在超过 10,000 项时停止。结果包含 provider、model ID 和 image support；Pi display table 的其他 detail 不包含在结果中。

<a id="model-capability-probe"></a>
## Per-model capability probe

[discoverPiModelCapabilities](../../../../../src/server/session-discovery.ts#L503) 在创建 temporary state 前先校验 provider/model request。它验证 Pi、复制 allowlisted host configuration，并使用 workspace cwd、session directory、environment 和 isolated resource policy 启动 PiProcess。随后读取 Pi state，确认实际选择的 provider 和 model 与请求完全一致。Thinking levels 和 image support 会在同一个 process 上并发查询，因此两者描述的是同一项 effective model selection。

该函数把 process 与 version failure 转换为安全的 public error。Pi 启动后的所有路径都会先尝试停止 Pi，再移除 workspace。Stop 或 workspace removal 失败时返回 discovery_cleanup_failed，包括已经得到结果或另一个 error 的情况。这个 isolated Pi process 只用于 capability discovery，不会加入 host 的 Dwell session catalog。

<a id="discovery-test-evidence"></a>
## Test evidence

[session-discovery.test.ts](../../../../../tests/session-discovery.test.ts#L29) 检查 canonical directory output、可见子目录、symlink 处理，以及对相对/缺失/文件路径的拒绝。Model-list tests 使用 synthetic Pi entry point，验证 version check、offline flags、复制文件 allowlist 与大小限制、经过消毒的 failure、空 model list、CLI 和 RPC entry-point 两种形式，以及不访问 provider 的本地配置。Capability test 确认 isolated Pi RPC 会返回 thinking/image support，且不会加载配置中的 extension。一个 integration case 验证 SessionService 会合并并发的 global scan，并在 shutdown 前排空 discovery。
