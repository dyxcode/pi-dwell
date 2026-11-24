<a id="user-guide"></a>

# 用户指南

[English](../../../handbook/guide.md) | 简体中文

Pi Dwell 为 Dwell host 所拥有的 Pi session 提供浏览器对话界面。请使用[手册索引](README.md)选择下一章。设置请从[快速开始](quick-start.md)入手；完整工作流程见[教程](tutorials.md)；支持的功能与限制见[参考](reference.md)。

内容包括浏览器工作流程、session 切换、连接中断，以及将 transcript 交还给 Pi。

<a id="start-a-conversation"></a>

## 开始对话

1. 按照[快速开始](quick-start.md)在主机上启动 Dwell。
2. 在主机打开 Dwell；手机则通过获准的私有 HTTPS 地址访问。
3. 选择 **New session**，然后选择 host 上的一个目录。
4. Dwell 会为该目录打开 Pi session。新 session 使用 Pi 已配置的默认 model 和 thinking 设置。
5. 如需选择其他 model，请使用消息框上方的 model 控件。按 provider 或 model ID 搜索，选择一个 model，再选择它提供的 thinking level。

Model 和 thinking 选择属于各自的 session。Dwell 显示该 session 已加载的 Pi runtime 中可用的选项，其中也包括已加载 extensions 提供的 model。如果某个 model 只有一个 thinking level，Dwell 会直接选中它。session 处于 idle 时可以更改这些设置；新设置会用于下一条消息，并在 session 重新打开后保留。

<a id="send-a-message"></a>

## 发送消息

在 composer 中输入消息并选择 **Send**。使用精确指针设备的键盘时，Enter 会发送消息，Shift+Enter 会插入换行。在触控布局上请使用发送按钮，让 Enter 留给屏幕键盘。

消息文本最多为 8 KiB UTF-8。消息必须包含非空白文本或至少一张图片。浏览器 composer 不接受 Pi slash commands；命令工作流程请使用交互式 Pi client。

Dwell turn 或 native Pi extension execution 正在运行时，composer 操作会变成 **Stop**。它会停止 host 当前显示的活动 run。session 忙碌时不能更改 model，也不能新增图片。

<a id="attach-images"></a>

## 附加图片

选择 **+ Image**，或将图片粘贴到 composer 中。浏览器接受 PNG、JPEG、WebP 和 GIF。每条消息最多可包含四张图片，解码后的总数据上限为 5 MiB，并且所选 model 必须支持图片。Dwell 会在将图片作为 draft 暂存之前检查类型和内容；也允许只发送图片的消息。

图片在发送前都只是 draft。你可以预览或移除每个附件。如果切换到不支持图片的 model，已有 draft 仍可移除；要发送它，请改选支持图片的 model。

页面打开期间，浏览器会按 session 在内存中保存文本和图片 draft。在 session 之间切换会保留这些 draft。完整刷新页面会丢失尚未发送的文本和图片 draft。连接页面重置时会清除图片 draft；文本只保留在仍打开的页面内存中。host 确认接受消息后，发送的 draft 会被清除。

<a id="switch-and-reopen-sessions"></a>

## 切换和重新打开 session

侧边栏列出 session identity；顶部状态标签显示 Dwell 当前认为已打开的 session，其中也包括需要处理的 session。状态包括 Ready、Working、Needs attention、Stopped 和 Opening。

配置 Distill 后，侧边栏会切换为 Memory search 与阅读入口。Conversation list 会由 icon-only session controls 取代；主视图仍显示所选 conversation 和 composer，**New** 仍可用。未配置 Distill 时，侧边栏仍显示 conversation list。详见[搜索与阅读 Memory](#distill-memory)。

- 选择侧边栏项目可切换到已打开的 session。
- 选择侧边栏中的已关闭 session 可显式重新打开它。
- 已关闭的 session 会保留其 saved history。刷新浏览器不会自动重新打开它。
- 要关闭所选 runtime，请再次选择它的状态标签以显示关闭控件，然后确认。如果仍有工作，Dwell 会询问是否停止并关闭。

关闭 runtime 后，session 及其 Pi native history 仍会显示在侧边栏。稍后要继续时，请重新打开该 session。浏览器只会在当前页面的生命周期内保留未发送的 draft。

<a id="move-a-transcript-between-dwell-and-pi"></a>

### 在 Dwell 和 Pi 之间移动 transcript

已测试的交接流程是顺序执行的。先关闭 Dwell runtime，再用 Pi 打开同一个 native session identity。随后在 Dwell 中重新打开 session，即可看到 Pi 保存的 transcript。Dwell 不会替你启动 Pi，也不会替你选择那个 Pi session。关于底层 ownership 行为，请参阅[Pi runtime 章节](runtime.md)。

<a id="read-conversation-history"></a>

## 阅读 conversation history

Dwell 会同时显示 Pi 的 saved history 和当前 live response。response 结束后，saved entry 会接替与之匹配的 live 内容，避免相同文本或 tool call 显示两次。选择 **Load earlier messages** 可获取更早的分页内容。

Assistant 文本使用 Markdown。Tool call 及其结果可以展开；失败的 tool 默认展开。Thinking 内容默认折叠，可以展开。查看 saved image 时，Dwell 会从当前 transcript 加载它。

**Context** 折叠区显示 Pi 保存为 system context 的 project instruction sources 有界预览。内容可能会标明已缩短或省略。这不是发送给 model 的完整 prompt。

<a id="distill-memory"></a>

## 搜索与阅读 Distill Memory

在 Dwell 中显式连接 Distill 后，可以使用 sidebar 的 **Memory** 搜索已保存的记录，并打开结果阅读。Search results 会提供简短 preview；选中结果后读取对应的记录 revision。Reader 暂不可用时，Memory 仍保留在 sidebar 中并提供 **Retry**。Conversation view 及其 controls 继续可用。

Search 页面可能没有结果，但仍有后续内容；只要页面提供继续选项，就可以继续搜索。

Memory 与 conversation 及 Current Library 相互独立。阅读记录不会将内容加入 Pi prompt 或已保存的 conversation。要浏览收集到的外部来源并附加 exact-version references，仍使用独立的 [Current Library](#current-library)。

<a id="stay-connected"></a>

## 保持连接

连接中断后，浏览器会重新连接 live event stream，并定期刷新 session 列表。host 拥有活动中的 Pi 工作，因此关闭标签页或丢失浏览器连接都不会取消 response。页面重新激活时，Dwell 会重新连接并刷新 history。

关闭浏览器标签页只会断开当前页面，Host 上的工作会继续。要阻止设备远程访问，请修改私有网络的访问策略。

<a id="what-the-browser-does-not-provide"></a>

## 浏览器不提供的功能

- Pi terminal 或 slash-command 界面。
- Pi 交互式 extension 确认/对话框界面。浏览器可以显示 extension 消息并观察 native extension execution，但需要交互式 Pi client 处理的对话框必须在该 client 中完成。
- 在创建表单中使用自定义 model 创建 session。请先创建基于目录的 session，再使用 model 控件。
- 完整刷新页面或关闭浏览器后恢复未发送 draft 的方式。连接页面重置时，图片 draft 也会清除。

当前功能和数值限制请参阅[功能参考](reference.md)。实现行为和测试覆盖请参阅 [Web client 内部说明](web-client.md)、[共享 contracts](contracts.md)和[手册索引](README.md)。


<a id="distill-configuration"></a>

## 配置 Distill Memory 与 source coordination

在 Distill checkout 中运行 `npm run build:package`，构建 public Node API。然后在 Dwell data directory 创建 owner-only `0600` 的 `integrations.json`：

```json
{
  "version": 1,
  "distill": {
    "module": "/absolute/path/to/pi-distill/dist/host-storage.js",
    "database": "/absolute/path/to/your/distill.sqlite"
  }
}
```

`database` 指向管理这些 Pi sessions 的 Distill store，然后 restart Dwell。该显式 host configuration 会启用 source coordination，以及由该 Distill module 提供的 Memory reader；仅安装或注册 Pi extension 不会为 Dwell 完成集成配置。Dwell 会让文件读取和 hosted Pi processes 参与 store 的 cleanup coordination。省略 Distill entry 时两项集成都不启用；未配置 Distill 时，现有 Conversations sidebar 保持不变。

Source-access configuration 或 module opening 出错仍会导致 startup 失败。Memory reader 初始化是 optional：reader 不存在或无法打开时，Dwell 会在 source coordination 可用的情况下正常启动，并在 sidebar 显示 Memory 不可用及 **Retry**。详见 [Memory](implementation/memory.md) 和 [access lifecycle](implementation/history-retirement.md#behavior)。

<a id="current-library"></a>

## 使用 Current library

在 Current checkout 中运行 `npm run build:library`，然后在 Dwell 私有 `integrations.json` 中加入 `current` object。`module` 必须是已安装 JavaScript library entry 的 absolute filesystem path；`root` 是 Current 使用的本地 data-directory path。`binding` 是该 root 的稳定本地 label，最多 64 个 letters、digits、dots、underscores 或 hyphens。

```json
{
  "version": 1,
  "current": {
    "module": "/absolute/path/to/pi-current/dist/library-api/library/index.js",
    "root": "/absolute/path/to/current-data",
    "binding": "personal-current"
  }
}
```

请将两个 path 替换为本机 absolute path。同一个 canonical root 应持续使用相同 binding；Current 打开后，若该 binding 指向不同 root，Dwell 会拒绝启动。配置文件从 Dwell data directory 读取，并需满足现有 private-file permission checks。省略 `current` 时 session host 仍可用，library routes 会返回 `library_unavailable`。

打开 **Library** 可查看 latest items、搜索和读取 exact version。Candidate result 会显示 **Article text has not been saved.**、发现时间和原始来源链接。已保存 item 则提供正文供阅读。选中 session 后，使用 **Attach to session** 保存 exact item/version reference，包括已确认的 candidate。该操作不会改变 Pi prompt，也不会获取 candidate text。Current 暂不可用时，已保存 reference 仍可查看和移除。

`current` 和 `distill` 可放在同一个 version 1 configuration 中。详见 [Library](implementation/library.md) 与 [历史清理](implementation/history-retirement.md)。

<a id="retired-history"></a>

## Distill 已删除的 history

匹配的 completed deletion receipt 会让 session 显示 **Saved history was deleted by Pi Distill**。Dwell 保留 session name、turn metadata 和 library references，并清除该 history 的缓存内容。恢复原 Pi file 并成功读取后，history 会重新显示；普通文件缺失显示 **Saved history is missing**。
