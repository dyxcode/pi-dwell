<a id="source-and-symbol-atlas"></a>

# 源码与 symbol 索引

[English](../../../handbook/source-map.md) | 简体中文

[文档目录](README.md) · [实现概览](system.md)

本索引覆盖当前 production TypeScript 源码。每个文件列出 local dependency、module-level declaration、class member 和具名 nested function declaration。每个 callable 都链接到文字解释。Local state 与 anonymous callbacks 结合所属操作说明，function bodies 保留在链接指向的源码中。链接包含源码行号 anchor，代码移动时应同步刷新。

## src/cli.ts

文字解释：[cli](implementation/cli.md)

[查看源码](../../../../src/cli.ts) · 8 行

Local dependencies： [clients/cli/main.ts](../../../../src/clients/cli/main.ts).

这个 entry point 通过 import 委派工作；上方链接的 CLI 章节解释其 top-level execution。


## src/clients/cli/arguments.ts

文字解释：[cli](implementation/cli.md)

[查看源码](../../../../src/clients/cli/arguments.ts) · 116 行

Local dependencies： [local/paths.ts](../../../../src/local/paths.ts), [service/service.ts](../../../../src/service/service.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`Command`](../../../../src/clients/cli/arguments.ts#L5) | TypeAlias |  | [文字解释](implementation/cli.md) |
| [`ParsedOptions`](../../../../src/clients/cli/arguments.ts#L11) | Interface |  | [文字解释](implementation/cli.md) |
| [`parseOptions`](../../../../src/clients/cli/arguments.ts#L17) | Function | args, valueOptions | [文字解释](implementation/cli.md#command-parsing) |
| [`requiredValue`](../../../../src/clients/cli/arguments.ts#L47) | Function | values, option | [文字解释](implementation/cli.md#command-parsing) |
| [`absolutePath`](../../../../src/clients/cli/arguments.ts#L54) | Function | value, option | [文字解释](implementation/cli.md#command-parsing) |
| [`parseCommand`](../../../../src/clients/cli/arguments.ts#L59) | Function | args | [文字解释](implementation/cli.md#command-parsing) |


## src/clients/cli/main.ts

文字解释：[cli](implementation/cli.md)

[查看源码](../../../../src/clients/cli/main.ts) · 101 行

Local dependencies： [local/paths.ts](../../../../src/local/paths.ts), [server/http.ts](../../../../src/server/http.ts), [service/service.ts](../../../../src/service/service.ts), [clients/cli/arguments.ts](../../../../src/clients/cli/arguments.ts), [clients/cli/runtime.ts](../../../../src/clients/cli/runtime.ts), [clients/cli/status.ts](../../../../src/clients/cli/status.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`runCli`](../../../../src/clients/cli/main.ts#L9) | Function | args, overrides | [文字解释](implementation/cli.md#command-dispatch) |


## src/clients/cli/runtime.ts

文字解释：[cli](implementation/cli.md)

[查看源码](../../../../src/clients/cli/runtime.ts) · 26 行

Local dependencies： [shared/sessions.ts](../../../../src/shared/sessions.ts), [clients/cli/status.ts](../../../../src/clients/cli/status.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`CONFIGURATION_REQUEST_TIMEOUT_MS`](../../../../src/clients/cli/runtime.ts#L4) | Module value | 由 initializer 推断 | [文字解释](implementation/cli.md) |
| [`configurationOptions`](../../../../src/clients/cli/runtime.ts#L6) | Function | options | [文字解释](implementation/cli.md#local-http-client) |
| [`configureRuntime`](../../../../src/clients/cli/runtime.ts#L13) | Function | options, configuration | [文字解释](implementation/cli.md#local-http-client) |


## src/clients/cli/status.ts

文字解释：[cli](implementation/cli.md)

[查看源码](../../../../src/clients/cli/status.ts) · 130 行

Local dependencies： [local/files.ts](../../../../src/local/files.ts), [local/paths.ts](../../../../src/local/paths.ts), [shared/protocol.ts](../../../../src/shared/protocol.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`ClientOptions`](../../../../src/clients/cli/status.ts#L5) | Interface |  | [文字解释](implementation/cli.md) |
| [`localRequest`](../../../../src/clients/cli/status.ts#L11) | Function | path, options, method, body | [文字解释](implementation/cli.md#local-http-client) |
| [`errorMessage`](../../../../src/clients/cli/status.ts#L86) | Function | value | [文字解释](implementation/cli.md#local-http-client) |
| [`readHostStatus`](../../../../src/clients/cli/status.ts#L101) | Function | options | [文字解释](implementation/cli.md#local-http-client) |
| [`createPairing`](../../../../src/clients/cli/status.ts#L107) | Function | options | [文字解释](implementation/cli.md#local-http-client) |
| [`revokeBrowsers`](../../../../src/clients/cli/status.ts#L126) | Function | options | [文字解释](implementation/cli.md#local-http-client) |


## src/clients/web/attachments.ts

文字解释：[browser-input](implementation/browser-input.md)

[查看源码](../../../../src/clients/web/attachments.ts) · 194 行

Local dependencies： [clients/web/icons.ts](../../../../src/clients/web/icons.ts), [shared/images.ts](../../../../src/shared/images.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`Attachment`](../../../../src/clients/web/attachments.ts#L11) | Interface |  | [文字解释](implementation/browser-input.md) |
| [`Attachments`](../../../../src/clients/web/attachments.ts#L17) | Class |  | [文字解释](implementation/browser-input.md) |
| [`Attachments.#drafts`](../../../../src/clients/web/attachments.ts#L18) | Property |  | [文字解释](implementation/browser-input.md) |
| [`Attachments.#pending`](../../../../src/clients/web/attachments.ts#L19) | Property |  | [文字解释](implementation/browser-input.md) |
| [`Attachments.#session`](../../../../src/clients/web/attachments.ts#L20) | Property |  | [文字解释](implementation/browser-input.md) |
| [`Attachments.#disabled`](../../../../src/clients/web/attachments.ts#L21) | Property |  | [文字解释](implementation/browser-input.md) |
| [`Attachments.#intakeDisabled`](../../../../src/clients/web/attachments.ts#L22) | Property |  | [文字解释](implementation/browser-input.md) |
| [`Attachments.#generation`](../../../../src/clients/web/attachments.ts#L23) | Property |  | [文字解释](implementation/browser-input.md) |
| [`Attachments.#input`](../../../../src/clients/web/attachments.ts#L24) | Property |  | [文字解释](implementation/browser-input.md) |
| [`Attachments.#tray`](../../../../src/clients/web/attachments.ts#L25) | Property |  | [文字解释](implementation/browser-input.md) |
| [`Attachments.#button`](../../../../src/clients/web/attachments.ts#L26) | Property |  | [文字解释](implementation/browser-input.md) |
| [`Attachments.#change`](../../../../src/clients/web/attachments.ts#L27) | Property |  | [文字解释](implementation/browser-input.md) |
| [`Attachments.#error`](../../../../src/clients/web/attachments.ts#L28) | Property |  | [文字解释](implementation/browser-input.md) |
| [`Attachments.#preview`](../../../../src/clients/web/attachments.ts#L29) | Property |  | [文字解释](implementation/browser-input.md) |
| [`Attachments.constructor`](../../../../src/clients/web/attachments.ts#L30) | Constructor | options | [文字解释](implementation/browser-input.md#attachment-ownership-callbacks) |
| [`Attachments.select`](../../../../src/clients/web/attachments.ts#L50) | Method | id | [文字解释](implementation/browser-input.md#attachment-ownership-callbacks) |
| [`Attachments.setDisabled`](../../../../src/clients/web/attachments.ts#L54) | Method | disabled, intakeDisabled | [文字解释](implementation/browser-input.md#attachment-ownership-callbacks) |
| [`Attachments.busy`](../../../../src/clients/web/attachments.ts#L61) | GetAccessor |  | [文字解释](implementation/browser-input.md#attachment-ownership-callbacks) |
| [`Attachments.count`](../../../../src/clients/web/attachments.ts#L64) | GetAccessor |  | [文字解释](implementation/browser-input.md#attachment-ownership-callbacks) |
| [`Attachments.payload`](../../../../src/clients/web/attachments.ts#L67) | Method |  | [文字解释](implementation/browser-input.md#attachment-ownership-callbacks) |
| [`Attachments.clear`](../../../../src/clients/web/attachments.ts#L70) | Method | id | [文字解释](implementation/browser-input.md#attachment-ownership-callbacks) |
| [`Attachments.dispose`](../../../../src/clients/web/attachments.ts#L75) | Method |  | [文字解释](implementation/browser-input.md#attachment-ownership-callbacks) |
| [`Attachments.paste`](../../../../src/clients/web/attachments.ts#L82) | Method | event | [文字解释](implementation/browser-input.md#attachment-ownership-callbacks) |
| [`Attachments.add`](../../../../src/clients/web/attachments.ts#L88) | Method | files, pasted | [文字解释](implementation/browser-input.md#file-intake-preview-rendering) |
| [`Attachments.#render`](../../../../src/clients/web/attachments.ts#L154) | Method |  | [文字解释](implementation/browser-input.md#file-intake-preview-rendering) |


## src/clients/web/client.ts

文字解释：[browser-controller](implementation/browser-controller.md)

[查看源码](../../../../src/clients/web/client.ts) · 2734 行

Local dependencies： [shared/discovery.ts](../../../../src/shared/discovery.ts), [shared/history.ts](../../../../src/shared/history.ts), [shared/protocol.ts](../../../../src/shared/protocol.ts), [shared/sessions.ts](../../../../src/shared/sessions.ts), [shared/turns.ts](../../../../src/shared/turns.ts), [clients/web/events.ts](../../../../src/clients/web/events.ts), [clients/web/tool-command.ts](../../../../src/clients/web/tool-command.ts), [clients/web/icons.ts](../../../../src/clients/web/icons.ts), [clients/web/attachments.ts](../../../../src/clients/web/attachments.ts), [clients/web/markdown.ts](../../../../src/clients/web/markdown.ts), [clients/web/conversation.ts](../../../../src/clients/web/conversation.ts), [clients/web/dom.ts](../../../../src/clients/web/dom.ts), [shared/images.ts](../../../../src/shared/images.ts), [shared/events.ts](../../../../src/shared/events.ts), [shared/thinking.ts](../../../../src/shared/thinking.ts), [clients/web/input.ts](../../../../src/clients/web/input.ts), [clients/web/transport.ts](../../../../src/clients/web/transport.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`el`](../../../../src/clients/web/client.ts#L54) | Function | id, type | [文字解释](implementation/browser-controller.md#dom-contract-coordinator-state) |
| [`node`](../../../../src/clients/web/client.ts#L59) | Function | tag, text, className | [文字解释](implementation/browser-controller.md#dom-contract-coordinator-state) |
| [`input`](../../../../src/clients/web/client.ts#L64) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`form`](../../../../src/clients/web/client.ts#L65) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`rail`](../../../../src/clients/web/client.ts#L66) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`main`](../../../../src/clients/web/client.ts#L67) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`gate`](../../../../src/clients/web/client.ts#L68) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`app`](../../../../src/clients/web/client.ts#L69) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`scroll`](../../../../src/clients/web/client.ts#L70) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`conversation`](../../../../src/clients/web/client.ts#L71) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`composer`](../../../../src/clients/web/client.ts#L72) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`savedRenderer`](../../../../src/clients/web/client.ts#L73) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`imageGeneration`](../../../../src/clients/web/client.ts#L74) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`send`](../../../../src/clients/web/client.ts#L75) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`notice`](../../../../src/clients/web/client.ts#L76) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`dialog`](../../../../src/clients/web/client.ts#L77) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`directory`](../../../../src/clients/web/client.ts#L78) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`createButton`](../../../../src/clients/web/client.ts#L79) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`closeDialog`](../../../../src/clients/web/client.ts#L80) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`closeDirectory`](../../../../src/clients/web/client.ts#L81) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`closeTitle`](../../../../src/clients/web/client.ts#L82) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`closeCopy`](../../../../src/clients/web/client.ts#L83) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`closeError`](../../../../src/clients/web/client.ts#L84) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`cancelClose`](../../../../src/clients/web/client.ts#L85) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`confirmClose`](../../../../src/clients/web/client.ts#L86) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`modelDialog`](../../../../src/clients/web/client.ts#L94) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`modelSearch`](../../../../src/clients/web/client.ts#L95) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`chooseModel`](../../../../src/clients/web/client.ts#L96) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`availableModels`](../../../../src/clients/web/client.ts#L97) | Module value | `PiModelOption[]` | [文字解释](implementation/browser-controller.md) |
| [`capabilities`](../../../../src/clients/web/client.ts#L98) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`capabilityRequests`](../../../../src/clients/web/client.ts#L99) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`capabilityErrors`](../../../../src/clients/web/client.ts#L100) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`capabilityGeneration`](../../../../src/clients/web/client.ts#L101) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`resetCapabilities`](../../../../src/clients/web/client.ts#L117) | Function |  | [文字解释](implementation/browser-controller.md#model-capability-state-image-gate) |
| [`thinkingChoice`](../../../../src/clients/web/client.ts#L118) | Module value | `PiModelOption \| null` | [文字解释](implementation/browser-controller.md) |
| [`levelNames`](../../../../src/clients/web/client.ts#L119) | Module value | `Record<ThinkingLevel, string>` | [文字解释](implementation/browser-controller.md) |
| [`modelSession`](../../../../src/clients/web/client.ts#L128) | Module value | `string \| null` | [文字解释](implementation/browser-controller.md) |
| [`changingModel`](../../../../src/clients/web/client.ts#L129) | Module value | `string \| null` | [文字解释](implementation/browser-controller.md) |
| [`older`](../../../../src/clients/web/client.ts#L130) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`drafts`](../../../../src/clients/web/client.ts#L147) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`turns`](../../../../src/clients/web/client.ts#L148) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`sessions`](../../../../src/clients/web/client.ts#L149) | Module value | `SessionInfo[]` | [文字解释](implementation/browser-controller.md) |
| [`selected`](../../../../src/clients/web/client.ts#L150) | Module value | `string \| null` | [文字解释](implementation/browser-controller.md) |
| [`state`](../../../../src/clients/web/client.ts#L151) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`contextSources`](../../../../src/clients/web/client.ts#L152) | Module value | `ContextSource[]` | [文字解释](implementation/browser-controller.md) |
| [`contextSourcesTruncated`](../../../../src/clients/web/client.ts#L153) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`entries`](../../../../src/clients/web/client.ts#L154) | Module value | `HistoryEntry[]` | [文字解释](implementation/browser-controller.md) |
| [`nextCursor`](../../../../src/clients/web/client.ts#L155) | Module value | `string \| null` | [文字解释](implementation/browser-controller.md) |
| [`controller`](../../../../src/clients/web/client.ts#L156) | Module value | `AbortController \| null` | [文字解释](implementation/browser-controller.md) |
| [`generation`](../../../../src/clients/web/client.ts#L157) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`authenticated`](../../../../src/clients/web/client.ts#L158) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`reconnectTimer`](../../../../src/clients/web/client.ts#L159) | Module value | `number \| undefined` | [文字解释](implementation/browser-controller.md) |
| [`pollTimer`](../../../../src/clients/web/client.ts#L159) | Module value | `number \| undefined` | [文字解释](implementation/browser-controller.md) |
| [`polling`](../../../../src/clients/web/client.ts#L160) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`suspended`](../../../../src/clients/web/client.ts#L161) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`HistoryReadRecovery`](../../../../src/clients/web/client.ts#L162) | Interface |  | [文字解释](implementation/browser-controller.md) |
| [`historyRecovery`](../../../../src/clients/web/client.ts#L167) | Module value | `Record<"latest" \| "older", HistoryReadRecovery>` | [文字解释](implementation/browser-controller.md) |
| [`historyContentFailed`](../../../../src/clients/web/client.ts#L171) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`historyCoverageReads`](../../../../src/clients/web/client.ts#L172) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`historyCoverageRun`](../../../../src/clients/web/client.ts#L173) | Module value | `string \| null` | [文字解释](implementation/browser-controller.md) |
| [`resetHistoryPagination`](../../../../src/clients/web/client.ts#L174) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`historyPending`](../../../../src/clients/web/client.ts#L175) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`sending`](../../../../src/clients/web/client.ts#L176) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`pendingSend`](../../../../src/clients/web/client.ts#L177) | Module value | `{   session: string;   requestId: string;   message: string;   images: ImageContent[]; } \| null` | [文字解释](implementation/browser-controller.md) |
| [`pendingCreate`](../../../../src/clients/web/client.ts#L183) | Module value | `{   requestId: string;   directory: string; } \| null` | [文字解释](implementation/browser-controller.md) |
| [`tabSlots`](../../../../src/clients/web/client.ts#L187) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`openingSessions`](../../../../src/clients/web/client.ts#L188) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`closeArmedSession`](../../../../src/clients/web/client.ts#L189) | Module value | `string \| null` | [文字解释](implementation/browser-controller.md) |
| [`preparingCloseSession`](../../../../src/clients/web/client.ts#L190) | Module value | `string \| null` | [文字解释](implementation/browser-controller.md) |
| [`closeTarget`](../../../../src/clients/web/client.ts#L191) | Module value | `{   id: string;   activeRunId: string \| null;   nativeExecutionId: string \| null;   attempted: boolean; } \| null` | [文字解释](implementation/browser-controller.md) |
| [`closingSession`](../../../../src/clients/web/client.ts#L197) | Module value | `string \| null` | [文字解释](implementation/browser-controller.md) |
| [`closePreparationGeneration`](../../../../src/clients/web/client.ts#L198) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`closeAttemptGeneration`](../../../../src/clients/web/client.ts#L199) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`sessionRefreshGeneration`](../../../../src/clients/web/client.ts#L200) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`sessionStateGeneration`](../../../../src/clients/web/client.ts#L201) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`selectionGeneration`](../../../../src/clients/web/client.ts#L202) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`openIntentGeneration`](../../../../src/clients/web/client.ts#L203) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`authAttempt`](../../../../src/clients/web/client.ts#L204) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`browseAttempt`](../../../../src/clients/web/client.ts#L205) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`modelAttempt`](../../../../src/clients/web/client.ts#L206) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`hostMode`](../../../../src/clients/web/client.ts#L207) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`streamConnected`](../../../../src/clients/web/client.ts#L208) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`imageDialog`](../../../../src/clients/web/client.ts#L209) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`showImage`](../../../../src/clients/web/client.ts#L215) | Function | url, name | [文字解释](implementation/browser-controller.md#dom-contract-coordinator-state) |
| [`attachments`](../../../../src/clients/web/client.ts#L216) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`attachButton`](../../../../src/clients/web/client.ts#L484) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`imageFiles`](../../../../src/clients/web/client.ts#L485) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`imageCache`](../../../../src/clients/web/client.ts#L523) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`imageQueue`](../../../../src/clients/web/client.ts#L524) | Module value | `Promise<unknown>` | [文字解释](implementation/browser-controller.md) |
| [`liveOrder`](../../../../src/clients/web/client.ts#L525) | Module value | `{ kind: "message" \| "tool"; id: string }[]` | [文字解释](implementation/browser-controller.md) |
| [`releaseImages`](../../../../src/clients/web/client.ts#L531) | Function |  | [文字解释](implementation/browser-controller.md#dom-contract-coordinator-state) |
| [`historyImage`](../../../../src/clients/web/client.ts#L541) | Function | entryId, index, mimeType | [文字解释](implementation/browser-controller.md#conversation-rendering-saved-images) |
| [`localPreferences`](../../../../src/clients/web/client.ts#L597) | Module value | `Record<string, string>` | [文字解释](implementation/browser-controller.md) |
| [`savePreference`](../../../../src/clients/web/client.ts#L611) | Function | key, value | [文字解释](implementation/browser-controller.md#model-capability-state-image-gate) |
| [`activeSession`](../../../../src/clients/web/client.ts#L699) | Function |  | [文字解释](implementation/browser-controller.md#model-capability-state-image-gate) |
| [`modelCapabilityKey`](../../../../src/clients/web/client.ts#L702) | Function | provider, model, sessionId | [文字解释](implementation/browser-controller.md#model-capability-state-image-gate) |
| [`requestModelCapabilities`](../../../../src/clients/web/client.ts#L711) | Function | choice, sessionId | [文字解释](implementation/browser-controller.md#model-capability-state-image-gate) |
| [`probeCurrentModel`](../../../../src/clients/web/client.ts#L751) | Function | sessionId | [文字解释](implementation/browser-controller.md#model-capability-state-image-gate) |
| [`label`](../../../../src/clients/web/client.ts#L779) | Function | s | [文字解释](implementation/browser-controller.md#session-labels-status-navigation) |
| [`runtimeOpen`](../../../../src/clients/web/client.ts#L795) | Function | s | [文字解释](implementation/browser-controller.md#session-labels-status-navigation) |
| [`nativeRunning`](../../../../src/clients/web/client.ts#L798) | Function | s | [文字解释](implementation/browser-controller.md#session-labels-status-navigation) |
| [`sessionBusy`](../../../../src/clients/web/client.ts#L801) | Function | s | [文字解释](implementation/browser-controller.md#session-labels-status-navigation) |
| [`status`](../../../../src/clients/web/client.ts#L804) | Function | s | [文字解释](implementation/browser-controller.md#session-labels-status-navigation) |
| [`TabStatus`](../../../../src/clients/web/client.ts#L821) | TypeAlias |  | [文字解释](implementation/browser-controller.md) |
| [`tabStatus`](../../../../src/clients/web/client.ts#L827) | Function | s | [文字解释](implementation/browser-controller.md#session-labels-status-navigation) |
| [`tabStatusLabel`](../../../../src/clients/web/client.ts#L836) | Function | value | [文字解释](implementation/browser-controller.md#session-labels-status-navigation) |
| [`SVG_NS`](../../../../src/clients/web/client.ts#L842) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`statusPaths`](../../../../src/clients/web/client.ts#L843) | Module value | `Record<   "ready" \| "working" \| "attention" \| "stopped" \| "opening" \| "close",   string >` | [文字解释](implementation/browser-controller.md) |
| [`tabSymbol`](../../../../src/clients/web/client.ts#L859) | Function | value | [文字解释](implementation/browser-controller.md#session-labels-status-navigation) |
| [`synchronizeTabSlots`](../../../../src/clients/web/client.ts#L875) | Function |  | [文字解释](implementation/browser-controller.md#session-labels-status-navigation) |
| [`openTabIds`](../../../../src/clients/web/client.ts#L887) | Function |  | [文字解释](implementation/browser-controller.md#session-labels-status-navigation) |
| [`closeBlockedReason`](../../../../src/clients/web/client.ts#L890) | Function |  | [文字解释](implementation/browser-controller.md#session-labels-status-navigation) |
| [`showError`](../../../../src/clients/web/client.ts#L900) | Function | error | [文字解释](implementation/browser-controller.md#session-labels-status-navigation) |
| [`clearNotice`](../../../../src/clients/web/client.ts#L908) | Function |  | [文字解释](implementation/browser-controller.md#session-labels-status-navigation) |
| [`nav`](../../../../src/clients/web/client.ts#L912) | Function | open | [文字解释](implementation/browser-controller.md#session-labels-status-navigation) |
| [`navigation`](../../../../src/clients/web/client.ts#L921) | Function |  | [文字解释](implementation/browser-controller.md#session-labels-status-navigation) |
| [`updatedSession`](../../../../src/clients/web/client.ts#L1101) | Function | session | [文字解释](implementation/browser-controller.md#opening-closing-concurrency-checks) |
| [`neighborAfterClose`](../../../../src/clients/web/client.ts#L1113) | Function | id, previousTabs | [文字解释](implementation/browser-controller.md#opening-closing-concurrency-checks) |
| [`reconcileClosedRuntime`](../../../../src/clients/web/client.ts#L1128) | Function | id, previousTabs | [文字解释](implementation/browser-controller.md#opening-closing-concurrency-checks) |
| [`userMessageSnippet`](../../../../src/clients/web/client.ts#L1137) | Function | values | [文字解释](implementation/browser-controller.md#opening-closing-concurrency-checks) |
| [`showCloseError`](../../../../src/clients/web/client.ts#L1150) | Function | error | [文字解释](implementation/browser-controller.md#opening-closing-concurrency-checks) |
| [`prepareClose`](../../../../src/clients/web/client.ts#L1154) | Function | id | [文字解释](implementation/browser-controller.md#opening-closing-concurrency-checks) |
| [`sessionSnapshot`](../../../../src/clients/web/client.ts#L1238) | Function | id | [文字解释](implementation/browser-controller.md#opening-closing-concurrency-checks) |
| [`turnSnapshot`](../../../../src/clients/web/client.ts#L1244) | Function | id, runId | [文字解释](implementation/browser-controller.md#opening-closing-concurrency-checks) |
| [`turnIsActive`](../../../../src/clients/web/client.ts#L1250) | Function | turn | [文字解释](implementation/browser-controller.md#opening-closing-concurrency-checks) |
| [`waitForTurnAndRuntime`](../../../../src/clients/web/client.ts#L1253) | Function | id, runId, authentication | [文字解释](implementation/browser-controller.md#opening-closing-concurrency-checks) |
| [`finishClose`](../../../../src/clients/web/client.ts#L1278) | Function | id, previousTabs | [文字解释](implementation/browser-controller.md#opening-closing-concurrency-checks) |
| [`confirmSessionClose`](../../../../src/clients/web/client.ts#L1284) | Function |  | [文字解释](implementation/browser-controller.md#opening-closing-concurrency-checks) |
| [`openFromSidebar`](../../../../src/clients/web/client.ts#L1396) | Function | id | [文字解释](implementation/browser-controller.md#opening-closing-concurrency-checks) |
| [`identifyLiveThinking`](../../../../src/clients/web/client.ts#L1432) | Function | message | [文字解释](implementation/browser-controller.md#conversation-rendering-saved-images) |
| [`renderConversation`](../../../../src/clients/web/client.ts#L1444) | Function |  | [文字解释](implementation/browser-controller.md#conversation-rendering-saved-images) |
| [`historyProblem`](../../../../src/clients/web/client.ts#L1630) | Function |  | [文字解释](implementation/browser-controller.md#saved-history-recovery) |
| [`resetHistoryRecovery`](../../../../src/clients/web/client.ts#L1634) | Function | more | [文字解释](implementation/browser-controller.md#saved-history-recovery) |
| [`uncoveredHistoryRun`](../../../../src/clients/web/client.ts#L1650) | Function |  | [文字解释](implementation/browser-controller.md#saved-history-recovery) |
| [`scheduleHistoryRecovery`](../../../../src/clients/web/client.ts#L1661) | Function | more | [文字解释](implementation/browser-controller.md#saved-history-recovery) |
| [`loadHistory`](../../../../src/clients/web/client.ts#L1670) | Function | more | [文字解释](implementation/browser-controller.md#saved-history-recovery) |
| [`stopStream`](../../../../src/clients/web/client.ts#L1769) | Function |  | [文字解释](implementation/browser-controller.md#sse-connection-selection-lifecycle) |
| [`renderFrame`](../../../../src/clients/web/client.ts#L1767) | Module value | `number \| undefined` | [文字解释](implementation/browser-controller.md) |
| [`scheduleStreamRender`](../../../../src/clients/web/client.ts#L1775) | Function |  | [文字解释](implementation/browser-controller.md#sse-connection-selection-lifecycle) |
| [`stream`](../../../../src/clients/web/client.ts#L1783) | Function | id, epoch | [文字解释](implementation/browser-controller.md#sse-connection-selection-lifecycle) |
| [`select`](../../../../src/clients/web/client.ts#L1900) | Function | id | [文字解释](implementation/browser-controller.md#sse-connection-selection-lifecycle) |
| [`connection`](../../../../src/clients/web/client.ts#L1938) | Function | text | [文字解释](implementation/browser-controller.md#sse-connection-selection-lifecycle) |
| [`refresh`](../../../../src/clients/web/client.ts#L1941) | Function |  | [文字解释](implementation/browser-controller.md#sse-connection-selection-lifecycle) |
| [`poll`](../../../../src/clients/web/client.ts#L2009) | Function |  | [文字解释](implementation/browser-controller.md#sse-connection-selection-lifecycle) |
| [`disconnect`](../../../../src/clients/web/client.ts#L2031) | Function | reason | [文字解释](implementation/browser-controller.md#sse-connection-selection-lifecycle) |
| [`connect`](../../../../src/clients/web/client.ts#L2057) | Function |  | [文字解释](implementation/browser-controller.md#sse-connection-selection-lifecycle) |
| [`submit`](../../../../src/clients/web/client.ts#L2096) | Function |  | [文字解释](implementation/browser-controller.md#sending-stopping-safe-retry) |
| [`browse`](../../../../src/clients/web/client.ts#L2199) | Function | path | [文字解释](implementation/browser-controller.md#directory-selection-session-creation-model-picker) |
| [`renderModels`](../../../../src/clients/web/client.ts#L2248) | Function |  | [文字解释](implementation/browser-controller.md#directory-selection-session-creation-model-picker) |
| [`showModels`](../../../../src/clients/web/client.ts#L2276) | Function |  | [文字解释](implementation/browser-controller.md#directory-selection-session-creation-model-picker) |
| [`showThinking`](../../../../src/clients/web/client.ts#L2327) | Function | choice | [文字解释](implementation/browser-controller.md#directory-selection-session-creation-model-picker) |
| [`changeModel`](../../../../src/clients/web/client.ts#L2388) | Function | choice, thinkingLevel | [文字解释](implementation/browser-controller.md#directory-selection-session-creation-model-picker) |
| [`newSession`](../../../../src/clients/web/client.ts#L2433) | Function |  | [文字解释](implementation/browser-controller.md#directory-selection-session-creation-model-picker) |
| [`createSession`](../../../../src/clients/web/client.ts#L2441) | Function |  | [文字解释](implementation/browser-controller.md#directory-selection-session-creation-model-picker) |
| [`resetCloseDialog`](../../../../src/clients/web/client.ts#L2548) | Function |  | [文字解释](implementation/browser-controller.md#opening-closing-concurrency-checks) |
| [`dismissCloseDialog`](../../../../src/clients/web/client.ts#L2561) | Function |  | [文字解释](implementation/browser-controller.md#opening-closing-concurrency-checks) |
| [`pairingCode`](../../../../src/clients/web/client.ts#L2580) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`viewport`](../../../../src/clients/web/client.ts#L2673) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`responsive`](../../../../src/clients/web/client.ts#L2682) | Function |  | [文字解释](implementation/browser-controller.md#event-bindings-page-lifecycle) |
| [`resume`](../../../../src/clients/web/client.ts#L2704) | Function |  | [文字解释](implementation/browser-controller.md#event-bindings-page-lifecycle) |
| [`savedHistoryWarning`](../../../../src/clients/web/client.ts#L785) | Function | | [Read explanation](implementation/browser-controller.md#session-labels-status-navigation) |
| [`invalidateSessionNameEditor`](../../../../src/clients/web/client.ts#L622) | Function |  | [Read explanation](implementation/browser-controller.md#browser-shared-session-names) |
| [`closeSessionNameEditor`](../../../../src/clients/web/client.ts#L626) | Function |  | [Read explanation](implementation/browser-controller.md#browser-shared-session-names) |
| [`openSessionNameEditor`](../../../../src/clients/web/client.ts#L630) | Function |  | [Read explanation](implementation/browser-controller.md#browser-shared-session-names) |
| [`saveSessionNameValue`](../../../../src/clients/web/client.ts#L647) | Function |  | [Read explanation](implementation/browser-controller.md#browser-shared-session-names) |
| [`sameLibraryReference`](../../../../src/clients/web/client.ts#L221) | Function | | [阅读说明](implementation/storage-integrations.md#library-http-browser) |
| [`libraryFailure`](../../../../src/clients/web/client.ts#L224) | Function | | [阅读说明](implementation/storage-integrations.md#library-http-browser) |
| [`renderLibraryReferences`](../../../../src/clients/web/client.ts#L228) | Function | | [阅读说明](implementation/storage-integrations.md#library-http-browser) |
| [`renderLibraryItems`](../../../../src/clients/web/client.ts#L258) | Function | | [阅读说明](implementation/storage-integrations.md#library-http-browser) |
| [`renderLibraryReader`](../../../../src/clients/web/client.ts#L277) | Function | | [阅读说明](implementation/storage-integrations.md#library-http-browser) |
| [`loadLibraryReferences`](../../../../src/clients/web/client.ts#L318) | Function | | [阅读说明](implementation/storage-integrations.md#library-http-browser) |
| [`loadLatestLibraryItems`](../../../../src/clients/web/client.ts#L351) | Function | | [阅读说明](implementation/storage-integrations.md#library-http-browser) |
| [`searchLibrary`](../../../../src/clients/web/client.ts#L378) | Function | | [阅读说明](implementation/storage-integrations.md#library-http-browser) |
| [`readLibraryItem`](../../../../src/clients/web/client.ts#L405) | Function | | [阅读说明](implementation/storage-integrations.md#library-http-browser) |
| [`changeLibraryReference`](../../../../src/clients/web/client.ts#L435) | Function | | [阅读说明](implementation/storage-integrations.md#library-http-browser) |
| [`openLibrary`](../../../../src/clients/web/client.ts#L470) | Function | | [阅读说明](implementation/storage-integrations.md#library-http-browser) |


## src/clients/web/conversation.ts

文字解释：[browser-rendering](implementation/browser-rendering.md)

[查看源码](../../../../src/clients/web/conversation.ts) · 579 行

Local dependencies： [shared/events.ts](../../../../src/shared/events.ts), [shared/history.ts](../../../../src/shared/history.ts), [clients/web/icons.ts](../../../../src/clients/web/icons.ts), [clients/web/markdown.ts](../../../../src/clients/web/markdown.ts), [clients/web/tool-command.ts](../../../../src/clients/web/tool-command.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`SavedConversationGroup`](../../../../src/clients/web/conversation.ts#L9) | TypeAlias |  | [文字解释](implementation/browser-rendering.md) |
| [`groupConversationEntries`](../../../../src/clients/web/conversation.ts#L14) | Function | entries | [文字解释](implementation/browser-rendering.md#saved-grouping-tool-pairing) |
| [`ToolResultPairs`](../../../../src/clients/web/conversation.ts#L37) | Interface |  | [文字解释](implementation/browser-rendering.md) |
| [`pairToolResults`](../../../../src/clients/web/conversation.ts#L44) | Function | entries | [文字解释](implementation/browser-rendering.md#saved-grouping-tool-pairing) |
| [`SavedImageRenderer`](../../../../src/clients/web/conversation.ts#L78) | TypeAlias |  | [文字解释](implementation/browser-rendering.md) |
| [`node`](../../../../src/clients/web/conversation.ts#L84) | Function | tag, text, className | [文字解释](implementation/browser-rendering.md#saved-grouping-tool-pairing) |
| [`keyed`](../../../../src/clients/web/conversation.ts#L95) | Function | details, key, entryId | [文字解释](implementation/browser-rendering.md#saved-grouping-tool-pairing) |
| [`markdown`](../../../../src/clients/web/conversation.ts#L101) | Function | parent, source | [文字解释](implementation/browser-rendering.md#saved-grouping-tool-pairing) |
| [`appendImage`](../../../../src/clients/web/conversation.ts#L105) | Function | parent, entry, block, renderImage | [文字解释](implementation/browser-rendering.md#saved-grouping-tool-pairing) |
| [`appendMarkdownBlocks`](../../../../src/clients/web/conversation.ts#L125) | Function | parent, entry, renderImage | [文字解释](implementation/browser-rendering.md#saved-grouping-tool-pairing) |
| [`thinkingPresentation`](../../../../src/clients/web/conversation.ts#L137) | Function | source | [文字解释](implementation/browser-rendering.md#message-thinking-context-rendering) |
| [`thinkingDisclosureKey`](../../../../src/clients/web/conversation.ts#L145) | Function | identity, contentIndex | [文字解释](implementation/browser-rendering.md#message-thinking-context-rendering) |
| [`thinkingDisclosure`](../../../../src/clients/web/conversation.ts#L149) | Function | text, key, entryId | [文字解释](implementation/browser-rendering.md#message-thinking-context-rendering) |
| [`renderLiveMessageBlock`](../../../../src/clients/web/conversation.ts#L164) | Function | message, block | [文字解释](implementation/browser-rendering.md#message-thinking-context-rendering) |
| [`thinkingDetails`](../../../../src/clients/web/conversation.ts#L193) | Function | entry, block, index | [文字解释](implementation/browser-rendering.md#message-thinking-context-rendering) |
| [`appendRawOutput`](../../../../src/clients/web/conversation.ts#L205) | Function | parent, entry, renderImage, blocks | [文字解释](implementation/browser-rendering.md#tool-disclosures-command-summaries) |
| [`bashCommand`](../../../../src/clients/web/conversation.ts#L226) | Function | call | [文字解释](implementation/browser-rendering.md#tool-disclosures-command-summaries) |
| [`toolRun`](../../../../src/clients/web/conversation.ts#L244) | Function | owner, call, result, renderImage, key, options | [文字解释](implementation/browser-rendering.md#tool-disclosures-command-summaries) |
| [`appendTruncated`](../../../../src/clients/web/conversation.ts#L309) | Function | parent, entry | [文字解释](implementation/browser-rendering.md#message-thinking-context-rendering) |
| [`renderUser`](../../../../src/clients/web/conversation.ts#L314) | Function | entry, renderImage | [文字解释](implementation/browser-rendering.md#message-thinking-context-rendering) |
| [`renderAssistant`](../../../../src/clients/web/conversation.ts#L326) | Function | entries, renderImage, liveTools | [文字解释](implementation/browser-rendering.md#message-thinking-context-rendering) |
| [`renderSpecial`](../../../../src/clients/web/conversation.ts#L410) | Function | entry, renderImage | [文字解释](implementation/browser-rendering.md#message-thinking-context-rendering) |
| [`renderContext`](../../../../src/clients/web/conversation.ts#L438) | Function | sources, truncated | [文字解释](implementation/browser-rendering.md#message-thinking-context-rendering) |
| [`renderSavedConversation`](../../../../src/clients/web/conversation.ts#L478) | Function | entries, contextSources, contextSourcesTruncated, renderImage, liveTools | [文字解释](implementation/browser-rendering.md#message-thinking-context-rendering) |
| [`SavedConversationRenderer`](../../../../src/clients/web/conversation.ts#L502) | Class |  | [文字解释](implementation/browser-rendering.md) |
| [`SavedConversationRenderer.#entries`](../../../../src/clients/web/conversation.ts#L503) | Property |  | [文字解释](implementation/browser-rendering.md) |
| [`SavedConversationRenderer.#groups`](../../../../src/clients/web/conversation.ts#L504) | Property |  | [文字解释](implementation/browser-rendering.md) |
| [`SavedConversationRenderer.#contextSources`](../../../../src/clients/web/conversation.ts#L505) | Property |  | [文字解释](implementation/browser-rendering.md) |
| [`SavedConversationRenderer.#contextTruncated`](../../../../src/clients/web/conversation.ts#L506) | Property |  | [文字解释](implementation/browser-rendering.md) |
| [`SavedConversationRenderer.#contextSignature`](../../../../src/clients/web/conversation.ts#L507) | Property |  | [文字解释](implementation/browser-rendering.md) |
| [`SavedConversationRenderer.#versions`](../../../../src/clients/web/conversation.ts#L508) | Property |  | [文字解释](implementation/browser-rendering.md) |
| [`SavedConversationRenderer.#serial`](../../../../src/clients/web/conversation.ts#L509) | Property |  | [文字解释](implementation/browser-rendering.md) |
| [`SavedConversationRenderer.clear`](../../../../src/clients/web/conversation.ts#L511) | Method |  | [文字解释](implementation/browser-rendering.md#saved-group-rendering-cache) |
| [`SavedConversationRenderer.render`](../../../../src/clients/web/conversation.ts#L517) | Method | entries, contextSources, contextSourcesTruncated, renderImage, liveTools | [文字解释](implementation/browser-rendering.md#saved-group-rendering-cache) |


## src/clients/web/dom.ts

文字解释：[browser-rendering](implementation/browser-rendering.md)

[查看源码](../../../../src/clients/web/dom.ts) · 128 行

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`elementIdentity`](../../../../src/clients/web/dom.ts#L3) | Function | element | [文字解释](implementation/browser-rendering.md#dom-identity-reconciliation) |
| [`compatible`](../../../../src/clients/web/dom.ts#L12) | Function | left, right | [文字解释](implementation/browser-rendering.md#dom-identity-reconciliation) |
| [`synchronizeAttributes`](../../../../src/clients/web/dom.ts#L19) | Function | current, desired | [文字解释](implementation/browser-rendering.md#dom-identity-reconciliation) |
| [`hasSamePreserveMarker`](../../../../src/clients/web/dom.ts#L29) | Function | current, desired | [文字解释](implementation/browser-rendering.md#dom-identity-reconciliation) |
| [`reconcileElement`](../../../../src/clients/web/dom.ts#L35) | Function | current, desired | [文字解释](implementation/browser-rendering.md#dom-identity-reconciliation) |
| [`reconcileChildren`](../../../../src/clients/web/dom.ts#L56) | Function | target, desired | [文字解释](implementation/browser-rendering.md#dom-identity-reconciliation) |


## src/clients/web/events.ts

文字解释：[browser-events](implementation/browser-events.md)

[查看源码](../../../../src/clients/web/events.ts) · 851 行

Local dependencies： [shared/events.ts](../../../../src/shared/events.ts), [shared/history.ts](../../../../src/shared/history.ts), [shared/sessions.ts](../../../../src/shared/sessions.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`MAX_SSE_FRAME_BYTES`](../../../../src/clients/web/events.ts#L13) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-events.md) |
| [`MAX_LIVE_MESSAGES`](../../../../src/clients/web/events.ts#L14) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-events.md) |
| [`MAX_LIVE_TOOLS`](../../../../src/clients/web/events.ts#L15) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-events.md) |
| [`MAX_LIVE_MESSAGE_BYTES`](../../../../src/clients/web/events.ts#L16) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-events.md) |
| [`ResyncReason`](../../../../src/clients/web/events.ts#L18) | TypeAlias |  | [文字解释](implementation/browser-events.md) |
| [`ConversationState`](../../../../src/clients/web/events.ts#L20) | Interface |  | [文字解释](implementation/browser-events.md) |
| [`SseDecodeErrorCode`](../../../../src/clients/web/events.ts#L43) | TypeAlias |  | [文字解释](implementation/browser-events.md) |
| [`SseDecodeError`](../../../../src/clients/web/events.ts#L51) | Class |  | [文字解释](implementation/browser-events.md) |
| [`SseDecodeError.code`](../../../../src/clients/web/events.ts#L52) | Property |  | [文字解释](implementation/browser-events.md) |
| [`SseDecodeError.constructor`](../../../../src/clients/web/events.ts#L54) | Constructor | code, message | [文字解释](implementation/browser-events.md#state-bounds-protocol-errors) |
| [`EventFields`](../../../../src/clients/web/events.ts#L61) | Interface |  | [文字解释](implementation/browser-events.md) |
| [`SSEDecoder`](../../../../src/clients/web/events.ts#L69) | Class |  | [文字解释](implementation/browser-events.md) |
| [`SSEDecoder.#line`](../../../../src/clients/web/events.ts#L70) | Property |  | [文字解释](implementation/browser-events.md) |
| [`SSEDecoder.#lineBytes`](../../../../src/clients/web/events.ts#L71) | Property |  | [文字解释](implementation/browser-events.md) |
| [`SSEDecoder.#pendingHighSurrogate`](../../../../src/clients/web/events.ts#L72) | Property |  | [文字解释](implementation/browser-events.md) |
| [`SSEDecoder.#pendingCR`](../../../../src/clients/web/events.ts#L73) | Property |  | [文字解释](implementation/browser-events.md) |
| [`SSEDecoder.#atStart`](../../../../src/clients/web/events.ts#L74) | Property |  | [文字解释](implementation/browser-events.md) |
| [`SSEDecoder.#fields`](../../../../src/clients/web/events.ts#L75) | Property |  | [文字解释](implementation/browser-events.md) |
| [`SSEDecoder.push`](../../../../src/clients/web/events.ts#L77) | Method | chunk | [文字解释](implementation/browser-events.md#incremental-sse-decoding) |
| [`SSEDecoder.#lineEnding`](../../../../src/clients/web/events.ts#L120) | Method | endingBytes, frames | [文字解释](implementation/browser-events.md#incremental-sse-decoding) |
| [`SSEDecoder.#dispatch`](../../../../src/clients/web/events.ts#L156) | Method |  | [文字解释](implementation/browser-events.md#incremental-sse-decoding) |
| [`SSEDecoder.#emptyFields`](../../../../src/clients/web/events.ts#L181) | Method |  | [文字解释](implementation/browser-events.md#incremental-sse-decoding) |
| [`SSEDecoder.#fail`](../../../../src/clients/web/events.ts#L185) | Method | code, message | [文字解释](implementation/browser-events.md#incremental-sse-decoding) |
| [`emptyConversationState`](../../../../src/clients/web/events.ts#L190) | Function | sessionId | [文字解释](implementation/browser-events.md#state-bounds-protocol-errors) |
| [`CursorParts`](../../../../src/clients/web/events.ts#L210) | Interface |  | [文字解释](implementation/browser-events.md) |
| [`cursorParts`](../../../../src/clients/web/events.ts#L216) | Function | cursor | [文字解释](implementation/browser-events.md#copying-state-joining-history-pages) |
| [`copyTurn`](../../../../src/clients/web/events.ts#L226) | Function | value | [文字解释](implementation/browser-events.md#copying-state-joining-history-pages) |
| [`copyMessage`](../../../../src/clients/web/events.ts#L231) | Function | value | [文字解释](implementation/browser-events.md#copying-state-joining-history-pages) |
| [`copyTool`](../../../../src/clients/web/events.ts#L246) | Function | value | [文字解释](implementation/browser-events.md#copying-state-joining-history-pages) |
| [`copyHistory`](../../../../src/clients/web/events.ts#L250) | Function | value | [文字解释](implementation/browser-events.md#copying-state-joining-history-pages) |
| [`mergeHistoryEntries`](../../../../src/clients/web/events.ts#L261) | Function | previous, incoming | [文字解释](implementation/browser-events.md#copying-state-joining-history-pages) |
| [`utf8Bytes`](../../../../src/clients/web/events.ts#L277) | Function | character | [文字解释](implementation/browser-events.md#copying-state-joining-history-pages) |
| [`isHighSurrogate`](../../../../src/clients/web/events.ts#L285) | Function | character | [文字解释](implementation/browser-events.md#copying-state-joining-history-pages) |
| [`isLowSurrogate`](../../../../src/clients/web/events.ts#L290) | Function | character | [文字解释](implementation/browser-events.md#copying-state-joining-history-pages) |
| [`isTerminal`](../../../../src/clients/web/events.ts#L295) | Function | status | [文字解释](implementation/browser-events.md#saved-history-coverage-snapshot-merging) |
| [`coveredLiveRun`](../../../../src/clients/web/events.ts#L304) | Function | history, liveRunId, activeTurn, latestTurn, nativeExecution | [文字解释](implementation/browser-events.md#saved-history-coverage-snapshot-merging) |
| [`applyCoveredHistory`](../../../../src/clients/web/events.ts#L323) | Function | state | [文字解释](implementation/browser-events.md#saved-history-coverage-snapshot-merging) |
| [`preserveCompatiblePrefix`](../../../../src/clients/web/events.ts#L343) | Function | previous, incoming, truncated | [文字解释](implementation/browser-events.md#saved-history-coverage-snapshot-merging) |
| [`mergeSnapshotMessage`](../../../../src/clients/web/events.ts#L352) | Function | previous, incoming | [文字解释](implementation/browser-events.md#saved-history-coverage-snapshot-merging) |
| [`copyMessageBlock`](../../../../src/clients/web/events.ts#L379) | Function | block | [文字解释](implementation/browser-events.md#saved-history-coverage-snapshot-merging) |
| [`mergeSnapshotTool`](../../../../src/clients/web/events.ts#L385) | Function | previous, incoming | [文字解释](implementation/browser-events.md#saved-history-coverage-snapshot-merging) |
| [`upsertSnapshotMessage`](../../../../src/clients/web/events.ts#L396) | Function | messages, value | [文字解释](implementation/browser-events.md#saved-history-coverage-snapshot-merging) |
| [`upsertSnapshotTool`](../../../../src/clients/web/events.ts#L412) | Function | tools, value | [文字解释](implementation/browser-events.md#saved-history-coverage-snapshot-merging) |
| [`snapshotState`](../../../../src/clients/web/events.ts#L425) | Function | state, frame | [文字解释](implementation/browser-events.md#saved-history-coverage-snapshot-merging) |
| [`upsertMessage`](../../../../src/clients/web/events.ts#L524) | Function | messages, value | [文字解释](implementation/browser-events.md#live-delta-accumulation) |
| [`appendDelta`](../../../../src/clients/web/events.ts#L544) | Function | messages, messageId, delta, truncated, blockDelta | [文字解释](implementation/browser-events.md#live-delta-accumulation) |
| [`messageThinkingBytes`](../../../../src/clients/web/events.ts#L639) | Function | message | [文字解释](implementation/browser-events.md#live-delta-accumulation) |
| [`upsertTool`](../../../../src/clients/web/events.ts#L647) | Function | tools, value | [文字解释](implementation/browser-events.md#live-delta-accumulation) |
| [`reduceFrame`](../../../../src/clients/web/events.ts#L666) | Function | state, frame | [文字解释](implementation/browser-events.md#event-reducer-branches-cursor-rules) |
| [`reconcileHistory`](../../../../src/clients/web/events.ts#L818) | Function | state, page | [文字解释](implementation/browser-events.md#event-reducer-branches-cursor-rules) |
| [`visibleLiveContent`](../../../../src/clients/web/events.ts#L826) | Function | state, entries | [文字解释](implementation/browser-events.md#event-reducer-branches-cursor-rules) |


## src/clients/web/icons.ts

文字解释：[browser-rendering](implementation/browser-rendering.md)

[查看源码](../../../../src/clients/web/icons.ts) · 43 行

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`ActionIcon`](../../../../src/clients/web/icons.ts#L3) | TypeAlias |  | [文字解释](implementation/browser-rendering.md) |
| [`actionIcon`](../../../../src/clients/web/icons.ts#L5) | Function | name | [文字解释](implementation/browser-rendering.md#tool-disclosures-command-summaries) |
| [`labelWithIcon`](../../../../src/clients/web/icons.ts#L31) | Function | button, text, name, leading | [文字解释](implementation/browser-rendering.md#tool-disclosures-command-summaries) |


## src/clients/web/input.ts

文字解释：[browser-input](implementation/browser-input.md)

[查看源码](../../../../src/clients/web/input.ts) · 306 行

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`BackspaceHold`](../../../../src/clients/web/input.ts#L3) | Interface |  | [文字解释](implementation/browser-input.md) |
| [`MAX_HEIGHT_PX`](../../../../src/clients/web/input.ts#L9) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-input.md) |
| [`MIN_HEIGHT_PX`](../../../../src/clients/web/input.ts#L10) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-input.md) |
| [`VIEWPORT_HEIGHT_RATIO`](../../../../src/clients/web/input.ts#L11) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-input.md) |
| [`setupComposer`](../../../../src/clients/web/input.ts#L13) | Function | input, form, scroll | [文字解释](implementation/browser-input.md#composer-sizing-and-viewport-adaptation) |
| [`setupComposer.dispose`](../../../../src/clients/web/input.ts#L277) | Method | — | [文字解释](implementation/browser-input.md#cleanup-current-test-boundary) |


## src/clients/web/markdown.ts

文字解释：[browser-rendering](implementation/browser-rendering.md)

[查看源码](../../../../src/clients/web/markdown.ts) · 168 行

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`record`](../../../../src/clients/web/markdown.ts#L4) | Function | value | [文字解释](implementation/browser-rendering.md#markdown-explicit-dom) |
| [`text`](../../../../src/clients/web/markdown.ts#L9) | Function | value | [文字解释](implementation/browser-rendering.md#markdown-explicit-dom) |
| [`entities`](../../../../src/clients/web/markdown.ts#L12) | Function | value | [文字解释](implementation/browser-rendering.md#markdown-explicit-dom) |
| [`safeLink`](../../../../src/clients/web/markdown.ts#L33) | Function | value | [文字解释](implementation/browser-rendering.md#markdown-explicit-dom) |
| [`renderMarkdown`](../../../../src/clients/web/markdown.ts#L42) | Function | parent, source | [文字解释](implementation/browser-rendering.md#markdown-explicit-dom) |


## src/clients/web/page.ts

文字解释：[browser-rendering](implementation/browser-rendering.md)

[查看源码](../../../../src/clients/web/page.ts) · 963 行

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`HOST_PAGE`](../../../../src/clients/web/page.ts#L1) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-rendering.md) |
| [`STYLE`](../../../../src/clients/web/page.ts#L191) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-rendering.md) |


## src/clients/web/script.ts

文字解释：[browser-rendering](implementation/browser-rendering.md)

[查看源码](../../../../src/clients/web/script.ts) · 39 行

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`modules`](../../../../src/clients/web/script.ts#L6) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-rendering.md) |
| [`BROWSER_ASSETS`](../../../../src/clients/web/script.ts#L27) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-rendering.md) |
| [`BROWSER_SCRIPT`](../../../../src/clients/web/script.ts#L39) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-rendering.md) |


## src/clients/web/tool-command.ts

文字解释：[browser-rendering](implementation/browser-rendering.md)

[查看源码](../../../../src/clients/web/tool-command.ts) · 46 行

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`CommandPresentation`](../../../../src/clients/web/tool-command.ts#L3) | Interface |  | [文字解释](implementation/browser-rendering.md) |
| [`commandLines`](../../../../src/clients/web/tool-command.ts#L9) | Function | command | [文字解释](implementation/browser-rendering.md#tool-disclosures-command-summaries) |
| [`commandPresentation`](../../../../src/clients/web/tool-command.ts#L15) | Function | command | [文字解释](implementation/browser-rendering.md#tool-disclosures-command-summaries) |
| [`appendToolCommand`](../../../../src/clients/web/tool-command.ts#L28) | Function | summary, command | [文字解释](implementation/browser-rendering.md#tool-disclosures-command-summaries) |


## src/clients/web/transport.ts

文字解释：[browser-controller](implementation/browser-controller.md)

[查看源码](../../../../src/clients/web/transport.ts) · 85 行

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`BINDING_KEY`](../../../../src/clients/web/transport.ts#L2) | Module value | 由 initializer 推断 | [文字解释](implementation/browser-controller.md) |
| [`ApiError`](../../../../src/clients/web/transport.ts#L3) | Class |  | [文字解释](implementation/browser-controller.md) |
| [`ApiError.status`](../../../../src/clients/web/transport.ts#L4) | Property |  | [文字解释](implementation/browser-controller.md) |
| [`ApiError.code`](../../../../src/clients/web/transport.ts#L5) | Property |  | [文字解释](implementation/browser-controller.md) |
| [`ApiError.constructor`](../../../../src/clients/web/transport.ts#L6) | Constructor | status, code, message | [文字解释](implementation/browser-controller.md#browser-http-transport) |
| [`binding`](../../../../src/clients/web/transport.ts#L12) | Function | create | [文字解释](implementation/browser-controller.md#browser-http-transport) |
| [`headers`](../../../../src/clients/web/transport.ts#L33) | Function |  | [文字解释](implementation/browser-controller.md#browser-http-transport) |
| [`responseError`](../../../../src/clients/web/transport.ts#L39) | Function | response | [文字解释](implementation/browser-controller.md#browser-http-transport) |
| [`api`](../../../../src/clients/web/transport.ts#L60) | Function | path, body | [文字解释](implementation/browser-controller.md#browser-http-transport) |
| [`message`](../../../../src/clients/web/transport.ts#L83) | Function | error | [文字解释](implementation/browser-controller.md#browser-http-transport) |


## src/local/files.ts

文字解释：[cli](implementation/cli.md)

[查看源码](../../../../src/local/files.ts) · 84 行

Local dependencies： [local/paths.ts](../../../../src/local/paths.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`prepareDataDirectory`](../../../../src/local/files.ts#L7) | Function | path | [文字解释](implementation/cli.md#data-directory-policy) |
| [`readPrivateFile`](../../../../src/local/files.ts#L17) | Function | path | [文字解释](implementation/cli.md#private-file-operations) |
| [`createPrivateFile`](../../../../src/local/files.ts#L38) | Function | path, contents | [文字解释](implementation/cli.md#private-file-operations) |
| [`replacePrivateFile`](../../../../src/local/files.ts#L52) | Function | path, contents | [文字解释](implementation/cli.md#private-file-operations) |
| [`readCredential`](../../../../src/local/files.ts#L70) | Function | dataDir | [文字解释](implementation/cli.md#private-file-operations) |


## src/local/paths.ts

文字解释：[cli](implementation/cli.md)

[查看源码](../../../../src/local/paths.ts) · 50 行

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`HostMode`](../../../../src/local/paths.ts#L5) | TypeAlias |  | [文字解释](implementation/cli.md) |
| [`dataDirectory`](../../../../src/local/paths.ts#L7) | Function | mode | [文字解释](implementation/cli.md#data-directory-policy) |
| [`hasCode`](../../../../src/local/paths.ts#L11) | Function | error, code | [文字解释](implementation/cli.md#data-directory-policy) |
| [`canonicalDestination`](../../../../src/local/paths.ts#L15) | Function | path | [文字解释](implementation/cli.md#data-directory-policy) |
| [`validateDataDirectory`](../../../../src/local/paths.ts#L27) | Function | path | [文字解释](implementation/cli.md#data-directory-policy) |


## src/runtime/message-identity.ts

文字解释：[history](implementation/history.md)

[查看源码](../../../../src/runtime/message-identity.ts) · 52 行

Local dependencies： [runtime/pi-process.ts](../../../../src/runtime/pi-process.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`canonical`](../../../../src/runtime/message-identity.ts#L5) | Function | value, depth | [文字解释](implementation/history.md#assistant-message-identity) |
| [`nextMessageKey`](../../../../src/runtime/message-identity.ts#L17) | Function | message, counts | [文字解释](implementation/history.md#assistant-message-identity) |
| [`savedMessageKeys`](../../../../src/runtime/message-identity.ts#L32) | Function | entries | [文字解释](implementation/history.md#assistant-message-identity) |


## src/runtime/pi-history-budget.ts

文字解释：[history](implementation/history.md)

[查看源码](../../../../src/runtime/pi-history-budget.ts) · 101 行

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`MAX_ACTIVE_READS`](../../../../src/runtime/pi-history-budget.ts#L1) | Module value | 由 initializer 推断 | [文字解释](implementation/history.md) |
| [`MAX_QUEUED_READS`](../../../../src/runtime/pi-history-budget.ts#L2) | Module value | 由 initializer 推断 | [文字解释](implementation/history.md) |
| [`HistoryReadBudgetError`](../../../../src/runtime/pi-history-budget.ts#L4) | Class |  | [文字解释](implementation/history.md) |
| [`HistoryReadBudgetError.constructor`](../../../../src/runtime/pi-history-budget.ts#L5) | Constructor |  | [文字解释](implementation/history.md#history-scan-budget) |
| [`Waiter`](../../../../src/runtime/pi-history-budget.ts#L11) | Interface |  | [文字解释](implementation/history.md) |
| [`abortError`](../../../../src/runtime/pi-history-budget.ts#L17) | Function |  | [文字解释](implementation/history.md#history-scan-budget) |
| [`HistoryReadBudget`](../../../../src/runtime/pi-history-budget.ts#L23) | Class |  | [文字解释](implementation/history.md) |
| [`HistoryReadBudget.#active`](../../../../src/runtime/pi-history-budget.ts#L24) | Property |  | [文字解释](implementation/history.md) |
| [`HistoryReadBudget.#queue`](../../../../src/runtime/pi-history-budget.ts#L25) | Property |  | [文字解释](implementation/history.md) |
| [`HistoryReadBudget.run`](../../../../src/runtime/pi-history-budget.ts#L27) | Method | operation, signal, { cancelQueuedOnly = false } | [文字解释](implementation/history.md#history-scan-budget) |
| [`HistoryReadBudget.#release`](../../../../src/runtime/pi-history-budget.ts#L73) | Method |  | [文字解释](implementation/history.md#history-scan-budget) |
| [`historyReadBudget`](../../../../src/runtime/pi-history-budget.ts#L92) | Module value | 由 initializer 推断 | [文字解释](implementation/history.md) |
| [`runWithHistoryReadBudget`](../../../../src/runtime/pi-history-budget.ts#L95) | Function | operation, signal, options | [文字解释](implementation/history.md#history-scan-budget) |


## src/runtime/pi-history.ts

文字解释：[history](implementation/history.md)

[查看源码](../../../../src/runtime/pi-history.ts) · 348 行

Local dependencies： [runtime/pi-history-budget.ts](../../../../src/runtime/pi-history-budget.ts), [runtime/pi-process.ts](../../../../src/runtime/pi-process.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`MAX_SOURCE_BYTES`](../../../../src/runtime/pi-history.ts#L7) | Module value | 由 initializer 推断 | [文字解释](implementation/history.md) |
| [`MAX_RECORD_BYTES`](../../../../src/runtime/pi-history.ts#L8) | Module value | 由 initializer 推断 | [文字解释](implementation/history.md) |
| [`MAX_ENTRIES`](../../../../src/runtime/pi-history.ts#L9) | Module value | 由 initializer 推断 | [文字解释](implementation/history.md) |
| [`MAX_NATIVE_ID_BYTES`](../../../../src/runtime/pi-history.ts#L10) | Module value | 由 initializer 推断 | [文字解释](implementation/history.md) |
| [`MAX_TIMESTAMP_BYTES`](../../../../src/runtime/pi-history.ts#L11) | Module value | 由 initializer 推断 | [文字解释](implementation/history.md) |
| [`READ_CHUNK_BYTES`](../../../../src/runtime/pi-history.ts#L12) | Module value | 由 initializer 推断 | [文字解释](implementation/history.md) |
| [`REVISION_PATTERN`](../../../../src/runtime/pi-history.ts#L13) | Module value | 由 initializer 推断 | [文字解释](implementation/history.md) |
| [`HistoryReadError`](../../../../src/runtime/pi-history.ts#L15) | Class |  | [文字解释](implementation/history.md) |
| [`HistoryReadError.status`](../../../../src/runtime/pi-history.ts#L16) | Property |  | [文字解释](implementation/history.md) |
| [`HistoryReadError.code`](../../../../src/runtime/pi-history.ts#L17) | Property |  | [文字解释](implementation/history.md) |
| [`HistoryReadError.constructor`](../../../../src/runtime/pi-history.ts#L19) | Constructor | status, code, message | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`HistoryPrefix`](../../../../src/runtime/pi-history.ts#L27) | Interface |  | [文字解释](implementation/history.md) |
| [`SavedHistory`](../../../../src/runtime/pi-history.ts#L32) | Interface |  | [文字解释](implementation/history.md) |
| [`SavedHistoryReadOptions`](../../../../src/runtime/pi-history.ts#L40) | Interface |  | [文字解释](implementation/history.md) |
| [`changed`](../../../../src/runtime/pi-history.ts#L50) | Function |  | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`invalid`](../../../../src/runtime/pi-history.ts#L54) | Function |  | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`unavailable`](../../../../src/runtime/pi-history.ts#L58) | Function |  | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`overLimit`](../../../../src/runtime/pi-history.ts#L62) | Function |  | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`busy`](../../../../src/runtime/pi-history.ts#L70) | Function |  | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`isRecord`](../../../../src/runtime/pi-history.ts#L78) | Function | value | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`errorCode`](../../../../src/runtime/pi-history.ts#L82) | Function | error | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`openError`](../../../../src/runtime/pi-history.ts#L88) | Function | error, hasPrefix | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`validatePrefix`](../../../../src/runtime/pi-history.ts#L96) | Function | prefix | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`sameIdentity`](../../../../src/runtime/pi-history.ts#L105) | Function | first, second | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`sameReadMetadata`](../../../../src/runtime/pi-history.ts#L112) | Function | first, second | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`assertSafeFile`](../../../../src/runtime/pi-history.ts#L123) | Function | info | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`assertPathIdentity`](../../../../src/runtime/pi-history.ts#L129) | Function | file, identity, hasPrefix | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`readBoundary`](../../../../src/runtime/pi-history.ts#L141) | Function | handle, byteLength | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`validTimestamp`](../../../../src/runtime/pi-history.ts#L161) | Function | value | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`parseRecord`](../../../../src/runtime/pi-history.ts#L173) | Function | buffer | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`parseEntries`](../../../../src/runtime/pi-history.ts#L193) | Function | content, completeBytes, options | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`makeRevision`](../../../../src/runtime/pi-history.ts#L254) | Function | dev, ino, content | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`completedBytes`](../../../../src/runtime/pi-history.ts#L266) | Function | content | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`readSavedHistorySnapshot`](../../../../src/runtime/pi-history.ts#L270) | Function | options, prefixBytes | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |
| [`readSavedHistory`](../../../../src/runtime/pi-history.ts#L336) | Function | options | [文字解释](implementation/history.md#native-jsonl-snapshot-and-validation) |


## src/runtime/pi-models.ts

文字解释：[runtime](implementation/runtime.md)

[查看源码](../../../../src/runtime/pi-models.ts) · 57 行

Local dependencies： [shared/discovery.ts](../../../../src/shared/discovery.ts), [shared/thinking.ts](../../../../src/shared/thinking.ts), [runtime/pi-rpc.ts](../../../../src/runtime/pi-rpc.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`parsePiSessionModels`](../../../../src/runtime/pi-models.ts#L6) | Function | value | [文字解释](implementation/runtime.md#runtime-model-and-context-operations) |


## src/runtime/pi-process.ts

文字解释：[runtime](implementation/runtime.md)

[查看源码](../../../../src/runtime/pi-process.ts) · 936 行

Local dependencies： [local/paths.ts](../../../../src/local/paths.ts), [shared/discovery.ts](../../../../src/shared/discovery.ts), [shared/images.ts](../../../../src/shared/images.ts), [shared/sessions.ts](../../../../src/shared/sessions.ts), [shared/thinking.ts](../../../../src/shared/thinking.ts), [runtime/pi-models.ts](../../../../src/runtime/pi-models.ts), [runtime/pi-rpc.ts](../../../../src/runtime/pi-rpc.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`exec`](../../../../src/runtime/pi-process.ts#L18) | Module value | 由 initializer 推断 | [文字解释](implementation/runtime.md) |
| [`SUPPORTED_PI_VERSION`](../../../../src/runtime/pi-process.ts#L19) | Module value | 由 initializer 推断 | [文字解释](implementation/runtime.md) |
| [`RuntimeState`](../../../../src/runtime/pi-process.ts#L20) | TypeAlias |  | [文字解释](implementation/runtime.md) |
| [`PiOptions`](../../../../src/runtime/pi-process.ts#L21) | Interface |  | [文字解释](implementation/runtime.md) |
| [`SessionState`](../../../../src/runtime/pi-process.ts#L41) | Interface |  | [文字解释](implementation/runtime.md) |
| [`RunResult`](../../../../src/runtime/pi-process.ts#L51) | Interface |  | [文字解释](implementation/runtime.md) |
| [`NativeExecutionResult`](../../../../src/runtime/pi-process.ts#L55) | TypeAlias |  | [文字解释](implementation/runtime.md) |
| [`ActiveExecution`](../../../../src/runtime/pi-process.ts#L59) | TypeAlias |  | [文字解释](implementation/runtime.md) |
| [`NativeExecutionEvent`](../../../../src/runtime/pi-process.ts#L61) | TypeAlias |  | [文字解释](implementation/runtime.md) |
| [`PiEntry`](../../../../src/runtime/pi-process.ts#L64) | TypeAlias |  | [文字解释](implementation/runtime.md) |
| [`Listener`](../../../../src/runtime/pi-process.ts#L69) | TypeAlias |  | [文字解释](implementation/runtime.md) |
| [`StateListener`](../../../../src/runtime/pi-process.ts#L70) | TypeAlias |  | [文字解释](implementation/runtime.md) |
| [`NativeExecutionListener`](../../../../src/runtime/pi-process.ts#L71) | TypeAlias |  | [文字解释](implementation/runtime.md) |
| [`Subscription`](../../../../src/runtime/pi-process.ts#L72) | Interface |  | [文字解释](implementation/runtime.md) |
| [`Run`](../../../../src/runtime/pi-process.ts#L76) | Interface |  | [文字解释](implementation/runtime.md) |
| [`NativeRun`](../../../../src/runtime/pi-process.ts#L88) | Interface |  | [文字解释](implementation/runtime.md) |
| [`ActiveRun`](../../../../src/runtime/pi-process.ts#L94) | TypeAlias |  | [文字解释](implementation/runtime.md) |
| [`UiResponse`](../../../../src/runtime/pi-process.ts#L95) | TypeAlias |  | [文字解释](implementation/runtime.md) |
| [`sessionState`](../../../../src/runtime/pi-process.ts#L101) | Function | value | [文字解释](implementation/runtime.md#runtime-types-and-boundary-validation) |
| [`isSelectedModel`](../../../../src/runtime/pi-process.ts#L135) | Function | value | [文字解释](implementation/runtime.md#runtime-types-and-boundary-validation) |
| [`sessionEntries`](../../../../src/runtime/pi-process.ts#L145) | Function | value | [文字解释](implementation/runtime.md#runtime-types-and-boundary-validation) |
| [`verifyPiConfiguration`](../../../../src/runtime/pi-process.ts#L174) | Function | configuration, cwd, env, timeout | [文字解释](implementation/runtime.md#runtime-types-and-boundary-validation) |
| [`PiProcess`](../../../../src/runtime/pi-process.ts#L217) | Class |  | [文字解释](implementation/runtime.md) |
| [`PiProcess.#state`](../../../../src/runtime/pi-process.ts#L218) | Property |  | [文字解释](implementation/runtime.md) |
| [`PiProcess.#child`](../../../../src/runtime/pi-process.ts#L219) | Property |  | [文字解释](implementation/runtime.md) |
| [`PiProcess.#rpc`](../../../../src/runtime/pi-process.ts#L220) | Property |  | [文字解释](implementation/runtime.md) |
| [`PiProcess.#listeners`](../../../../src/runtime/pi-process.ts#L221) | Property |  | [文字解释](implementation/runtime.md) |
| [`PiProcess.#stateListeners`](../../../../src/runtime/pi-process.ts#L222) | Property |  | [文字解释](implementation/runtime.md) |
| [`PiProcess.#nativeExecutionListeners`](../../../../src/runtime/pi-process.ts#L223) | Property |  | [文字解释](implementation/runtime.md) |
| [`PiProcess.#dialogs`](../../../../src/runtime/pi-process.ts#L224) | Property |  | [文字解释](implementation/runtime.md) |
| [`PiProcess.#requestMs`](../../../../src/runtime/pi-process.ts#L225) | Property |  | [文字解释](implementation/runtime.md) |
| [`PiProcess.#shutdownMs`](../../../../src/runtime/pi-process.ts#L226) | Property |  | [文字解释](implementation/runtime.md) |
| [`PiProcess.#closed`](../../../../src/runtime/pi-process.ts#L227) | Property |  | [文字解释](implementation/runtime.md) |
| [`PiProcess.#stderr`](../../../../src/runtime/pi-process.ts#L228) | Property |  | [文字解释](implementation/runtime.md) |
| [`PiProcess.#run`](../../../../src/runtime/pi-process.ts#L229) | Property |  | [文字解释](implementation/runtime.md) |
| [`PiProcess.#lastNativeExecution`](../../../../src/runtime/pi-process.ts#L230) | Property |  | [文字解释](implementation/runtime.md) |
| [`PiProcess.#stopping`](../../../../src/runtime/pi-process.ts#L231) | Property |  | [文字解释](implementation/runtime.md) |
| [`PiProcess.#error`](../../../../src/runtime/pi-process.ts#L232) | Property |  | [文字解释](implementation/runtime.md) |
| [`PiProcess.constructor`](../../../../src/runtime/pi-process.ts#L234) | Constructor | child, requestMs, shutdownMs | [文字解释](implementation/runtime.md#runtime-startup-and-session-handshake) |
| [`PiProcess.start`](../../../../src/runtime/pi-process.ts#L276) | Method | options | [文字解释](implementation/runtime.md#runtime-startup-and-session-handshake) |
| [`PiProcess.state`](../../../../src/runtime/pi-process.ts#L400) | GetAccessor |  | [文字解释](implementation/runtime.md#runtime-observation-and-process-state) |
| [`PiProcess.pid`](../../../../src/runtime/pi-process.ts#L403) | GetAccessor |  | [文字解释](implementation/runtime.md#runtime-observation-and-process-state) |
| [`PiProcess.stderrTail`](../../../../src/runtime/pi-process.ts#L406) | GetAccessor |  | [文字解释](implementation/runtime.md#runtime-observation-and-process-state) |
| [`PiProcess.activeExecution`](../../../../src/runtime/pi-process.ts#L410) | GetAccessor |  | [文字解释](implementation/runtime.md#runtime-observation-and-process-state) |
| [`PiProcess.subscribe`](../../../../src/runtime/pi-process.ts#L418) | Method | listener, options | [文字解释](implementation/runtime.md#runtime-observation-and-process-state) |
| [`PiProcess.subscribeState`](../../../../src/runtime/pi-process.ts#L427) | Method | listener | [文字解释](implementation/runtime.md#runtime-observation-and-process-state) |
| [`PiProcess.subscribeNativeExecution`](../../../../src/runtime/pi-process.ts#L433) | Method | listener | [文字解释](implementation/runtime.md#runtime-observation-and-process-state) |
| [`PiProcess.getState`](../../../../src/runtime/pi-process.ts#L446) | Method |  | [文字解释](implementation/runtime.md#runtime-observation-and-process-state) |
| [`PiProcess.getAvailableModels`](../../../../src/runtime/pi-process.ts#L456) | Method |  | [文字解释](implementation/runtime.md#runtime-model-and-context-operations) |
| [`PiProcess.getAvailableThinkingLevels`](../../../../src/runtime/pi-process.ts#L462) | Method |  | [文字解释](implementation/runtime.md#runtime-model-and-context-operations) |
| [`PiProcess.setThinkingLevel`](../../../../src/runtime/pi-process.ts#L485) | Method | level | [文字解释](implementation/runtime.md#runtime-model-and-context-operations) |
| [`PiProcess.setModel`](../../../../src/runtime/pi-process.ts#L494) | Method | provider, model | [文字解释](implementation/runtime.md#runtime-model-and-context-operations) |
| [`PiProcess.getMessages`](../../../../src/runtime/pi-process.ts#L523) | Method |  | [文字解释](implementation/runtime.md#runtime-model-and-context-operations) |
| [`PiProcess.getEntries`](../../../../src/runtime/pi-process.ts#L539) | Method |  | [文字解释](implementation/runtime.md#runtime-model-and-context-operations) |
| [`PiProcess.supportsImages`](../../../../src/runtime/pi-process.ts#L549) | Method |  | [文字解释](implementation/runtime.md#runtime-model-and-context-operations) |
| [`PiProcess.startRun`](../../../../src/runtime/pi-process.ts#L585) | Method | message, images | [文字解释](implementation/runtime.md#runtime-dwell-run-lifecycle) |
| [`PiProcess.run`](../../../../src/runtime/pi-process.ts#L655) | Method | message | [文字解释](implementation/runtime.md#runtime-dwell-run-lifecycle) |
| [`PiProcess.abort`](../../../../src/runtime/pi-process.ts#L661) | Method |  | [文字解释](implementation/runtime.md#runtime-dwell-run-lifecycle) |
| [`PiProcess.respondToUi`](../../../../src/runtime/pi-process.ts#L666) | Method | response | [文字解释](implementation/runtime.md#runtime-extension-dialogs-and-shutdown) |
| [`PiProcess.stop`](../../../../src/runtime/pi-process.ts#L689) | Method |  | [文字解释](implementation/runtime.md#runtime-extension-dialogs-and-shutdown) |
| [`PiProcess.#stop`](../../../../src/runtime/pi-process.ts#L694) | Method |  | [文字解释](implementation/runtime.md#runtime-extension-dialogs-and-shutdown) |
| [`PiProcess.#finish`](../../../../src/runtime/pi-process.ts#L712) | Method | run, result | [文字解释](implementation/runtime.md#runtime-dwell-run-lifecycle) |
| [`PiProcess.#rejectRun`](../../../../src/runtime/pi-process.ts#L720) | Method | run, error | [文字解释](implementation/runtime.md#runtime-dwell-run-lifecycle) |
| [`PiProcess.#fail`](../../../../src/runtime/pi-process.ts#L728) | Method | error | [文字解释](implementation/runtime.md#runtime-dwell-run-lifecycle) |
| [`PiProcess.#onRecord`](../../../../src/runtime/pi-process.ts#L737) | Method | record | [文字解释](implementation/runtime.md#runtime-rpc-events-and-native-execution) |
| [`PiProcess.#setState`](../../../../src/runtime/pi-process.ts#L791) | Method | state | [文字解释](implementation/runtime.md#runtime-observation-and-process-state) |
| [`PiProcess.#beginNativeRun`](../../../../src/runtime/pi-process.ts#L799) | Method |  | [文字解释](implementation/runtime.md#runtime-rpc-events-and-native-execution) |
| [`PiProcess.#finishNativeRun`](../../../../src/runtime/pi-process.ts#L807) | Method | run, result | [文字解释](implementation/runtime.md#runtime-rpc-events-and-native-execution) |
| [`PiProcess.#transferHandledRun`](../../../../src/runtime/pi-process.ts#L815) | Method | run | [文字解释](implementation/runtime.md#runtime-rpc-events-and-native-execution) |
| [`PiProcess.#interruptRun`](../../../../src/runtime/pi-process.ts#L842) | Method | error | [文字解释](implementation/runtime.md#runtime-rpc-events-and-native-execution) |
| [`PiProcess.#publishNativeExecution`](../../../../src/runtime/pi-process.ts#L858) | Method | event | [文字解释](implementation/runtime.md#runtime-rpc-events-and-native-execution) |
| [`PiProcess.#notifyNativeExecutionListener`](../../../../src/runtime/pi-process.ts#L864) | Method | listener, event | [文字解释](implementation/runtime.md#runtime-observation-and-process-state) |
| [`PiProcess.#notifyStateListener`](../../../../src/runtime/pi-process.ts#L876) | Method | listener, state | [文字解释](implementation/runtime.md#runtime-observation-and-process-state) |
| [`PiProcess.#hasInteractiveObservers`](../../../../src/runtime/pi-process.ts#L885) | Method |  | [文字解释](implementation/runtime.md#runtime-extension-dialogs-and-shutdown) |
| [`PiProcess.#cancelDialogs`](../../../../src/runtime/pi-process.ts#L889) | Method |  | [文字解释](implementation/runtime.md#runtime-extension-dialogs-and-shutdown) |
| [`PiProcess.#uiRequest`](../../../../src/runtime/pi-process.ts#L894) | Method | record | [文字解释](implementation/runtime.md#runtime-extension-dialogs-and-shutdown) |
| [`PiProcess.#clearDialogs`](../../../../src/runtime/pi-process.ts#L932) | Method |  | [文字解释](implementation/runtime.md#runtime-extension-dialogs-and-shutdown) |


## src/runtime/pi-rpc.ts

文字解释：[rpc](implementation/rpc.md)

[查看源码](../../../../src/runtime/pi-rpc.ts) · 176 行

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`RpcRecord`](../../../../src/runtime/pi-rpc.ts#L4) | TypeAlias |  | [文字解释](implementation/rpc.md) |
| [`RpcCommandError`](../../../../src/runtime/pi-rpc.ts#L7) | Class |  | [文字解释](implementation/rpc.md) |
| [`RpcCommandError.command`](../../../../src/runtime/pi-rpc.ts#L8) | Property |  | [文字解释](implementation/rpc.md) |
| [`RpcCommandError.rejection`](../../../../src/runtime/pi-rpc.ts#L9) | Property |  | [文字解释](implementation/rpc.md) |
| [`RpcCommandError.constructor`](../../../../src/runtime/pi-rpc.ts#L11) | Constructor | command, rejection | [文字解释](implementation/rpc.md#rpc-errors-and-record-narrowing) |
| [`isRecord`](../../../../src/runtime/pi-rpc.ts#L19) | Function | value | [文字解释](implementation/rpc.md#rpc-errors-and-record-narrowing) |
| [`Pending`](../../../../src/runtime/pi-rpc.ts#L23) | Interface |  | [文字解释](implementation/rpc.md) |
| [`PiRpc`](../../../../src/runtime/pi-rpc.ts#L31) | Class |  | [文字解释](implementation/rpc.md) |
| [`PiRpc.#input`](../../../../src/runtime/pi-rpc.ts#L32) | Property |  | [文字解释](implementation/rpc.md) |
| [`PiRpc.#record`](../../../../src/runtime/pi-rpc.ts#L33) | Property |  | [文字解释](implementation/rpc.md) |
| [`PiRpc.#failure`](../../../../src/runtime/pi-rpc.ts#L34) | Property |  | [文字解释](implementation/rpc.md) |
| [`PiRpc.#timeout`](../../../../src/runtime/pi-rpc.ts#L35) | Property |  | [文字解释](implementation/rpc.md) |
| [`PiRpc.#pending`](../../../../src/runtime/pi-rpc.ts#L36) | Property |  | [文字解释](implementation/rpc.md) |
| [`PiRpc.#decoder`](../../../../src/runtime/pi-rpc.ts#L37) | Property |  | [文字解释](implementation/rpc.md) |
| [`PiRpc.#buffer`](../../../../src/runtime/pi-rpc.ts#L38) | Property |  | [文字解释](implementation/rpc.md) |
| [`PiRpc.#nextId`](../../../../src/runtime/pi-rpc.ts#L39) | Property |  | [文字解释](implementation/rpc.md) |
| [`PiRpc.#closed`](../../../../src/runtime/pi-rpc.ts#L40) | Property |  | [文字解释](implementation/rpc.md) |
| [`PiRpc.#writes`](../../../../src/runtime/pi-rpc.ts#L41) | Property |  | [文字解释](implementation/rpc.md) |
| [`PiRpc.#queuedBytes`](../../../../src/runtime/pi-rpc.ts#L42) | Property |  | [文字解释](implementation/rpc.md) |
| [`PiRpc.constructor`](../../../../src/runtime/pi-rpc.ts#L44) | Constructor | input, output, timeout, record, failure | [文字解释](implementation/rpc.md#rpc-construction-and-request-admission) |
| [`PiRpc.request`](../../../../src/runtime/pi-rpc.ts#L66) | Method | command, fields | [文字解释](implementation/rpc.md#rpc-construction-and-request-admission) |
| [`PiRpc.write`](../../../../src/runtime/pi-rpc.ts#L82) | Method | record | [文字解释](implementation/rpc.md#rpc-construction-and-request-admission) |
| [`PiRpc.close`](../../../../src/runtime/pi-rpc.ts#L107) | Method | error | [文字解释](implementation/rpc.md#rpc-close-and-failure) |
| [`PiRpc.fail`](../../../../src/runtime/pi-rpc.ts#L118) | Method | error | [文字解释](implementation/rpc.md#rpc-close-and-failure) |
| [`PiRpc.#read`](../../../../src/runtime/pi-rpc.ts#L124) | Method | chunk | [文字解释](implementation/rpc.md#rpc-jsonl-decoding-and-response-correlation) |
| [`PiRpc.#response`](../../../../src/runtime/pi-rpc.ts#L155) | Method | value | [文字解释](implementation/rpc.md#rpc-jsonl-decoding-and-response-correlation) |


## src/server/access.ts

文字解释：[authentication](implementation/authentication.md)

[查看源码](../../../../src/server/access.ts) · 96 行

Local dependencies： [local/files.ts](../../../../src/local/files.ts), [local/paths.ts](../../../../src/local/paths.ts), [server/auth.ts](../../../../src/server/auth.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`readBrowserOrigin`](../../../../src/server/access.ts#L8) | Function | dataDir, mode | [文字解释](implementation/authentication.md#authority-and-cookies) |
| [`RequestAccess`](../../../../src/server/access.ts#L58) | Interface |  | [文字解释](implementation/authentication.md) |
| [`requestAccess`](../../../../src/server/access.ts#L65) | Function | headers, localOrigin, browserOrigin, mode | [文字解释](implementation/authentication.md#authority-and-cookies) |
| [`browserCookie`](../../../../src/server/access.ts#L94) | Function | access, token, maxAge | [文字解释](implementation/authentication.md#authority-and-cookies) |


## src/server/auth.ts

文字解释：[authentication](implementation/authentication.md)

[查看源码](../../../../src/server/auth.ts) · 263 行

Local dependencies： [local/files.ts](../../../../src/local/files.ts), [local/paths.ts](../../../../src/local/paths.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`PAIRING_MS`](../../../../src/server/auth.ts#L12) | Module value | 由 initializer 推断 | [文字解释](implementation/authentication.md) |
| [`SESSION_MS`](../../../../src/server/auth.ts#L13) | Module value | 由 initializer 推断 | [文字解释](implementation/authentication.md) |
| [`MAX_SESSIONS`](../../../../src/server/auth.ts#L14) | Module value | 由 initializer 推断 | [文字解释](implementation/authentication.md) |
| [`PAIRING_ALPHABET`](../../../../src/server/auth.ts#L15) | Module value | 由 initializer 推断 | [文字解释](implementation/authentication.md) |
| [`BrowserSession`](../../../../src/server/auth.ts#L16) | Interface |  | [文字解释](implementation/authentication.md) |
| [`AccessError`](../../../../src/server/auth.ts#L22) | Class |  | [文字解释](implementation/authentication.md) |
| [`AccessError.status`](../../../../src/server/auth.ts#L23) | Property |  | [文字解释](implementation/authentication.md) |
| [`AccessError.code`](../../../../src/server/auth.ts#L24) | Property |  | [文字解释](implementation/authentication.md) |
| [`AccessError.constructor`](../../../../src/server/auth.ts#L25) | Constructor | status, code, message | [文字解释](implementation/authentication.md#browser-session-auth) |
| [`digest`](../../../../src/server/auth.ts#L32) | Function | value | [文字解释](implementation/authentication.md#browser-session-auth) |
| [`parseSessions`](../../../../src/server/auth.ts#L36) | Function | text | [文字解释](implementation/authentication.md#browser-session-auth) |
| [`LocalAuth`](../../../../src/server/auth.ts#L87) | Class |  | [文字解释](implementation/authentication.md) |
| [`LocalAuth.token`](../../../../src/server/auth.ts#L88) | Property |  | [文字解释](implementation/authentication.md) |
| [`LocalAuth.path`](../../../../src/server/auth.ts#L89) | Property |  | [文字解释](implementation/authentication.md) |
| [`LocalAuth.now`](../../../../src/server/auth.ts#L90) | Property |  | [文字解释](implementation/authentication.md) |
| [`LocalAuth.sessions`](../../../../src/server/auth.ts#L91) | Property |  | [文字解释](implementation/authentication.md) |
| [`LocalAuth.codes`](../../../../src/server/auth.ts#L92) | Property |  | [文字解释](implementation/authentication.md) |
| [`LocalAuth.attempts`](../../../../src/server/auth.ts#L93) | Property |  | [文字解释](implementation/authentication.md) |
| [`LocalAuth.pending`](../../../../src/server/auth.ts#L94) | Property |  | [文字解释](implementation/authentication.md) |
| [`LocalAuth.faulted`](../../../../src/server/auth.ts#L95) | Property |  | [文字解释](implementation/authentication.md) |
| [`LocalAuth.constructor`](../../../../src/server/auth.ts#L97) | Constructor | token, path, sessions, now | [文字解释](implementation/authentication.md#browser-session-auth) |
| [`LocalAuth.open`](../../../../src/server/auth.ts#L104) | Method | dataDir, now | [文字解释](implementation/authentication.md#browser-session-auth) |
| [`LocalAuth.isCli`](../../../../src/server/auth.ts#L121) | Method | authorization | [文字解释](implementation/authentication.md#browser-session-auth) |
| [`LocalAuth.available`](../../../../src/server/auth.ts#L130) | Method |  | [文字解释](implementation/authentication.md#browser-session-auth) |
| [`LocalAuth.isBrowser`](../../../../src/server/auth.ts#L139) | Method | token, browserKey | [文字解释](implementation/authentication.md#browser-session-auth) |
| [`LocalAuth.createPairing`](../../../../src/server/auth.ts#L158) | Method |  | [文字解释](implementation/authentication.md#browser-session-auth) |
| [`LocalAuth.serialize`](../../../../src/server/auth.ts#L181) | Method | action | [文字解释](implementation/authentication.md#browser-session-auth) |
| [`LocalAuth.save`](../../../../src/server/auth.ts#L190) | Method | sessions | [文字解释](implementation/authentication.md#browser-session-auth) |
| [`LocalAuth.redeem`](../../../../src/server/auth.ts#L204) | Method | code, browserKey | [文字解释](implementation/authentication.md#browser-session-auth) |
| [`LocalAuth.logout`](../../../../src/server/auth.ts#L241) | Method | token | [文字解释](implementation/authentication.md#browser-session-auth) |
| [`LocalAuth.revoke`](../../../../src/server/auth.ts#L252) | Method |  | [文字解释](implementation/authentication.md#browser-session-auth) |
| [`LocalAuth.drain`](../../../../src/server/auth.ts#L260) | Method |  | [文字解释](implementation/authentication.md#browser-session-auth) |


## src/server/http.ts

文字解释：[http](implementation/http.md)

[查看源码](../../../../src/server/http.ts) · 788 行

Local dependencies： [clients/web/page.ts](../../../../src/clients/web/page.ts), [clients/web/script.ts](../../../../src/clients/web/script.ts), [local/files.ts](../../../../src/local/files.ts), [local/paths.ts](../../../../src/local/paths.ts), [sessions/service.ts](../../../../src/sessions/service.ts), [shared/protocol.ts](../../../../src/shared/protocol.ts), [shared/sessions.ts](../../../../src/shared/sessions.ts), [shared/thinking.ts](../../../../src/shared/thinking.ts), [shared/turns.ts](../../../../src/shared/turns.ts), [server/access.ts](../../../../src/server/access.ts), [server/auth.ts](../../../../src/server/auth.ts), [server/sse.ts](../../../../src/server/sse.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`HostOptions`](../../../../src/server/http.ts#L24) | Interface |  | [文字解释](implementation/http.md) |
| [`RunningHost`](../../../../src/server/http.ts#L34) | Interface |  | [文字解释](implementation/http.md) |
| [`fail`](../../../../src/server/http.ts#L39) | Function | status, code, message | [文字解释](implementation/http.md#request-validation) |
| [`cookieToken`](../../../../src/server/http.ts#L42) | Function | request, name | [文字解释](implementation/http.md#request-validation) |
| [`browserRequest`](../../../../src/server/http.ts#L50) | Function | request, origin | [文字解释](implementation/http.md#request-validation) |
| [`readJson`](../../../../src/server/http.ts#L55) | Function | request, limit | [文字解释](implementation/http.md#request-validation) |
| [`send`](../../../../src/server/http.ts#L92) | Function | response, status, body | [文字解释](implementation/http.md#request-validation) |
| [`parseHistoryCursor`](../../../../src/server/http.ts#L96) | Function | query | [文字解释](implementation/http.md#request-validation) |
| [`startHost`](../../../../src/server/http.ts#L127) | Function | {   port = DEFAULT_PORT,   mode = "production",   dataDir = dataDirectory(mode),   now = Date.now,   sessions: sessionOptions,   eventHeartbeatMs, } | [文字解释](implementation/http.md#host-lifecycle) |
| [`startHost.revalidateEventStreams`](../../../../src/server/http.ts#L157) | Nested function |  | [文字解释](implementation/http.md#host-lifecycle) |
| [`startHost.openEventStream`](../../../../src/server/http.ts#L161) | Nested function | request, response, sessionId, cursor, cookieName | [文字解释](implementation/http.md#host-lifecycle) |
| [`startHost.handle`](../../../../src/server/http.ts#L194) | Nested function | request, response | [文字解释](implementation/http.md#route-dispatch) |
| [`parseLibraryLatestQuery`](../../../../src/server/http.ts#L110) | Function | | [阅读说明](implementation/storage-integrations.md#library-http-browser) |


## src/server/session-discovery.ts

文字解释：[discovery](implementation/discovery.md)

[查看源码](../../../../src/server/session-discovery.ts) · 600 行

Local dependencies： [runtime/pi-process.ts](../../../../src/runtime/pi-process.ts), [shared/discovery.ts](../../../../src/shared/discovery.ts), [shared/thinking.ts](../../../../src/shared/thinking.ts), [shared/sessions.ts](../../../../src/shared/sessions.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`MAX_DIRECTORY_ENTRIES`](../../../../src/server/session-discovery.ts#L26) | Module value | 由 initializer 推断 | [文字解释](implementation/discovery.md) |
| [`MAX_DIRECTORY_SCAN`](../../../../src/server/session-discovery.ts#L27) | Module value | 由 initializer 推断 | [文字解释](implementation/discovery.md) |
| [`MAX_PATH_LENGTH`](../../../../src/server/session-discovery.ts#L28) | Module value | 由 initializer 推断 | [文字解释](implementation/discovery.md) |
| [`MAX_MODEL_COUNT`](../../../../src/server/session-discovery.ts#L29) | Module value | 由 initializer 推断 | [文字解释](implementation/discovery.md) |
| [`MAX_MODEL_OUTPUT_BYTES`](../../../../src/server/session-discovery.ts#L30) | Module value | 由 initializer 推断 | [文字解释](implementation/discovery.md) |
| [`MODEL_DISCOVERY_TIMEOUT_MS`](../../../../src/server/session-discovery.ts#L31) | Module value | 由 initializer 推断 | [文字解释](implementation/discovery.md) |
| [`MAX_CONFIG_FILE_BYTES`](../../../../src/server/session-discovery.ts#L32) | Module value | 由 initializer 推断 | [文字解释](implementation/discovery.md) |
| [`MAX_CONFIG_BYTES`](../../../../src/server/session-discovery.ts#L33) | Module value | 由 initializer 推断 | [文字解释](implementation/discovery.md) |
| [`PI_CONFIG_FILES`](../../../../src/server/session-discovery.ts#L34) | Module value | 由 initializer 推断 | [文字解释](implementation/discovery.md) |
| [`MODEL_LIST_COLUMNS`](../../../../src/server/session-discovery.ts#L41) | Module value | 由 initializer 推断 | [文字解释](implementation/discovery.md) |
| [`SessionDiscoveryError`](../../../../src/server/session-discovery.ts#L43) | Class |  | [文字解释](implementation/discovery.md) |
| [`SessionDiscoveryError.status`](../../../../src/server/session-discovery.ts#L44) | Property |  | [文字解释](implementation/discovery.md) |
| [`SessionDiscoveryError.code`](../../../../src/server/session-discovery.ts#L45) | Property |  | [文字解释](implementation/discovery.md) |
| [`SessionDiscoveryError.constructor`](../../../../src/server/session-discovery.ts#L47) | Constructor | status, code, message | [文字解释](implementation/discovery.md#discovery-errors-and-home) |
| [`errnoCode`](../../../../src/server/session-discovery.ts#L54) | Function | error | [文字解释](implementation/discovery.md#discovery-errors-and-home) |
| [`hostHomeDirectory`](../../../../src/server/session-discovery.ts#L60) | Function | env | [文字解释](implementation/discovery.md#discovery-errors-and-home) |
| [`canonicalPathForPiAgentDirectory`](../../../../src/server/session-discovery.ts#L72) | Function | env, home | [文字解释](implementation/discovery.md#discovery-errors-and-home) |
| [`directoryError`](../../../../src/server/session-discovery.ts#L90) | Function | error | [文字解释](implementation/discovery.md#discovery-errors-and-home) |
| [`listHostDirectories`](../../../../src/server/session-discovery.ts#L112) | Function | requestedPath, homeDirectory | [文字解释](implementation/discovery.md#directory-listing) |
| [`DiscoveryWorkspace`](../../../../src/server/session-discovery.ts#L179) | Interface |  | [文字解释](implementation/discovery.md) |
| [`createDiscoveryWorkspace`](../../../../src/server/session-discovery.ts#L187) | Function |  | [文字解释](implementation/discovery.md#temporary-discovery-workspace) |
| [`isolatedEnvironment`](../../../../src/server/session-discovery.ts#L226) | Function | env, workspace | [文字解释](implementation/discovery.md#temporary-discovery-workspace) |
| [`discoveryEnvironment`](../../../../src/server/session-discovery.ts#L243) | Function | env, workspace | [文字解释](implementation/discovery.md#temporary-discovery-workspace) |
| [`copyPiConfiguration`](../../../../src/server/session-discovery.ts#L250) | Function | sourceDirectory, targetDirectory | [文字解释](implementation/discovery.md#temporary-discovery-workspace) |
| [`runModelList`](../../../../src/server/session-discovery.ts#L293) | Function | configuration, cwd, env | [文字解释](implementation/discovery.md#global-model-list) |
| [`modelColumnPositions`](../../../../src/server/session-discovery.ts#L331) | Function | line | [文字解释](implementation/discovery.md#model-list-parser) |
| [`modelColumns`](../../../../src/server/session-discovery.ts#L343) | Function | line, positions | [文字解释](implementation/discovery.md#model-list-parser) |
| [`parseModelList`](../../../../src/server/session-discovery.ts#L356) | Function | output | [文字解释](implementation/discovery.md#model-list-parser) |
| [`discoverPiModels`](../../../../src/server/session-discovery.ts#L434) | Function | configuration, env | [文字解释](implementation/discovery.md#global-model-list) |
| [`discoverPiModelCapabilities`](../../../../src/server/session-discovery.ts#L503) | Function | configuration, env, request | [文字解释](implementation/discovery.md#model-capability-probe) |


## src/server/sse.ts

文字解释：[http](implementation/http.md)

[查看源码](../../../../src/server/sse.ts) · 302 行

Local dependencies： [shared/events.ts](../../../../src/shared/events.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`MAX_BUFFER_BYTES`](../../../../src/server/sse.ts#L4) | Module value | 由 initializer 推断 | [文字解释](implementation/http.md) |
| [`HEARTBEAT`](../../../../src/server/sse.ts#L5) | Module value | 由 initializer 推断 | [文字解释](implementation/http.md) |
| [`STREAM_ERROR_FLUSH_MS`](../../../../src/server/sse.ts#L6) | Module value | 由 initializer 推断 | [文字解释](implementation/http.md) |
| [`SseStartError`](../../../../src/server/sse.ts#L8) | Class |  | [文字解释](implementation/http.md) |
| [`SseStartError.code`](../../../../src/server/sse.ts#L9) | Property |  | [文字解释](implementation/http.md) |
| [`SseStartError.constructor`](../../../../src/server/sse.ts#L11) | Constructor | code, message | [文字解释](implementation/http.md#sse-frame-and-connection) |
| [`SseConnection`](../../../../src/server/sse.ts#L17) | Interface |  | [文字解释](implementation/http.md) |
| [`SseConnectionOptions`](../../../../src/server/sse.ts#L24) | Interface |  | [文字解释](implementation/http.md) |
| [`encodeFrame`](../../../../src/server/sse.ts#L30) | Function | frame | [文字解释](implementation/http.md#sse-frame-and-connection) |
| [`createSseConnection`](../../../../src/server/sse.ts#L48) | Function | response, { heartbeatMs = 15_000, isAuthorized, onClose } | [文字解释](implementation/http.md#sse-frame-and-connection) |
| [`createSseConnection.onDrain`](../../../../src/server/sse.ts#L171) | Nested function |  | [文字解释](implementation/http.md#sse-lifecycle-and-overflow) |
| [`createSseConnection.onCloseResponse`](../../../../src/server/sse.ts#L176) | Nested function |  | [文字解释](implementation/http.md#sse-lifecycle-and-overflow) |
| [`createSseConnection.onErrorResponse`](../../../../src/server/sse.ts#L180) | Nested function |  | [文字解释](implementation/http.md#sse-lifecycle-and-overflow) |
| [`createSseConnection.enqueue`](../../../../src/server/sse.ts#L198) | Method | — | [文字解释](implementation/http.md#sse-lifecycle-and-overflow) |
| [`createSseConnection.start`](../../../../src/server/sse.ts#L229) | Method | — | [文字解释](implementation/http.md#sse-lifecycle-and-overflow) |
| [`createSseConnection.revalidate`](../../../../src/server/sse.ts#L292) | Method | — | [文字解释](implementation/http.md#sse-lifecycle-and-overflow) |
| [`createSseConnection.close`](../../../../src/server/sse.ts#L298) | Method | — | [文字解释](implementation/http.md#sse-lifecycle-and-overflow) |


## src/service/service.ts

文字解释：[services](implementation/services.md)

[查看源码](../../../../src/service/service.ts) · 1005 行

Local dependencies： [local/paths.ts](../../../../src/local/paths.ts), [shared/protocol.ts](../../../../src/shared/protocol.ts), [clients/cli/status.ts](../../../../src/clients/cli/status.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`SERVICE_LABEL`](../../../../src/service/service.ts#L22) | Module value | 由 initializer 推断 | [文字解释](implementation/services.md) |
| [`SYSTEMD_UNIT`](../../../../src/service/service.ts#L23) | Module value | 由 initializer 推断 | [文字解释](implementation/services.md) |
| [`DATA_DIRECTORY_SEGMENTS`](../../../../src/service/service.ts#L24) | Module value | 由 initializer 推断 | [文字解释](implementation/services.md) |
| [`STARTUP_TIMEOUT_MS`](../../../../src/service/service.ts#L25) | Module value | 由 initializer 推断 | [文字解释](implementation/services.md) |
| [`POLL_INTERVAL_MS`](../../../../src/service/service.ts#L26) | Module value | 由 initializer 推断 | [文字解释](implementation/services.md) |
| [`COMMAND_TIMEOUT_MS`](../../../../src/service/service.ts#L27) | Module value | 由 initializer 推断 | [文字解释](implementation/services.md) |
| [`MAX_COMMAND_OUTPUT_BYTES`](../../../../src/service/service.ts#L28) | Module value | 由 initializer 推断 | [文字解释](implementation/services.md) |
| [`MAX_REGISTRATION_BYTES`](../../../../src/service/service.ts#L29) | Module value | 由 initializer 推断 | [文字解释](implementation/services.md) |
| [`SERVICE_ACTIONS`](../../../../src/service/service.ts#L31) | Module value | 由 initializer 推断 | [文字解释](implementation/services.md) |
| [`ServiceAction`](../../../../src/service/service.ts#L39) | TypeAlias |  | [文字解释](implementation/services.md) |
| [`ServiceCommandResult`](../../../../src/service/service.ts#L41) | Interface |  | [文字解释](implementation/services.md) |
| [`ServiceReadiness`](../../../../src/service/service.ts#L47) | Interface |  | [文字解释](implementation/services.md) |
| [`ServiceCommandRunner`](../../../../src/service/service.ts#L53) | TypeAlias |  | [文字解释](implementation/services.md) |
| [`ServiceCommandOptions`](../../../../src/service/service.ts#L58) | Interface |  | [文字解释](implementation/services.md) |
| [`ServicePaths`](../../../../src/service/service.ts#L70) | Interface |  | [文字解释](implementation/services.md) |
| [`ManagerState`](../../../../src/service/service.ts#L86) | Interface |  | [文字解释](implementation/services.md) |
| [`DirectoryCheck`](../../../../src/service/service.ts#L91) | Interface |  | [文字解释](implementation/services.md) |
| [`defaultRunner`](../../../../src/service/service.ts#L96) | Function | command, args | [文字解释](implementation/services.md#service-command-and-paths) |
| [`validatePath`](../../../../src/service/service.ts#L119) | Function | value, label | [文字解释](implementation/services.md#service-command-and-paths) |
| [`resolvePaths`](../../../../src/service/service.ts#L130) | Function | options | [文字解释](implementation/services.md#service-command-and-paths) |
| [`ensureDirectories`](../../../../src/service/service.ts#L197) | Function | homeDirectory, userId, segments, { create, private: requirePrivate } | [文字解释](implementation/services.md#safe-service-directories) |
| [`ensureServiceDirectories`](../../../../src/service/service.ts#L255) | Function | paths, create | [文字解释](implementation/services.md#safe-service-directories) |
| [`plistEscape`](../../../../src/service/service.ts#L275) | Function | value | [文字解释](implementation/services.md#registration-generation) |
| [`systemdQuote`](../../../../src/service/service.ts#L279) | Function | value, escapeCommandVariables | [文字解释](implementation/services.md#registration-generation) |
| [`launchAgentContent`](../../../../src/service/service.ts#L285) | Function | paths | [文字解释](implementation/services.md#registration-generation) |
| [`systemdUnitContent`](../../../../src/service/service.ts#L329) | Function | paths, legacy | [文字解释](implementation/services.md#registration-generation) |
| [`registrationContent`](../../../../src/service/service.ts#L360) | Function | paths | [文字解释](implementation/services.md#registration-generation) |
| [`isLegacyRegistration`](../../../../src/service/service.ts#L364) | Function | paths, content | [文字解释](implementation/services.md#registration-generation) |
| [`fileOpenFlags`](../../../../src/service/service.ts#L372) | Function |  | [文字解释](implementation/services.md#registration-ownership) |
| [`readPrivateRegistration`](../../../../src/service/service.ts#L376) | Function | path, userId | [文字解释](implementation/services.md#registration-ownership) |
| [`RegistrationChange`](../../../../src/service/service.ts#L416) | TypeAlias |  | [文字解释](implementation/services.md) |
| [`upgradeRegistration`](../../../../src/service/service.ts#L418) | Function | paths, previous, content | [文字解释](implementation/services.md#registration-ownership) |
| [`writePrivateRegistration`](../../../../src/service/service.ts#L450) | Function | paths, content | [文字解释](implementation/services.md#registration-ownership) |
| [`verifyRegistration`](../../../../src/service/service.ts#L506) | Function | paths, allowLegacy | [文字解释](implementation/services.md#registration-ownership) |
| [`run`](../../../../src/service/service.ts#L527) | Function | paths, command, args | [文字解释](implementation/services.md#manager-command-adapter) |
| [`commandError`](../../../../src/service/service.ts#L535) | Function | command, args, result | [文字解释](implementation/services.md#manager-command-adapter) |
| [`runRequired`](../../../../src/service/service.ts#L542) | Function | paths, command, args | [文字解释](implementation/services.md#manager-command-adapter) |
| [`reloadLinuxManager`](../../../../src/service/service.ts#L552) | Function | paths | [文字解释](implementation/services.md#manager-command-adapter) |
| [`unknownSetting`](../../../../src/service/service.ts#L557) | Function | error | [文字解释](implementation/services.md#manager-command-adapter) |
| [`linuxAutostart`](../../../../src/service/service.ts#L562) | Function | paths | [文字解释](implementation/services.md#manager-command-adapter) |
| [`linuxLingering`](../../../../src/service/service.ts#L596) | Function | paths | [文字解释](implementation/services.md#manager-command-adapter) |
| [`linuxBootStatus`](../../../../src/service/service.ts#L613) | Function | paths | [文字解释](implementation/services.md#manager-command-adapter) |
| [`inspectLinux`](../../../../src/service/service.ts#L618) | Function | paths, repairingLegacy | [文字解释](implementation/services.md#manager-identity-inspection) |
| [`LaunchdRegistration`](../../../../src/service/service.ts#L667) | Interface |  | [文字解释](implementation/services.md) |
| [`parseLaunchdRegistration`](../../../../src/service/service.ts#L675) | Function | output | [文字解释](implementation/services.md#manager-identity-inspection) |
| [`validateLaunchdIdentity`](../../../../src/service/service.ts#L700) | Function | paths, registration | [文字解释](implementation/services.md#manager-identity-inspection) |
| [`inspectMac`](../../../../src/service/service.ts#L714) | Function | paths | [文字解释](implementation/services.md#manager-identity-inspection) |
| [`managerProcessIsRunning`](../../../../src/service/service.ts#L727) | Function | paths, state | [文字解释](implementation/services.md#manager-identity-inspection) |
| [`inspectManager`](../../../../src/service/service.ts#L732) | Function | paths | [文字解释](implementation/services.md#manager-identity-inspection) |
| [`readReadiness`](../../../../src/service/service.ts#L736) | Function | paths, processId, timeoutMs | [文字解释](implementation/services.md#readiness-and-start) |
| [`validateReadyIdentity`](../../../../src/service/service.ts#L744) | Function | status, expectedProcessId | [文字解释](implementation/services.md#readiness-and-start) |
| [`waitForReady`](../../../../src/service/service.ts#L757) | Function | paths, deadline | [文字解释](implementation/services.md#readiness-and-start) |
| [`startService`](../../../../src/service/service.ts#L784) | Function | paths | [文字解释](implementation/services.md#readiness-and-start) |
| [`waitForStopped`](../../../../src/service/service.ts#L832) | Function | paths | [文字解释](implementation/services.md#stop-uninstall-and-status) |
| [`stopService`](../../../../src/service/service.ts#L851) | Function | paths | [文字解释](implementation/services.md#stop-uninstall-and-status) |
| [`removeRegistration`](../../../../src/service/service.ts#L866) | Function | paths | [文字解释](implementation/services.md#stop-uninstall-and-status) |
| [`install`](../../../../src/service/service.ts#L877) | Function | paths | [文字解释](implementation/services.md#stop-uninstall-and-status) |
| [`uninstall`](../../../../src/service/service.ts#L904) | Function | paths | [文字解释](implementation/services.md#stop-uninstall-and-status) |
| [`runtimeStatus`](../../../../src/service/service.ts#L939) | Function | paths | [文字解释](implementation/services.md#stop-uninstall-and-status) |
| [`status`](../../../../src/service/service.ts#L974) | Function | paths | [文字解释](implementation/services.md#stop-uninstall-and-status) |
| [`runServiceCommand`](../../../../src/service/service.ts#L983) | Function | action, options | [文字解释](implementation/services.md#service-command-and-paths) |


## src/sessions/events.ts

文字解释：[events](implementation/events.md)

[查看源码](../../../../src/sessions/events.ts) · 1381 行

Local dependencies： [runtime/message-identity.ts](../../../../src/runtime/message-identity.ts), [runtime/pi-rpc.ts](../../../../src/runtime/pi-rpc.ts), [shared/events.ts](../../../../src/shared/events.ts), [shared/sessions.ts](../../../../src/shared/sessions.ts), [shared/turns.ts](../../../../src/shared/turns.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`SessionEventsOptions`](../../../../src/sessions/events.ts#L22) | Interface |  | [文字解释](implementation/events.md) |
| [`InvalidCursorError`](../../../../src/sessions/events.ts#L30) | Class |  | [文字解释](implementation/events.md) |
| [`InvalidCursorError.constructor`](../../../../src/sessions/events.ts#L31) | Constructor |  | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`SubscriberLimitError`](../../../../src/sessions/events.ts#L37) | Class |  | [文字解释](implementation/events.md) |
| [`SubscriberLimitError.constructor`](../../../../src/sessions/events.ts#L38) | Constructor |  | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`StreamCapacityError`](../../../../src/sessions/events.ts#L44) | Class |  | [文字解释](implementation/events.md) |
| [`StreamCapacityError.constructor`](../../../../src/sessions/events.ts#L45) | Constructor | message | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`EventType`](../../../../src/sessions/events.ts#L51) | TypeAlias |  | [文字解释](implementation/events.md) |
| [`PayloadFor`](../../../../src/sessions/events.ts#L52) | TypeAlias |  | [文字解释](implementation/events.md) |
| [`ReplayableFrame`](../../../../src/sessions/events.ts#L53) | TypeAlias |  | [文字解释](implementation/events.md) |
| [`StoredEvent`](../../../../src/sessions/events.ts#L55) | Interface |  | [文字解释](implementation/events.md) |
| [`Subscriber`](../../../../src/sessions/events.ts#L61) | Interface |  | [文字解释](implementation/events.md) |
| [`CachedView`](../../../../src/sessions/events.ts#L66) | Interface |  | [文字解释](implementation/events.md) |
| [`LiveState`](../../../../src/sessions/events.ts#L73) | Interface |  | [文字解释](implementation/events.md) |
| [`LiveContentBlock`](../../../../src/sessions/events.ts#L85) | Interface |  | [文字解释](implementation/events.md) |
| [`SessionStream`](../../../../src/sessions/events.ts#L94) | Interface |  | [文字解释](implementation/events.md) |
| [`ParsedCursor`](../../../../src/sessions/events.ts#L107) | Interface |  | [文字解释](implementation/events.md) |
| [`BoundedText`](../../../../src/sessions/events.ts#L113) | Interface |  | [文字解释](implementation/events.md) |
| [`BoundedAppend`](../../../../src/sessions/events.ts#L118) | Interface |  | [文字解释](implementation/events.md) |
| [`UUID`](../../../../src/sessions/events.ts#L122) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`CURSOR`](../../../../src/sessions/events.ts#L123) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`encoder`](../../../../src/sessions/events.ts#L124) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`MAX_STREAMS`](../../../../src/sessions/events.ts#L125) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`MAX_REPLAY_EVENTS`](../../../../src/sessions/events.ts#L126) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`MAX_REPLAY_BYTES`](../../../../src/sessions/events.ts#L127) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`MAX_SESSION_SUBSCRIBERS`](../../../../src/sessions/events.ts#L128) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`MAX_SUBSCRIBERS`](../../../../src/sessions/events.ts#L129) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`MAX_MESSAGE_JSON_BYTES`](../../../../src/sessions/events.ts#L130) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`MAX_MESSAGE_CONTENT_BLOCKS`](../../../../src/sessions/events.ts#L131) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`MAX_TOOL_FIELD_JSON_BYTES`](../../../../src/sessions/events.ts#L132) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`MAX_TOOL_NAME_JSON_BYTES`](../../../../src/sessions/events.ts#L133) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`MAX_TOOL_CALL_ID_BYTES`](../../../../src/sessions/events.ts#L134) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`MAX_TOOLS`](../../../../src/sessions/events.ts#L135) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`MAX_METADATA_DIRECTORY_JSON_BYTES`](../../../../src/sessions/events.ts#L136) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`MAX_METADATA_VALUE_JSON_BYTES`](../../../../src/sessions/events.ts#L137) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`MAX_METADATA_ERROR_JSON_BYTES`](../../../../src/sessions/events.ts#L138) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`MAX_TURN_ERROR_JSON_BYTES`](../../../../src/sessions/events.ts#L139) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`MAX_LIMITED_STRING_JSON_BYTES`](../../../../src/sessions/events.ts#L140) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`MAX_REPLAY_INITIAL_BYTES`](../../../../src/sessions/events.ts#L141) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`SSE_FRAME_OVERHEAD_BYTES`](../../../../src/sessions/events.ts#L142) | Module value | 由 initializer 推断 | [文字解释](implementation/events.md) |
| [`isRecord`](../../../../src/sessions/events.ts#L144) | Function | value | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`jsonStringBytes`](../../../../src/sessions/events.ts#L148) | Function | value | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`boundedJsonString`](../../../../src/sessions/events.ts#L152) | Function | value, maxBytes | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`appendBoundedJsonString`](../../../../src/sessions/events.ts#L176) | Function | existing, addition, maxBytes | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`safeJsonString`](../../../../src/sessions/events.ts#L209) | Function | value | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`equalJson`](../../../../src/sessions/events.ts#L217) | Function | left, right | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`blockDelta`](../../../../src/sessions/events.ts#L221) | Function | type, contentIndex, text | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`emptyLiveState`](../../../../src/sessions/events.ts#L229) | Function |  | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`parseCursor`](../../../../src/sessions/events.ts#L246) | Function | cursor, sessionId | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`projectSession`](../../../../src/sessions/events.ts#L260) | Function | value | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`projectTurn`](../../../../src/sessions/events.ts#L315) | Function | value | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`extractText`](../../../../src/sessions/events.ts#L341) | Function | value | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`clippedToolInput`](../../../../src/sessions/events.ts#L352) | Function | value | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`clippedToolText`](../../../../src/sessions/events.ts#L356) | Function | value | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`eventSize`](../../../../src/sessions/events.ts#L360) | Function | value | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`asReplayable`](../../../../src/sessions/events.ts#L364) | Function | frame | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`copyFrame`](../../../../src/sessions/events.ts#L368) | Function | frame | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |
| [`SessionEvents`](../../../../src/sessions/events.ts#L373) | Class |  | [文字解释](implementation/events.md) |
| [`SessionEvents.#maxSessions`](../../../../src/sessions/events.ts#L374) | Property |  | [文字解释](implementation/events.md) |
| [`SessionEvents.#maxReplayEvents`](../../../../src/sessions/events.ts#L375) | Property |  | [文字解释](implementation/events.md) |
| [`SessionEvents.#maxReplayBytes`](../../../../src/sessions/events.ts#L376) | Property |  | [文字解释](implementation/events.md) |
| [`SessionEvents.#maxSubscribersPerSession`](../../../../src/sessions/events.ts#L377) | Property |  | [文字解释](implementation/events.md) |
| [`SessionEvents.#maxSubscribers`](../../../../src/sessions/events.ts#L378) | Property |  | [文字解释](implementation/events.md) |
| [`SessionEvents.#streams`](../../../../src/sessions/events.ts#L379) | Property |  | [文字解释](implementation/events.md) |
| [`SessionEvents.#subscriberCount`](../../../../src/sessions/events.ts#L380) | Property |  | [文字解释](implementation/events.md) |
| [`SessionEvents.#tick`](../../../../src/sessions/events.ts#L381) | Property |  | [文字解释](implementation/events.md) |
| [`SessionEvents.#closed`](../../../../src/sessions/events.ts#L382) | Property |  | [文字解释](implementation/events.md) |
| [`SessionEvents.constructor`](../../../../src/sessions/events.ts#L384) | Constructor | options | [文字解释](implementation/events.md#event-hub-lifecycle) |
| [`SessionEvents.ensure`](../../../../src/sessions/events.ts#L399) | Method | sessionId | [文字解释](implementation/events.md#event-hub-lifecycle) |
| [`SessionEvents.publishSession`](../../../../src/sessions/events.ts#L404) | Method | session | [文字解释](implementation/events.md#event-hub-lifecycle) |
| [`SessionEvents.publishTurn`](../../../../src/sessions/events.ts#L432) | Method | session, activeTurn, latestTurn | [文字解释](implementation/events.md#event-hub-lifecycle) |
| [`SessionEvents.beginTurn`](../../../../src/sessions/events.ts#L496) | Method | sessionId, runId, messageCounts, messageIdentityKnown | [文字解释](implementation/events.md#live-turn-and-native-execution) |
| [`SessionEvents.beginNativeExecution`](../../../../src/sessions/events.ts#L521) | Method | sessionId, executionId, messageCounts | [文字解释](implementation/events.md#live-turn-and-native-execution) |
| [`SessionEvents.observe`](../../../../src/sessions/events.ts#L564) | Method | sessionId, runId, event | [文字解释](implementation/events.md#live-turn-and-native-execution) |
| [`SessionEvents.endTurn`](../../../../src/sessions/events.ts#L596) | Method | sessionId, runId | [文字解释](implementation/events.md#live-turn-and-native-execution) |
| [`SessionEvents.endNativeExecution`](../../../../src/sessions/events.ts#L605) | Method | sessionId, executionId | [文字解释](implementation/events.md#live-turn-and-native-execution) |
| [`SessionEvents.fail`](../../../../src/sessions/events.ts#L629) | Method | sessionId, code, message | [文字解释](implementation/events.md#connection-snapshots-and-replay) |
| [`SessionEvents.connect`](../../../../src/sessions/events.ts#L645) | Method | session, activeTurn, latestTurn, cursor, listener | [文字解释](implementation/events.md#connection-snapshots-and-replay) |
| [`SessionEvents.close`](../../../../src/sessions/events.ts#L675) | Method |  | [文字解释](implementation/events.md#connection-snapshots-and-replay) |
| [`SessionEvents.#validView`](../../../../src/sessions/events.ts#L686) | Method | session, activeTurn, latestTurn | [文字解释](implementation/events.md#event-hub-lifecycle) |
| [`SessionEvents.#getOrCreate`](../../../../src/sessions/events.ts#L706) | Method | sessionId | [文字解释](implementation/events.md#event-hub-lifecycle) |
| [`SessionEvents.#touch`](../../../../src/sessions/events.ts#L738) | Method | stream | [文字解释](implementation/events.md#event-hub-lifecycle) |
| [`SessionEvents.#removeSubscriber`](../../../../src/sessions/events.ts#L742) | Method | stream, subscriber | [文字解释](implementation/events.md#event-hub-lifecycle) |
| [`SessionEvents.#reconcileView`](../../../../src/sessions/events.ts#L749) | Method | stream, session, activeTurn, latestTurn | [文字解释](implementation/events.md#event-hub-lifecycle) |
| [`SessionEvents.#publishViewLimits`](../../../../src/sessions/events.ts#L805) | Method | stream, _session, activeTurn, latestTurn, sessionLimited | [文字解释](implementation/events.md#event-hub-lifecycle) |
| [`SessionEvents.#initialFrames`](../../../../src/sessions/events.ts#L819) | Method | stream, cursor | [文字解释](implementation/events.md#connection-snapshots-and-replay) |
| [`SessionEvents.#snapshotFrame`](../../../../src/sessions/events.ts#L843) | Method | stream | [文字解释](implementation/events.md#connection-snapshots-and-replay) |
| [`SessionEvents.#resyncFrame`](../../../../src/sessions/events.ts#L874) | Method | stream, reason | [文字解释](implementation/events.md#connection-snapshots-and-replay) |
| [`SessionEvents.#cursor`](../../../../src/sessions/events.ts#L888) | Method | stream | [文字解释](implementation/events.md#connection-snapshots-and-replay) |
| [`SessionEvents.#emit`](../../../../src/sessions/events.ts#L892) | Method | stream, runId, type, payload | [文字解释](implementation/events.md#connection-snapshots-and-replay) |
| [`SessionEvents.#limited`](../../../../src/sessions/events.ts#L937) | Method | stream, scope, limit | [文字解释](implementation/events.md#connection-snapshots-and-replay) |
| [`SessionEvents.#projectionError`](../../../../src/sessions/events.ts#L944) | Method | stream | [文字解释](implementation/events.md#connection-snapshots-and-replay) |
| [`SessionEvents.#messageStart`](../../../../src/sessions/events.ts#L953) | Method | stream, event | [文字解释](implementation/events.md#live-message-projection) |
| [`SessionEvents.#messageUpdate`](../../../../src/sessions/events.ts#L966) | Method | stream, event | [文字解释](implementation/events.md#live-message-projection) |
| [`SessionEvents.#messageEnd`](../../../../src/sessions/events.ts#L1097) | Method | stream, event | [文字解释](implementation/events.md#live-message-projection) |
| [`SessionEvents.#parseContent`](../../../../src/sessions/events.ts#L1121) | Method | content, finished | [文字解释](implementation/events.md#live-message-projection) |
| [`SessionEvents.#contentBlock`](../../../../src/sessions/events.ts#L1155) | Method | stream, contentIndex, type | [文字解释](implementation/events.md#live-message-projection) |
| [`SessionEvents.#partialContent`](../../../../src/sessions/events.ts#L1177) | Method | partial, contentIndex, type | [文字解释](implementation/events.md#live-message-projection) |
| [`SessionEvents.#appendContent`](../../../../src/sessions/events.ts#L1189) | Method | content, block, text | [文字解释](implementation/events.md#live-message-projection) |
| [`SessionEvents.#publishMessage`](../../../../src/sessions/events.ts#L1206) | Method | stream, type, nativeKey, messageId | [文字解释](implementation/events.md#live-message-projection) |
| [`SessionEvents.#toolStart`](../../../../src/sessions/events.ts#L1259) | Method | stream, event | [文字解释](implementation/events.md#live-tool-projection) |
| [`SessionEvents.#toolUpdate`](../../../../src/sessions/events.ts#L1279) | Method | stream, event | [文字解释](implementation/events.md#live-tool-projection) |
| [`SessionEvents.#toolEnd`](../../../../src/sessions/events.ts#L1303) | Method | stream, event | [文字解释](implementation/events.md#live-tool-projection) |
| [`SessionEvents.#getTool`](../../../../src/sessions/events.ts#L1327) | Method | stream, rawId, name, input | [文字解释](implementation/events.md#live-tool-projection) |
| [`SessionEvents.#toolEventId`](../../../../src/sessions/events.ts#L1363) | Method | event | [文字解释](implementation/events.md#live-tool-projection) |
| [`SessionEvents.#toolEventName`](../../../../src/sessions/events.ts#L1371) | Method | event | [文字解释](implementation/events.md#live-tool-projection) |
| [`boundedLimit`](../../../../src/sessions/events.ts#L1376) | Function | value, maximum, minimum | [文字解释](implementation/events.md#event-shapes-and-helper-functions) |


## src/sessions/files.ts

[源码与说明](../../../../src/sessions/files.ts) · [Implementation](implementation/history.md#session-file-resolution)

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`nestedPath`](../../../../src/sessions/files.ts#L6) | Function | | [Read explanation](implementation/history.md#session-file-resolution) |
| [`SessionFileError.constructor`](../../../../src/sessions/files.ts#L14) | Constructor | | [Read explanation](implementation/history.md#session-file-resolution) |
| [`SessionFiles.constructor`](../../../../src/sessions/files.ts#L24) | Constructor | | [Read explanation](implementation/history.md#session-file-resolution) |
| [`SessionFiles.resolve`](../../../../src/sessions/files.ts#L28) | Method | | [Read explanation](implementation/history.md#session-file-resolution) |


## src/sessions/history.ts

文字解释：[history](implementation/history.md)

[查看源码](../../../../src/sessions/history.ts) · 513 行

Local dependencies： [runtime/message-identity.ts](../../../../src/runtime/message-identity.ts), [runtime/pi-history.ts](../../../../src/runtime/pi-history.ts), [runtime/pi-process.ts](../../../../src/runtime/pi-process.ts), [runtime/pi-rpc.ts](../../../../src/runtime/pi-rpc.ts), [shared/history.ts](../../../../src/shared/history.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`ENTRY_BYTES`](../../../../src/sessions/history.ts#L13) | Module value | 由 initializer 推断 | [文字解释](implementation/history.md) |
| [`PAGE_BYTES`](../../../../src/sessions/history.ts#L14) | Module value | 由 initializer 推断 | [文字解释](implementation/history.md) |
| [`MAX_CONTEXT_JSON_BYTES`](../../../../src/sessions/history.ts#L15) | Module value | 由 initializer 推断 | [文字解释](implementation/history.md) |
| [`MAX_CONTEXT_SOURCE_BYTES`](../../../../src/sessions/history.ts#L16) | Module value | 由 initializer 推断 | [文字解释](implementation/history.md) |
| [`MAX_CONTEXT_SOURCES`](../../../../src/sessions/history.ts#L17) | Module value | 由 initializer 推断 | [文字解释](implementation/history.md) |
| [`MAX_IMAGE_BYTES`](../../../../src/sessions/history.ts#L18) | Module value | 由 initializer 推断 | [文字解释](implementation/history.md) |
| [`MAX_IMAGE_BASE64_CHARS`](../../../../src/sessions/history.ts#L19) | Module value | 由 initializer 推断 | [文字解释](implementation/history.md) |
| [`IMAGE_TYPES`](../../../../src/sessions/history.ts#L20) | Module value | 由 initializer 推断 | [文字解释](implementation/history.md) |
| [`ContextProjection`](../../../../src/sessions/history.ts#L22) | Interface |  | [文字解释](implementation/history.md) |
| [`string`](../../../../src/sessions/history.ts#L27) | Function | value | [文字解释](implementation/history.md#history-context-and-entry-projection) |
| [`block`](../../../../src/sessions/history.ts#L30) | Function | type, text | [文字解释](implementation/history.md#history-context-and-entry-projection) |
| [`sections`](../../../../src/sessions/history.ts#L34) | Function | value | [文字解释](implementation/history.md#history-context-and-entry-projection) |
| [`prefixUtf8`](../../../../src/sessions/history.ts#L38) | Function | value, limit | [文字解释](implementation/history.md#history-context-and-entry-projection) |
| [`contextSection`](../../../../src/sessions/history.ts#L50) | Function | value | [文字解释](implementation/history.md#history-context-and-entry-projection) |
| [`activeContextSources`](../../../../src/sessions/history.ts#L99) | Function | entries | [文字解释](implementation/history.md#history-context-and-entry-projection) |
| [`imageMimeType`](../../../../src/sessions/history.ts#L122) | Function | value | [文字解释](implementation/history.md#history-context-and-entry-projection) |
| [`savedImage`](../../../../src/sessions/history.ts#L126) | Function | value | [文字解释](implementation/history.md#history-context-and-entry-projection) |
| [`toolInput`](../../../../src/sessions/history.ts#L139) | Function | value | [文字解释](implementation/history.md#history-context-and-entry-projection) |
| [`project`](../../../../src/sessions/history.ts#L155) | Function | entry | [文字解释](implementation/history.md#history-context-and-entry-projection) |
| [`Cursor`](../../../../src/sessions/history.ts#L322) | Interface |  | [文字解释](implementation/history.md) |
| [`HistorySlice`](../../../../src/sessions/history.ts#L326) | Interface |  | [文字解释](implementation/history.md) |
| [`HistoryPages`](../../../../src/sessions/history.ts#L336) | Class |  | [文字解释](implementation/history.md) |
| [`HistoryPages.#key`](../../../../src/sessions/history.ts#L337) | Property |  | [文字解释](implementation/history.md) |
| [`HistoryPages.#cursor`](../../../../src/sessions/history.ts#L339) | Method | value, sessionId | [文字解释](implementation/history.md#history-page-cursors-and-branch) |
| [`HistoryPages.#encode`](../../../../src/sessions/history.ts#L375) | Method | cursor | [文字解释](implementation/history.md#history-page-cursors-and-branch) |
| [`HistoryPages.read`](../../../../src/sessions/history.ts#L380) | Method | options | [文字解释](implementation/history.md#history-page-cursors-and-branch) |
| [`HistoryPages.image`](../../../../src/sessions/history.ts#L469) | Method | options | [文字解释](implementation/history.md#history-image-loading) |
| [`project.metadata`](../../../../src/sessions/history.ts#L172) | Nested function | value | [文字解释](implementation/history.md#history-context-and-entry-projection) |


## src/sessions/service.ts

文字解释：[sessions](implementation/sessions.md)

[查看源码](../../../../src/sessions/service.ts) · 2262 行

Local dependencies： [local/files.ts](../../../../src/local/files.ts), [local/paths.ts](../../../../src/local/paths.ts), [runtime/message-identity.ts](../../../../src/runtime/message-identity.ts), [runtime/pi-history.ts](../../../../src/runtime/pi-history.ts), [runtime/pi-process.ts](../../../../src/runtime/pi-process.ts), [runtime/pi-rpc.ts](../../../../src/runtime/pi-rpc.ts), [server/session-discovery.ts](../../../../src/server/session-discovery.ts), [shared/discovery.ts](../../../../src/shared/discovery.ts), [shared/events.ts](../../../../src/shared/events.ts), [shared/history.ts](../../../../src/shared/history.ts), [shared/images.ts](../../../../src/shared/images.ts), [shared/sessions.ts](../../../../src/shared/sessions.ts), [shared/thinking.ts](../../../../src/shared/thinking.ts), [shared/turns.ts](../../../../src/shared/turns.ts), [storage/catalog.ts](../../../../src/storage/catalog.ts), [sessions/events.ts](../../../../src/sessions/events.ts), [sessions/history.ts](../../../../src/sessions/history.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`SessionError`](../../../../src/sessions/service.ts#L62) | Class |  | [文字解释](implementation/sessions.md) |
| [`SessionError.status`](../../../../src/sessions/service.ts#L63) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionError.code`](../../../../src/sessions/service.ts#L64) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionError.constructor`](../../../../src/sessions/service.ts#L65) | Constructor | status, code, message | [文字解释](implementation/sessions.md#session-identity-and-recovery) |
| [`SessionServiceOptions`](../../../../src/sessions/service.ts#L72) | Interface |  | [文字解释](implementation/sessions.md) |
| [`HISTORY_UNAVAILABLE`](../../../../src/sessions/service.ts#L89) | Module value | 由 initializer 推断 | [文字解释](implementation/sessions.md) |
| [`MAX_OPEN_SESSIONS`](../../../../src/sessions/service.ts#L90) | Module value | 由 initializer 推断 | [文字解释](implementation/sessions.md) |
| [`turnPayloadIdentity`](../../../../src/sessions/service.ts#L92) | Function | message, images | [文字解释](implementation/sessions.md#session-identity-and-recovery) |
| [`validateStored`](../../../../src/sessions/service.ts#L104) | Function | stored | [文字解释](implementation/sessions.md#session-identity-and-recovery) |
| [`ActiveTurn`](../../../../src/sessions/service.ts#L120) | Interface |  | [文字解释](implementation/sessions.md) |
| [`HistoryIdentity`](../../../../src/sessions/service.ts#L136) | Interface |  | [文字解释](implementation/sessions.md) |
| [`NativeExecutionRecord`](../../../../src/sessions/service.ts#L141) | Interface |  | [文字解释](implementation/sessions.md) |
| [`NativeStateRefreshRequest`](../../../../src/sessions/service.ts#L152) | Interface |  | [文字解释](implementation/sessions.md) |
| [`NativeStateRefresh`](../../../../src/sessions/service.ts#L157) | Interface |  | [文字解释](implementation/sessions.md) |
| [`isMessageAfterBaseline`](../../../../src/sessions/service.ts#L162) | Function | key, baseline | [文字解释](implementation/sessions.md#session-identity-and-recovery) |
| [`messageKeysAfterBaseline`](../../../../src/sessions/service.ts#L174) | Function | entries, baseline | [文字解释](implementation/sessions.md#session-identity-and-recovery) |
| [`messageKeyDelta`](../../../../src/sessions/service.ts#L184) | Function | baseline, finalCounts | [文字解释](implementation/sessions.md#session-identity-and-recovery) |
| [`turnView`](../../../../src/sessions/service.ts#L198) | Function | turn | [文字解释](implementation/sessions.md#session-identity-and-recovery) |
| [`active`](../../../../src/sessions/service.ts#L203) | Function | turn | [文字解释](implementation/sessions.md#session-identity-and-recovery) |
| [`truncateUtf8`](../../../../src/sessions/service.ts#L207) | Function | value, maxBytes | [文字解释](implementation/sessions.md#session-identity-and-recovery) |
| [`SessionService`](../../../../src/sessions/service.ts#L220) | Class |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#catalog`](../../../../src/sessions/service.ts#L221) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#dataDir`](../../../../src/sessions/service.ts#L223) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#env`](../../../../src/sessions/service.ts#L224) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#extensions`](../../../../src/sessions/service.ts#L225) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#now`](../../../../src/sessions/service.ts#L226) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#runtimes`](../../../../src/sessions/service.ts#L227) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#runtimeObservers`](../../../../src/sessions/service.ts#L228) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#historyIdentity`](../../../../src/sessions/service.ts#L229) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#nativeExecutions`](../../../../src/sessions/service.ts#L230) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#nativeStateRefreshes`](../../../../src/sessions/service.ts#L231) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#turns`](../../../../src/sessions/service.ts#L232) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#storageFaults`](../../../../src/sessions/service.ts#L233) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#events`](../../../../src/sessions/service.ts#L234) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#historyPages`](../../../../src/sessions/service.ts#L235) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#reads`](../../../../src/sessions/service.ts#L239) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#nativeRefreshes`](../../../../src/sessions/service.ts#L240) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#shutdownController`](../../../../src/sessions/service.ts#L241) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#modelDiscovery`](../../../../src/sessions/service.ts#L242) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#modelCapabilityDiscoveries`](../../../../src/sessions/service.ts#L243) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#sessionModelReads`](../../../../src/sessions/service.ts#L244) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#checkpoint`](../../../../src/sessions/service.ts#L245) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#queue`](../../../../src/sessions/service.ts#L247) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#stopping`](../../../../src/sessions/service.ts#L248) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.#shutdown`](../../../../src/sessions/service.ts#L249) | Property |  | [文字解释](implementation/sessions.md) |
| [`SessionService.constructor`](../../../../src/sessions/service.ts#L251) | Constructor | catalog, dataDir, options | [文字解释](implementation/sessions.md#session-identity-and-recovery) |
| [`SessionService.create`](../../../../src/sessions/service.ts#L264) | Method | options | [文字解释](implementation/sessions.md#session-identity-and-recovery) |
| [`SessionService.runtimeCount`](../../../../src/sessions/service.ts#L282) | GetAccessor |  | [文字解释](implementation/sessions.md#session-identity-and-recovery) |
| [`SessionService.configure`](../../../../src/sessions/service.ts#L286) | Method | configuration | [文字解释](implementation/sessions.md#session-identity-and-recovery) |
| [`SessionService.listSessions`](../../../../src/sessions/service.ts#L309) | Method |  | [文字解释](implementation/sessions.md#sessions-discovery-and-observation) |
| [`SessionService.getSession`](../../../../src/sessions/service.ts#L314) | Method | id | [文字解释](implementation/sessions.md#sessions-discovery-and-observation) |
| [`SessionService.listDirectories`](../../../../src/sessions/service.ts#L390) | Method | path | [文字解释](implementation/sessions.md#sessions-discovery-and-observation) |
| [`SessionService.listAvailableModels`](../../../../src/sessions/service.ts#L413) | Method |  | [文字解释](implementation/sessions.md#sessions-discovery-and-observation) |
| [`SessionService.listSessionModels`](../../../../src/sessions/service.ts#L438) | Method | id | [文字解释](implementation/sessions.md#sessions-discovery-and-observation) |
| [`SessionService.getSessionModelCapabilities`](../../../../src/sessions/service.ts#L481) | Method | id, request | [文字解释](implementation/sessions.md#sessions-discovery-and-observation) |
| [`SessionService.getModelCapabilities`](../../../../src/sessions/service.ts#L501) | Method | request | [文字解释](implementation/sessions.md#sessions-discovery-and-observation) |
| [`SessionService.subscribeEvents`](../../../../src/sessions/service.ts#L540) | Method | id, cursor, listener | [文字解释](implementation/sessions.md#sessions-discovery-and-observation) |
| [`SessionService.#publishState`](../../../../src/sessions/service.ts#L571) | Method | id, withTurn | [文字解释](implementation/sessions.md#sessions-discovery-and-observation) |
| [`SessionService.#storageFault`](../../../../src/sessions/service.ts#L594) | Method | id | [文字解释](implementation/sessions.md#sessions-discovery-and-observation) |
| [`SessionService.createSession`](../../../../src/sessions/service.ts#L604) | Method | request | [文字解释](implementation/sessions.md#sessions-create-open-close) |
| [`SessionService.setSessionModel`](../../../../src/sessions/service.ts#L688) | Method | id, request | [文字解释](implementation/sessions.md#sessions-create-open-close) |
| [`SessionService.openSession`](../../../../src/sessions/service.ts#L795) | Method | id | [文字解释](implementation/sessions.md#sessions-create-open-close) |
| [`SessionService.closeSession`](../../../../src/sessions/service.ts#L799) | Method | id | [文字解释](implementation/sessions.md#sessions-create-open-close) |
| [`SessionService.getContext`](../../../../src/sessions/service.ts#L841) | Method | id | [文字解释](implementation/sessions.md#sessions-create-open-close) |
| [`SessionService.getHistory`](../../../../src/sessions/service.ts#L853) | Method | id, cursor | [文字解释](implementation/sessions.md#sessions-history-results) |
| [`SessionService.getHistoryImage`](../../../../src/sessions/service.ts#L971) | Method | id, entryId, imageIndex | [文字解释](implementation/sessions.md#sessions-history-results) |
| [`SessionService.submitTurn`](../../../../src/sessions/service.ts#L999) | Method | id, request | [文字解释](implementation/sessions.md#sessions-turn-state-machine) |
| [`SessionService.getTurn`](../../../../src/sessions/service.ts#L1075) | Method | id, runId | [文字解释](implementation/sessions.md#sessions-turn-state-machine) |
| [`SessionService.getTurnResult`](../../../../src/sessions/service.ts#L1081) | Method | id, runId | [文字解释](implementation/sessions.md#sessions-history-results) |
| [`SessionService.abortTurn`](../../../../src/sessions/service.ts#L1133) | Method | id, runId | [文字解释](implementation/sessions.md#sessions-cancellation-and-native-execution) |
| [`SessionService.abortNativeExecution`](../../../../src/sessions/service.ts#L1168) | Method | id, executionId | [文字解释](implementation/sessions.md#sessions-cancellation-and-native-execution) |
| [`SessionService.#storedTurn`](../../../../src/sessions/service.ts#L1212) | Method | id, runId | [文字解释](implementation/sessions.md#sessions-create-open-close) |
| [`SessionService.#checkStorage`](../../../../src/sessions/service.ts#L1220) | Method | id | [文字解释](implementation/sessions.md#sessions-shutdown-and-private-helpers) |
| [`SessionService.#writeTurn`](../../../../src/sessions/service.ts#L1229) | Method | turn | [文字解释](implementation/sessions.md#sessions-shutdown-and-private-helpers) |
| [`SessionService.#abortRuntime`](../../../../src/sessions/service.ts#L1243) | Method | slot | [文字解释](implementation/sessions.md#sessions-cancellation-and-native-execution) |
| [`SessionService.#executeTurn`](../../../../src/sessions/service.ts#L1258) | Method | slot, message, images | [文字解释](implementation/sessions.md#sessions-turn-state-machine) |
| [`SessionService.#completeHandledTurn`](../../../../src/sessions/service.ts#L1441) | Method | sessionId, runId, runtime, before, historyWasExpected | [文字解释](implementation/sessions.md#sessions-turn-state-machine) |
| [`SessionService.shutdown`](../../../../src/sessions/service.ts#L1504) | Method |  | [文字解释](implementation/sessions.md#sessions-shutdown-and-private-helpers) |
| [`SessionService.#configuration`](../../../../src/sessions/service.ts#L1577) | Method |  | [文字解释](implementation/sessions.md#session-identity-and-recovery) |
| [`SessionService.#admit`](../../../../src/sessions/service.ts#L1588) | Method |  | [文字解释](implementation/sessions.md#session-identity-and-recovery) |
| [`SessionService.#mutate`](../../../../src/sessions/service.ts#L1593) | Method | operation | [文字解释](implementation/sessions.md#session-identity-and-recovery) |
| [`SessionService.#read`](../../../../src/sessions/service.ts#L1607) | Method | operation | [文字解释](implementation/sessions.md#session-identity-and-recovery) |
| [`SessionService.#stored`](../../../../src/sessions/service.ts#L1637) | Method | id | [文字解释](implementation/sessions.md#sessions-create-open-close) |
| [`SessionService.#view`](../../../../src/sessions/service.ts#L1645) | Method | stored | [文字解释](implementation/sessions.md#sessions-create-open-close) |
| [`SessionService.#directory`](../../../../src/sessions/service.ts#L1693) | Method | path | [文字解释](implementation/sessions.md#sessions-create-open-close) |
| [`SessionService.#prune`](../../../../src/sessions/service.ts#L1709) | Method |  | [文字解释](implementation/sessions.md#sessions-create-open-close) |
| [`SessionService.#checkHistory`](../../../../src/sessions/service.ts#L1720) | Method | stored | [文字解释](implementation/sessions.md#sessions-history-results) |
| [`SessionService.#savedHistory`](../../../../src/sessions/service.ts#L1825) | Method | stored, options | [文字解释](implementation/sessions.md#sessions-history-results) |
| [`SessionService.#identityForEntries`](../../../../src/sessions/service.ts#L1843) | Method | entries | [文字解释](implementation/sessions.md#sessions-history-results) |
| [`SessionService.#identityForHistory`](../../../../src/sessions/service.ts#L1848) | Method | history | [文字解释](implementation/sessions.md#sessions-history-results) |
| [`SessionService.#observeRuntime`](../../../../src/sessions/service.ts#L1854) | Method | sessionId, runtime | [文字解释](implementation/sessions.md#sessions-cancellation-and-native-execution) |
| [`SessionService.#nativeExecutionEvent`](../../../../src/sessions/service.ts#L1888) | Method | sessionId, event, startedLate | [文字解释](implementation/sessions.md#sessions-cancellation-and-native-execution) |
| [`SessionService.#refreshNativeHistory`](../../../../src/sessions/service.ts#L1974) | Method | sessionId, executionId | [文字解释](implementation/sessions.md#sessions-cancellation-and-native-execution) |
| [`SessionService.#scheduleNativeStateRefresh`](../../../../src/sessions/service.ts#L2005) | Method | sessionId, executionId, runtime | [文字解释](implementation/sessions.md#sessions-cancellation-and-native-execution) |
| [`SessionService.#refreshNativeSessionState`](../../../../src/sessions/service.ts#L2035) | Method | sessionId, executionId, runtime | [文字解释](implementation/sessions.md#sessions-cancellation-and-native-execution) |
| [`SessionService.#open`](../../../../src/sessions/service.ts#L2086) | Method | stored, options | [文字解释](implementation/sessions.md#sessions-create-open-close) |
| [`SessionService.#rememberHistory`](../../../../src/sessions/service.ts#L2237) | Method | stored, runtime | [文字解释](implementation/sessions.md#sessions-create-open-close) |
| [`SessionService.#recordHistoryCheck`](../../../../src/sessions/service.ts#L1783) | Method | | [Read explanation](implementation/sessions.md#sessions-history-results) |
| [`SessionService.#historyCheckState`](../../../../src/sessions/service.ts#L1814) | Method | | [Read explanation](implementation/sessions.md#sessions-history-results) |
| [`SessionService.renameSession`](../../../../src/sessions/service.ts#L319) | Method |  | [Read explanation](implementation/sessions.md#sessions-shared-names) |
| [`SessionService.listLibraryReferences`](../../../../src/sessions/service.ts#L360) | Method | | [阅读说明](implementation/storage-integrations.md#library-reference-storage) |
| [`SessionService.addLibraryReference`](../../../../src/sessions/service.ts#L366) | Method | | [阅读说明](implementation/storage-integrations.md#library-reference-storage) |
| [`SessionService.removeLibraryReference`](../../../../src/sessions/service.ts#L381) | Method | | [阅读说明](implementation/storage-integrations.md#library-reference-storage) |


## src/shared/discovery.ts

文字解释：[validators](implementation/validators.md)

[查看源码](../../../../src/shared/discovery.ts) · 106 行

Local dependencies： [shared/sessions.ts](../../../../src/shared/sessions.ts), [shared/thinking.ts](../../../../src/shared/thinking.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`HostDirectoryEntry`](../../../../src/shared/discovery.ts#L4) | Interface |  | [文字解释](implementation/validators.md) |
| [`HostDirectoryListing`](../../../../src/shared/discovery.ts#L9) | Interface |  | [文字解释](implementation/validators.md) |
| [`PiModelOption`](../../../../src/shared/discovery.ts#L16) | Interface |  | [文字解释](implementation/validators.md) |
| [`AvailableModelsResponse`](../../../../src/shared/discovery.ts#L22) | Interface |  | [文字解释](implementation/validators.md) |
| [`PiSessionModelOption`](../../../../src/shared/discovery.ts#L26) | Interface |  | [文字解释](implementation/validators.md) |
| [`SessionModelsResponse`](../../../../src/shared/discovery.ts#L31) | Interface |  | [文字解释](implementation/validators.md) |
| [`isSessionModelsResponse`](../../../../src/shared/discovery.ts#L36) | Function | value | [文字解释](implementation/validators.md#discovery) |
| [`isObject`](../../../../src/shared/discovery.ts#L57) | Function | value | [文字解释](implementation/validators.md#discovery) |
| [`isAbsolutePath`](../../../../src/shared/discovery.ts#L61) | Function | value | [文字解释](implementation/validators.md#discovery) |
| [`isModelOption`](../../../../src/shared/discovery.ts#L68) | Function | value | [文字解释](implementation/validators.md#discovery) |
| [`isHostDirectoryListing`](../../../../src/shared/discovery.ts#L81) | Function | value | [文字解释](implementation/validators.md#discovery) |
| [`isAvailableModelsResponse`](../../../../src/shared/discovery.ts#L102) | Function | value | [文字解释](implementation/validators.md#discovery) |


## src/shared/events.ts

文字解释：[validators](implementation/validators.md)

[查看源码](../../../../src/shared/events.ts) · 527 行

Local dependencies： [shared/sessions.ts](../../../../src/shared/sessions.ts), [shared/turns.ts](../../../../src/shared/turns.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`STREAM_EVENT_MAX_BYTES`](../../../../src/shared/events.ts#L4) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`STREAM_SNAPSHOT_MAX_BYTES`](../../../../src/shared/events.ts#L5) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`TurnProjection`](../../../../src/shared/events.ts#L7) | Interface |  | [文字解释](implementation/validators.md) |
| [`LiveMessageTextRange`](../../../../src/shared/events.ts#L20) | Interface |  | [文字解释](implementation/validators.md) |
| [`LiveMessageBlock`](../../../../src/shared/events.ts#L26) | TypeAlias |  | [文字解释](implementation/validators.md) |
| [`LiveMessageBlockDelta`](../../../../src/shared/events.ts#L42) | TypeAlias |  | [文字解释](implementation/validators.md) |
| [`LiveMessage`](../../../../src/shared/events.ts#L46) | Interface |  | [文字解释](implementation/validators.md) |
| [`LiveMessageDelta`](../../../../src/shared/events.ts#L56) | Interface |  | [文字解释](implementation/validators.md) |
| [`LiveTool`](../../../../src/shared/events.ts#L63) | Interface |  | [文字解释](implementation/validators.md) |
| [`LiveProjection`](../../../../src/shared/events.ts#L75) | Interface |  | [文字解释](implementation/validators.md) |
| [`SessionSnapshot`](../../../../src/shared/events.ts#L81) | Interface |  | [文字解释](implementation/validators.md) |
| [`StreamEventBase`](../../../../src/shared/events.ts#L89) | Interface |  | [文字解释](implementation/validators.md) |
| [`ProjectionLimitScope`](../../../../src/shared/events.ts#L95) | TypeAlias |  | [文字解释](implementation/validators.md) |
| [`StreamFrame`](../../../../src/shared/events.ts#L103) | TypeAlias |  | [文字解释](implementation/validators.md) |
| [`UUID`](../../../../src/shared/events.ts#L137) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`CURSOR`](../../../../src/shared/events.ts#L138) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`SESSION_KEYS`](../../../../src/shared/events.ts#L139) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`TURN_PROJECTION_KEYS`](../../../../src/shared/events.ts#L157) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`SNAPSHOT_KEYS`](../../../../src/shared/events.ts#L169) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`LIVE_KEYS`](../../../../src/shared/events.ts#L170) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`MESSAGE_KEYS`](../../../../src/shared/events.ts#L171) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`MESSAGE_DELTA_KEYS`](../../../../src/shared/events.ts#L172) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`TOOL_KEYS`](../../../../src/shared/events.ts#L173) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`MAX_LIVE_MESSAGE_BLOCKS`](../../../../src/shared/events.ts#L174) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`MAX_LIVE_TEXT_RANGES`](../../../../src/shared/events.ts#L175) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`isRecord`](../../../../src/shared/events.ts#L177) | Function | value | [文字解释](implementation/validators.md#stream-primitives) |
| [`hasExactKeys`](../../../../src/shared/events.ts#L181) | Function | value, expected | [文字解释](implementation/validators.md#stream-primitives) |
| [`isBoundedString`](../../../../src/shared/events.ts#L186) | Function | value, maxBytes | [文字解释](implementation/validators.md#stream-primitives) |
| [`isCursorFor`](../../../../src/shared/events.ts#L190) | Function | value, sessionId | [文字解释](implementation/validators.md#stream-primitives) |
| [`isSession`](../../../../src/shared/events.ts#L201) | Function | value | [文字解释](implementation/validators.md#stream-primitives) |
| [`isTurnProjection`](../../../../src/shared/events.ts#L213) | Function | value | [文字解释](implementation/validators.md#stream-primitives) |
| [`isLiveMessage`](../../../../src/shared/events.ts#L254) | Function | value | [文字解释](implementation/validators.md#stream-primitives) |
| [`isLiveMessageDelta`](../../../../src/shared/events.ts#L334) | Function | value | [文字解释](implementation/validators.md#stream-primitives) |
| [`isLiveTool`](../../../../src/shared/events.ts#L366) | Function | value | [文字解释](implementation/validators.md#stream-primitives) |
| [`isLiveProjection`](../../../../src/shared/events.ts#L392) | Function | value | [文字解释](implementation/validators.md#stream-primitives) |
| [`hasBoundedJsonSize`](../../../../src/shared/events.ts#L406) | Function | value, maxBytes | [文字解释](implementation/validators.md#stream-frame) |
| [`isCommonEvent`](../../../../src/shared/events.ts#L414) | Function | value | [文字解释](implementation/validators.md#stream-frame) |
| [`isStreamFrame`](../../../../src/shared/events.ts#L424) | Function | value | [文字解释](implementation/validators.md#stream-frame) |


## src/shared/history.ts

文字解释：[validators](implementation/validators.md)

[查看源码](../../../../src/shared/history.ts) · 229 行

Local dependencies： [shared/sessions.ts](../../../../src/shared/sessions.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`HistoryBlock`](../../../../src/shared/history.ts#L3) | Interface |  | [文字解释](implementation/validators.md) |
| [`ContextSource`](../../../../src/shared/history.ts#L12) | Interface |  | [文字解释](implementation/validators.md) |
| [`HistoryEntry`](../../../../src/shared/history.ts#L19) | Interface |  | [文字解释](implementation/validators.md) |
| [`HistoryPage`](../../../../src/shared/history.ts#L43) | Interface |  | [文字解释](implementation/validators.md) |
| [`IMAGE_MIME_TYPES`](../../../../src/shared/history.ts#L64) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`record`](../../../../src/shared/history.ts#L66) | Function | value | [文字解释](implementation/validators.md#history) |
| [`text`](../../../../src/shared/history.ts#L69) | Function | value, limit | [文字解释](implementation/validators.md#history) |
| [`optionalText`](../../../../src/shared/history.ts#L72) | Function | value | [文字解释](implementation/validators.md#history) |
| [`optionalUuid`](../../../../src/shared/history.ts#L75) | Function | value | [文字解释](implementation/validators.md#history) |
| [`exact`](../../../../src/shared/history.ts#L78) | Function | value, keys | [文字解释](implementation/validators.md#history) |
| [`block`](../../../../src/shared/history.ts#L83) | Function | value | [文字解释](implementation/validators.md#history) |
| [`contextSource`](../../../../src/shared/history.ts#L104) | Function | value | [文字解释](implementation/validators.md#history) |
| [`entry`](../../../../src/shared/history.ts#L114) | Function | value | [文字解释](implementation/validators.md#history) |
| [`isHistoryPage`](../../../../src/shared/history.ts#L167) | Function | value | [文字解释](implementation/validators.md#history) |


## src/shared/images.ts

文字解释：[validators](implementation/validators.md)

[查看源码](../../../../src/shared/images.ts) · 98 行

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`MAX_IMAGE_COUNT`](../../../../src/shared/images.ts#L3) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`MAX_IMAGE_BYTES`](../../../../src/shared/images.ts#L4) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`MAX_IMAGE_TOTAL_BYTES`](../../../../src/shared/images.ts#L5) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`MIME_TYPES`](../../../../src/shared/images.ts#L7) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`BASE64`](../../../../src/shared/images.ts#L8) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`ImageContent`](../../../../src/shared/images.ts#L11) | Interface |  | [文字解释](implementation/validators.md) |
| [`object`](../../../../src/shared/images.ts#L17) | Function | value | [文字解释](implementation/validators.md#images) |
| [`base64ByteLength`](../../../../src/shared/images.ts#L21) | Function | value | [文字解释](implementation/validators.md#images) |
| [`decoded`](../../../../src/shared/images.ts#L34) | Function | value | [文字解释](implementation/validators.md#images) |
| [`signature`](../../../../src/shared/images.ts#L47) | Function | bytes, mimeType | [文字解释](implementation/validators.md#images) |
| [`isImageContent`](../../../../src/shared/images.ts#L64) | Function | value | [文字解释](implementation/validators.md#images) |
| [`imageByteLength`](../../../../src/shared/images.ts#L81) | Function | value | [文字解释](implementation/validators.md#images) |
| [`isImageContentArray`](../../../../src/shared/images.ts#L86) | Function | value | [文字解释](implementation/validators.md#images) |


## src/shared/protocol.ts

文字解释：[validators](implementation/validators.md)

[查看源码](../../../../src/shared/protocol.ts) · 48 行

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`DEFAULT_PORT`](../../../../src/shared/protocol.ts#L1) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`HostStatus`](../../../../src/shared/protocol.ts#L3) | Interface |  | [文字解释](implementation/validators.md) |
| [`isHostStatus`](../../../../src/shared/protocol.ts#L14) | Function | value | [文字解释](implementation/validators.md#host) |


## src/shared/sessions.ts

文字解释：[validators](implementation/validators.md)

[查看源码](../../../../src/shared/sessions.ts) · 234 行

Local dependencies： [shared/thinking.ts](../../../../src/shared/thinking.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`SESSION_ID`](../../../../src/shared/sessions.ts#L3) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`RuntimeConfiguration`](../../../../src/shared/sessions.ts#L5) | Interface |  | [文字解释](implementation/validators.md) |
| [`SessionCreateRequest`](../../../../src/shared/sessions.ts#L10) | Interface |  | [文字解释](implementation/validators.md) |
| [`SessionModelRequest`](../../../../src/shared/sessions.ts#L17) | Interface |  | [文字解释](implementation/validators.md) |
| [`NativeExecutionInfo`](../../../../src/shared/sessions.ts#L30) | Interface |  | [文字解释](implementation/validators.md) |
| [`SessionInfo`](../../../../src/shared/sessions.ts#L44) | Interface |  | [文字解释](implementation/validators.md) |
| [`isRuntimeConfiguration`](../../../../src/shared/sessions.ts#L77) | Function | value | [文字解释](implementation/validators.md#sessions) |
| [`isSessionInfo`](../../../../src/shared/sessions.ts#L89) | Function | value | [文字解释](implementation/validators.md#sessions) |
| [`isNativeExecutionInfo`](../../../../src/shared/sessions.ts#L196) | Function | value | [文字解释](implementation/validators.md#sessions) |
| [`isSessionModelRequest`](../../../../src/shared/sessions.ts#L214) | Function | value | [文字解释](implementation/validators.md#sessions) |
| [`isHistoryCheck`](../../../../src/shared/sessions.ts#L181) | Function | | [Read explanation](implementation/validators.md#sessions) |
| [`isSessionDisplayName`](../../../../src/shared/sessions.ts#L149) | Function |  | [Read explanation](implementation/validators.md#sessions) |
| [`isSessionNameRequest`](../../../../src/shared/sessions.ts#L160) | Function |  | [Read explanation](implementation/validators.md#sessions) |
| [`mergeSessionMetadata`](../../../../src/shared/sessions.ts#L67) | Function |  | [Read explanation](implementation/validators.md#sessions) |

## src/shared/thinking.ts

文字解释：[validators](implementation/validators.md)

[查看源码](../../../../src/shared/thinking.ts) · 66 行

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`THINKING_LEVELS`](../../../../src/shared/thinking.ts#L1) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`ThinkingLevel`](../../../../src/shared/thinking.ts#L3) | TypeAlias |  | [文字解释](implementation/validators.md) |
| [`ModelCapabilitiesRequest`](../../../../src/shared/thinking.ts#L5) | Interface |  | [文字解释](implementation/validators.md) |
| [`ModelCapabilitiesResponse`](../../../../src/shared/thinking.ts#L10) | Interface |  | [文字解释](implementation/validators.md) |
| [`isObject`](../../../../src/shared/thinking.ts#L15) | Function | value | [文字解释](implementation/validators.md#discovery) |
| [`isThinkingLevel`](../../../../src/shared/thinking.ts#L19) | Function | value | [文字解释](implementation/validators.md#discovery) |
| [`isModelCapabilitiesRequest`](../../../../src/shared/thinking.ts#L23) | Function | value | [文字解释](implementation/validators.md#discovery) |
| [`isModelCapabilitiesResponse`](../../../../src/shared/thinking.ts#L38) | Function | value | [文字解释](implementation/validators.md#discovery) |


## src/shared/turns.ts

文字解释：[validators](implementation/validators.md)

[查看源码](../../../../src/shared/turns.ts) · 149 行

Local dependencies： [shared/images.ts](../../../../src/shared/images.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`TurnStatus`](../../../../src/shared/turns.ts#L3) | TypeAlias |  | [文字解释](implementation/validators.md) |
| [`TurnError`](../../../../src/shared/turns.ts#L12) | Interface |  | [文字解释](implementation/validators.md) |
| [`TurnCreateRequest`](../../../../src/shared/turns.ts#L17) | Interface |  | [文字解释](implementation/validators.md) |
| [`TurnInfo`](../../../../src/shared/turns.ts#L23) | Interface |  | [文字解释](implementation/validators.md) |
| [`UUID`](../../../../src/shared/turns.ts#L35) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`TURN_STATUSES`](../../../../src/shared/turns.ts#L36) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`TURN_INFO_KEYS`](../../../../src/shared/turns.ts#L45) | Module value | 由 initializer 推断 | [文字解释](implementation/validators.md) |
| [`hasExactKeys`](../../../../src/shared/turns.ts#L57) | Function | value, expected | [文字解释](implementation/validators.md#turns) |
| [`isUuid`](../../../../src/shared/turns.ts#L62) | Function | value | [文字解释](implementation/validators.md#turns) |
| [`isTimestamp`](../../../../src/shared/turns.ts#L66) | Function | value | [文字解释](implementation/validators.md#turns) |
| [`isTurnError`](../../../../src/shared/turns.ts#L70) | Function | value | [文字解释](implementation/validators.md#turns) |
| [`isTurnCreateRequest`](../../../../src/shared/turns.ts#L85) | Function | value | [文字解释](implementation/validators.md#turns) |
| [`isTurnInfo`](../../../../src/shared/turns.ts#L114) | Function | value | [文字解释](implementation/validators.md#turns) |


## src/storage/catalog.ts

文字解释：[catalog](implementation/catalog.md)

[查看源码](../../../../src/storage/catalog.ts) · 1108 行

Local dependencies： [local/files.ts](../../../../src/local/files.ts), [local/paths.ts](../../../../src/local/paths.ts), [shared/thinking.ts](../../../../src/shared/thinking.ts), [shared/sessions.ts](../../../../src/shared/sessions.ts), [shared/turns.ts](../../../../src/shared/turns.ts).

| Symbol | 类型 | Parameter 或 type | 文字解释 |
| --- | --- | --- | --- |
| [`StoredSession`](../../../../src/storage/catalog.ts#L19) | Interface |  | [文字解释](implementation/catalog.md) |
| [`StoredTurn`](../../../../src/storage/catalog.ts#L39) | Interface |  | [文字解释](implementation/catalog.md) |
| [`SCHEMA_VERSION`](../../../../src/storage/catalog.ts#L41) | Module value | 由 initializer 推断 | [文字解释](implementation/catalog.md) |
| [`V1_SCHEMA_VERSION`](../../../../src/storage/catalog.ts#L44) | Module value | 由 initializer 推断 | [文字解释](implementation/catalog.md) |
| [`V2_SCHEMA_VERSION`](../../../../src/storage/catalog.ts#L45) | Module value | 由 initializer 推断 | [文字解释](implementation/catalog.md) |
| [`V3_SCHEMA_VERSION`](../../../../src/storage/catalog.ts#L46) | Module value | 由 initializer 推断 | [文字解释](implementation/catalog.md) |
| [`DATABASE_NAME`](../../../../src/storage/catalog.ts#L50) | Module value | 由 initializer 推断 | [文字解释](implementation/catalog.md) |
| [`SESSION_COLUMNS`](../../../../src/storage/catalog.ts#L51) | Module value | 由 initializer 推断 | [文字解释](implementation/catalog.md) |
| [`V3_SESSION_COLUMNS`](../../../../src/storage/catalog.ts#L66) | Module value | 由 initializer 推断 | [文字解释](implementation/catalog.md) |
| [`CONFIGURATION_SCHEMA`](../../../../src/storage/catalog.ts#L71) | Module value | 由 initializer 推断 | [文字解释](implementation/catalog.md) |
| [`V2_SESSIONS_SCHEMA`](../../../../src/storage/catalog.ts#L73) | Module value | 由 initializer 推断 | [文字解释](implementation/catalog.md) |
| [`V3_SESSIONS_SCHEMA`](../../../../src/storage/catalog.ts#L75) | Module value | 由 initializer 推断 | [文字解释](implementation/catalog.md) |
| [`SESSIONS_SCHEMA`](../../../../src/storage/catalog.ts#L81) | Module value | 由 initializer 推断 | [文字解释](implementation/catalog.md) |
| [`TURNS_SCHEMA`](../../../../src/storage/catalog.ts#L83) | Module value | 由 initializer 推断 | [文字解释](implementation/catalog.md) |
| [`ACTIVE_TURN_INDEX`](../../../../src/storage/catalog.ts#L85) | Module value | 由 initializer 推断 | [文字解释](implementation/catalog.md) |
| [`TURN_COLUMNS`](../../../../src/storage/catalog.ts#L87) | Module value | 由 initializer 推断 | [文字解释](implementation/catalog.md) |
| [`SESSION_STATUSES`](../../../../src/storage/catalog.ts#L94) | Module value | 由 initializer 推断 | [文字解释](implementation/catalog.md) |
| [`TURN_STATUSES`](../../../../src/storage/catalog.ts#L95) | Module value | 由 initializer 推断 | [文字解释](implementation/catalog.md) |
| [`TERMINAL_TURN_STATUSES`](../../../../src/storage/catalog.ts#L104) | Module value | 由 initializer 推断 | [文字解释](implementation/catalog.md) |
| [`ALLOWED_TURN_TRANSITIONS`](../../../../src/storage/catalog.ts#L110) | Module value | `Readonly<Record<TurnStatus, ReadonlySet<TurnStatus>>>` | [文字解释](implementation/catalog.md) |
| [`PAYLOAD_IDENTITY`](../../../../src/storage/catalog.ts#L119) | Module value | 由 initializer 推断 | [文字解释](implementation/catalog.md) |
| [`isSessionStatus`](../../../../src/storage/catalog.ts#L121) | Function | value | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`isTurnStatus`](../../../../src/storage/catalog.ts#L125) | Function | value | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`invalidCatalog`](../../../../src/storage/catalog.ts#L129) | Function | reason | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`isNonEmptyString`](../../../../src/storage/catalog.ts#L135) | Function | value | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`isNullableNonEmptyString`](../../../../src/storage/catalog.ts#L139) | Function | value | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`isSafeIntegerValue`](../../../../src/storage/catalog.ts#L143) | Function | value | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`isStoredSession`](../../../../src/storage/catalog.ts#L153) | Function | value | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`hasExactKeys`](../../../../src/storage/catalog.ts#L220) | Function | value, expected | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`isStoredTurn`](../../../../src/storage/catalog.ts#L225) | Function | value | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`assertRuntimeConfiguration`](../../../../src/storage/catalog.ts#L273) | Function | value | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`integerFromDatabase`](../../../../src/storage/catalog.ts#L297) | Function | row, column | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`stringFromDatabase`](../../../../src/storage/catalog.ts#L311) | Function | row, column | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`nullableStringFromDatabase`](../../../../src/storage/catalog.ts#L351) | Function | row, column | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`nullableThinkingLevelFromDatabase`](../../../../src/storage/catalog.ts#L363) | Function | row | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`sessionFromDatabase`](../../../../src/storage/catalog.ts#L384) | Function | row | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`entryIdsFromDatabase`](../../../../src/storage/catalog.ts#L415) | Function | row | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`nullableErrorFromDatabase`](../../../../src/storage/catalog.ts#L435) | Function | row | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`turnFromDatabase`](../../../../src/storage/catalog.ts#L450) | Function | row | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`databaseRows`](../../../../src/storage/catalog.ts#L474) | Function | database, sql | [文字解释](implementation/catalog.md#catalog-schema-and-migrations) |
| [`hasUserSchema`](../../../../src/storage/catalog.ts#L478) | Function | database | [文字解释](implementation/catalog.md#catalog-schema-and-migrations) |
| [`verifySchema`](../../../../src/storage/catalog.ts#L487) | Function | database, version | [文字解释](implementation/catalog.md#catalog-schema-and-migrations) |
| [`migrateV2ToV3`](../../../../src/storage/catalog.ts#L538) | Function | database | [文字解释](implementation/catalog.md#catalog-schema-and-migrations) |
| [`migrateV3ToV4`](../../../../src/storage/catalog.ts#L554) | Function | database | [文字解释](implementation/catalog.md#catalog-schema-and-migrations) |
| [`initializeSchema`](../../../../src/storage/catalog.ts#L604) | Function | database | [文字解释](implementation/catalog.md#catalog-schema-and-migrations) |
| [`validateDatabaseFile`](../../../../src/storage/catalog.ts#L678) | Function | path | [文字解释](implementation/catalog.md#catalog-file-safety-and-open) |
| [`validateRecord`](../../../../src/storage/catalog.ts#L702) | Function | value | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`validateTurnRecord`](../../../../src/storage/catalog.ts#L706) | Function | value | [文字解释](implementation/catalog.md#catalog-records-and-validation) |
| [`SessionCatalog`](../../../../src/storage/catalog.ts#L710) | Class |  | [文字解释](implementation/catalog.md) |
| [`SessionCatalog.database`](../../../../src/storage/catalog.ts#L711) | Property |  | [文字解释](implementation/catalog.md) |
| [`SessionCatalog.constructor`](../../../../src/storage/catalog.ts#L713) | Constructor | database | [文字解释](implementation/catalog.md#catalog-file-safety-and-open) |
| [`SessionCatalog.open`](../../../../src/storage/catalog.ts#L717) | Method | dataDir | [文字解释](implementation/catalog.md#catalog-file-safety-and-open) |
| [`SessionCatalog.configuration`](../../../../src/storage/catalog.ts#L756) | Method |  | [文字解释](implementation/catalog.md#catalog-session-operations) |
| [`SessionCatalog.configure`](../../../../src/storage/catalog.ts#L766) | Method | config | [文字解释](implementation/catalog.md#catalog-session-operations) |
| [`SessionCatalog.list`](../../../../src/storage/catalog.ts#L830) | Method |  | [文字解释](implementation/catalog.md#catalog-session-operations) |
| [`SessionCatalog.get`](../../../../src/storage/catalog.ts#L837) | Method | id | [文字解释](implementation/catalog.md#catalog-session-operations) |
| [`SessionCatalog.findRequest`](../../../../src/storage/catalog.ts#L844) | Method | requestId | [文字解释](implementation/catalog.md#catalog-session-operations) |
| [`SessionCatalog.insert`](../../../../src/storage/catalog.ts#L851) | Method | record | [文字解释](implementation/catalog.md#catalog-session-operations) |
| [`SessionCatalog.update`](../../../../src/storage/catalog.ts#L927) | Method | record | [文字解释](implementation/catalog.md#catalog-session-operations) |
| [`SessionCatalog.interruptCreating`](../../../../src/storage/catalog.ts#L956) | Method | now | [文字解释](implementation/catalog.md#catalog-session-operations) |
| [`SessionCatalog.insertTurn`](../../../../src/storage/catalog.ts#L966) | Method | record | [文字解释](implementation/catalog.md#catalog-turn-operations) |
| [`SessionCatalog.updateTurn`](../../../../src/storage/catalog.ts#L985) | Method | record | [文字解释](implementation/catalog.md#catalog-turn-operations) |
| [`SessionCatalog.getTurn`](../../../../src/storage/catalog.ts#L1023) | Method | sessionId, runId | [文字解释](implementation/catalog.md#catalog-turn-operations) |
| [`SessionCatalog.findTurnRequest`](../../../../src/storage/catalog.ts#L1030) | Method | sessionId, requestId | [文字解释](implementation/catalog.md#catalog-turn-operations) |
| [`SessionCatalog.latestTurn`](../../../../src/storage/catalog.ts#L1037) | Method | sessionId | [文字解释](implementation/catalog.md#catalog-turn-operations) |
| [`SessionCatalog.activeTurn`](../../../../src/storage/catalog.ts#L1044) | Method | sessionId | [文字解释](implementation/catalog.md#catalog-turn-operations) |
| [`SessionCatalog.listTurns`](../../../../src/storage/catalog.ts#L1053) | Method |  | [文字解释](implementation/catalog.md#catalog-turn-operations) |
| [`SessionCatalog.markTurnDispatching`](../../../../src/storage/catalog.ts#L1060) | Method | record, session | [文字解释](implementation/catalog.md#catalog-turn-operations) |
| [`SessionCatalog.interruptTurns`](../../../../src/storage/catalog.ts#L1083) | Method | now | [文字解释](implementation/catalog.md#catalog-turn-operations) |
| [`SessionCatalog.close`](../../../../src/storage/catalog.ts#L1105) | Method |  | [文字解释](implementation/catalog.md#catalog-turn-operations) |
| [`isHistoryCheckState`](../../../../src/storage/catalog.ts#L147) | Function | | [Read explanation](implementation/catalog.md#catalog-records-and-validation) |
| [`nullableHistoryCheckFromDatabase`](../../../../src/storage/catalog.ts#L372) | Function | | [Read explanation](implementation/catalog.md#catalog-records-and-validation) |
| [`migrateV4ToV5`](../../../../src/storage/catalog.ts#L570) | Function | | [Read explanation](implementation/catalog.md#catalog-schema-and-migrations) |
| [`migrateV5ToV6`](../../../../src/storage/catalog.ts#L586) | Function |  | [Read explanation](implementation/catalog.md#catalog-session-names) |
| [`SessionCatalog.rename`](../../../../src/storage/catalog.ts#L879) | Method |  | [Read explanation](implementation/catalog.md#catalog-session-names) |
| [`isCanonicalLibraryRoot`](../../../../src/storage/catalog.ts#L319) | Function | | [阅读说明](implementation/storage-integrations.md#library-reference-storage) |
| [`libraryBindingFromDatabase`](../../../../src/storage/catalog.ts#L329) | Function | | [阅读说明](implementation/storage-integrations.md#library-reference-storage) |
| [`libraryReferenceFromDatabase`](../../../../src/storage/catalog.ts#L341) | Function | | [阅读说明](implementation/storage-integrations.md#library-reference-storage) |
| [`migrateV6ToV7`](../../../../src/storage/catalog.ts#L597) | Function | | [阅读说明](implementation/storage-integrations.md#library-reference-storage) |
| [`SessionCatalog.bindLibrary`](../../../../src/storage/catalog.ts#L775) | Method | | [阅读说明](implementation/storage-integrations.md#library-reference-storage) |
| [`SessionCatalog.listLibraryReferences`](../../../../src/storage/catalog.ts#L800) | Method | | [阅读说明](implementation/storage-integrations.md#library-reference-storage) |
| [`SessionCatalog.addLibraryReference`](../../../../src/storage/catalog.ts#L810) | Method | | [阅读说明](implementation/storage-integrations.md#library-reference-storage) |
| [`SessionCatalog.removeLibraryReference`](../../../../src/storage/catalog.ts#L820) | Method | | [阅读说明](implementation/storage-integrations.md#library-reference-storage) |
| [`SessionCatalog.#validateLibraryRows`](../../../../src/storage/catalog.ts#L1093) | Method | | [阅读说明](implementation/storage-integrations.md#library-reference-storage) |


## src/integrations/configuration.ts

文字解释: [storage integrations](implementation/storage-integrations.md#integration-configuration)

[查看源码](../../../../src/integrations/configuration.ts) · 70 行

Local dependencies: [src/local/files.ts](../../../../src/local/files.ts), [src/local/paths.ts](../../../../src/local/paths.ts), [src/runtime/pi-rpc.ts](../../../../src/runtime/pi-rpc.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`IntegrationsConfiguration`](../../../../src/integrations/configuration.ts#L7) | Interface | | [Read explanation](implementation/storage-integrations.md#integration-configuration) |
| [`absolutePath`](../../../../src/integrations/configuration.ts#L13) | Function | | [Read explanation](implementation/storage-integrations.md#integration-configuration) |
| [`readIntegrations`](../../../../src/integrations/configuration.ts#L17) | Function | | [Read explanation](implementation/storage-integrations.md#integration-configuration) |

## src/integrations/distill.ts

文字解释: [storage integrations](implementation/storage-integrations.md#integration-configuration)

[查看源码](../../../../src/integrations/distill.ts) · 99 行

Local dependencies: [src/runtime/pi-rpc.ts](../../../../src/runtime/pi-rpc.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`DistillModuleConfiguration`](../../../../src/integrations/distill.ts#L4) | Interface | | [Read explanation](implementation/storage-integrations.md#integration-configuration) |
| [`DistillSource`](../../../../src/integrations/distill.ts#L9) | Interface | | [Read explanation](implementation/storage-integrations.md#integration-configuration) |
| [`DistillChild`](../../../../src/integrations/distill.ts#L16) | Interface | | [Read explanation](implementation/storage-integrations.md#integration-configuration) |
| [`DistillUseSource`](../../../../src/integrations/distill.ts#L21) | Type alias | | [Read explanation](implementation/storage-integrations.md#integration-configuration) |
| [`DistillUseRecord`](../../../../src/integrations/distill.ts#L27) | Interface | | [Read explanation](implementation/storage-integrations.md#integration-configuration) |
| [`DistillRecovery`](../../../../src/integrations/distill.ts#L39) | Type alias | | [Read explanation](implementation/storage-integrations.md#integration-configuration) |
| [`DistillDeletionReceipt`](../../../../src/integrations/distill.ts#L43) | Interface | | [Read explanation](implementation/storage-integrations.md#integration-configuration) |
| [`DistillRead`](../../../../src/integrations/distill.ts#L52) | Interface | | [Read explanation](implementation/storage-integrations.md#integration-configuration) |
| [`DistillUse`](../../../../src/integrations/distill.ts#L57) | Interface | | [Read explanation](implementation/storage-integrations.md#integration-configuration) |
| [`DistillStorage`](../../../../src/integrations/distill.ts#L64) | Interface | | [Read explanation](implementation/storage-integrations.md#integration-configuration) |
| [`isDistillStorage`](../../../../src/integrations/distill.ts#L74) | Function | | [Read explanation](implementation/storage-integrations.md#integration-configuration) |
| [`openDistill`](../../../../src/integrations/distill.ts#L87) | Function | | [Read explanation](implementation/storage-integrations.md#integration-configuration) |

## src/sessions/source-access.ts

文字解释: [storage integrations](implementation/storage-integrations.md#source-read-coordination)

[查看源码](../../../../src/sessions/source-access.ts) · 145 行

Local dependencies: [src/integrations/distill.ts](../../../../src/integrations/distill.ts), [src/storage/catalog.ts](../../../../src/storage/catalog.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`SourceSession`](../../../../src/sessions/source-access.ts#L4) | Type alias | | [Read explanation](implementation/storage-integrations.md#source-read-coordination) |
| [`OpeningSource`](../../../../src/sessions/source-access.ts#L6) | Interface | | [Read explanation](implementation/storage-integrations.md#source-read-coordination) |
| [`SourceAccessError`](../../../../src/sessions/source-access.ts#L11) | Class | | [Read explanation](implementation/storage-integrations.md#source-read-coordination) |
| [`SourceAccessError.constructor`](../../../../src/sessions/source-access.ts#L12) | Constructor | | [Read explanation](implementation/storage-integrations.md#source-read-coordination) |
| [`SessionSourceAccess`](../../../../src/sessions/source-access.ts#L21) | Class | | [Read explanation](implementation/storage-integrations.md#source-read-coordination) |
| [`SessionSourceAccess.#storage`](../../../../src/sessions/source-access.ts#L22) | Property | | [Read explanation](implementation/storage-integrations.md#source-read-coordination) |
| [`SessionSourceAccess.#reads`](../../../../src/sessions/source-access.ts#L23) | Property | | [Read explanation](implementation/storage-integrations.md#source-read-coordination) |
| [`SessionSourceAccess.#children`](../../../../src/sessions/source-access.ts#L24) | Property | | [Read explanation](implementation/storage-integrations.md#source-read-coordination) |
| [`SessionSourceAccess.#releases`](../../../../src/sessions/source-access.ts#L25) | Property | | [Read explanation](implementation/storage-integrations.md#source-read-coordination) |
| [`SessionSourceAccess.constructor`](../../../../src/sessions/source-access.ts#L27) | Constructor | | [Read explanation](implementation/storage-integrations.md#source-read-coordination) |
| [`SessionSourceAccess.read`](../../../../src/sessions/source-access.ts#L35) | Method | | [Read explanation](implementation/storage-integrations.md#source-read-coordination) |
| [`SessionSourceAccess.#releaseRead`](../../../../src/sessions/source-access.ts#L59) | Method | lease | [阅读说明](implementation/storage-integrations.md#source-read-coordination) |
| [`SessionSourceAccess.begin`](../../../../src/sessions/source-access.ts#L69) | Method | | [Read explanation](implementation/storage-integrations.md#source-read-coordination) |
| [`SessionSourceAccess.drain`](../../../../src/sessions/source-access.ts#L111) | Method | | [Read explanation](implementation/storage-integrations.md#source-read-coordination) |
| [`SessionSourceAccess.#release`](../../../../src/sessions/source-access.ts#L137) | Method | | [Read explanation](implementation/storage-integrations.md#source-read-coordination) |



## src/integrations/current.ts

[Open source](../../../../src/integrations/current.ts)

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`record`](../../../../src/integrations/current.ts#L70) | Function | | [阅读说明](implementation/storage-integrations.md#current-library-api) |
| [`isLibraryModule`](../../../../src/integrations/current.ts#L74) | Function | | [阅读说明](implementation/storage-integrations.md#current-library-api) |
| [`isContentLibrary`](../../../../src/integrations/current.ts#L84) | Function | | [阅读说明](implementation/storage-integrations.md#current-library-api) |
| [`clip`](../../../../src/integrations/current.ts#L95) | Function | | [阅读说明](implementation/storage-integrations.md#current-library-api) |
| [`unavailable`](../../../../src/integrations/current.ts#L104) | Function | | [阅读说明](implementation/storage-integrations.md#current-library-api) |
| [`CurrentLibraryError.constructor`](../../../../src/integrations/current.ts#L111) | Constructor | | [阅读说明](implementation/storage-integrations.md#current-library-api) |
| [`CurrentLibrary.constructor`](../../../../src/integrations/current.ts#L124) | Constructor | | [阅读说明](implementation/storage-integrations.md#current-library-api) |
| [`CurrentLibrary.open`](../../../../src/integrations/current.ts#L130) | Method | | [阅读说明](implementation/storage-integrations.md#current-library-api) |
| [`CurrentLibrary.search`](../../../../src/integrations/current.ts#L158) | Method | | [阅读说明](implementation/storage-integrations.md#current-library-api) |
| [`CurrentLibrary.latest`](../../../../src/integrations/current.ts#L172) | Method | | [阅读说明](implementation/storage-integrations.md#current-library-api) |
| [`CurrentLibrary.read`](../../../../src/integrations/current.ts#L183) | Method | | [阅读说明](implementation/storage-integrations.md#current-library-api) |
| [`CurrentLibrary.close`](../../../../src/integrations/current.ts#L202) | Method | | [阅读说明](implementation/storage-integrations.md#current-library-api) |
| [`CurrentLibrary.#call`](../../../../src/integrations/current.ts#L210) | Method | | [阅读说明](implementation/storage-integrations.md#current-library-api) |
| [`CurrentLibrary.#project`](../../../../src/integrations/current.ts#L220) | Method | | [阅读说明](implementation/storage-integrations.md#current-library-api) |
| [`CurrentLibraryConfig`](../../../../src/integrations/current.ts#L17) | Interface | | [Read explanation](implementation/storage-integrations.md#current-library-api) |
| [`CurrentLibraryModuleV1`](../../../../src/integrations/current.ts#L23) | Interface | | [Read explanation](implementation/storage-integrations.md#current-library-api) |
| [`CurrentContentLibraryV1`](../../../../src/integrations/current.ts#L29) | Interface | | [Read explanation](implementation/storage-integrations.md#current-library-api) |
| [`CurrentContentItem`](../../../../src/integrations/current.ts#L43) | Interface | | [Read explanation](implementation/storage-integrations.md#current-library-api) |
| [`CurrentLibraryBatch`](../../../../src/integrations/current.ts#L58) | Interface | | [Read explanation](implementation/storage-integrations.md#current-library-api) |
| [`ERROR_MESSAGES`](../../../../src/integrations/current.ts#L63) | Module value | | [Read explanation](implementation/storage-integrations.md#current-library-api) |
| [`CurrentLibraryError`](../../../../src/integrations/current.ts#L108) | Class | | [Read explanation](implementation/storage-integrations.md#current-library-api) |
| [`CurrentLibraryError.code`](../../../../src/integrations/current.ts#L109) | Property | | [Read explanation](implementation/storage-integrations.md#current-library-api) |
| [`CurrentLibrary`](../../../../src/integrations/current.ts#L119) | Class | | [Read explanation](implementation/storage-integrations.md#current-library-api) |
| [`CurrentLibrary.binding`](../../../../src/integrations/current.ts#L120) | Property | | [Read explanation](implementation/storage-integrations.md#current-library-api) |
| [`CurrentLibrary.root`](../../../../src/integrations/current.ts#L121) | Property | | [Read explanation](implementation/storage-integrations.md#current-library-api) |
| [`CurrentLibrary.#api`](../../../../src/integrations/current.ts#L122) | Property | | [Read explanation](implementation/storage-integrations.md#current-library-api) |


## src/shared/library.ts

[Open source](../../../../src/shared/library.ts)

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`record`](../../../../src/shared/library.ts#L63) | Function | | [阅读说明](implementation/storage-integrations.md#library-contract-guards) |
| [`exact`](../../../../src/shared/library.ts#L67) | Function | | [阅读说明](implementation/storage-integrations.md#library-contract-guards) |
| [`keysWithOptional`](../../../../src/shared/library.ts#L73) | Function | | [阅读说明](implementation/storage-integrations.md#library-contract-guards) |
| [`text`](../../../../src/shared/library.ts#L82) | Function | | [阅读说明](implementation/storage-integrations.md#library-contract-guards) |
| [`isLibraryBinding`](../../../../src/shared/library.ts#L93) | Function | | [阅读说明](implementation/storage-integrations.md#library-contract-guards) |
| [`source`](../../../../src/shared/library.ts#L97) | Function | | [阅读说明](implementation/storage-integrations.md#library-contract-guards) |
| [`validLimit`](../../../../src/shared/library.ts#L101) | Function | | [阅读说明](implementation/storage-integrations.md#library-contract-guards) |
| [`isLibraryErrorCode`](../../../../src/shared/library.ts#L110) | Function | | [阅读说明](implementation/storage-integrations.md#library-contract-guards) |
| [`isLibrarySearchRequest`](../../../../src/shared/library.ts#L114) | Function | | [阅读说明](implementation/storage-integrations.md#library-contract-guards) |
| [`isLibraryLatestRequest`](../../../../src/shared/library.ts#L124) | Function | | [阅读说明](implementation/storage-integrations.md#library-contract-guards) |
| [`isLibraryReference`](../../../../src/shared/library.ts#L133) | Function | | [阅读说明](implementation/storage-integrations.md#library-contract-guards) |
| [`isLibraryReferencesResponse`](../../../../src/shared/library.ts#L145) | Function | | [阅读说明](implementation/storage-integrations.md#library-contract-guards) |
| [`isLibraryItemView`](../../../../src/shared/library.ts#L154) | Function | | [阅读说明](implementation/storage-integrations.md#library-contract-guards) |
| [`isLibraryItemsResponse`](../../../../src/shared/library.ts#L200) | Function | | [阅读说明](implementation/storage-integrations.md#library-contract-guards) |
| [`isLibraryLatestResponse`](../../../../src/shared/library.ts#L212) | Function | | [阅读说明](implementation/storage-integrations.md#library-contract-guards) |
| [`libraryItemPath`](../../../../src/shared/library.ts#L226) | Function | | [阅读说明](implementation/storage-integrations.md#library-contract-guards) |
| [`LIBRARY_SEARCH_LIMIT`](../../../../src/shared/library.ts#L1) | Module value | | [Read explanation](implementation/storage-integrations.md#library-contract-guards) |
| [`LIBRARY_EXCERPT_CHARACTERS`](../../../../src/shared/library.ts#L2) | Module value | | [Read explanation](implementation/storage-integrations.md#library-contract-guards) |
| [`LIBRARY_READ_CHARACTERS`](../../../../src/shared/library.ts#L3) | Module value | | [Read explanation](implementation/storage-integrations.md#library-contract-guards) |
| [`LIBRARY_ERROR_CODES`](../../../../src/shared/library.ts#L5) | Module value | | [Read explanation](implementation/storage-integrations.md#library-contract-guards) |
| [`LibraryErrorCode`](../../../../src/shared/library.ts#L12) | Type alias | | [Read explanation](implementation/storage-integrations.md#library-contract-guards) |
| [`LibraryCompleteness`](../../../../src/shared/library.ts#L13) | Type alias | | [Read explanation](implementation/storage-integrations.md#library-contract-guards) |
| [`LibraryReference`](../../../../src/shared/library.ts#L15) | Interface | | [Read explanation](implementation/storage-integrations.md#library-contract-guards) |
| [`LibraryReferencesResponse`](../../../../src/shared/library.ts#L21) | Interface | | [Read explanation](implementation/storage-integrations.md#library-contract-guards) |
| [`LibrarySearchRequest`](../../../../src/shared/library.ts#L25) | Interface | | [Read explanation](implementation/storage-integrations.md#library-contract-guards) |
| [`LibraryLatestRequest`](../../../../src/shared/library.ts#L31) | Interface | | [Read explanation](implementation/storage-integrations.md#library-contract-guards) |
| [`LibraryItemView`](../../../../src/shared/library.ts#L36) | Interface | | [Read explanation](implementation/storage-integrations.md#library-contract-guards) |
| [`LibraryItemsResponse`](../../../../src/shared/library.ts#L50) | Interface | | [Read explanation](implementation/storage-integrations.md#library-contract-guards) |
| [`LibraryLatestResponse`](../../../../src/shared/library.ts#L55) | Interface | | [Read explanation](implementation/storage-integrations.md#library-contract-guards) |
| [`UUID`](../../../../src/shared/library.ts#L59) | Module value | | [Read explanation](implementation/storage-integrations.md#library-contract-guards) |
| [`BINDING`](../../../../src/shared/library.ts#L60) | Module value | | [Read explanation](implementation/storage-integrations.md#library-contract-guards) |
| [`SOURCE`](../../../../src/shared/library.ts#L61) | Module value | | [Read explanation](implementation/storage-integrations.md#library-contract-guards) |

已索引 **49 个 source files** 和 **677 个 callable explanations**。
