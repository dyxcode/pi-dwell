<a id="memory"></a>
# 搜索与阅读 Memory

[English](../../../../handbook/implementation/memory.md) | 简体中文

[实现手册索引](README.md)

<a id="behavior"></a>

## 行为

为 Dwell 显式配置 Distill 后，browser sidebar 会切换为只读 Memory view，用于搜索和阅读已保存的记录。原有的 conversation list 会由 icon-only session controls 取代；**New** 仍可创建 conversation，conversation composer 和 transcript 继续显示在主视图中。未配置 Distill 时，现有 Conversations sidebar 保持不变。配置了 Current 时，其 Library 仍在独立 dialog 中。

如果已经配置 Distill，但 Memory reader 暂不可用，sidebar 仍显示 Memory，并提供 **Retry**。这样可以保持集成入口一致，同时让 reader 状态清晰可见。

浏览 Memory 不会改变当前 conversation、Pi context 或已保存的 conversation history。

<a id="ownership"></a>

## 数据归属

Distill 拥有 Memory 内容、搜索匹配、分页 cursor、记录 revision 和 revision conflict。Dwell 拥有显式配置的本地连接、authenticated browser access，以及每个 request/response 边界上的验证。Browser 将当前 query、result page 和选中的阅读页面作为 view state 保存。

Memory 内容保留在 Distill。Dwell 不会将它复制到 session catalog、turn ledger 或 Pi history。Current 仍单独拥有收集到的外部内容，以及附加到 conversation 的 exact-version references。

<a id="execution"></a>

## 执行流程

1. Browser 接收 Host 提供的 client capabilities；配置了 Distill 时显示 Memory。
2. Search 会向 Distill 请求一个有界的匹配记录页面。每条结果都标识记录 revision，并附带简短 preview。
3. 选中结果后，Browser 会请求 Distill 读取这个特定 revision。内容较长时，可以继续请求该记录的后续页面。
4. 如果记录在 search result 返回后发生变化，读取会返回 revision conflict。Browser 可以刷新搜索并选中当前 revision。
5. 如果 Memory 无法打开，Memory view 会显示不可用状态并提供 **Retry**。Reader failure 不会停止 Dwell session host 或已配置的 source coordination。Host 重启后，Browser 会重新请求集成 capabilities，让 sidebar 显示新 Host 的 reader 状态。

<a id="mechanisms"></a>

## 机制

Search 按一个最多 128 个 Unicode code points 的 literal substring 匹配，每页最多返回 20 条结果；每次请求最多扫描 128 条已保存 Memory record。因此页面可能没有结果，但仍带有 continuation cursor；只要 cursor 还存在，就可以继续搜索。只有 cursor 消失后，搜索才算完成。每条 preview 最多 500 个 code points；Read 每页最多返回 8,000 个 code points。Distill 负责 matching、cursor 的生成与解释、revision identity 和 conflict detection；Dwell 验证接收到的有界值，并将请求传给 authenticated browser。

读取结果时必须带上 search 返回的 revision。Distill 会在返回每一页前，将它与存储记录的 revision 比较。如果续页前记录发生修改，读取会报告 conflict，Browser 会清除已读取的部分文本，避免拼接不同 revision 的内容。这样读取对应的是用户选中的记录，而不会悄悄替换成结果出现后编辑的新内容。Search cursor 绑定 reader instance 和 query；read cursor 绑定选中的 record revision。重新打开 reader 会让其 cursor 失效，cursor 也不能用于其他 query 或 revision。Opaque continuation cursor 将分页规则留在 Distill，因为底层数据和搜索机制都由 Distill 管理。

Browser 会跟踪 search 和 read generation。开始新 query 会让之前的 search 及其关联 read 失效；选择其他结果或关闭 reader 会让之前的 read 失效。只有仍对应当前 query 和选中记录的 response 才会更新 view。Disconnect 会清空 view 并让未完成的操作失效。Reconnect 后，只有属于当前 authenticated connection 且来自最新 capability check 的 Host response 才会覆盖集成状态。

<a id="technology"></a>

## 技术选择

Dwell 通过本地 versioned Node API 连接到 Distill，并使用显式配置的 Distill store。Distill 将 Memory records 和 revisions 保存在现有 SQLite database 中。Reader 以只读方式打开该 store，因此 Dwell 不会另建 Memory database；revision check 也会读取 Distill 更新的同一份持久记录。Adapter 调用 Distill 的 public API，不直接访问 database。Memory reader 的可用性与 Distill source-access coordination 相互独立：reader 打开失败时 Dwell Host 仍可运行。

Browser 通过 Dwell authenticated HTTP boundary 搜索和阅读。Distill 负责匹配、revision 和 cursor 规则；Dwell 负责 transport 和 validation，client 负责导航与呈现。

<a id="verification"></a>

## 验证场景

未配置 Distill 时，Browser 应保留 Conversations sidebar，并继续支持普通 session。配置 Distill 后，应在 sidebar 显示 Memory search 与阅读入口；已打开的 conversation controls 仍可用 icon 选择，**New** 仍可用，主视图中的 conversation 保持可见。Host 重启后，sidebar 应刷新 Memory 的可用状态。若同时配置 Current，其 Library dialog 也应继续可用。Memory reader 不可用时，Memory 入口仍保留并提供 **Retry**，Host 和 source coordination 继续可用。

Query 应只返回 literal-substring 匹配结果，并遵守 scan、结果数、preview 和页面大小限制。空 response 若带 continuation cursor，应允许继续搜索；没有 cursor 才表示已无更多匹配。Read 应在有界页面中返回所选 revision；search 与 read 之间记录发生变化时，应报告 conflict，而不是返回另一个 revision 的内容。Memory reader 出错时，普通 Dwell session 和 Distill source coordination 仍应可用。搜索和阅读 Memory 不会将内容加入 Pi prompt 或 history。
