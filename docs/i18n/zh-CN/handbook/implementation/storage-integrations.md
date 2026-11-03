<a id="storage-integrations"></a>

# Local storage integrations

[English](../../../../handbook/implementation/storage-integrations.md) | 简体中文

[Implementation index](README.md) · [Session files](history.md) · [Catalog](catalog.md)

Dwell 托管 Pi 并读取 Pi native session files。配置 Distill binding 后，Dwell 的读取与 hosted process 会参与 Distill source cleanup 的 coordination。Binding 使用 Distill public Node API 及配置的 database。

<a id="integration-configuration"></a>

## Configuration 与 API opening

[`readIntegrations`](../../../../../src/integrations/configuration.ts) 读取 Dwell data directory 下的 private `integrations.json`。文件不存在时采用 standalone operation。文件要求 version 1 与已知字段；`absolutePath` 检查不含 NUL 的 local absolute path。现有 private-file 检查负责 owner-only permissions、regular-file ownership 与 configuration size limit。

`startHost` 先打开配置的 storage，再创建 SessionService，并保留 connection 直到 session shutdown 完成。Configuration 格式错误或 Distill import 失败会使 startup 失败；Current availability 由下文单独处理。Shutdown 等待已接受的 requests 与 Pi processes，释放 source access，关闭 storage adapter，最后关闭 listener。

[`openDistill`](../../../../../src/integrations/distill.ts) import 配置的 local module，再以 database path 调用 `openHostStorageV1`。`isDistillStorage` 一次性检查 API version 1 及 read、host-use、recovery、receipt、close methods，然后返回 Distill 的 API instance。Dwell 的 structural types 描述 public contract；database 与 source record 的验证由 Distill 负责。

<a id="source-read-coordination"></a>

## Short reads 与 Pi process lifetime

[`SessionSourceAccess`](../../../../../src/sessions/source-access.ts) 分别管理两种 access。Constructor 只通过 Distill 的 exact-child-exited check 恢复 attached reservation；无法确认 child 状态的 opening 继续保留。

`read` 使用 Pi session ID、实际 file path 与 working directory 获取 short source-read lease，并在整个 history reader 执行期间持有它。`#releaseRead` 在读取成功或失败后释放 lease；release 失败时保留记录，供 shutdown 重试。读取与 release 同时失败时，`AggregateError` 保留两个 error。Distill access gate 正被占用时，`SourceAccessError` 转为 `source_busy`，原 file observation 保持不变。

`begin` 在读取 saved history 或 spawn Pi 之前建立 durable host-use reservation。Fresh session 尚无 file path 时，提供 Pi ID 与 working directory。返回的 `onSpawn` callback 绑定实际 child PID，并由 close promise 在 child 确认关闭后释放 reservation；如果 attach 本身失败，确认 close 后可以放弃该 opening。`abandon` 只释放从未 spawn child 的 reservation。因此，hosted Pi process 持有 durable reservation，同时允许其他 short reads 使用 global gate。

`#release` 在 durable operation 成功或 reservation 已不存在时移除 pending release；若 release 被拒绝且 reservation 仍存在，则保留它供重试。`drain` 在 session reads 与 stop operations 结束后尝试每个 pending read 和 host-use release，再用一个 `AggregateError` 汇总失败。尚未关闭的 child 也计入该报告。Host 意外退出后，Distill 保留无法确认的记录；仅经过一段时间不会释放它们。

`SessionService.#checkHistory` 通过 `read` 执行实际 history read。`#open` 在检查 saved content 前调用 `begin`，把 `onSpawn` 传给 `PiProcess.start`，并在退出时放弃未 spawn 的 opening。Pi startup 在第一次 readiness RPC 前调用 callback；callback 失败时，先停止并等待 child 关闭，再返回 startup error。关闭 idle session 时，即使可选的 history refresh 返回 file 或 access error，仍会停止 Pi；已有 file observation 继续保留。

Verification：[source access](../../../../../tests/session-source-access.test.ts)、[Pi lifecycle](../../../../../tests/distill-sessions.test.ts)、[Host configuration](../../../../../tests/integrations-host.test.ts)、[adapter contract](../../../../../tests/distill-adapter.test.ts) 与 [spawn/close callback](../../../../../tests/runtime-spawn.test.ts)。实际 Distill acceptance 使用配置的 built module 和 synthetic storage。

`SessionSourceAccess.read` 会一直持有 short read lease，直到 awaited Pi-file read 和 completed-receipt lookup 都结束。`matchingDeletion` 只接受 state 为 `complete`、且 Pi session ID、file path 与 source generation 均相同的 receipt；lookup 同时提供 working directory。`missing` 使用相同的精确 receipt query。Source registry row 被回收后，Dwell 可以使用此前成功读取时保存的 generation 来查询 receipt，但不会把这个缓存值传给 `acquireSourceRead`。Gate 忙时返回 `source_busy`，保留先前 observation。[`matchingDeletion`](../../../../../src/sessions/source-access.ts#L22)、[`read`](../../../../../src/sessions/source-access.ts#L65)、[`missing`](../../../../../src/sessions/source-access.ts#L99)、[`#withReadLease`](../../../../../src/sessions/source-access.ts#L208) 与 [`#releaseRead`](../../../../../src/sessions/source-access.ts#L224) 展示 lookup 顺序和释放行为。

<a id="current-library-api"></a>

## Optional pi-current library

[`readIntegrations`](../../../../../src/integrations/configuration.ts) 从 Dwell 私有 `integrations.json` 读取可选的 `current` 配置。它要求 module path 与 data root 都是 absolute path，并要求 binding label 符合 [`isLibraryBinding`](../../../../../src/shared/library.ts)。[`CurrentLibrary.open`](../../../../../src/integrations/current.ts) 会 canonicalize root；root 必须解析到 Obsidian vault 与 repositories 之外。随后从该 local file path import 模块，通过 `openContentLibrary` 打开一次。Dwell 检查 `contentLibraryApiVersion === 1`，再确认返回的 handle 有 `apiVersion === 1` 以及 `search`、`latest`、`read`、`close` methods 后才保留它。

没有 `current` 配置时，library endpoints 返回 `503 library_unavailable`。配置格式正确但 Current module、root 或 API 无法打开时，host 也会继续运行，只是 library 不可用。`integrations.json` 本身无效仍会阻止 startup。Current 成功打开后，`SessionService.create` 会记录 binding 到 canonical root 的对应关系；同一 binding 再映射到另一个 root 时，startup 会以 `library_binding_mismatch` 失败。

[`CurrentLibrary`](../../../../../src/integrations/current.ts) 是 Current API v1 handle 的 read-only projection。

| Callable | 行为 |
| --- | --- |
| `CurrentLibrary.open(config?)` | 未配置时返回 `undefined`；否则 import 并检查 module、canonicalize root、打开 store。Import、root、open 或 API shape 失败会转为 `CurrentLibraryError("library_unavailable")`。 |
| `search(input, signal?)` | 验证 query request，向 Current 查询，并最多返回 20 个 item views；默认 limit 为 20。 |
| `latest(input?, signal?)` | 读取 Current 最新 batch，可按 source 过滤，并最多返回 20 个 views。Current 没有 batch 时，返回 `collectedAt: null` 与空 items。 |
| `read(reference, signal?)` | 要求 binding 与已配置库一致，并读取指定 item/version。Binding 不同返回 `library_binding_mismatch`；版本不存在返回 `library_not_found`。 |
| `close()` | 关闭唯一的 Current handle；关闭失败报告为 `library_unavailable`。 |
| `CurrentLibraryError(code)` | 携带 shared library error code 及对应的用户可读 message。 |

`binding` 与 canonical `root` properties 标识当前打开的 store。Search/latest excerpts 最多 2,000 个 Unicode code points；exact reads 最多 20,000。Projection 还将 title 限制为 500、author 为 250、summary 为 1,000 个 code points。它保留 Current 的 `sourceCompleteness` 与 source `truncated` flag；当 Current 报告 display shortening，或 Dwell 缩短任一 projected field 时，`displayTruncated` 为 true。Source URL、retrieval time、source ID 与 exact `{binding,itemId,versionId}` 会保留。Dwell catalog 只保存 reference；Item text 与原始 metadata 由 Current 保留。

Private constructor 保留 binding、canonical root 与打开的 handle。私有函数 `record`、`isLibraryModule` 与 `isContentLibrary` 在 open 时检查 module/handle shape。`unavailable` 创建标准 `CurrentLibraryError`；`clip` 逐 code point 迭代，并在达到显示上限时停止。`#project` 创建有界 DTO；`#call` 检查并向 Current 传递可选 `AbortSignal`，signal 已 aborted 时保留 operation error，其他 Current 错误转为 `library_unavailable`。当前 HTTP host 没有向 adapter 传入 signal，因此浏览器断开后 library request 会继续。Host shutdown 会等待 active requests 完成，再关闭 Current。

<a id="library-reference-storage"></a>

## 持久化 binding 与 session reference

Catalog schema 7 新增 `library_bindings(binding, root)` 与 `session_library_references(session_id, binding, item_id, version_id)`。v6-to-v7 migration 保留现有 session 与 turn rows。一个 binding 在本 catalog 中始终关联首次记录的 canonical root，删除 session references 后仍保持该关系。Session 删除时，foreign key cascade 会删除该 session 的 references。详见 [`SessionCatalog`](../../../../../src/storage/catalog.ts)。

| Catalog callable | 行为 |
| --- | --- |
| `bindLibrary(binding, root)` | 新 binding 时写入 canonical mapping；已有 mapping 指向相同 root 时返回 true；相同 binding 指向其他 root 时返回 false。 |
| `listLibraryReferences(sessionId)` | 按 binding、item ID、version ID 排序返回 references。 |
| `addLibraryReference(sessionId, reference)` | 写入 exact reference；重复添加是幂等 no-op。 |
| `removeLibraryReference(sessionId, reference)` | 只删除 exact reference；不存在时是 no-op。 |

`initializeSchema` 以 transaction 应用 v6-to-v7 migration；`migrateV6ToV7` 创建两张表。Catalog open 时，`#validateLibraryRows` 使用 `isCanonicalLibraryRoot`、`libraryBindingFromDatabase` 与 `libraryReferenceFromDatabase` 检查已存的 binding、canonical root 与 reference。SQLite foreign-key check 检查 references 的 parent rows。持久化数据无效会阻止 catalog 打开。

[`SessionService.create`](../../../../../src/sessions/service.ts) 在提供服务前绑定已打开的 Current root。`listLibraryReferences` 从 catalog 读取，即使 Current offline 也可用。`addLibraryReference` 与其他 session mutations 串行执行，验证 exact identity，要求 binding 与已配置库一致，并先成功读取该 Current exact version，之后才插入 reference。因此，过期或已删除的 item 不能新附加。`removeLibraryReference` 删除 exact identity，即使没有打开 Current 也可用。Catalog mutations 只影响 reference rows；session metadata、turn rows、Pi context 与 conversation history 保持不变。

<a id="library-http-browser"></a>

## Authenticated HTTP 与 browser flow

`startHost` 内的 `handle` request function 在通过 Dwell 现有 local authentication 与 request checks 后 dispatch library routes。Search/latest 返回 projected item views；exact reads 指定一个 saved version。Reference routes 只保存稳定 identity：

| Method 与 path | 行为 |
| --- | --- |
| `POST /api/v1/library/search` | JSON body 提供 `query`，可选 `source`、`limit`。 |
| `GET /api/v1/library/latest` | 可选 `source`、`limit` query parameters。`parseLibraryLatestQuery` 拒绝未知或重复参数；shared guards 验证参数值。 |
| `GET /api/v1/library/{binding}/items/{itemId}/versions/{versionId}` | 读取指定的 exact version。 |
| `GET /api/v1/sessions/{sessionId}/library-references` | 列出该 session 已保存的 references。 |
| `POST /api/v1/sessions/{sessionId}/library-references` | 添加 JSON `{binding,itemId,versionId}`；Current 必须确认该 version 存在。 |
| `DELETE /api/v1/sessions/{sessionId}/library-references/{binding}/items/{itemId}/versions/{versionId}` | 删除指定的 exact reference。 |

Library errors 分别映射到 HTTP 400 (`invalid_input`)、404 (`library_not_found`)、409 (`library_binding_mismatch`) 或 503 (`library_unavailable`)。未认证调用返回现有 protected-route 的 401 response。Current 不可用时，search、latest、exact read 与添加 reference 返回 503；已保存 references 仍可从 catalog 列出或删除。Search JSON request 使用 Dwell 现有的 8 KiB body limit。

[`HOST_PAGE`](../../../../../src/clients/web/page.ts) 提供一个 native dialog，并在 desktop 与 mobile 位置提供打开按钮。Dialog 显示 latest items、query results、exact-version reader，以及当前 selected session 的 references。Source link 使用 validated item view 中的 HTTP(S) URL；title、summary 与正文作为 text 渲染。没有 selected session 时可 browse；attach/remove 需要先选择 session。Attach 只保存 identity；Pi prompt、turn 与 context 保持不变。

在 [`client.ts`](../../../../../src/clients/web/client.ts) 中，`openLibrary` 打开 dialog 并读取 references/latest；`searchLibrary`、`loadLatestLibraryItems` 与 `readLibraryItem` 分别读取对应视图。`loadLibraryReferences` 重新读取 selected session 的 saved identities。`renderLibraryItems`、`renderLibraryReader` 与 `renderLibraryReferences` 更新三个视图；`sameLibraryReference` 比较 identity 的三个字段；`libraryFailure` 显示 request error。`changeLibraryReference` 将 dialog 内的 attach/remove mutations 串行化，执行时禁用相关按钮，settle 后重新读取权威 references。展示状态以重新读取的 catalog response 为准，避免较旧 mutation response 覆盖较新的保存状态。

每个 read request 都绑定启动时的 dialog generation、selected session 与 read generation。Dialog 关闭/重开、session selection 改变或有更新的 library read 启动后，旧结果都会被忽略。Generation checks 用于 stale-result suppression。Dialog 或 session 变化不会取消已发出的 request；shared transport 对 GET 使用 15 秒 timeout，对 mutation 使用 60 秒 timeout。Logout 会关闭 dialog 并使 pending generations 失效。Source version 删除后，已经持久化的 reference 可以继续存在；读取该 reference 会返回 404，但仍可删除。

`startHost` 在创建 `SessionService` 前打开唯一的 Current instance。Shutdown 停止接收新工作，等待 active HTTP operations，关闭 sessions 与 auth，再关闭 Current，最后关闭 listener。即使 `CurrentLibrary.close` reject，listener 仍会关闭，而 close promise 会报告错误。Startup 后续设置失败时也会关闭已打开的 listener。

<a id="library-contract-guards"></a>

## Shared library contract 与 guards

[`shared/library.ts`](../../../../../src/shared/library.ts) 定义 adapter、server 与 browser 共用的 DTO。`LibraryReference` 精确包含 `{binding,itemId,versionId}`；item view 提供 source ID、title、URL、可选 author/summary、有界 text、retrieval time、completeness 与 truncation flags。Search/latest responses 携带 binding，最多 20 个 views；Latest 额外携带 collection timestamp 或 `null`。

导出的 limits 为 `LIBRARY_SEARCH_LIMIT = 20`、`LIBRARY_EXCERPT_CHARACTERS = 2,000` 与 `LIBRARY_READ_CHARACTERS = 20,000`。`isLibraryBinding` 接受 1–64 个 ASCII letters、digits、dots、underscores 或 hyphens，首字符必须是 letter 或 digit。`isLibraryErrorCode` 检查四种稳定 error codes。`isLibrarySearchRequest` 要求非空白、最多 200 个 code points 的 query；`isLibraryLatestRequest` 检查可选 source 与 limit。Source 是最多 64 个字符的小写 slug；limit 是 1 到 20 的整数。

`isLibraryReference` 要求 exact 三字段 shape，以及 UUID 格式的 item/version IDs。`isLibraryReferencesResponse` 验证每个持久化 identity 与 response envelope；reference collection 没有数量上限。`isLibraryItemView` 检查字段大小、timestamp、completeness flags 与 HTTP(S) URL（不得带内嵌 credentials）；单个 item 的 JSON encoding 最多 256 KiB。`isLibraryItemsResponse` 与 `isLibraryLatestResponse` 要求最多 20 个 views，整个 response JSON 最多 2 MiB。私有 helpers `record`、`exact`、`keysWithOptional`、`text`、`source` 与 `validLimit` 实现这些共用检查。`libraryItemPath` 先验证 reference，再 percent-encode identity 形成 exact-version route。

Acceptance coverage 位于 [Current adapter](../../../../../tests/current-library.test.ts)、[persistent references](../../../../../tests/library-references.test.ts)、[HTTP 与 Host lifecycle](../../../../../tests/library-http.test.ts) 和 [browser contract](../../../../../tests/library-web.test.ts)。依赖 Current 的测试使用已构建 API v1 entry 与 synthetic store data。
