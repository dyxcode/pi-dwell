<a id="catalog-implementation"></a>

# Session catalog

[English](../../../../handbook/implementation/catalog.md) | 简体中文

[实现文档索引](README.md) · [Session service](sessions.md) · [Session/storage 概览](../sessions-storage.md)

`SessionCatalog` 在 SQLite 中保存 Dwell 配置的 Pi executable/entry point、session metadata 和 turn outcome。它在写入和读取时验证 records，并将意外 schema 或语义状态报告为 catalog corruption。已保存的对话 entries 位于 Pi 的 JSONL session file。

<a id="catalog-records-and-validation"></a>

## Stored record 与 validation

[`StoredSession` 和 `StoredTurn`](../../../../../src/storage/catalog.ts#L11) 是内部 row。Session row 保存 request identity、canonical project directory、可选 provider/model pair、确认过的 thinking level、Pi session ID/file、history 是否预期存在、lifecycle status、时间戳和 error。Turn 在 public `TurnInfo` 字段外增加 private payload digest，用于 request-key idempotency，原始 message/image 内容不会暴露。

基础 validator 定义允许的值域。[`isSessionStatus` 和 `isTurnStatus`](../../../../../src/storage/catalog.ts#L89) 检查显式 status set。[`invalidCatalog`](../../../../../src/storage/catalog.ts#L97) 统一生成 unsupported/corrupt catalog error，并说明应在 host 停止时修复。[`isNonEmptyString`、`isNullableNonEmptyString` 和 `isSafeIntegerValue`](../../../../../src/storage/catalog.ts#L103) 是 record guard 与 SQLite decoder 共用的 primitive field check。

[`isStoredSession`](../../../../../src/storage/catalog.ts#L115) 要求当前 record 恰好有 14 个 own field。它验证非空 ID/path/digest、model 字段要么同时为 null 要么同时为非空字符串、thinking level 有效、可选 Pi file 非空、history flag 为 boolean、status 在允许集合内、时间戳是安全整数、error 可为空。`ready` 记录还必须有 provider/model。[`hasExactKeys`](../../../../../src/storage/catalog.ts#L172) 严格比较 own key 集合，供 turn guard 复用。[`isStoredTurn`](../../../../../src/storage/catalog.ts#L177) 先抽出 public turn 部分并交给 `isTurnInfo` 验证，再要求 private payload identity 为 64 位小写十六进制 SHA-256。[`assertRuntimeConfiguration`](../../../../../src/storage/catalog.ts#L225) 只接受包含非空 executable 和可选非空 entry point 的对象；未知 key、继承而非 own 的 entry point 均会拒绝。

SQLite decoder 不做宽松类型转换。[`integerFromDatabase`](../../../../../src/storage/catalog.ts#L249) 接受安全范围内的 JavaScript integer 或 SQLite `bigint`；[`stringFromDatabase`](../../../../../src/storage/catalog.ts#L263) 要求非空文本；[`nullableStringFromDatabase`](../../../../../src/storage/catalog.ts#L271) 只允许 SQL `NULL` 或非空文本；[`nullableThinkingLevelFromDatabase`](../../../../../src/storage/catalog.ts#L283) 检查共享 thinking-level vocabulary。[`sessionFromDatabase`](../../../../../src/storage/catalog.ts#L292) 校验 0/1 history flag 与 status 后组装完整 session record。[`entryIdsFromDatabase`](../../../../../src/storage/catalog.ts#L318) 将 JSON text 解码为非空 string ID array。[`nullableErrorFromDatabase`](../../../../../src/storage/catalog.ts#L338) 要求 error code/message 同时为 null，或同时为非空白字符串。[`turnFromDatabase`](../../../../../src/storage/catalog.ts#L353) 组合这些 decoder，校验 cancellation flag/status/digest，再由 `isTurnInfo` 验证组装后的值，并将 private digest 一并返回。

[`validateRecord` 和 `validateTurnRecord`](../../../../../src/storage/catalog.ts#L533) 在每个 insert/update 入口检查内存对象。非法的内存 record 会在 SQL 参数绑定前抛出 `TypeError`；无效的持久化值会作为 catalog corruption 报告。

<a id="catalog-schema-and-migrations"></a>

## Schema 验证与迁移顺序

当前 schema 为 version 4。`runtime_configuration` 是受约束的 singleton，保存 executable 和可选 Node entry point。`sessions` 以 Dwell ID 为主键，create-request ID 唯一，并约束 provider/model 同时为空或非空、合法状态、ready session 必须有确认过的 model metadata，以及可选 thinking level。`turns` 通过 foreign key 引用 `sessions`，保存 request/payload identity、status/cancellation/timestamps/errors 和 JSON entry IDs。一个 partial unique index 保证每个 session 最多有一个 `accepted`、`dispatching` 或 `running` turn。SQL constraints 与 TypeScript validation 共同约束 catalog 接受的 record shape。[`SCHEMA_VERSION`、schema declaration 和 status-transition set](../../../../../src/storage/catalog.ts#L32)

[`databaseRows`](../../../../../src/storage/catalog.ts#L377) 执行 prepared query 并读取 `all()` 结果。[`hasUserSchema`](../../../../../src/storage/catalog.ts#L381) 判断未版本化数据库是否真的为空。[`verifySchema`](../../../../../src/storage/catalog.ts#L390) 按名称读取非 SQLite 内部对象，并要求对象数量、类型/名称和原始 SQL text 与指定版本完全一致。同名但结构被改动的 table/index 也会拒绝。

迁移在一个外层 transaction 中通过 rename/rebuild 保存旧记录。[`migrateV2ToV3`](../../../../../src/storage/catalog.ts#L427) 重建 provider/model 可为空的 session table，同时保留 turn rows 并重建 active-turn index。[`migrateV3ToV4`](../../../../../src/storage/catalog.ts#L443) 新增 nullable `thinking_level`，复制旧 session 字段并写入 `NULL`，保留 turns、重建 index。两者都会更新 `user_version` 并重新验证 schema。[`initializeSchema`](../../../../../src/storage/catalog.ts#L459) 只在迁移 transaction 期间关闭 foreign-key enforcement；处理方式是：空的 version 0 创建 v4；v1 先验证、加入 turn storage 到 v2，再运行 v2→v3→v4；v2 运行 v2→v3→v4；v3 运行 v3→v4；v4 只验证。提交前执行 foreign-key consistency check；失败时 rollback，并在 `finally` 中重新启用 foreign key。其他版本或非空未版本化数据库都会拒绝。

<a id="catalog-file-safety-and-open"></a>

## 文件安全与打开 catalog

[`validateDatabaseFile`](../../../../../src/storage/catalog.ts#L509) 使用不跟随 symlink、不会在特殊文件上阻塞的 flag 打开数据库文件。它要求 regular file、单一 hard link、精确 owner-only `0600` 权限，并要求当前 process UID 已知且与文件 owner 一致。无论成功或失败都会关闭 file handle。

[`SessionCatalog.constructor` 和 `SessionCatalog.open`](../../../../../src/storage/catalog.ts#L544) 是唯一创建入口。`open` 先准备 private parent directory；若文件不存在则创建 owner-only 文件，仅容忍预期的 `EEXIST` race。验证文件后，用 `DatabaseSync` 启用 foreign key、bigint read，且禁用 SQLite extension。Schema 初始化完成后，要求 DELETE journal mode 并设置 `synchronous = FULL`；随后构造 catalog，并读取全部 turns 以便在返回前发现持久化的语义损坏。任一阶段失败都会关闭已打开的数据库并保留原始初始化错误。

<a id="catalog-session-operations"></a>

## 配置与 session row 操作

[`configuration`](../../../../../src/storage/catalog.ts#L586) 在没有 row 时返回 `undefined`；否则解码 executable 和 nullable entry point，生成 public Pi executable configuration。[`configure`](../../../../../src/storage/catalog.ts#L596) 先通过 `assertRuntimeConfiguration` 验证，再 upsert singleton row 1；如果新配置省略 entry point，就会清除旧值。

[`list`](../../../../../src/storage/catalog.ts#L605) 返回全部 session，并按创建时间、再按 ID 排序。[`get`](../../../../../src/storage/catalog.ts#L612) 按 primary key 查询；[`findRequest`](../../../../../src/storage/catalog.ts#L619) 按全局唯一 create-request ID 查询。[`insert`](../../../../../src/storage/catalog.ts#L626) 先验证后插入全部 14 个字段，并将 history boolean 编码为 0/1。[`update`](../../../../../src/storage/catalog.ts#L650) 验证后按 session ID 更新完整 row；如果恰好没有改动一行，则报告 session 不存在。Catalog method 不会掩盖重复 request ID 等 SQLite constraint error。

[`interruptCreating`](../../../../../src/storage/catalog.ts#L677) 校验时间戳后，将所有 `creating` row 设为 `interrupted` 并写入 host restart 说明。Service startup 会在启动 Pi processes 前调用它；该 row 无法判断 Pi child 是否已启动。

<a id="catalog-turn-operations"></a>

## Durable turn ledger 与恢复

[`insertTurn`](../../../../../src/storage/catalog.ts#L687) 验证 stored turn，再写入 immutable identity、初始 status、cancellation flag、可选 error pair 和序列化后的 saved-entry ID list。SQL foreign key 要求 session 已存在；每个 session 的 request 唯一约束和 partial active-turn index 分别强制 deduplication 与 single-active-turn。

[`updateTurn`](../../../../../src/storage/catalog.ts#L706) 先重读当前 turn。`requestId`、payload digest 和 creation time 均不可变。Status 变化必须符合 `ALLOWED_TURN_TRANSITIONS`；terminal status 不得再次变化。然后更新 status、cancellation flag、updated time、error pair 和 entry IDs；目标 row 不存在时抛错。同 status update 仍允许，用来保存 cancellation intent 或刷新 outcome metadata。

[`getTurn`](../../../../../src/storage/catalog.ts#L744) 按 session/run identity 查询；[`findTurnRequest`](../../../../../src/storage/catalog.ts#L751) 按 session 内 request key 查询。[`latestTurn`](../../../../../src/storage/catalog.ts#L758) 按 SQLite `rowid` 排序，所以即使注入的 clock 倒退，也按 turn admission 顺序确定 latest。[`activeTurn`](../../../../../src/storage/catalog.ts#L765) 查询一个 nonterminal status；partial unique index 保证不会返回第二个匹配项。[`listTurns`](../../../../../src/storage/catalog.ts#L774) 按 creation time/rowid 顺序解码并验证每个 row；service startup 也用它确保 Pi 启动前检查到语义损坏。

[`markTurnDispatching`](../../../../../src/storage/catalog.ts#L781) 要求 turn status 为 `dispatching`，session ID 匹配且 `historyExpected: true`。它在 `BEGIN IMMEDIATE` transaction 中先更新 session 再更新 turn；任一失败都会 rollback 两者。这是 prompt 可能交给 Pi 之前的 durable boundary。因此 host restart 后能区分确定未发送的 `accepted` work 和可能已有副作用的 dispatched turn。

[`interruptTurns`](../../../../../src/storage/catalog.ts#L804) 校验 recovery timestamp，并将全部 active turn 设为 terminal `interrupted`；时间使用原值与 recovery time 的较大者。`accepted` turn 记录 `not_dispatched`，说明 prompt 未发送；`dispatching` 或 `running` 记录 `outcome_unknown`，因为 Pi 可能已收到或处理 prompt。恢复逻辑绝不自动 retry。[`close`](../../../../../src/storage/catalog.ts#L814) 仅关闭仍打开的 SQLite handle，重复调用安全。

相关行为见 [catalog tests](../../../../../tests/catalog.test.ts)、[turn/catalog tests](../../../../../tests/turn-catalog.test.ts) 和 [session restart tests](../../../../../tests/sessions.test.ts)。
