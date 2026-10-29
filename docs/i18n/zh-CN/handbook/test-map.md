<a id="test-and-fixture-atlas"></a>

# 测试与 fixture 索引

[English](../../../handbook/test-map.md) | 简体中文

[文档目录](README.md) · [开发](development.md)

本索引覆盖 `tests/` 下的全部文件。下面的 scenario name 来自 `test`、`it` 和 `describe` 调用中的 literal；computed name 和 anonymous helper 可在链接指向的文件中查看。测试名称保留源码中的 English 原文，便于搜索与匹配运行结果；每个文件前的中文说明概括其验证边界。通过各链接可以查看 scenario 的 assertions、fixtures 和 test environment。

## tests/access.test.ts

验证 HTTPS origin 的独立 pairing、Host/Origin 信任边界、配置失败，以及 browser binding 与 SSE revocation。

[查看源码](../../../../tests/access.test.ts)

- [a configured HTTPS origin pairs independently and preserves auth through restart, logout and revoke](../../../../tests/access.test.ts#L121)
- [host/origin trust is explicit, forwarding headers cannot enable it, and development stays local](../../../../tests/access.test.ts#L259)
- [invalid or unsafe access configuration fails startup without rewriting it or holding the port](../../../../tests/access.test.ts#L304)
- [configured HTTPS-origin SSE requires browser binding and closes immediately on local revoke](../../../../tests/access.test.ts#L357)

## tests/auth.test.ts

验证 pairing code、private state、credential 校验、browser session persistence、logout/revoke，以及损坏或不安全文件的拒绝行为。

[查看源码](../../../../tests/auth.test.ts)

- [short pairing codes regenerate pending collisions and preserve exact case](../../../../tests/auth.test.ts#L21)
- [initialization is private, persistent, and status requires a credential](../../../../tests/auth.test.ts#L53)
- [pair once, survive restart, forget and revoke browser sessions](../../../../tests/auth.test.ts#L75)
- [unsafe credentials are rejected without resetting them](../../../../tests/auth.test.ts#L218)
- [pairing storage failure never issues a browser cookie or resets durable state](../../../../tests/auth.test.ts#L231)
- [data initialization rejects repository and vault destinations, including aliases](../../../../tests/auth.test.ts#L260)
- [corrupt and unsupported browser-session records fail startup without overwriting files](../../../../tests/auth.test.ts#L279)

## tests/catalog.test.ts

验证 SQLite catalog 的 schema、migration、权限、数据完整性与启动恢复；错误状态不会被静默重置。

[查看源码](../../../../tests/catalog.test.ts)

- [catalog configuration and private SQLite storage survive reopening](../../../../tests/catalog.test.ts#L72)
- [version-one catalogs migrate transactionally while preserving sessions and configuration](../../../../tests/catalog.test.ts#L107)
- [version-two migration preserves sessions, turns, indexes, and foreign keys](../../../../tests/catalog.test.ts#L157)
- [version-three migration preserves sessions and turns while adding thinking level](../../../../tests/catalog.test.ts#L220)
- [version-two migration rolls back if preserved turns violate the session foreign key](../../../../tests/catalog.test.ts#L274)
- [version-one schema rejection leaves the original catalog version and tables intact](../../../../tests/catalog.test.ts#L304)
- [catalog enforces request uniqueness and reopens deterministic list and updates](../../../../tests/catalog.test.ts#L335)
- [startup marks only creating sessions interrupted and persists the recovery](../../../../tests/catalog.test.ts#L377)
- [corrupt, unversioned, and future catalog files fail closed without resetting bytes](../../../../tests/catalog.test.ts#L409)
- [catalog refuses database symlinks, hard links, and unsafe permissions](../../../../tests/catalog.test.ts#L445)

## tests/cli.test.ts

验证 CLI grammar、错误输出、foreground host 与本地管理命令的边界。

[查看源码](../../../../tests/cli.test.ts)

- [help is read-only and development data is separate](../../../../tests/cli.test.ts#L23)
- [removed session commands fail before accessing host state, including help aliases](../../../../tests/cli.test.ts#L34)
- [CLI status, pair and revoke use authenticated HTTP and do not print the long-lived credential](../../../../tests/cli.test.ts#L61)
- [CLI reports missing credentials and unreachable hosts without writing state](../../../../tests/cli.test.ts#L78)
- [public CLI rejects multi-instance options and malformed commands](../../../../tests/cli.test.ts#L102)

## tests/conversation.test.ts

验证 conversation projection/rendering，包括 assistant/tool 分组、thinking、Markdown、context 与内容合并。

[查看源码](../../../../tests/conversation.test.ts)

- [command presentation previews the first meaningful line and counts physical lines](../../../../tests/conversation.test.ts#L12)
- [thinking uses a short existing heading without repeating it in the body](../../../../tests/conversation.test.ts#L40)
- [live and saved thinking share the native message and content-index disclosure key](../../../../tests/conversation.test.ts#L62)
- [assistant text and tool results stay in one group until the next user message](../../../../tests/conversation.test.ts#L91)
- [tool results pair by call id across intervening messages and leave orphans visible](../../../../tests/conversation.test.ts#L116)
- [context and diagnostic blocks do not split a response before the next user](../../../../tests/conversation.test.ts#L148)

## tests/events-http.test.ts

通过真实 loopback connection 验证 SSE authentication、event 顺序、cursor、revocation 与 slow-reader backpressure。

[查看源码](../../../../tests/events-http.test.ts)

- [events routes authenticate and report an unknown session before starting SSE](../../../../tests/events-http.test.ts#L421)
- [SSE snapshots and events are ordered for two clients; disconnect detaches observation only](../../../../tests/events-http.test.ts#L437)
- [browser SSE streams close on revoke, logout, expiry, and auth storage failure](../../../../tests/events-http.test.ts#L534)
- [Last-Event-ID is unique, session-scoped, and validated before stream headers](../../../../tests/events-http.test.ts#L604)
- [a slow SSE reader overflows only its real loopback connection](../../../../tests/events-http.test.ts#L654)

## tests/events.test.ts

验证 event hub 的 snapshot/replay/resync、message identity、projection budget、observer 隔离与 native execution tracking。

[查看源码](../../../../tests/events.test.ts)

- [connect returns a bounded snapshot and replays only missing ordered events](../../../../tests/events.test.ts#L112)
- [snapshot and subscriber registration share one synchronous sequence boundary](../../../../tests/events.test.ts#L166)
- [invalid and foreign cursors are rejected while stale, ahead, and old-epoch cursors resync](../../../../tests/events.test.ts#L193)
- [a metadata read catches a newer durable view up for existing subscribers](../../../../tests/events.test.ts#L233)
- [a newly accepted run clears the previous run live projection before dispatch](../../../../tests/events.test.ts#L259)
- [first snapshots flag bounded session metadata even without a prior limit event](../../../../tests/events.test.ts#L285)
- [replay batches that exceed the HTTP queue resync from a bounded snapshot](../../../../tests/events.test.ts#L299)
- [Pi messages and tools become capped Dwell projections without raw record leakage](../../../../tests/events.test.ts#L343)
- [live assistant content preserves indexed visible thinking and deduplicates seeded prefixes](../../../../tests/events.test.ts#L470)
- [authoritative cumulative partials preserve a repeated legitimate prefix delta](../../../../tests/events.test.ts#L619)
- [sequential assistant messages get distinct live identities and clear the prior native key](../../../../tests/events.test.ts#L679)
- [live content exceeding the supported block count is explicitly truncated](../../../../tests/events.test.ts#L725)
- [bounded live thinking keeps the SSE event and snapshot limits](../../../../tests/events.test.ts#L752)
- [observer failures remove only the failing subscriber and never escape the observer](../../../../tests/events.test.ts#L785)
- [rejected asynchronous listeners are removed without affecting healthy observers](../../../../tests/events.test.ts#L819)
- [truncation and replay retention stay within explicit serialized byte limits](../../../../tests/events.test.ts#L848)
- [subscriber and hub limits enforce bounded ownership and evict only idle streams](../../../../tests/events.test.ts#L930)
- [stream.error is delivered as a bounded projection and close clears subscriptions](../../../../tests/events.test.ts#L965)
- [native message identities distinguish identical occurrences and retain tool references](../../../../tests/events.test.ts#L985)
- [native execution starts from active Dwell message counts instead of a stale file baseline](../../../../tests/events.test.ts#L1026)

## tests/fixtures/cli.ts

为 CLI subprocess 测试提供可控制的启动入口与隔离配置。

[查看源码](../../../../tests/fixtures/cli.ts)

这是 fixture/helper module；其导出的 setup 或 subprocess 行为见源码。

## tests/fixtures/https-proxy.ts

为 HTTP/HTTPS browser 与 access 测试提供本地 HTTPS proxy fixture。

[查看源码](../../../../tests/fixtures/https-proxy.ts)

这是 fixture/helper module；其导出的 setup 或 subprocess 行为见源码。

## tests/fixtures/pi-environment.ts

建立隔离的 Pi 测试环境、配置和 synthetic provider，供 offline test 使用。

[查看源码](../../../../tests/fixtures/pi-environment.ts)

这是 fixture/helper module；其导出的 setup 或 subprocess 行为见源码。

## tests/fixtures/pi-event-race.ts

构造 Pi event 与 prompt acknowledgment 的时序竞争，验证早到 event 的归属。

[查看源码](../../../../tests/fixtures/pi-event-race.ts)

这是 fixture/helper module；其导出的 setup 或 subprocess 行为见源码。

## tests/fixtures/pi-extension.ts

提供测试专用 Pi extension 行为，用于 tool、stream、dialog 与 execution 测试。

[查看源码](../../../../tests/fixtures/pi-extension.ts)

这是 fixture/helper module；其导出的 setup 或 subprocess 行为见源码。

## tests/fixtures/pi-fault.ts

模拟异常 Pi subprocess/RPC 行为，用于 timeout、malformed record 和 process failure 测试。

[查看源码](../../../../tests/fixtures/pi-fault.ts)

这是 fixture/helper module；其导出的 setup 或 subprocess 行为见源码。

## tests/fixtures/pi-handled-extension.ts

提供 extension-handled input 与 native follow-up fixture，区分 handled prompt 和普通 model execution。

[查看源码](../../../../tests/fixtures/pi-handled-extension.ts)

这是 fixture/helper module；其导出的 setup 或 subprocess 行为见源码。

## tests/fixtures/pi-native-state.ts

提供可控制的 native Pi state fixture，用于 model、thinking 和 session 状态验证。

[查看源码](../../../../tests/fixtures/pi-native-state.ts)

这是 fixture/helper module；其导出的 setup 或 subprocess 行为见源码。

## tests/fixtures/pi-owner.ts

为 Pi process owner 消失、stdin EOF 和子进程退出场景提供 subprocess fixture。

[查看源码](../../../../tests/fixtures/pi-owner.ts)

这是 fixture/helper module；其导出的 setup 或 subprocess 行为见源码。

## tests/fixtures/turn-owner.ts

为 durable turn 的 owner lifecycle 与恢复场景提供 subprocess fixture。

[查看源码](../../../../tests/fixtures/turn-owner.ts)

这是 fixture/helper module；其导出的 setup 或 subprocess 行为见源码。

## tests/history-cancellation.test.ts

验证 history scan 排队、queued cancellation、runtime startup cancellation 和 shutdown drain。

[查看源码](../../../../tests/history-cancellation.test.ts)

- [aborting an admitted history scan lets it finish and releases its permit](../../../../tests/history-cancellation.test.ts#L113)
- [a shutdown-cancelled public read uses a free permit but never joins the wait queue](../../../../tests/history-cancellation.test.ts#L137)
- [aborting a turn cancels its queued baseline scan without replaying the request](../../../../tests/history-cancellation.test.ts#L168)
- [aborting a turn cancels queued history identity capture while opening a closed session](../../../../tests/history-cancellation.test.ts#L223)
- [shutdown cancels queued public history reads without waiting for unrelated active scans](../../../../tests/history-cancellation.test.ts#L280)

## tests/history-context.test.ts

验证从 saved history 提取 context source、覆盖与清空语义、truncation 和大小限制。

[查看源码](../../../../tests/history-context.test.ts)

- [history reports only project instructions persisted in Pi system context](../../../../tests/history-context.test.ts#L54)
- [context follows system section replacement, removal, and compaction snapshots](../../../../tests/history-context.test.ts#L88)
- [routine saved metadata stays out of chat and unknown entries remain diagnostics](../../../../tests/history-context.test.ts#L142)
- [saved unsupported message roles become diagnostics rather than chat messages](../../../../tests/history-context.test.ts#L161)
- [Pi-native bash and custom messages keep their native display roles](../../../../tests/history-context.test.ts#L171)
- [saved tool errors retain an explicit error marker for expandable output](../../../../tests/history-context.test.ts#L224)
- [saved images are referenced by bounded history and loaded only from the active branch](../../../../tests/history-context.test.ts#L242)
- [context previews stay within the browser history envelope](../../../../tests/history-context.test.ts#L316)
- [context marks instruction sources omitted beyond the source count limit](../../../../tests/history-context.test.ts#L334)
- [context marks sources shortened by the combined preview byte budget](../../../../tests/history-context.test.ts#L362)
- [escaped context and conversation entries share the browser page budget](../../../../tests/history-context.test.ts#L391)

## tests/history-http.test.ts

验证 history HTTP route 的 authentication、pagination、输入边界与错误行为。

[查看源码](../../../../tests/history-http.test.ts)

- [history reads an empty closed session without reopening Pi](../../../../tests/history-http.test.ts#L193)
- [history route retains authentication, query, method, body, and exact-path guards](../../../../tests/history-http.test.ts#L220)
- [history reads support paired browsers, completed pages, and active-turn metadata without Pi reads](../../../../tests/history-http.test.ts#L307)
- [history rejects malformed signed cursors through the session error envelope](../../../../tests/history-http.test.ts#L385)

## tests/history-service.test.ts

验证 saved history/result 在重启和 sequential Pi handoff 后的连续性，以及缺失、损坏或尚未保存的 source。

[查看源码](../../../../tests/history-service.test.ts)

- [history and native results survive restart without launching Pi](../../../../tests/history-service.test.ts#L70)
- [standalone Pi continues the same native file and Dwell reads external messages without inventing turns](../../../../tests/history-service.test.ts#L90)
- [history plus buffered SSE converges on saved entries across a completion race](../../../../tests/history-service.test.ts#L144)
- [deleted history remains unavailable even with a live runtime and corruption never overwrites source](../../../../tests/history-service.test.ts#L178)
- [deep native result content reports a response limit while projected history stays readable](../../../../tests/history-service.test.ts#L193)
- [a first admitted turn has pending history before dispatch and read admission drains at shutdown](../../../../tests/history-service.test.ts#L211)
- [active saved tool records take over live output across a multi-step reconnect](../../../../tests/history-service.test.ts#L258)

## tests/history.test.ts

验证 native branch projection、signed cursor、page/entry budget、tool/image block 与 unsupported content 的展示。

[查看源码](../../../../tests/history.test.ts)

- [history pages retain their saved revision across appends and paginate without repeats](../../../../tests/history.test.ts#L37)
- [saved branch projection preserves old text, hides private state and explains context edits](../../../../tests/history.test.ts#L66)
- [tool references survive projection while images and oversized text remain bounded](../../../../tests/history.test.ts#L144)
- [history page validation rejects untrusted or inconsistent protocol values](../../../../tests/history.test.ts#L188)
- [oversized tool metadata is explicitly marked as truncated](../../../../tests/history.test.ts#L217)
- [deep saved tool input gets a bounded placeholder instead of failing history](../../../../tests/history.test.ts#L227)

## tests/host.test.ts

验证 loopback host、status protocol、启动/shutdown、请求限制和错误响应。

[查看源码](../../../../tests/host.test.ts)

- [loopback host serves public health/assets and authenticated status](../../../../tests/host.test.ts#L16)
- [closing is repeatable and releases the listening port](../../../../tests/host.test.ts#L48)
- [a losing server cannot initialize state, even with a different data root](../../../../tests/host.test.ts#L58)
- [status client rejects incompatible HTTP services](../../../../tests/host.test.ts#L69)
- [Host, Origin, CSRF, media type, body sizes and rate limits are enforced](../../../../tests/host.test.ts#L87)

## tests/images-http.test.ts

验证 authenticated image submission/read 路径、image reference 与 HTTP payload 边界。

[查看源码](../../../../tests/images-http.test.ts)

- [authenticated image turns save images natively and retrieve them by scoped history reference](../../../../tests/images-http.test.ts#L274)
- [the 8 MiB request body limit is scoped to turn creation](../../../../tests/images-http.test.ts#L338)

## tests/images.test.ts

验证 image payload 的 MIME、base64、header、数量与大小限制，以及 image turn 的行为。

[查看源码](../../../../tests/images.test.ts)

- [turn image content validates supported types, signatures and size limits](../../../../tests/images.test.ts#L100)
- [base64 validation handles the exact 5 MiB image boundary without stack overflow](../../../../tests/images.test.ts#L120)
- [image lists are bounded by count and total decoded bytes](../../../../tests/images.test.ts#L133)
- [turn requests accept image-only and text with separately ordered image attachments](../../../../tests/images.test.ts#L146)
- [Pi RPC receives native image attachments and image-only turns](../../../../tests/images.test.ts#L168)
- [native Pi RPC and history preserve a valid image record larger than 1 MiB](../../../../tests/images.test.ts#L210)
- [sessions remain usable after saved image history exceeds Pi's RPC record limit](../../../../tests/images.test.ts#L239)
- [image turns fail before dispatch when the selected model is text-only](../../../../tests/images.test.ts#L266)

## tests/native-executions.test.ts

验证 native execution 与 durable turn 的独立 identity、startup/follow-up execution、abort 和 saved-history coverage。

[查看源码](../../../../tests/native-executions.test.ts)

- [a native extension execution during session startup is observed without rejecting Pi](../../../../tests/native-executions.test.ts#L110)
- [extension-handled requests retain asynchronous native follow-ups and permit later turns](../../../../tests/native-executions.test.ts#L130)
- [startup native execution preserves Pi thinking when the saved Dwell setting differs](../../../../tests/native-executions.test.ts#L214)
- [native extension model and thinking changes refresh the session catalog after settlement](../../../../tests/native-executions.test.ts#L281)
- [host restart reconciles stale session model metadata from the saved Pi transcript](../../../../tests/native-executions.test.ts#L357)
- [native extension runs stay outside the turn ledger and reconcile live events with saved history](../../../../tests/native-executions.test.ts#L438)
- [native execution abort requires its current execution ID and preserves RPC until settlement](../../../../tests/native-executions.test.ts#L534)

## tests/pi-history-budget.test.ts

验证 process-wide history scan budget、FIFO 排队、overflow 与 queued cancellation。

[查看源码](../../../../tests/pi-history-budget.test.ts)

- [history scan budget caps concurrency, queues fairly, and releases permits after errors](../../../../tests/pi-history-budget.test.ts#L67)
- [readSavedHistory permits only two active scans and cancels a queued prefix read](../../../../tests/pi-history-budget.test.ts#L115)
- [readSavedHistory bounds its global wait queue and maps overload to history_busy](../../../../tests/pi-history-budget.test.ts#L133)

## tests/pi-history.test.ts

验证 native JSONL file 的 identity、header、record、byte prefix、incomplete tail 与读取限制。

[查看源码](../../../../tests/pi-history.test.ts)

- [reads complete native entries as raw Pi data and keeps the persisted branch leaf](../../../../tests/pi-history.test.ts#L83)
- [returns an immutable pinned prefix across appends](../../../../tests/pi-history.test.ts#L120)
- [ignores an unterminated final record but rejects malformed complete records](../../../../tests/pi-history.test.ts#L148)
- [rejects absent, mismatched, duplicate, or structurally invalid history](../../../../tests/pi-history.test.ts#L165)
- [detects changed, truncated, and replaced sources for a pinned prefix](../../../../tests/pi-history.test.ts#L196)
- [caps file, record, and entry counts without reading an oversized sparse tail](../../../../tests/pi-history.test.ts#L232)
- [allows Pi's ordinary 0644 JSONL mode in a private session directory](../../../../tests/pi-history.test.ts#L261)
- [rejects symlinks and multiply-linked history files](../../../../tests/pi-history.test.ts#L272)
- [returns history unavailable for a missing saved file](../../../../tests/pi-history.test.ts#L286)

## tests/pi-models.test.ts

验证 Pi model registry projection、thinking level/image capability，以及返回字段的边界。

[查看源码](../../../../tests/pi-models.test.ts)

- [session model projection agrees with installed Pi levels and excludes provider secrets](../../../../tests/pi-models.test.ts#L22)
- [session registry rejects malformed, duplicate and excessive model metadata](../../../../tests/pi-models.test.ts#L44)

## tests/runtime-cli.test.ts

验证 runtime configuration CLI 的 argument grammar、authenticated HTTP、response validation 与错误报告。

[查看源码](../../../../tests/runtime-cli.test.ts)

- [CLI parser validates runtime configuration and preserves foreground defaults](../../../../tests/runtime-cli.test.ts#L89)
- [runtime configuration CLI uses authenticated HTTP and validates the response](../../../../tests/runtime-cli.test.ts#L116)
- [runtime configuration CLI reports server errors and rejects malformed responses](../../../../tests/runtime-cli.test.ts#L146)

## tests/runtime-failure.test.ts

验证 RPC correlation、早到 settlement、timeout、malformed data、bounded diagnostics 与 shutdown escalation。

[查看源码](../../../../tests/runtime-failure.test.ts)

- [readiness waits for a response and JSONL preserves fragmented Unicode and response identity](../../../../tests/runtime-failure.test.ts#L35)
- [an unmatched settlement observation does not fail the Pi RPC connection](../../../../tests/runtime-failure.test.ts#L45)
- [a known Pi command rejection is typed and leaves the runtime ready](../../../../tests/runtime-failure.test.ts#L52)
- [startRun keeps events that settle before Pi acknowledges prompt acceptance](../../../../tests/runtime-failure.test.ts#L69)
- [malformed get_entries data fails the runtime](../../../../tests/runtime-failure.test.ts#L84)
- [startRun reports transport timeout as uncertain, not a command rejection](../../../../tests/runtime-failure.test.ts#L102)
- [shutdown escalates for an unresponsive Pi and observes its actual exit](../../../../tests/runtime-failure.test.ts#L116)
- [private stderr diagnostics are bounded and excluded from ordinary errors](../../../../tests/runtime-failure.test.ts#L124)
- [missing executable and directory errors do not launch a runtime](../../../../tests/runtime-failure.test.ts#L135)
- [a recovered provider attempt is completed only after final settlement](../../../../tests/runtime-failure.test.ts#L144)
- [oversized prompts reject before dispatch and leave the session usable](../../../../tests/runtime-failure.test.ts#L150)
- [pending RPC requests are bounded without disrupting admitted queries](../../../../tests/runtime-failure.test.ts#L158)

## tests/runtime.test.ts

使用真实 pinned Pi 验证 native resource/context loading、model/thinking、turn/history/reopen、extension/dialog、abort 与 process ownership。

[查看源码](../../../../tests/runtime.test.ts)

- [native Pi resource loading discovers trusted global and project resources and refreshes on reopen](../../../../tests/runtime.test.ts#L127)
- [native Pi project trust excludes project resources when the global default is never](../../../../tests/runtime.test.ts#L240)
- [native context loading includes global and ancestors across a Git root once, in order](../../../../tests/runtime.test.ts#L280)
- [native context loading deduplicates the agent directory when it is also an ancestor](../../../../tests/runtime.test.ts#L335)
- [sessions without context files retain Pi's default prompt and complete turns](../../../../tests/runtime.test.ts#L352)
- [native context remains additive to global SYSTEM and APPEND_SYSTEM customization](../../../../tests/runtime.test.ts#L361)
- [native defaults and model changes work without changing global Pi settings](../../../../tests/runtime.test.ts#L379)
- [Pi thinking capabilities are model-specific, clamped, and restored from the session transcript](../../../../tests/runtime.test.ts#L397)
- [reopening a saved Pi transcript keeps its native model and thinking despite stale launch selections](../../../../tests/runtime.test.ts#L423)
- [real Pi performs a tool turn, saves history, and reopens the same session](../../../../tests/runtime.test.ts#L440)
- [startRun exposes prompt acceptance separately from settled outcome](../../../../tests/runtime.test.ts#L481)
- [extension-handled no-op and custom input stay truthful without a model turn](../../../../tests/runtime.test.ts#L503)
- [a handled input that starts native work before acknowledgement transfers run ownership](../../../../tests/runtime.test.ts#L527)
- [a native follow-up before prompt acknowledgement keeps native run ownership](../../../../tests/runtime.test.ts#L549)
- [an extension can start a new idle execution without losing Pi runtime health](../../../../tests/runtime.test.ts#L586)
- [a native extension execution reports normal completion](../../../../tests/runtime.test.ts#L614)
- [a native extension provider failure is observed without failing RPC transport](../../../../tests/runtime.test.ts#L631)
- [stopping Pi reports a native execution as interrupted](../../../../tests/runtime.test.ts#L655)
- [real Pi observers detach without stopping work, busy runs reject, and abort settles](../../../../tests/runtime.test.ts#L673)
- [runtime state subscribers receive initial state and child lifecycle transitions](../../../../tests/runtime.test.ts#L700)
- [runtime state subscribers observe an unexpected real Pi child exit](../../../../tests/runtime.test.ts#L722)
- [passive Pi observers do not keep dialogs open without an interactive observer](../../../../tests/runtime.test.ts#L737)
- [real Pi stream fixture waits for a release barrier and aborts while waiting](../../../../tests/runtime.test.ts#L820)
- [real Pi burst fixture streams large tool updates with a bounded final message](../../../../tests/runtime.test.ts#L869)
- [real Pi reports provider failures rather than successful settlement](../../../../tests/runtime.test.ts#L899)
- [real Pi extension commands handle confirmation, cancellation, timeout and notification](../../../../tests/runtime.test.ts#L907)
- [real Pi closes after its owner disappears and receives stdin EOF](../../../../tests/runtime.test.ts#L944)

## tests/service-boot.test.ts

验证 Linux unit ordering、exact legacy migration、manager ownership、autostart/lingering reporting 与卸载阶段。

[查看源码](../../../../tests/service-boot.test.ts)

- [Linux user unit leaves ordering to the user manager and retains default.target installation](../../../../tests/service-boot.test.ts#L167)
- [first install refuses a loaded systemd unit from a different registration path](../../../../tests/service-boot.test.ts#L177)
- [first install rechecks systemd when an identical registration wins the create race](../../../../tests/service-boot.test.ts#L202)
- [install atomically upgrades only the exact previous unit and keeps an enabled running service untouched](../../../../tests/service-boot.test.ts#L239)
- [install repairs the exact quoted-directory unit rejected by systemd without starting it](../../../../tests/service-boot.test.ts#L290)
- [systemd accepts the generated unit with special characters in its working directory](../../../../tests/service-boot.test.ts#L319)
- [install refuses a symlinked Linux unit without changing its target](../../../../tests/service-boot.test.ts#L341)
- [known legacy units can be inspected and stopped, but restart requires upgrade before stopping](../../../../tests/service-boot.test.ts#L362)
- [install refuses a previous-version unit whose executable or entry path differs](../../../../tests/service-boot.test.ts#L399)
- [status reports live runtime, persistent autostart, and user lingering read-only](../../../../tests/service-boot.test.ts#L413)
- [status distinguishes disabled and runtime-only autostart and reports disabled lingering](../../../../tests/service-boot.test.ts#L473)
- [an upgraded unit survives reload failure and install can retry without restarting work](../../../../tests/service-boot.test.ts#L506)
- [status reports unknown autostart and lingering when either state query fails](../../../../tests/service-boot.test.ts#L536)
- [install reports the actual existing enabled state rather than claiming startup is disabled](../../../../tests/service-boot.test.ts#L557)
- [status and install refuse a loaded manager unit whose FragmentPath points elsewhere](../../../../tests/service-boot.test.ts#L575)
- [uninstall stops and waits, disables autostart, removes only its unit, then reloads without touching lingering](../../../../tests/service-boot.test.ts#L597)
- [uninstall disable failure preserves the unit and user data and reports partial completion](../../../../tests/service-boot.test.ts#L671)

## tests/service.test.ts

验证 macOS/Linux registration、path serialization、private file 边界、readiness identity 和 service start/stop。

[查看源码](../../../../tests/service.test.ts)

- [macOS install writes a private, non-login-autoload LaunchAgent with a fixed production command](../../../../tests/service.test.ts#L69)
- [Linux install writes a private systemd user unit without enabling login startup](../../../../tests/service.test.ts#L103)
- [systemd serialization preserves literal path characters without shell or specifier expansion](../../../../tests/service.test.ts#L149)
- [service installation rejects repository and vault destinations before writing registrations](../../../../tests/service.test.ts#L176)
- [install is idempotent for its own registration and refuses to overwrite unrelated content](../../../../tests/service.test.ts#L185)
- [service registration reads reject hard links and oversized files](../../../../tests/service.test.ts#L210)
- [service status reports a failed systemd unit distinctly from a stopped unit](../../../../tests/service.test.ts#L232)
- [service status reports a systemd activation transition](../../../../tests/service.test.ts#L245)
- [FIFO registration is rejected promptly instead of blocking the CLI](../../../../tests/service.test.ts#L263)
- [start waits for production host readiness and matches the service manager PID](../../../../tests/service.test.ts#L297)
- [start rejects a running listener whose host identity does not match the service PID](../../../../tests/service.test.ts#L334)
- [start reports manager cleanup failure after readiness times out](../../../../tests/service.test.ts#L368)
- [macOS start bootstraps and stop unloads only the matching LaunchAgent](../../../../tests/service.test.ts#L399)
- [stop refuses a conflicting launchd label with a different registration](../../../../tests/service.test.ts#L442)
- [stop unloads an installed LaunchAgent even when its process is already idle](../../../../tests/service.test.ts#L473)
- [launchd waiting state is reported without claiming the host is stopped](../../../../tests/service.test.ts#L506)
- [stop and uninstall target only the registered service manager unit](../../../../tests/service.test.ts#L534)
- [registration paths and executable arguments reject newline injection](../../../../tests/service.test.ts#L569)

## tests/session-discovery.test.ts

验证 host directory listing，以及 isolated offline model/capability discovery、错误处理和 scan coalescing。

[查看源码](../../../../tests/session-discovery.test.ts)

- [directory listing defaults to HOME and returns visible canonical directories](../../../../tests/session-discovery.test.ts#L29)
- [directory listing rejects relative, missing, and non-directory paths](../../../../tests/session-discovery.test.ts#L57)
- [Pi model discovery validates version and runs an offline isolated CLI](../../../../tests/session-discovery.test.ts#L68)
- [model capability discovery uses Pi RPC in a private offline session](../../../../tests/session-discovery.test.ts#L185)
- [Pi discovery recognizes an empty model list and sanitizes process failures](../../../../tests/session-discovery.test.ts#L276)
- [Pi 1.4.0 lists a synthetic configured model without provider access](../../../../tests/session-discovery.test.ts#L314)
- [session discovery coalesces model scans and drains one before shutdown](../../../../tests/session-discovery.test.ts#L386)

## tests/session-events.test.ts

验证 session subscription 不启动 Pi、late observer、live/saved 状态推进、storage fault 与 host restart resync。

[查看源码](../../../../tests/session-events.test.ts)

- [session subscriptions snapshot without starting Pi and runtime closes are published](../../../../tests/session-events.test.ts#L52)
- [a late subscriber sees the partial message then final state without duplicate text](../../../../tests/session-events.test.ts#L79)
- [failed observers do not fail execution and tool events remain Dwell projections](../../../../tests/session-events.test.ts#L127)
- [ledger failure emits a stream fault and never a durable completed event](../../../../tests/session-events.test.ts#L155)
- [an idle Pi process loss is observable without submitting another turn](../../../../tests/session-events.test.ts#L215)
- [a restarted host resynchronizes an old cursor without opening a runtime](../../../../tests/session-events.test.ts#L234)

## tests/session-models.test.ts

验证 session model discovery 使用已加载 extension registry，并且不通过切换 model 或重开 closed session 来探测。

[查看源码](../../../../tests/session-models.test.ts)

- [session model discovery uses loaded extensions without switching models or reopening closed sessions](../../../../tests/session-models.test.ts#L12)

## tests/sessions-http.test.ts

验证 session HTTP authentication、configuration 权限、create/list/open/close/context、model mutation 和已完成 admission 的请求。

[查看源码](../../../../tests/sessions-http.test.ts)

- [session routes require authentication and validate configuration/body boundaries](../../../../tests/sessions-http.test.ts#L47)
- [slow authenticated configuration outlives the ordinary five-second socket timeout](../../../../tests/sessions-http.test.ts#L67)
- [paired browsers can read sessions but cannot configure executables or bypass mutation guards](../../../../tests/sessions-http.test.ts#L93)
- [HTTP create/list/open/close/context preserve one session across host restart](../../../../tests/sessions-http.test.ts#L154)
- [HTTP creation can use the configured Pi default and idle model changes are durable](../../../../tests/sessions-http.test.ts#L188)
- [disconnecting an admitted creation request does not cancel or duplicate it](../../../../tests/sessions-http.test.ts#L237)

## tests/sessions.test.ts

验证 durable session identity、native defaults、model/thinking mutation、history reopen、并发去重与 shutdown。

[查看源码](../../../../tests/sessions.test.ts)

- [sessions start without Pi configuration and create/reopen empty identities durably](../../../../tests/sessions.test.ts#L56)
- [hosted Pi preserves the configured environment instead of forcing offline mode](../../../../tests/sessions.test.ts#L77)
- [a model and thinking-level selection is one idle session mutation and survives reopen](../../../../tests/sessions.test.ts#L105)
- [host restart reloads changed native instructions while preserving session history](../../../../tests/sessions.test.ts#L125)
- [directory-only sessions use Pi defaults and persist native idle model changes](../../../../tests/sessions.test.ts#L166)
- [model changes are rejected while a session turn is active](../../../../tests/sessions.test.ts#L214)
- [a failed native model-change append closes the uncertain runtime and can reopen safely](../../../../tests/sessions.test.ts#L240)
- [create retries and concurrent opens share one persisted session and runtime](../../../../tests/sessions.test.ts#L285)
- [known populated history reopens through Pi and missing history never becomes an empty replacement](../../../../tests/sessions.test.ts#L312)
- [invalid directories and failed Pi startup do not become successful sessions](../../../../tests/sessions.test.ts#L353)
- [shutdown closes every runtime and rejects later work](../../../../tests/sessions.test.ts#L368)
- [a locked catalog prevents session dispatch before durable admission](../../../../tests/sessions.test.ts#L380)
- [a corrupt history header is rejected before Pi can replace it](../../../../tests/sessions.test.ts#L395)
- [semantic catalog corruption fails startup before any runtime is created](../../../../tests/sessions.test.ts#L410)

## tests/turn-catalog.test.ts

验证 turn validator、request deduplication、active-turn 唯一性、dispatch transaction、terminal update 与 foreign key。

[查看源码](../../../../tests/turn-catalog.test.ts)

- [turn validators enforce exact request shape, UUIDs, slash-command scope, and byte bounds](../../../../tests/turn-catalog.test.ts#L70)
- [turn catalog deduplicates per session, reserves one active turn, and orders by admission if the clock regresses](../../../../tests/turn-catalog.test.ts#L96)
- [dispatch marking atomically persists history expectation and turn state, and rolls back together](../../../../tests/turn-catalog.test.ts#L168)
- [turn terminal updates release the active slot; startup interruption records an unknown outcome](../../../../tests/turn-catalog.test.ts#L196)
- [turn writes enforce session foreign keys and reopen validates semantic identifiers](../../../../tests/turn-catalog.test.ts#L247)

## tests/turn-recovery.test.ts

验证 terminal ledger write 或 cancellation persistence 失败时如何阻止新 execution，并保留 Pi history。

[查看源码](../../../../tests/turn-recovery.test.ts)

- [a final ledger write failure blocks new execution until restart without losing Pi history](../../../../tests/turn-recovery.test.ts#L111)
- [failed cancellation persistence stops the runtime and blocks new work](../../../../tests/turn-recovery.test.ts#L181)

## tests/turns-http.test.ts

验证 turn HTTP authentication、payload limit、session-scoped idempotency、result、browser binding 与 abort。

[查看源码](../../../../tests/turns-http.test.ts)

- [turn routes retain authentication, request limits, and exact path matching](../../../../tests/turns-http.test.ts#L95)
- [HTTP turn admission is idempotent, session-scoped, and exposes finalized entries](../../../../tests/turns-http.test.ts#L148)
- [paired browsers must present the binding and mutation headers for turn submission and abort](../../../../tests/turns-http.test.ts#L210)
- [an admitted turn survives client disconnect, blocks competing work, and can be aborted](../../../../tests/turns-http.test.ts#L343)

## tests/turns.test.ts

验证 turn admission、busy protection、跨 session 并行、cancellation、provider failure、shutdown 与 extension-handled input。

[查看源码](../../../../tests/turns.test.ts)

- [turn admission deduplicates before busy and saved results survive host restart](../../../../tests/turns.test.ts#L57)
- [slow turns do not block other sessions and abort is scoped to its run](../../../../tests/turns.test.ts#L93)
- [accepted work can be cancelled before dispatch and provider failures remain explicit](../../../../tests/turns.test.ts#L132)
- [database admission failure never sends a prompt and removed history is unavailable](../../../../tests/turns.test.ts#L154)
- [shutdown bounds active work and restarting never replays it](../../../../tests/turns.test.ts#L196)
- [cancel during dispatch preparation preserves an empty session; completion can win an abort race](../../../../tests/turns.test.ts#L215)
- [extension-handled input completes without model work and leaves an empty session reopenable](../../../../tests/turns.test.ts#L278)
- [extension-handled custom messages are saved without a fabricated assistant](../../../../tests/turns.test.ts#L326)

## tests/web-client.test.ts

验证实际 browser shell 的 pairing/history/stop/目录创建控件，以及公开 asset 与受保护 discovery 的边界。

[查看源码](../../../../tests/web-client.test.ts)

- [the real conversation shell exposes pairing, history, stop, and directory creation](../../../../tests/web-client.test.ts#L5)
- [browser modules are public but directory and model discovery require authentication](../../../../tests/web-client.test.ts#L27)

## tests/web-events.test.ts

验证 SSE decoder、immutable reducer、cursor/resync、live accumulation、saved/native identity reconciliation 与 client budget。

[查看源码](../../../../tests/web-events.test.ts)

- [SSEDecoder accepts fragmented CRLF frames and ignores heartbeat blocks](../../../../tests/web-events.test.ts#L205)
- [SSEDecoder permits multiline data fields but validates the JSON protocol frame](../../../../tests/web-events.test.ts#L217)
- [SSEDecoder counts fragmented Unicode as UTF-8 bytes](../../../../tests/web-events.test.ts#L226)
- [SSEDecoder reports malformed JSON, invalid frames, and mismatched event metadata](../../../../tests/web-events.test.ts#L239)
- [stream frame guards validate block text spans and thinking-only deltas](../../../../tests/web-events.test.ts#L259)
- [SSEDecoder bounds an unfinished frame](../../../../tests/web-events.test.ts#L324)
- [reduceFrame accumulates multiple assistant messages and updates tool output](../../../../tests/web-events.test.ts#L330)
- [reduceFrame retains ordered text spans and thinking deltas through snapshot resync](../../../../tests/web-events.test.ts#L406)
- [reduceFrame leaves previous state and frame payloads untouched](../../../../tests/web-events.test.ts#L496)
- [reduceFrame ignores duplicate and older cursors, and marks sequence gaps incomplete](../../../../tests/web-events.test.ts#L511)
- [resync preserves live state and a same-run snapshot merges its bounded projection](../../../../tests/web-events.test.ts#L547)
- [reconcileHistory clears only the matching covered terminal live run](../../../../tests/web-events.test.ts#L648)
- [mergeHistoryEntries keeps a loaded older prefix without duplicating overlap](../../../../tests/web-events.test.ts#L706)
- [mergeHistoryEntries drops the old fork suffix and retains its shared parent](../../../../tests/web-events.test.ts#L727)
- [mergeHistoryEntries replaces unrelated branches and clears on an empty latest page](../../../../tests/web-events.test.ts#L744)
- [new runs reset live items and a fresh session state accepts its snapshot](../../../../tests/web-events.test.ts#L755)
- [resync rejects stale cursors but accepts a lower sequence from a new epoch](../../../../tests/web-events.test.ts#L843)
- [live message and tool accumulation stay within client item and byte limits](../../../../tests/web-events.test.ts#L911)
- [reduceFrame ignores frames from another session and handles epoch replacement snapshots](../../../../tests/web-events.test.ts#L974)
- [saved native identities take over live content while repeated text stays distinct](../../../../tests/web-events.test.ts#L997)
- [native execution observation is separate from Dwell turns and waits for saved coverage](../../../../tests/web-events.test.ts#L1048)

## tests/web.test.ts

验证同 origin 的 browser asset、fixed module compilation，以及 directory-only creation 与 composer model selection 的 UI 结构。

[查看源码](../../../../tests/web.test.ts)

- [the conversation page loads only same-origin external code and styles](../../../../tests/web.test.ts#L6)
- [native browser compilation exposes a fixed set of credential-safe modules](../../../../tests/web.test.ts#L16)
- [creation asks only for a directory and model selection sits above the composer](../../../../tests/web.test.ts#L44)
