<a id="library"></a>

# 浏览 Current 内容库

[English](../../../../handbook/implementation/library.md) | 简体中文

[实现文档索引](README.md)

<a id="behavior"></a>

## 行为

桌面端的 **Library** 显示在对话旁的侧栏内，手机端则在侧栏抽屉中。同时配置两项集成时，在 Knowledge 侧栏选择 **Memory** 旁的 **Library**。最新内容和搜索结果可能包含已保存内容和 discovery candidate。已保存内容会显示有界 excerpt，并可打开精确版本阅读；candidate 会展示 discovery metadata、**Article text has not been saved.** 提示、发现时间和来源链接。没有选中会话也可以浏览；只有选中 Dwell 会话后才能添加或移除引用。

附加到会话的引用包含内容库绑定、条目身份和准确版本。Current 可以确认 candidate reference，也可以确认已保存版本。添加引用会为所选会话保存这些身份，Pi 上下文保持不变；它不会获取 candidate text，也不会将内容加入 prompt。Current 仍管理 discovery metadata 和已保存 article body。Current 不可用时，Host 仍可显示并移除已保存的引用；浏览内容、打开准确版本和添加新引用则必须连接到可用的内容库。

<a id="ownership"></a>

## 数据归属

Current 拥有 discovery candidate、采集到的正文、元数据和版本历史。Dwell 通过 Current 本地的版本化内容库接口打开内容库，并提供只读且有长度上限的视图。Dwell Catalog 为会话保存稳定引用，以及绑定到规范化本地根目录的对应关系；Current 继续保留文章正文。Candidate 的 source URL 和 discovery metadata 不表示 article body 已被采集。

绑定是已配置内容库的本地身份。Catalog 会将一个绑定固定关联到最初的规范化根目录，尝试用同一绑定打开另一个存储库时会被拒绝。每个存储库使用独立绑定。没有配置 Current 时 Dwell 会照常运行；配置的 Current 模块无法打开时，会话 Host 仍可使用，但内容库读取不可用。

<a id="execution"></a>

## 执行顺序

1. 进入 Library 视图后，客户端读取 Current 最新内容；如果已选中会话，也同时读取该会话已保存的引用。Search 会用匹配 items 替换当前结果列表；latest 和 search 都可能返回已保存版本或 discovery candidate。
2. 选择已保存版本后，客户端读取该精确版本，并显示标题、来源、采集日期、摘要、正文，以及来源完整度或截断信息。选择 candidate 后则显示其 metadata、发现时间和来源链接。Article body 尚未保存时，Dwell 不会编造正文或采集时间。
3. 添加引用前，Host 要求已打开的 Current 内容库确认准确的绑定、条目和版本。已确认的 candidate 也可以关联，但不会将 article text 加入 Pi context。重复添加同一引用不会产生重复记录。移除操作只删除这一条精确身份对应的引用。
4. 修改引用或切换会话后，Library 会重新读取所选会话已保存的引用。切换会话不会改变正在阅读的文章版本。

<a id="mechanisms"></a>

## 内部机制

最新内容和搜索各最多返回 20 条。已保存内容的 excerpt 最多 2,000 个 Unicode code point；打开指定的已保存版本时最多返回 20,000 个 code point。Candidate 携带来源和发现 metadata，但不含 article text。描述采集时间和来源完整度的字段对 candidate 不存在；display-shortening 标记则单独描述 metadata 是否被缩短。

准确引用包含全部三个身份。打开旧版本时不会自动替换为最新版本。如果 Current 后来删除了该版本，已有引用仍会显示并可移除；打开内容时会说明该版本不可用。列出和移除引用只访问 Dwell Catalog，因此 Current 离线时仍可执行。离线时不能新增引用，因为 Current 必须先确认准确的 item 和 version。

离开 Library 或发起较新的读取请求后，浏览器会忽略迟到的搜索或阅读结果。引用响应还必须对应当前会话。写入操作串行执行，完成后重新读取保存列表。

<a id="technology"></a>

## 技术选择

围绕 Current 公开的本地 API 的小型适配层将内容语义和存储留在 Current 中，同时为 Dwell 提供稳定且有界的视图。它支持 library API version 1 和 2，并要求 module 与打开的 library 声明相同版本。Version 2 可分别返回 discovery candidate 和已保存 article body。绑定将引用固定到指定的本地内容库。Current 保存文章正文，Dwell 保存关联到会话的引用。

这种边界让没有 Current 的 Dwell 仍可运行，并使内容库中断时的引用管理继续可用。读取已保存内容仍依赖配置的 Current store；candidate reference 只能标识发现到的材料，并不表示正文可用。用户选择哪些引用关联到会话；已保存和 candidate references 都与 Pi input 相互独立。

<a id="verification"></a>

## 关键场景与结果

未配置 Current 时，Host 应继续支持普通会话，内容库浏览则应说明当前没有可用内容库。已配置的内容库无法打开时，Host 仍应可用。Latest 和 search 结果都不得超过 20 条，并保留 saved item 与 candidate 的区别。阅读引用应返回指定的 item/version，而非任意最新版本；candidate 应保持 metadata-only，不得编造 article text 或采集时间。

Current 删除某个版本后，会话引用仍应显示且可移除，但正文不可读。Current 离线时列出和移除仍应成功，新增引用要求 Current 确认准确的 item/version。关联已保存内容或 candidate 都不得改变 Pi 上下文、轮次请求内容或对话历史。尝试让同一绑定指向另一个根目录应被拒绝。
