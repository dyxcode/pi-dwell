# Source and symbol atlas

English | [简体中文](../i18n/zh-CN/handbook/source-map.md)

[Documentation index](README.md) · [Internals overview](system.md)

This atlas lists production TypeScript dependencies, declarations and named members. Each callable links to its source location and relevant feature context. Feature chapters explain module responsibilities, data and execution mechanisms. Refresh line anchors when code moves.

## src/cli.ts

Feature context: [Run and manage the Host](implementation/host-service.md)

[Open source](../../src/cli.ts) · 8 lines

Local dependencies: [clients/cli/main.ts](../../src/clients/cli/main.ts).

This entry point delegates through imports; the linked CLI chapter explains its top-level execution.


## src/clients/cli/arguments.ts

Feature context: [Run and manage the Host](implementation/host-service.md)

[Open source](../../src/clients/cli/arguments.ts) · 116 lines

Local dependencies: [local/paths.ts](../../src/local/paths.ts), [service/service.ts](../../src/service/service.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`Command`](../../src/clients/cli/arguments.ts#L5) | TypeAlias |  | [Feature context](implementation/host-service.md#behavior) |
| [`ParsedOptions`](../../src/clients/cli/arguments.ts#L11) | Interface |  | [Feature context](implementation/host-service.md#behavior) |
| [`parseOptions`](../../src/clients/cli/arguments.ts#L17) | Function | args, valueOptions | [Feature context](implementation/host-service.md#execution) |
| [`requiredValue`](../../src/clients/cli/arguments.ts#L47) | Function | values, option | [Feature context](implementation/host-service.md#execution) |
| [`absolutePath`](../../src/clients/cli/arguments.ts#L54) | Function | value, option | [Feature context](implementation/host-service.md#execution) |
| [`parseCommand`](../../src/clients/cli/arguments.ts#L59) | Function | args | [Feature context](implementation/host-service.md#execution) |


## src/clients/cli/main.ts

Feature context: [Run and manage the Host](implementation/host-service.md)

[Open source](../../src/clients/cli/main.ts) · 101 lines

Local dependencies: [local/paths.ts](../../src/local/paths.ts), [server/http.ts](../../src/server/http.ts), [service/service.ts](../../src/service/service.ts), [clients/cli/arguments.ts](../../src/clients/cli/arguments.ts), [clients/cli/runtime.ts](../../src/clients/cli/runtime.ts), [clients/cli/status.ts](../../src/clients/cli/status.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`runCli`](../../src/clients/cli/main.ts#L9) | Function | args, overrides | [Feature context](implementation/host-service.md#execution) |


## src/clients/cli/runtime.ts

Feature context: [Run and manage the Host](implementation/host-service.md)

[Open source](../../src/clients/cli/runtime.ts) · 26 lines

Local dependencies: [shared/sessions.ts](../../src/shared/sessions.ts), [clients/cli/status.ts](../../src/clients/cli/status.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`CONFIGURATION_REQUEST_TIMEOUT_MS`](../../src/clients/cli/runtime.ts#L4) | Module value | Inferred from initializer | [Feature context](implementation/host-service.md#behavior) |
| [`configurationOptions`](../../src/clients/cli/runtime.ts#L6) | Function | options | [Feature context](implementation/host-service.md#mechanisms) |
| [`configureRuntime`](../../src/clients/cli/runtime.ts#L13) | Function | options, configuration | [Feature context](implementation/host-service.md#mechanisms) |


## src/clients/cli/status.ts

Feature context: [Run and manage the Host](implementation/host-service.md)

[Open source](../../src/clients/cli/status.ts) · 130 lines

Local dependencies: [local/files.ts](../../src/local/files.ts), [local/paths.ts](../../src/local/paths.ts), [shared/protocol.ts](../../src/shared/protocol.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`ClientOptions`](../../src/clients/cli/status.ts#L5) | Interface |  | [Feature context](implementation/host-service.md#behavior) |
| [`localRequest`](../../src/clients/cli/status.ts#L11) | Function | path, options, method, body | [Feature context](implementation/host-service.md#mechanisms) |
| [`errorMessage`](../../src/clients/cli/status.ts#L86) | Function | value | [Feature context](implementation/host-service.md#mechanisms) |
| [`readHostStatus`](../../src/clients/cli/status.ts#L101) | Function | options | [Feature context](implementation/host-service.md#mechanisms) |
| [`createPairing`](../../src/clients/cli/status.ts#L107) | Function | options | [Feature context](implementation/host-service.md#mechanisms) |
| [`revokeBrowsers`](../../src/clients/cli/status.ts#L126) | Function | options | [Feature context](implementation/host-service.md#mechanisms) |


## src/clients/web/attachments.ts

Feature context: [Compose a message](implementation/compose-message.md)

[Open source](../../src/clients/web/attachments.ts) · 194 lines

Local dependencies: [clients/web/icons.ts](../../src/clients/web/icons.ts), [shared/images.ts](../../src/shared/images.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`Attachment`](../../src/clients/web/attachments.ts#L11) | Interface |  | [Feature context](implementation/compose-message.md#behavior) |
| [`Attachments`](../../src/clients/web/attachments.ts#L17) | Class |  | [Feature context](implementation/compose-message.md#behavior) |
| [`Attachments.#drafts`](../../src/clients/web/attachments.ts#L18) | Property |  | [Feature context](implementation/compose-message.md#behavior) |
| [`Attachments.#pending`](../../src/clients/web/attachments.ts#L19) | Property |  | [Feature context](implementation/compose-message.md#behavior) |
| [`Attachments.#session`](../../src/clients/web/attachments.ts#L20) | Property |  | [Feature context](implementation/compose-message.md#behavior) |
| [`Attachments.#disabled`](../../src/clients/web/attachments.ts#L21) | Property |  | [Feature context](implementation/compose-message.md#behavior) |
| [`Attachments.#intakeDisabled`](../../src/clients/web/attachments.ts#L22) | Property |  | [Feature context](implementation/compose-message.md#behavior) |
| [`Attachments.#generation`](../../src/clients/web/attachments.ts#L23) | Property |  | [Feature context](implementation/compose-message.md#behavior) |
| [`Attachments.#input`](../../src/clients/web/attachments.ts#L24) | Property |  | [Feature context](implementation/compose-message.md#behavior) |
| [`Attachments.#tray`](../../src/clients/web/attachments.ts#L25) | Property |  | [Feature context](implementation/compose-message.md#behavior) |
| [`Attachments.#button`](../../src/clients/web/attachments.ts#L26) | Property |  | [Feature context](implementation/compose-message.md#behavior) |
| [`Attachments.#change`](../../src/clients/web/attachments.ts#L27) | Property |  | [Feature context](implementation/compose-message.md#behavior) |
| [`Attachments.#error`](../../src/clients/web/attachments.ts#L28) | Property |  | [Feature context](implementation/compose-message.md#behavior) |
| [`Attachments.#preview`](../../src/clients/web/attachments.ts#L29) | Property |  | [Feature context](implementation/compose-message.md#behavior) |
| [`Attachments.constructor`](../../src/clients/web/attachments.ts#L30) | Constructor | options | [Feature context](implementation/compose-message.md#ownership) |
| [`Attachments.select`](../../src/clients/web/attachments.ts#L50) | Method | id | [Feature context](implementation/compose-message.md#ownership) |
| [`Attachments.setDisabled`](../../src/clients/web/attachments.ts#L54) | Method | disabled, intakeDisabled | [Feature context](implementation/compose-message.md#ownership) |
| [`Attachments.busy`](../../src/clients/web/attachments.ts#L61) | GetAccessor |  | [Feature context](implementation/compose-message.md#ownership) |
| [`Attachments.count`](../../src/clients/web/attachments.ts#L64) | GetAccessor |  | [Feature context](implementation/compose-message.md#ownership) |
| [`Attachments.payload`](../../src/clients/web/attachments.ts#L67) | Method |  | [Feature context](implementation/compose-message.md#ownership) |
| [`Attachments.clear`](../../src/clients/web/attachments.ts#L70) | Method | id | [Feature context](implementation/compose-message.md#ownership) |
| [`Attachments.dispose`](../../src/clients/web/attachments.ts#L75) | Method |  | [Feature context](implementation/compose-message.md#ownership) |
| [`Attachments.paste`](../../src/clients/web/attachments.ts#L82) | Method | event | [Feature context](implementation/compose-message.md#ownership) |
| [`Attachments.add`](../../src/clients/web/attachments.ts#L88) | Method | files, pasted | [Feature context](implementation/compose-message.md#mechanisms) |
| [`Attachments.#render`](../../src/clients/web/attachments.ts#L154) | Method |  | [Feature context](implementation/compose-message.md#mechanisms) |


## src/clients/web/client.ts

Feature context: [Read and navigate a conversation](implementation/read-conversation.md)

[Open source](../../src/clients/web/client.ts) · 3001 lines

Local dependencies: [clients/web/attachments.ts](../../src/clients/web/attachments.ts), [clients/web/conversation.ts](../../src/clients/web/conversation.ts), [clients/web/dom.ts](../../src/clients/web/dom.ts), [clients/web/events.ts](../../src/clients/web/events.ts), [clients/web/icons.ts](../../src/clients/web/icons.ts), [clients/web/input.ts](../../src/clients/web/input.ts), [clients/web/markdown.ts](../../src/clients/web/markdown.ts), [clients/web/memory.ts](../../src/clients/web/memory.ts), [clients/web/tool-command.ts](../../src/clients/web/tool-command.ts), [clients/web/transport.ts](../../src/clients/web/transport.ts), [shared/discovery.ts](../../src/shared/discovery.ts), [shared/events.ts](../../src/shared/events.ts), [shared/history.ts](../../src/shared/history.ts), [shared/images.ts](../../src/shared/images.ts), [shared/library.ts](../../src/shared/library.ts), [shared/memory.ts](../../src/shared/memory.ts), [shared/protocol.ts](../../src/shared/protocol.ts), [shared/sessions.ts](../../src/shared/sessions.ts), [shared/thinking.ts](../../src/shared/thinking.ts), [shared/turns.ts](../../src/shared/turns.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`el`](../../src/clients/web/client.ts#L56) | Function | id, type | [Feature context](implementation/read-conversation.md#ownership) |
| [`node`](../../src/clients/web/client.ts#L61) | Function | tag, text, className | [Feature context](implementation/read-conversation.md#ownership) |
| [`input`](../../src/clients/web/client.ts#L71) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`form`](../../src/clients/web/client.ts#L72) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`rail`](../../src/clients/web/client.ts#L73) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`main`](../../src/clients/web/client.ts#L74) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`gate`](../../src/clients/web/client.ts#L75) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`app`](../../src/clients/web/client.ts#L76) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`scroll`](../../src/clients/web/client.ts#L77) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`conversation`](../../src/clients/web/client.ts#L78) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`composer`](../../src/clients/web/client.ts#L79) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`savedRenderer`](../../src/clients/web/client.ts#L80) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`imageGeneration`](../../src/clients/web/client.ts#L81) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`send`](../../src/clients/web/client.ts#L82) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`notice`](../../src/clients/web/client.ts#L83) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`dialog`](../../src/clients/web/client.ts#L84) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`directory`](../../src/clients/web/client.ts#L85) | Module value | Inferred from initializer | [Feature context](implementation/models.md#mechanisms) |
| [`createButton`](../../src/clients/web/client.ts#L86) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`closeDialog`](../../src/clients/web/client.ts#L87) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`closeDirectory`](../../src/clients/web/client.ts#L88) | Module value | Inferred from initializer | [Feature context](implementation/models.md#mechanisms) |
| [`closeTitle`](../../src/clients/web/client.ts#L89) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`closeCopy`](../../src/clients/web/client.ts#L90) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`closeError`](../../src/clients/web/client.ts#L91) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`cancelClose`](../../src/clients/web/client.ts#L92) | Module value | Inferred from initializer | [Feature context](implementation/stop-work.md#mechanisms) |
| [`confirmClose`](../../src/clients/web/client.ts#L93) | Module value | Inferred from initializer | [Feature context](implementation/stop-work.md#mechanisms) |
| [`modelDialog`](../../src/clients/web/client.ts#L95) | Module value | Inferred from initializer | [Feature context](implementation/models.md#mechanisms) |
| [`modelSearch`](../../src/clients/web/client.ts#L96) | Module value | Inferred from initializer | [Feature context](implementation/models.md#mechanisms) |
| [`chooseModel`](../../src/clients/web/client.ts#L97) | Module value | Inferred from initializer | [Feature context](implementation/models.md#mechanisms) |
| [`availableModels`](../../src/clients/web/client.ts#L131) | Module value | `PiModelOption[]` | [Feature context](implementation/models.md#mechanisms) |
| [`capabilities`](../../src/clients/web/client.ts#L132) | Module value | Inferred from initializer | [Feature context](implementation/models.md#mechanisms) |
| [`capabilityRequests`](../../src/clients/web/client.ts#L133) | Module value | Inferred from initializer | [Feature context](implementation/models.md#mechanisms) |
| [`capabilityErrors`](../../src/clients/web/client.ts#L134) | Module value | Inferred from initializer | [Feature context](implementation/models.md#mechanisms) |
| [`capabilityGeneration`](../../src/clients/web/client.ts#L135) | Module value | Inferred from initializer | [Feature context](implementation/models.md#mechanisms) |
| [`resetCapabilities`](../../src/clients/web/client.ts#L136) | Function |  | [Feature context](implementation/models.md#mechanisms) |
| [`thinkingChoice`](../../src/clients/web/client.ts#L142) | Module value | `PiModelOption \| null` | [Feature context](implementation/models.md#mechanisms) |
| [`levelNames`](../../src/clients/web/client.ts#L143) | Module value | `Record<ThinkingLevel, string>` | [Feature context](implementation/read-conversation.md#behavior) |
| [`modelSession`](../../src/clients/web/client.ts#L152) | Module value | `string \| null` | [Feature context](implementation/models.md#mechanisms) |
| [`changingModel`](../../src/clients/web/client.ts#L153) | Module value | `string \| null` | [Feature context](implementation/models.md#mechanisms) |
| [`older`](../../src/clients/web/client.ts#L154) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`drafts`](../../src/clients/web/client.ts#L171) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`turns`](../../src/clients/web/client.ts#L172) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`sessions`](../../src/clients/web/client.ts#L173) | Module value | `SessionInfo[]` | [Feature context](implementation/read-conversation.md#behavior) |
| [`selected`](../../src/clients/web/client.ts#L174) | Module value | `string \| null` | [Feature context](implementation/read-conversation.md#behavior) |
| [`state`](../../src/clients/web/client.ts#L175) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`contextSources`](../../src/clients/web/client.ts#L176) | Module value | `ContextSource[]` | [Feature context](implementation/read-conversation.md#behavior) |
| [`contextSourcesTruncated`](../../src/clients/web/client.ts#L177) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`entries`](../../src/clients/web/client.ts#L178) | Module value | `HistoryEntry[]` | [Feature context](implementation/read-conversation.md#behavior) |
| [`nextCursor`](../../src/clients/web/client.ts#L179) | Module value | `string \| null` | [Feature context](implementation/read-conversation.md#behavior) |
| [`controller`](../../src/clients/web/client.ts#L180) | Module value | `AbortController \| null` | [Feature context](implementation/read-conversation.md#behavior) |
| [`generation`](../../src/clients/web/client.ts#L181) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`authenticated`](../../src/clients/web/client.ts#L182) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`reconnectTimer`](../../src/clients/web/client.ts#L185) | Module value | `number \| undefined` | [Feature context](implementation/read-conversation.md#behavior) |
| [`pollTimer`](../../src/clients/web/client.ts#L185) | Module value | `number \| undefined` | [Feature context](implementation/read-conversation.md#behavior) |
| [`polling`](../../src/clients/web/client.ts#L186) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`suspended`](../../src/clients/web/client.ts#L187) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`HistoryReadRecovery`](../../src/clients/web/client.ts#L190) | Interface |  | [Feature context](implementation/read-conversation.md#behavior) |
| [`historyRecovery`](../../src/clients/web/client.ts#L195) | Module value | `Record<"latest" \| "older", HistoryReadRecovery>` | [Feature context](implementation/read-conversation.md#behavior) |
| [`historyContentFailed`](../../src/clients/web/client.ts#L199) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`historyCoverageReads`](../../src/clients/web/client.ts#L200) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`historyCoverageRun`](../../src/clients/web/client.ts#L201) | Module value | `string \| null` | [Feature context](implementation/read-conversation.md#behavior) |
| [`resetHistoryPagination`](../../src/clients/web/client.ts#L202) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`historyPending`](../../src/clients/web/client.ts#L203) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`sending`](../../src/clients/web/client.ts#L204) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`pendingSend`](../../src/clients/web/client.ts#L205) | Module value | `{   session: string;   requestId: string;   message: string;   images: ImageContent[]; } \| null` | [Feature context](implementation/read-conversation.md#behavior) |
| [`pendingCreate`](../../src/clients/web/client.ts#L211) | Module value | `{   requestId: string;   directory: string; } \| null` | [Feature context](implementation/read-conversation.md#behavior) |
| [`tabSlots`](../../src/clients/web/client.ts#L215) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`openingSessions`](../../src/clients/web/client.ts#L216) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`closeArmedSession`](../../src/clients/web/client.ts#L217) | Module value | `string \| null` | [Feature context](implementation/read-conversation.md#behavior) |
| [`preparingCloseSession`](../../src/clients/web/client.ts#L218) | Module value | `string \| null` | [Feature context](implementation/read-conversation.md#behavior) |
| [`closeTarget`](../../src/clients/web/client.ts#L219) | Module value | `{   id: string;   activeRunId: string \| null;   nativeExecutionId: string \| null;   attempted: boolean; } \| null` | [Feature context](implementation/read-conversation.md#behavior) |
| [`closingSession`](../../src/clients/web/client.ts#L225) | Module value | `string \| null` | [Feature context](implementation/read-conversation.md#behavior) |
| [`closePreparationGeneration`](../../src/clients/web/client.ts#L226) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`closeAttemptGeneration`](../../src/clients/web/client.ts#L227) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`sessionRefreshGeneration`](../../src/clients/web/client.ts#L228) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`sessionStateGeneration`](../../src/clients/web/client.ts#L229) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`selectionGeneration`](../../src/clients/web/client.ts#L230) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`openIntentGeneration`](../../src/clients/web/client.ts#L231) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`authAttempt`](../../src/clients/web/client.ts#L232) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`browseAttempt`](../../src/clients/web/client.ts#L233) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`modelAttempt`](../../src/clients/web/client.ts#L234) | Module value | Inferred from initializer | [Feature context](implementation/models.md#mechanisms) |
| [`hostMode`](../../src/clients/web/client.ts#L235) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`streamConnected`](../../src/clients/web/client.ts#L237) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`imageDialog`](../../src/clients/web/client.ts#L238) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`showImage`](../../src/clients/web/client.ts#L239) | Function | url, name | [Feature context](implementation/read-conversation.md#ownership) |
| [`attachments`](../../src/clients/web/client.ts#L667) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`attachButton`](../../src/clients/web/client.ts#L675) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`imageFiles`](../../src/clients/web/client.ts#L676) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`imageCache`](../../src/clients/web/client.ts#L714) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`imageQueue`](../../src/clients/web/client.ts#L715) | Module value | `Promise<unknown>` | [Feature context](implementation/read-conversation.md#behavior) |
| [`liveOrder`](../../src/clients/web/client.ts#L716) | Module value | `{ kind: "message" \| "tool"; id: string }[]` | [Feature context](implementation/read-conversation.md#behavior) |
| [`releaseImages`](../../src/clients/web/client.ts#L717) | Function |  | [Feature context](implementation/read-conversation.md#ownership) |
| [`historyImage`](../../src/clients/web/client.ts#L753) | Function | entryId, index, mimeType | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`localPreferences`](../../src/clients/web/client.ts#L831) | Module value | `Record<string, string>` | [Feature context](implementation/read-conversation.md#behavior) |
| [`savePreference`](../../src/clients/web/client.ts#L840) | Function | key, value | [Feature context](implementation/models.md#ownership) |
| [`activeSession`](../../src/clients/web/client.ts#L848) | Function |  | [Feature context](implementation/models.md#ownership) |
| [`modelCapabilityKey`](../../src/clients/web/client.ts#L851) | Function | provider, model, sessionId | [Feature context](implementation/models.md#mechanisms) |
| [`requestModelCapabilities`](../../src/clients/web/client.ts#L860) | Function | choice, sessionId | [Feature context](implementation/models.md#mechanisms) |
| [`probeCurrentModel`](../../src/clients/web/client.ts#L900) | Function | sessionId | [Feature context](implementation/models.md#mechanisms) |
| [`label`](../../src/clients/web/client.ts#L928) | Function | s | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`directoryName`](../../src/clients/web/client.ts#L937) | Function | directory | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`runtimeOpen`](../../src/clients/web/client.ts#L952) | Function | s | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`nativeRunning`](../../src/clients/web/client.ts#L955) | Function | s | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`sessionBusy`](../../src/clients/web/client.ts#L958) | Function | s | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`status`](../../src/clients/web/client.ts#L961) | Function | s | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`TabStatus`](../../src/clients/web/client.ts#L983) | TypeAlias |  | [Feature context](implementation/read-conversation.md#behavior) |
| [`tabStatus`](../../src/clients/web/client.ts#L984) | Function | s | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`tabStatusLabel`](../../src/clients/web/client.ts#L993) | Function | value | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`SVG_NS`](../../src/clients/web/client.ts#L1004) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`statusPaths`](../../src/clients/web/client.ts#L1005) | Module value | `Record<   "ready" \| "working" \| "attention" \| "stopped" \| "opening" \| "close",   string >` | [Feature context](implementation/read-conversation.md#behavior) |
| [`tabSymbol`](../../src/clients/web/client.ts#L1016) | Function | value | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`synchronizeTabSlots`](../../src/clients/web/client.ts#L1032) | Function |  | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`openTabIds`](../../src/clients/web/client.ts#L1044) | Function |  | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`closeBlockedReason`](../../src/clients/web/client.ts#L1047) | Function |  | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`showError`](../../src/clients/web/client.ts#L1057) | Function | error | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`clearNotice`](../../src/clients/web/client.ts#L1065) | Function |  | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`nav`](../../src/clients/web/client.ts#L1069) | Function | open | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`navigation`](../../src/clients/web/client.ts#L1078) | Function |  | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`updatedSession`](../../src/clients/web/client.ts#L1272) | Function | session | [Feature context](implementation/session-lifecycle.md#execution) |
| [`neighborAfterClose`](../../src/clients/web/client.ts#L1284) | Function | id, previousTabs | [Feature context](implementation/session-lifecycle.md#execution) |
| [`reconcileClosedRuntime`](../../src/clients/web/client.ts#L1299) | Function | id, previousTabs | [Feature context](implementation/session-lifecycle.md#execution) |
| [`userMessageSnippet`](../../src/clients/web/client.ts#L1308) | Function | values | [Feature context](implementation/session-lifecycle.md#execution) |
| [`showCloseError`](../../src/clients/web/client.ts#L1321) | Function | error | [Feature context](implementation/session-lifecycle.md#execution) |
| [`prepareClose`](../../src/clients/web/client.ts#L1325) | Function | id | [Feature context](implementation/session-lifecycle.md#execution) |
| [`sessionSnapshot`](../../src/clients/web/client.ts#L1409) | Function | id | [Feature context](implementation/session-lifecycle.md#execution) |
| [`turnSnapshot`](../../src/clients/web/client.ts#L1415) | Function | id, runId | [Feature context](implementation/session-lifecycle.md#execution) |
| [`turnIsActive`](../../src/clients/web/client.ts#L1421) | Function | turn | [Feature context](implementation/session-lifecycle.md#execution) |
| [`waitForTurnAndRuntime`](../../src/clients/web/client.ts#L1424) | Function | id, runId, authentication | [Feature context](implementation/session-lifecycle.md#execution) |
| [`finishClose`](../../src/clients/web/client.ts#L1449) | Function | id, previousTabs | [Feature context](implementation/session-lifecycle.md#execution) |
| [`confirmSessionClose`](../../src/clients/web/client.ts#L1455) | Function |  | [Feature context](implementation/session-lifecycle.md#execution) |
| [`openFromSidebar`](../../src/clients/web/client.ts#L1567) | Function | id | [Feature context](implementation/session-lifecycle.md#execution) |
| [`identifyLiveThinking`](../../src/clients/web/client.ts#L1603) | Function | message | [Feature context](implementation/models.md#mechanisms) |
| [`renderConversation`](../../src/clients/web/client.ts#L1619) | Function |  | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`historyProblem`](../../src/clients/web/client.ts#L1846) | Function |  | [Feature context](implementation/saved-history.md#mechanisms) |
| [`resetHistoryRecovery`](../../src/clients/web/client.ts#L1850) | Function | more | [Feature context](implementation/saved-history.md#mechanisms) |
| [`uncoveredHistoryRun`](../../src/clients/web/client.ts#L1866) | Function |  | [Feature context](implementation/saved-history.md#mechanisms) |
| [`scheduleHistoryRecovery`](../../src/clients/web/client.ts#L1877) | Function | more | [Feature context](implementation/saved-history.md#mechanisms) |
| [`loadHistory`](../../src/clients/web/client.ts#L1886) | Function | more | [Feature context](implementation/saved-history.md#mechanisms) |
| [`stopStream`](../../src/clients/web/client.ts#L1992) | Function |  | [Feature context](implementation/stop-work.md#mechanisms) |
| [`renderFrame`](../../src/clients/web/client.ts#L1997) | Module value | `number \| undefined` | [Feature context](implementation/read-conversation.md#behavior) |
| [`scheduleStreamRender`](../../src/clients/web/client.ts#L1998) | Function |  | [Feature context](implementation/reconnect.md#execution) |
| [`stream`](../../src/clients/web/client.ts#L2006) | Function | id, epoch | [Feature context](implementation/reconnect.md#execution) |
| [`select`](../../src/clients/web/client.ts#L2146) | Function | id | [Feature context](implementation/reconnect.md#execution) |
| [`connection`](../../src/clients/web/client.ts#L2184) | Function | text | [Feature context](implementation/reconnect.md#execution) |
| [`refresh`](../../src/clients/web/client.ts#L2187) | Function |  | [Feature context](implementation/reconnect.md#execution) |
| [`poll`](../../src/clients/web/client.ts#L2255) | Function |  | [Feature context](implementation/reconnect.md#execution) |
| [`disconnect`](../../src/clients/web/client.ts#L2291) | Function | reason | [Feature context](implementation/reconnect.md#execution) |
| [`connect`](../../src/clients/web/client.ts#L2327) | Function |  | [Feature context](implementation/reconnect.md#execution) |
| [`submit`](../../src/clients/web/client.ts#L2368) | Function |  | [Feature context](implementation/send-message.md#mechanisms) |
| [`browse`](../../src/clients/web/client.ts#L2471) | Function | path | [Feature context](implementation/models.md#execution) |
| [`renderModels`](../../src/clients/web/client.ts#L2520) | Function |  | [Feature context](implementation/models.md#mechanisms) |
| [`showModels`](../../src/clients/web/client.ts#L2548) | Function |  | [Feature context](implementation/models.md#mechanisms) |
| [`showThinking`](../../src/clients/web/client.ts#L2599) | Function | choice | [Feature context](implementation/models.md#mechanisms) |
| [`changeModel`](../../src/clients/web/client.ts#L2660) | Function | choice, thinkingLevel | [Feature context](implementation/models.md#mechanisms) |
| [`newSession`](../../src/clients/web/client.ts#L2705) | Function |  | [Feature context](implementation/models.md#execution) |
| [`createSession`](../../src/clients/web/client.ts#L2713) | Function |  | [Feature context](implementation/models.md#execution) |
| [`resetCloseDialog`](../../src/clients/web/client.ts#L2810) | Function |  | [Feature context](implementation/session-lifecycle.md#execution) |
| [`dismissCloseDialog`](../../src/clients/web/client.ts#L2823) | Function |  | [Feature context](implementation/session-lifecycle.md#execution) |
| [`pairingCode`](../../src/clients/web/client.ts#L2850) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`viewport`](../../src/clients/web/client.ts#L2947) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`responsive`](../../src/clients/web/client.ts#L2948) | Function |  | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`resume`](../../src/clients/web/client.ts#L2970) | Function |  | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`savedHistoryWarning`](../../src/clients/web/client.ts#L940) | Function | | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`sameLibraryReference`](../../src/clients/web/client.ts#L245) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`libraryFailure`](../../src/clients/web/client.ts#L248) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`renderLibraryReferences`](../../src/clients/web/client.ts#L252) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`renderLibraryItems`](../../src/clients/web/client.ts#L282) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`renderLibraryReader`](../../src/clients/web/client.ts#L307) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`loadLibraryReferences`](../../src/clients/web/client.ts#L357) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`loadLatestLibraryItems`](../../src/clients/web/client.ts#L390) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`searchLibrary`](../../src/clients/web/client.ts#L417) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`readLibraryItem`](../../src/clients/web/client.ts#L444) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`changeLibraryReference`](../../src/clients/web/client.ts#L474) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`openLibrary`](../../src/clients/web/client.ts#L509) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`clearRetiredHistory`](../../src/clients/web/client.ts#L727) | Function | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`memoryConfigured`](../../src/clients/web/client.ts#L520) | Function |  | [Feature context](implementation/memory.md#behavior) |
| [`memoryReady`](../../src/clients/web/client.ts#L523) | Function |  | [Feature context](implementation/memory.md#behavior) |
| [`renderMemoryPanel`](../../src/clients/web/client.ts#L526) | Function | state | [Feature context](implementation/memory.md#behavior) |
| [`updateClientCapabilityView`](../../src/clients/web/client.ts#L616) | Function |  | [Feature context](implementation/memory.md#execution) |
| [`reloadClientCapabilities`](../../src/clients/web/client.ts#L632) | Function | force | [Feature context](implementation/memory.md#execution) |
| [`memoryView`](../../src/clients/web/client.ts#L102) | Module value |  | [Feature context](implementation/memory.md#behavior) |
| [`memoryQuery`](../../src/clients/web/client.ts#L103) | Module value |  | [Feature context](implementation/memory.md#behavior) |
| [`memoryResults`](../../src/clients/web/client.ts#L104) | Module value |  | [Feature context](implementation/memory.md#behavior) |
| [`memoryReader`](../../src/clients/web/client.ts#L105) | Module value |  | [Feature context](implementation/memory.md#behavior) |
| [`memoryText`](../../src/clients/web/client.ts#L106) | Module value |  | [Feature context](implementation/memory.md#behavior) |
| [`memorySearchMore`](../../src/clients/web/client.ts#L107) | Module value |  | [Feature context](implementation/memory.md#behavior) |
| [`memoryReadMore`](../../src/clients/web/client.ts#L108) | Module value |  | [Feature context](implementation/memory.md#behavior) |
| [`memoryRetry`](../../src/clients/web/client.ts#L109) | Module value |  | [Feature context](implementation/memory.md#behavior) |
| [`clientCapabilities`](../../src/clients/web/client.ts#L116) | Module value |  | [Feature context](implementation/memory.md#behavior) |
| [`clientCapabilityGeneration`](../../src/clients/web/client.ts#L117) | Module value |  | [Feature context](implementation/memory.md#behavior) |
| [`clientCapabilityRequestPending`](../../src/clients/web/client.ts#L118) | Module value |  | [Feature context](implementation/memory.md#behavior) |
| [`clientCapabilitiesError`](../../src/clients/web/client.ts#L119) | Module value |  | [Feature context](implementation/memory.md#behavior) |
| [`capabilityRetryPending`](../../src/clients/web/client.ts#L120) | Module value |  | [Feature context](implementation/memory.md#behavior) |
| [`CLIENT_CAPABILITY_NOTICE`](../../src/clients/web/client.ts#L121) | Module value |  | [Feature context](implementation/memory.md#behavior) |
| [`memoryPanel`](../../src/clients/web/client.ts#L123) | Module value |  | [Feature context](implementation/memory.md#behavior) |

## src/clients/web/conversation.ts

Feature context: [Read and navigate a conversation](implementation/read-conversation.md)

[Open source](../../src/clients/web/conversation.ts) · 637 lines

Local dependencies: [shared/events.ts](../../src/shared/events.ts), [shared/history.ts](../../src/shared/history.ts), [clients/web/icons.ts](../../src/clients/web/icons.ts), [clients/web/markdown.ts](../../src/clients/web/markdown.ts), [clients/web/tool-command.ts](../../src/clients/web/tool-command.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`SavedConversationGroup`](../../src/clients/web/conversation.ts#L9) | TypeAlias |  | [Feature context](implementation/read-conversation.md#behavior) |
| [`groupConversationEntries`](../../src/clients/web/conversation.ts#L14) | Function | entries | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`ToolResultPairs`](../../src/clients/web/conversation.ts#L37) | Interface |  | [Feature context](implementation/read-conversation.md#behavior) |
| [`pairToolResults`](../../src/clients/web/conversation.ts#L44) | Function | entries | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`SavedImageRenderer`](../../src/clients/web/conversation.ts#L78) | TypeAlias |  | [Feature context](implementation/read-conversation.md#behavior) |
| [`node`](../../src/clients/web/conversation.ts#L84) | Function | tag, text, className | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`keyed`](../../src/clients/web/conversation.ts#L95) | Function | details, key, entryId | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`markdown`](../../src/clients/web/conversation.ts#L101) | Function | parent, source | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`appendImage`](../../src/clients/web/conversation.ts#L105) | Function | parent, entry, block, renderImage | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`appendMarkdownBlocks`](../../src/clients/web/conversation.ts#L125) | Function | parent, entry, renderImage | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`thinkingPresentation`](../../src/clients/web/conversation.ts#L137) | Function | source | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`thinkingDisclosureKey`](../../src/clients/web/conversation.ts#L145) | Function | identity, contentIndex | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`thinkingDisclosure`](../../src/clients/web/conversation.ts#L149) | Function | text, key, entryId | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`renderLiveMessageBlock`](../../src/clients/web/conversation.ts#L164) | Function | message, block | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`groupActivity`](../../src/clients/web/conversation.ts#L194) | Function | body, working | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`thinkingDetails`](../../src/clients/web/conversation.ts#L248) | Function | entry, block, index | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`appendRawOutput`](../../src/clients/web/conversation.ts#L260) | Function | parent, entry, renderImage, blocks | [Feature context](implementation/read-conversation.md#execution) |
| [`bashCommand`](../../src/clients/web/conversation.ts#L281) | Function | call | [Feature context](implementation/read-conversation.md#execution) |
| [`toolRun`](../../src/clients/web/conversation.ts#L299) | Function | owner, call, result, renderImage, key, options | [Feature context](implementation/read-conversation.md#execution) |
| [`appendTruncated`](../../src/clients/web/conversation.ts#L366) | Function | parent, entry | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`renderUser`](../../src/clients/web/conversation.ts#L371) | Function | entry, renderImage | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`renderAssistant`](../../src/clients/web/conversation.ts#L383) | Function | entries, renderImage, liveTools | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`renderSpecial`](../../src/clients/web/conversation.ts#L468) | Function | entry, renderImage | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`renderContext`](../../src/clients/web/conversation.ts#L496) | Function | sources, truncated | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`renderSavedConversation`](../../src/clients/web/conversation.ts#L536) | Function | entries, contextSources, contextSourcesTruncated, renderImage, liveTools | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`SavedConversationRenderer`](../../src/clients/web/conversation.ts#L560) | Class |  | [Feature context](implementation/read-conversation.md#behavior) |
| [`SavedConversationRenderer.#entries`](../../src/clients/web/conversation.ts#L561) | Property |  | [Feature context](implementation/read-conversation.md#behavior) |
| [`SavedConversationRenderer.#groups`](../../src/clients/web/conversation.ts#L562) | Property |  | [Feature context](implementation/read-conversation.md#behavior) |
| [`SavedConversationRenderer.#contextSources`](../../src/clients/web/conversation.ts#L563) | Property |  | [Feature context](implementation/read-conversation.md#behavior) |
| [`SavedConversationRenderer.#contextTruncated`](../../src/clients/web/conversation.ts#L564) | Property |  | [Feature context](implementation/read-conversation.md#behavior) |
| [`SavedConversationRenderer.#contextSignature`](../../src/clients/web/conversation.ts#L565) | Property |  | [Feature context](implementation/read-conversation.md#behavior) |
| [`SavedConversationRenderer.#versions`](../../src/clients/web/conversation.ts#L566) | Property |  | [Feature context](implementation/read-conversation.md#behavior) |
| [`SavedConversationRenderer.#serial`](../../src/clients/web/conversation.ts#L567) | Property |  | [Feature context](implementation/read-conversation.md#behavior) |
| [`SavedConversationRenderer.clear`](../../src/clients/web/conversation.ts#L569) | Method |  | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`SavedConversationRenderer.render`](../../src/clients/web/conversation.ts#L575) | Method | entries, contextSources, contextSourcesTruncated, renderImage, liveTools | [Feature context](implementation/read-conversation.md#mechanisms) |


## src/clients/web/dom.ts

Feature context: [Read and navigate a conversation](implementation/read-conversation.md)

[Open source](../../src/clients/web/dom.ts) · 128 lines

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`elementIdentity`](../../src/clients/web/dom.ts#L3) | Function | element | [Feature context](implementation/read-conversation.md#ownership) |
| [`compatible`](../../src/clients/web/dom.ts#L12) | Function | left, right | [Feature context](implementation/read-conversation.md#ownership) |
| [`synchronizeAttributes`](../../src/clients/web/dom.ts#L19) | Function | current, desired | [Feature context](implementation/read-conversation.md#ownership) |
| [`hasSamePreserveMarker`](../../src/clients/web/dom.ts#L29) | Function | current, desired | [Feature context](implementation/read-conversation.md#ownership) |
| [`reconcileElement`](../../src/clients/web/dom.ts#L35) | Function | current, desired | [Feature context](implementation/read-conversation.md#ownership) |
| [`reconcileChildren`](../../src/clients/web/dom.ts#L56) | Function | target, desired | [Feature context](implementation/read-conversation.md#ownership) |


## src/clients/web/events.ts

Feature context: [Reconnect to ongoing work](implementation/reconnect.md)

[Open source](../../src/clients/web/events.ts) · 866 lines

Local dependencies: [shared/events.ts](../../src/shared/events.ts), [shared/history.ts](../../src/shared/history.ts), [shared/sessions.ts](../../src/shared/sessions.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`MAX_SSE_FRAME_BYTES`](../../src/clients/web/events.ts#L13) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_LIVE_MESSAGES`](../../src/clients/web/events.ts#L14) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_LIVE_TOOLS`](../../src/clients/web/events.ts#L15) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_LIVE_MESSAGE_BYTES`](../../src/clients/web/events.ts#L16) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`ResyncReason`](../../src/clients/web/events.ts#L18) | TypeAlias |  | [Feature context](implementation/reconnect.md#behavior) |
| [`ConversationState`](../../src/clients/web/events.ts#L20) | Interface |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SseDecodeErrorCode`](../../src/clients/web/events.ts#L43) | TypeAlias |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SseDecodeError`](../../src/clients/web/events.ts#L51) | Class |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SseDecodeError.code`](../../src/clients/web/events.ts#L52) | Property |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SseDecodeError.constructor`](../../src/clients/web/events.ts#L54) | Constructor | code, message | [Feature context](implementation/reconnect.md#ownership) |
| [`EventFields`](../../src/clients/web/events.ts#L61) | Interface |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SSEDecoder`](../../src/clients/web/events.ts#L69) | Class |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SSEDecoder.#line`](../../src/clients/web/events.ts#L70) | Property |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SSEDecoder.#lineBytes`](../../src/clients/web/events.ts#L71) | Property |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SSEDecoder.#pendingHighSurrogate`](../../src/clients/web/events.ts#L72) | Property |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SSEDecoder.#pendingCR`](../../src/clients/web/events.ts#L73) | Property |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SSEDecoder.#atStart`](../../src/clients/web/events.ts#L74) | Property |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SSEDecoder.#fields`](../../src/clients/web/events.ts#L75) | Property |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SSEDecoder.push`](../../src/clients/web/events.ts#L77) | Method | chunk | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SSEDecoder.#lineEnding`](../../src/clients/web/events.ts#L120) | Method | endingBytes, frames | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SSEDecoder.#dispatch`](../../src/clients/web/events.ts#L156) | Method |  | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SSEDecoder.#emptyFields`](../../src/clients/web/events.ts#L181) | Method |  | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SSEDecoder.#fail`](../../src/clients/web/events.ts#L185) | Method | code, message | [Feature context](implementation/reconnect.md#mechanisms) |
| [`emptyConversationState`](../../src/clients/web/events.ts#L190) | Function | sessionId | [Feature context](implementation/reconnect.md#ownership) |
| [`CursorParts`](../../src/clients/web/events.ts#L210) | Interface |  | [Feature context](implementation/reconnect.md#behavior) |
| [`cursorParts`](../../src/clients/web/events.ts#L216) | Function | cursor | [Feature context](implementation/reconnect.md#ownership) |
| [`copyTurn`](../../src/clients/web/events.ts#L226) | Function | value | [Feature context](implementation/reconnect.md#ownership) |
| [`copyMessage`](../../src/clients/web/events.ts#L231) | Function | value | [Feature context](implementation/reconnect.md#ownership) |
| [`copyTool`](../../src/clients/web/events.ts#L246) | Function | value | [Feature context](implementation/reconnect.md#ownership) |
| [`copyHistory`](../../src/clients/web/events.ts#L250) | Function | value | [Feature context](implementation/reconnect.md#ownership) |
| [`mergeHistoryEntries`](../../src/clients/web/events.ts#L273) | Function | previous, incoming | [Feature context](implementation/reconnect.md#ownership) |
| [`utf8Bytes`](../../src/clients/web/events.ts#L289) | Function | character | [Feature context](implementation/reconnect.md#ownership) |
| [`isHighSurrogate`](../../src/clients/web/events.ts#L297) | Function | character | [Feature context](implementation/reconnect.md#ownership) |
| [`isLowSurrogate`](../../src/clients/web/events.ts#L302) | Function | character | [Feature context](implementation/reconnect.md#ownership) |
| [`isTerminal`](../../src/clients/web/events.ts#L307) | Function | status | [Feature context](implementation/reconnect.md#mechanisms) |
| [`coveredLiveRun`](../../src/clients/web/events.ts#L316) | Function | history, liveRunId, activeTurn, latestTurn, nativeExecution | [Feature context](implementation/reconnect.md#mechanisms) |
| [`applyCoveredHistory`](../../src/clients/web/events.ts#L335) | Function | state | [Feature context](implementation/reconnect.md#mechanisms) |
| [`preserveCompatiblePrefix`](../../src/clients/web/events.ts#L355) | Function | previous, incoming, truncated | [Feature context](implementation/reconnect.md#mechanisms) |
| [`mergeSnapshotMessage`](../../src/clients/web/events.ts#L364) | Function | previous, incoming | [Feature context](implementation/reconnect.md#mechanisms) |
| [`copyMessageBlock`](../../src/clients/web/events.ts#L391) | Function | block | [Feature context](implementation/reconnect.md#mechanisms) |
| [`mergeSnapshotTool`](../../src/clients/web/events.ts#L397) | Function | previous, incoming | [Feature context](implementation/reconnect.md#mechanisms) |
| [`upsertSnapshotMessage`](../../src/clients/web/events.ts#L408) | Function | messages, value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`upsertSnapshotTool`](../../src/clients/web/events.ts#L424) | Function | tools, value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`snapshotState`](../../src/clients/web/events.ts#L437) | Function | state, frame | [Feature context](implementation/reconnect.md#mechanisms) |
| [`upsertMessage`](../../src/clients/web/events.ts#L537) | Function | messages, value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`appendDelta`](../../src/clients/web/events.ts#L557) | Function | messages, messageId, delta, truncated, blockDelta | [Feature context](implementation/reconnect.md#mechanisms) |
| [`messageThinkingBytes`](../../src/clients/web/events.ts#L652) | Function | message | [Feature context](implementation/reconnect.md#mechanisms) |
| [`upsertTool`](../../src/clients/web/events.ts#L660) | Function | tools, value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`reduceFrame`](../../src/clients/web/events.ts#L679) | Function | state, frame | [Feature context](implementation/reconnect.md#mechanisms) |
| [`reconcileHistory`](../../src/clients/web/events.ts#L833) | Function | state, page | [Feature context](implementation/reconnect.md#mechanisms) |
| [`visibleLiveContent`](../../src/clients/web/events.ts#L841) | Function | state, entries | [Feature context](implementation/reconnect.md#mechanisms) |
| [`clearRetiredProjection`](../../src/clients/web/events.ts#L260) | Function | | [Feature context](implementation/history-retirement.md#mechanisms) |


## src/clients/web/icons.ts

Feature context: [Read and navigate a conversation](implementation/read-conversation.md)

[Open source](../../src/clients/web/icons.ts) · 43 lines

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`ActionIcon`](../../src/clients/web/icons.ts#L3) | TypeAlias |  | [Feature context](implementation/read-conversation.md#behavior) |
| [`actionIcon`](../../src/clients/web/icons.ts#L5) | Function | name | [Feature context](implementation/read-conversation.md#execution) |
| [`labelWithIcon`](../../src/clients/web/icons.ts#L31) | Function | button, text, name, leading | [Feature context](implementation/read-conversation.md#execution) |


## src/clients/web/input.ts

Feature context: [Compose a message](implementation/compose-message.md)

[Open source](../../src/clients/web/input.ts) · 306 lines

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`BackspaceHold`](../../src/clients/web/input.ts#L3) | Interface |  | [Feature context](implementation/compose-message.md#behavior) |
| [`MAX_HEIGHT_PX`](../../src/clients/web/input.ts#L9) | Module value | Inferred from initializer | [Feature context](implementation/compose-message.md#behavior) |
| [`MIN_HEIGHT_PX`](../../src/clients/web/input.ts#L10) | Module value | Inferred from initializer | [Feature context](implementation/compose-message.md#behavior) |
| [`VIEWPORT_HEIGHT_RATIO`](../../src/clients/web/input.ts#L11) | Module value | Inferred from initializer | [Feature context](implementation/compose-message.md#behavior) |
| [`setupComposer`](../../src/clients/web/input.ts#L13) | Function | input, form, scroll | [Feature context](implementation/compose-message.md#mechanisms) |
| [`setupComposer.dispose`](../../src/clients/web/input.ts#L277) | Method | — | [Feature context](implementation/compose-message.md#verification) |


## src/clients/web/markdown.ts

Feature context: [Read and navigate a conversation](implementation/read-conversation.md)

[Open source](../../src/clients/web/markdown.ts) · 168 lines

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`record`](../../src/clients/web/markdown.ts#L4) | Function | value | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`text`](../../src/clients/web/markdown.ts#L9) | Function | value | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`entities`](../../src/clients/web/markdown.ts#L12) | Function | value | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`safeLink`](../../src/clients/web/markdown.ts#L33) | Function | value | [Feature context](implementation/read-conversation.md#mechanisms) |
| [`renderMarkdown`](../../src/clients/web/markdown.ts#L42) | Function | parent, source | [Feature context](implementation/read-conversation.md#mechanisms) |


## src/clients/web/memory.ts

Feature context: [Search and read Memory](implementation/memory.md)

[Open source](../../src/clients/web/memory.ts) · 312 lines

Local dependencies: [shared/memory.ts](../../src/shared/memory.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`MemoryPanelState`](../../src/clients/web/memory.ts#L13) | Interface |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryRequest`](../../src/clients/web/memory.ts#L27) | TypeAlias |  | [Feature context](implementation/memory.md#mechanisms) |
| [`StateChange`](../../src/clients/web/memory.ts#L28) | TypeAlias |  | [Feature context](implementation/memory.md#mechanisms) |
| [`emptyState`](../../src/clients/web/memory.ts#L30) | Function | query | [Feature context](implementation/memory.md#mechanisms) |
| [`errorCode`](../../src/clients/web/memory.ts#L46) | Function | error | [Feature context](implementation/memory.md#mechanisms) |
| [`errorText`](../../src/clients/web/memory.ts#L57) | Function | error | [Feature context](implementation/memory.md#mechanisms) |
| [`copyState`](../../src/clients/web/memory.ts#L73) | Function | state | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryPanel`](../../src/clients/web/memory.ts#L81) | Class |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryPanel.#request`](../../src/clients/web/memory.ts#L82) | Property |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryPanel.#changed`](../../src/clients/web/memory.ts#L83) | Property |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryPanel.#state`](../../src/clients/web/memory.ts#L84) | Property |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryPanel.#searchGeneration`](../../src/clients/web/memory.ts#L85) | Property |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryPanel.#readGeneration`](../../src/clients/web/memory.ts#L86) | Property |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryPanel.constructor`](../../src/clients/web/memory.ts#L88) | Constructor | request, changed | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryPanel.state`](../../src/clients/web/memory.ts#L93) | GetAccessor |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryPanel.setQuery`](../../src/clients/web/memory.ts#L97) | Method | query | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryPanel.search`](../../src/clients/web/memory.ts#L105) | Method | query | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryPanel.continueSearch`](../../src/clients/web/memory.ts#L149) | Method |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryPanel.read`](../../src/clients/web/memory.ts#L189) | Method | item | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryPanel.continueReading`](../../src/clients/web/memory.ts#L241) | Method |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryPanel.closeReader`](../../src/clients/web/memory.ts#L292) | Method |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryPanel.clear`](../../src/clients/web/memory.ts#L305) | Method |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryPanel.#emit`](../../src/clients/web/memory.ts#L312) | Method |  | [Feature context](implementation/memory.md#mechanisms) |

## src/clients/web/page.ts

Feature context: [Read and navigate a conversation](implementation/read-conversation.md)

[Open source](../../src/clients/web/page.ts) · 1049 lines

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`HOST_PAGE`](../../src/clients/web/page.ts#L1) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`STYLE`](../../src/clients/web/page.ts#L188) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |


## src/clients/web/script.ts

Feature context: [Read and navigate a conversation](implementation/read-conversation.md)

[Open source](../../src/clients/web/script.ts) · 41 lines

Local dependencies: [clients/web/memory.ts](../../src/clients/web/memory.ts), [shared/memory.ts](../../src/shared/memory.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`modules`](../../src/clients/web/script.ts#L6) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`BROWSER_ASSETS`](../../src/clients/web/script.ts#L29) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`BROWSER_SCRIPT`](../../src/clients/web/script.ts#L41) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |


## src/clients/web/tool-command.ts

Feature context: [Read and navigate a conversation](implementation/read-conversation.md)

[Open source](../../src/clients/web/tool-command.ts) · 46 lines

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`CommandPresentation`](../../src/clients/web/tool-command.ts#L3) | Interface |  | [Feature context](implementation/read-conversation.md#behavior) |
| [`commandLines`](../../src/clients/web/tool-command.ts#L9) | Function | command | [Feature context](implementation/read-conversation.md#execution) |
| [`commandPresentation`](../../src/clients/web/tool-command.ts#L15) | Function | command | [Feature context](implementation/read-conversation.md#execution) |
| [`appendToolCommand`](../../src/clients/web/tool-command.ts#L28) | Function | summary, command | [Feature context](implementation/read-conversation.md#execution) |


## src/clients/web/transport.ts

Feature context: [Read and navigate a conversation](implementation/read-conversation.md)

[Open source](../../src/clients/web/transport.ts) · 85 lines

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`BINDING_KEY`](../../src/clients/web/transport.ts#L2) | Module value | Inferred from initializer | [Feature context](implementation/read-conversation.md#behavior) |
| [`ApiError`](../../src/clients/web/transport.ts#L3) | Class |  | [Feature context](implementation/read-conversation.md#behavior) |
| [`ApiError.status`](../../src/clients/web/transport.ts#L4) | Property |  | [Feature context](implementation/read-conversation.md#behavior) |
| [`ApiError.code`](../../src/clients/web/transport.ts#L5) | Property |  | [Feature context](implementation/read-conversation.md#behavior) |
| [`ApiError.constructor`](../../src/clients/web/transport.ts#L6) | Constructor | status, code, message | [Feature context](implementation/pairing.md#mechanisms) |
| [`binding`](../../src/clients/web/transport.ts#L12) | Function | create | [Feature context](implementation/pairing.md#mechanisms) |
| [`headers`](../../src/clients/web/transport.ts#L33) | Function |  | [Feature context](implementation/pairing.md#mechanisms) |
| [`responseError`](../../src/clients/web/transport.ts#L39) | Function | response | [Feature context](implementation/pairing.md#mechanisms) |
| [`api`](../../src/clients/web/transport.ts#L60) | Function | path, body | [Feature context](implementation/pairing.md#mechanisms) |
| [`message`](../../src/clients/web/transport.ts#L83) | Function | error | [Feature context](implementation/pairing.md#mechanisms) |


## src/local/files.ts

Feature context: [Run and manage the Host](implementation/host-service.md)

[Open source](../../src/local/files.ts) · 84 lines

Local dependencies: [local/paths.ts](../../src/local/paths.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`prepareDataDirectory`](../../src/local/files.ts#L7) | Function | path | [Feature context](implementation/host-service.md#mechanisms) |
| [`readPrivateFile`](../../src/local/files.ts#L17) | Function | path | [Feature context](implementation/host-service.md#mechanisms) |
| [`createPrivateFile`](../../src/local/files.ts#L38) | Function | path, contents | [Feature context](implementation/host-service.md#mechanisms) |
| [`replacePrivateFile`](../../src/local/files.ts#L52) | Function | path, contents | [Feature context](implementation/host-service.md#mechanisms) |
| [`readCredential`](../../src/local/files.ts#L70) | Function | dataDir | [Feature context](implementation/host-service.md#mechanisms) |


## src/local/paths.ts

Feature context: [Run and manage the Host](implementation/host-service.md)

[Open source](../../src/local/paths.ts) · 50 lines

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`HostMode`](../../src/local/paths.ts#L5) | TypeAlias |  | [Feature context](implementation/host-service.md#behavior) |
| [`dataDirectory`](../../src/local/paths.ts#L7) | Function | mode | [Feature context](implementation/host-service.md#mechanisms) |
| [`hasCode`](../../src/local/paths.ts#L11) | Function | error, code | [Feature context](implementation/host-service.md#mechanisms) |
| [`canonicalDestination`](../../src/local/paths.ts#L15) | Function | path | [Feature context](implementation/host-service.md#mechanisms) |
| [`validateDataDirectory`](../../src/local/paths.ts#L27) | Function | path | [Feature context](implementation/host-service.md#mechanisms) |


## src/runtime/message-identity.ts

Feature context: [Read saved history](implementation/saved-history.md)

[Open source](../../src/runtime/message-identity.ts) · 52 lines

Local dependencies: [runtime/pi-process.ts](../../src/runtime/pi-process.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`canonical`](../../src/runtime/message-identity.ts#L5) | Function | value, depth | [Feature context](implementation/saved-history.md#ownership) |
| [`nextMessageKey`](../../src/runtime/message-identity.ts#L17) | Function | message, counts | [Feature context](implementation/saved-history.md#ownership) |
| [`savedMessageKeys`](../../src/runtime/message-identity.ts#L32) | Function | entries | [Feature context](implementation/saved-history.md#ownership) |


## src/runtime/pi-history-budget.ts

Feature context: [Read saved history](implementation/saved-history.md)

[Open source](../../src/runtime/pi-history-budget.ts) · 101 lines

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`MAX_ACTIVE_READS`](../../src/runtime/pi-history-budget.ts#L1) | Module value | Inferred from initializer | [Feature context](implementation/saved-history.md#behavior) |
| [`MAX_QUEUED_READS`](../../src/runtime/pi-history-budget.ts#L2) | Module value | Inferred from initializer | [Feature context](implementation/saved-history.md#behavior) |
| [`HistoryReadBudgetError`](../../src/runtime/pi-history-budget.ts#L4) | Class |  | [Feature context](implementation/saved-history.md#behavior) |
| [`HistoryReadBudgetError.constructor`](../../src/runtime/pi-history-budget.ts#L5) | Constructor |  | [Feature context](implementation/saved-history.md#mechanisms) |
| [`Waiter`](../../src/runtime/pi-history-budget.ts#L11) | Interface |  | [Feature context](implementation/saved-history.md#behavior) |
| [`abortError`](../../src/runtime/pi-history-budget.ts#L17) | Function |  | [Feature context](implementation/saved-history.md#mechanisms) |
| [`HistoryReadBudget`](../../src/runtime/pi-history-budget.ts#L23) | Class |  | [Feature context](implementation/saved-history.md#behavior) |
| [`HistoryReadBudget.#active`](../../src/runtime/pi-history-budget.ts#L24) | Property |  | [Feature context](implementation/saved-history.md#behavior) |
| [`HistoryReadBudget.#queue`](../../src/runtime/pi-history-budget.ts#L25) | Property |  | [Feature context](implementation/saved-history.md#behavior) |
| [`HistoryReadBudget.run`](../../src/runtime/pi-history-budget.ts#L27) | Method | operation, signal, { cancelQueuedOnly = false } | [Feature context](implementation/saved-history.md#mechanisms) |
| [`HistoryReadBudget.#release`](../../src/runtime/pi-history-budget.ts#L73) | Method |  | [Feature context](implementation/saved-history.md#mechanisms) |
| [`historyReadBudget`](../../src/runtime/pi-history-budget.ts#L92) | Module value | Inferred from initializer | [Feature context](implementation/saved-history.md#behavior) |
| [`runWithHistoryReadBudget`](../../src/runtime/pi-history-budget.ts#L95) | Function | operation, signal, options | [Feature context](implementation/saved-history.md#mechanisms) |


## src/runtime/pi-history.ts

Feature context: [Read saved history](implementation/saved-history.md)

[Open source](../../src/runtime/pi-history.ts) · 348 lines

Local dependencies: [runtime/pi-history-budget.ts](../../src/runtime/pi-history-budget.ts), [runtime/pi-process.ts](../../src/runtime/pi-process.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`MAX_SOURCE_BYTES`](../../src/runtime/pi-history.ts#L7) | Module value | Inferred from initializer | [Feature context](implementation/saved-history.md#behavior) |
| [`MAX_RECORD_BYTES`](../../src/runtime/pi-history.ts#L8) | Module value | Inferred from initializer | [Feature context](implementation/saved-history.md#behavior) |
| [`MAX_ENTRIES`](../../src/runtime/pi-history.ts#L9) | Module value | Inferred from initializer | [Feature context](implementation/saved-history.md#behavior) |
| [`MAX_NATIVE_ID_BYTES`](../../src/runtime/pi-history.ts#L10) | Module value | Inferred from initializer | [Feature context](implementation/saved-history.md#behavior) |
| [`MAX_TIMESTAMP_BYTES`](../../src/runtime/pi-history.ts#L11) | Module value | Inferred from initializer | [Feature context](implementation/saved-history.md#behavior) |
| [`READ_CHUNK_BYTES`](../../src/runtime/pi-history.ts#L12) | Module value | Inferred from initializer | [Feature context](implementation/saved-history.md#behavior) |
| [`REVISION_PATTERN`](../../src/runtime/pi-history.ts#L13) | Module value | Inferred from initializer | [Feature context](implementation/saved-history.md#behavior) |
| [`HistoryReadError`](../../src/runtime/pi-history.ts#L15) | Class |  | [Feature context](implementation/saved-history.md#behavior) |
| [`HistoryReadError.status`](../../src/runtime/pi-history.ts#L16) | Property |  | [Feature context](implementation/saved-history.md#behavior) |
| [`HistoryReadError.code`](../../src/runtime/pi-history.ts#L17) | Property |  | [Feature context](implementation/saved-history.md#behavior) |
| [`HistoryReadError.constructor`](../../src/runtime/pi-history.ts#L19) | Constructor | status, code, message | [Feature context](implementation/saved-history.md#mechanisms) |
| [`HistoryPrefix`](../../src/runtime/pi-history.ts#L27) | Interface |  | [Feature context](implementation/saved-history.md#behavior) |
| [`SavedHistory`](../../src/runtime/pi-history.ts#L32) | Interface |  | [Feature context](implementation/saved-history.md#behavior) |
| [`SavedHistoryReadOptions`](../../src/runtime/pi-history.ts#L40) | Interface |  | [Feature context](implementation/saved-history.md#behavior) |
| [`changed`](../../src/runtime/pi-history.ts#L50) | Function |  | [Feature context](implementation/saved-history.md#mechanisms) |
| [`invalid`](../../src/runtime/pi-history.ts#L54) | Function |  | [Feature context](implementation/saved-history.md#mechanisms) |
| [`unavailable`](../../src/runtime/pi-history.ts#L58) | Function |  | [Feature context](implementation/saved-history.md#mechanisms) |
| [`overLimit`](../../src/runtime/pi-history.ts#L62) | Function |  | [Feature context](implementation/saved-history.md#mechanisms) |
| [`busy`](../../src/runtime/pi-history.ts#L70) | Function |  | [Feature context](implementation/saved-history.md#mechanisms) |
| [`isRecord`](../../src/runtime/pi-history.ts#L78) | Function | value | [Feature context](implementation/saved-history.md#mechanisms) |
| [`errorCode`](../../src/runtime/pi-history.ts#L82) | Function | error | [Feature context](implementation/saved-history.md#mechanisms) |
| [`openError`](../../src/runtime/pi-history.ts#L88) | Function | error, hasPrefix | [Feature context](implementation/saved-history.md#mechanisms) |
| [`validatePrefix`](../../src/runtime/pi-history.ts#L96) | Function | prefix | [Feature context](implementation/saved-history.md#mechanisms) |
| [`sameIdentity`](../../src/runtime/pi-history.ts#L105) | Function | first, second | [Feature context](implementation/saved-history.md#mechanisms) |
| [`sameReadMetadata`](../../src/runtime/pi-history.ts#L112) | Function | first, second | [Feature context](implementation/saved-history.md#mechanisms) |
| [`assertSafeFile`](../../src/runtime/pi-history.ts#L123) | Function | info | [Feature context](implementation/saved-history.md#mechanisms) |
| [`assertPathIdentity`](../../src/runtime/pi-history.ts#L129) | Function | file, identity, hasPrefix | [Feature context](implementation/saved-history.md#mechanisms) |
| [`readBoundary`](../../src/runtime/pi-history.ts#L141) | Function | handle, byteLength | [Feature context](implementation/saved-history.md#mechanisms) |
| [`validTimestamp`](../../src/runtime/pi-history.ts#L161) | Function | value | [Feature context](implementation/saved-history.md#mechanisms) |
| [`parseRecord`](../../src/runtime/pi-history.ts#L173) | Function | buffer | [Feature context](implementation/saved-history.md#mechanisms) |
| [`parseEntries`](../../src/runtime/pi-history.ts#L193) | Function | content, completeBytes, options | [Feature context](implementation/saved-history.md#mechanisms) |
| [`makeRevision`](../../src/runtime/pi-history.ts#L254) | Function | dev, ino, content | [Feature context](implementation/saved-history.md#mechanisms) |
| [`completedBytes`](../../src/runtime/pi-history.ts#L266) | Function | content | [Feature context](implementation/saved-history.md#mechanisms) |
| [`readSavedHistorySnapshot`](../../src/runtime/pi-history.ts#L270) | Function | options, prefixBytes | [Feature context](implementation/saved-history.md#mechanisms) |
| [`readSavedHistory`](../../src/runtime/pi-history.ts#L336) | Function | options | [Feature context](implementation/saved-history.md#mechanisms) |


## src/runtime/pi-models.ts

Feature context: [Create and return to a conversation](implementation/session-lifecycle.md)

[Open source](../../src/runtime/pi-models.ts) · 57 lines

Local dependencies: [shared/discovery.ts](../../src/shared/discovery.ts), [shared/thinking.ts](../../src/shared/thinking.ts), [runtime/pi-rpc.ts](../../src/runtime/pi-rpc.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`parsePiSessionModels`](../../src/runtime/pi-models.ts#L6) | Function | value | [Feature context](implementation/models.md#mechanisms) |


## src/runtime/pi-process.ts

Feature context: [Create and return to a conversation](implementation/session-lifecycle.md)

[Open source](../../src/runtime/pi-process.ts) · 941 lines

Local dependencies: [local/paths.ts](../../src/local/paths.ts), [shared/discovery.ts](../../src/shared/discovery.ts), [shared/images.ts](../../src/shared/images.ts), [shared/sessions.ts](../../src/shared/sessions.ts), [shared/thinking.ts](../../src/shared/thinking.ts), [runtime/pi-models.ts](../../src/runtime/pi-models.ts), [runtime/pi-rpc.ts](../../src/runtime/pi-rpc.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`exec`](../../src/runtime/pi-process.ts#L18) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SUPPORTED_PI_VERSION`](../../src/runtime/pi-process.ts#L19) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`RuntimeState`](../../src/runtime/pi-process.ts#L20) | TypeAlias |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiOptions`](../../src/runtime/pi-process.ts#L21) | Interface |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionState`](../../src/runtime/pi-process.ts#L41) | Interface |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`RunResult`](../../src/runtime/pi-process.ts#L51) | Interface |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`NativeExecutionResult`](../../src/runtime/pi-process.ts#L55) | TypeAlias |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`ActiveExecution`](../../src/runtime/pi-process.ts#L59) | TypeAlias |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`NativeExecutionEvent`](../../src/runtime/pi-process.ts#L61) | TypeAlias |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiEntry`](../../src/runtime/pi-process.ts#L64) | TypeAlias |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`Listener`](../../src/runtime/pi-process.ts#L69) | TypeAlias |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`StateListener`](../../src/runtime/pi-process.ts#L70) | TypeAlias |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`NativeExecutionListener`](../../src/runtime/pi-process.ts#L71) | TypeAlias |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`Subscription`](../../src/runtime/pi-process.ts#L72) | Interface |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`Run`](../../src/runtime/pi-process.ts#L76) | Interface |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`NativeRun`](../../src/runtime/pi-process.ts#L88) | Interface |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`ActiveRun`](../../src/runtime/pi-process.ts#L94) | TypeAlias |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`UiResponse`](../../src/runtime/pi-process.ts#L95) | TypeAlias |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`sessionState`](../../src/runtime/pi-process.ts#L101) | Function | value | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`isSelectedModel`](../../src/runtime/pi-process.ts#L135) | Function | value | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`sessionEntries`](../../src/runtime/pi-process.ts#L145) | Function | value | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`verifyPiConfiguration`](../../src/runtime/pi-process.ts#L174) | Function | configuration, cwd, env, timeout | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`PiProcess`](../../src/runtime/pi-process.ts#L217) | Class |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiProcess.#state`](../../src/runtime/pi-process.ts#L218) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiProcess.#child`](../../src/runtime/pi-process.ts#L219) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiProcess.#rpc`](../../src/runtime/pi-process.ts#L220) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiProcess.#listeners`](../../src/runtime/pi-process.ts#L221) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiProcess.#stateListeners`](../../src/runtime/pi-process.ts#L222) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiProcess.#nativeExecutionListeners`](../../src/runtime/pi-process.ts#L223) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiProcess.#dialogs`](../../src/runtime/pi-process.ts#L224) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiProcess.#requestMs`](../../src/runtime/pi-process.ts#L225) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiProcess.#shutdownMs`](../../src/runtime/pi-process.ts#L226) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiProcess.#closed`](../../src/runtime/pi-process.ts#L227) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiProcess.#stderr`](../../src/runtime/pi-process.ts#L228) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiProcess.#run`](../../src/runtime/pi-process.ts#L229) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiProcess.#lastNativeExecution`](../../src/runtime/pi-process.ts#L230) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiProcess.#stopping`](../../src/runtime/pi-process.ts#L231) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiProcess.#expectedExit`](../../src/runtime/pi-process.ts#L232) | Property |  | [Feature context](implementation/host-service.md#mechanisms) |
| [`PiProcess.#error`](../../src/runtime/pi-process.ts#L233) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiProcess.constructor`](../../src/runtime/pi-process.ts#L235) | Constructor | child, requestMs, shutdownMs | [Feature context](implementation/session-lifecycle.md#execution) |
| [`PiProcess.start`](../../src/runtime/pi-process.ts#L280) | Method | options | [Feature context](implementation/session-lifecycle.md#execution) |
| [`PiProcess.state`](../../src/runtime/pi-process.ts#L404) | GetAccessor |  | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`PiProcess.pid`](../../src/runtime/pi-process.ts#L407) | GetAccessor |  | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`PiProcess.stderrTail`](../../src/runtime/pi-process.ts#L410) | GetAccessor |  | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`PiProcess.activeExecution`](../../src/runtime/pi-process.ts#L414) | GetAccessor |  | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`PiProcess.subscribe`](../../src/runtime/pi-process.ts#L422) | Method | listener, options | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`PiProcess.subscribeState`](../../src/runtime/pi-process.ts#L431) | Method | listener | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`PiProcess.subscribeNativeExecution`](../../src/runtime/pi-process.ts#L437) | Method | listener | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`PiProcess.getState`](../../src/runtime/pi-process.ts#L450) | Method |  | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`PiProcess.getAvailableModels`](../../src/runtime/pi-process.ts#L460) | Method |  | [Feature context](implementation/models.md#mechanisms) |
| [`PiProcess.getAvailableThinkingLevels`](../../src/runtime/pi-process.ts#L466) | Method |  | [Feature context](implementation/models.md#mechanisms) |
| [`PiProcess.setThinkingLevel`](../../src/runtime/pi-process.ts#L489) | Method | level | [Feature context](implementation/models.md#mechanisms) |
| [`PiProcess.setModel`](../../src/runtime/pi-process.ts#L498) | Method | provider, model | [Feature context](implementation/models.md#mechanisms) |
| [`PiProcess.getMessages`](../../src/runtime/pi-process.ts#L527) | Method |  | [Feature context](implementation/models.md#mechanisms) |
| [`PiProcess.getEntries`](../../src/runtime/pi-process.ts#L543) | Method |  | [Feature context](implementation/models.md#mechanisms) |
| [`PiProcess.supportsImages`](../../src/runtime/pi-process.ts#L553) | Method |  | [Feature context](implementation/models.md#mechanisms) |
| [`PiProcess.startRun`](../../src/runtime/pi-process.ts#L589) | Method | message, images | [Feature context](implementation/send-message.md#mechanisms) |
| [`PiProcess.run`](../../src/runtime/pi-process.ts#L659) | Method | message | [Feature context](implementation/send-message.md#mechanisms) |
| [`PiProcess.abort`](../../src/runtime/pi-process.ts#L665) | Method |  | [Feature context](implementation/send-message.md#mechanisms) |
| [`PiProcess.respondToUi`](../../src/runtime/pi-process.ts#L670) | Method | response | [Feature context](implementation/stop-work.md#mechanisms) |
| [`PiProcess.stop`](../../src/runtime/pi-process.ts#L693) | Method |  | [Feature context](implementation/stop-work.md#mechanisms) |
| [`PiProcess.#stop`](../../src/runtime/pi-process.ts#L698) | Method |  | [Feature context](implementation/stop-work.md#mechanisms) |
| [`PiProcess.#finish`](../../src/runtime/pi-process.ts#L717) | Method | run, result | [Feature context](implementation/send-message.md#mechanisms) |
| [`PiProcess.#rejectRun`](../../src/runtime/pi-process.ts#L725) | Method | run, error | [Feature context](implementation/send-message.md#mechanisms) |
| [`PiProcess.#fail`](../../src/runtime/pi-process.ts#L733) | Method | error | [Feature context](implementation/send-message.md#mechanisms) |
| [`PiProcess.#onRecord`](../../src/runtime/pi-process.ts#L742) | Method | record | [Feature context](implementation/send-message.md#mechanisms) |
| [`PiProcess.#setState`](../../src/runtime/pi-process.ts#L796) | Method | state | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`PiProcess.#beginNativeRun`](../../src/runtime/pi-process.ts#L804) | Method |  | [Feature context](implementation/send-message.md#mechanisms) |
| [`PiProcess.#finishNativeRun`](../../src/runtime/pi-process.ts#L812) | Method | run, result | [Feature context](implementation/send-message.md#mechanisms) |
| [`PiProcess.#transferHandledRun`](../../src/runtime/pi-process.ts#L820) | Method | run | [Feature context](implementation/send-message.md#mechanisms) |
| [`PiProcess.#interruptRun`](../../src/runtime/pi-process.ts#L847) | Method | error | [Feature context](implementation/send-message.md#mechanisms) |
| [`PiProcess.#publishNativeExecution`](../../src/runtime/pi-process.ts#L863) | Method | event | [Feature context](implementation/send-message.md#mechanisms) |
| [`PiProcess.#notifyNativeExecutionListener`](../../src/runtime/pi-process.ts#L869) | Method | listener, event | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`PiProcess.#notifyStateListener`](../../src/runtime/pi-process.ts#L881) | Method | listener, state | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`PiProcess.#hasInteractiveObservers`](../../src/runtime/pi-process.ts#L890) | Method |  | [Feature context](implementation/stop-work.md#mechanisms) |
| [`PiProcess.#cancelDialogs`](../../src/runtime/pi-process.ts#L894) | Method |  | [Feature context](implementation/stop-work.md#mechanisms) |
| [`PiProcess.#uiRequest`](../../src/runtime/pi-process.ts#L899) | Method | record | [Feature context](implementation/stop-work.md#mechanisms) |
| [`PiProcess.#clearDialogs`](../../src/runtime/pi-process.ts#L937) | Method |  | [Feature context](implementation/stop-work.md#mechanisms) |


## src/runtime/pi-rpc.ts

Feature context: [Create and return to a conversation](implementation/session-lifecycle.md)

[Open source](../../src/runtime/pi-rpc.ts) · 176 lines

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`RpcRecord`](../../src/runtime/pi-rpc.ts#L4) | TypeAlias |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`RpcCommandError`](../../src/runtime/pi-rpc.ts#L7) | Class |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`RpcCommandError.command`](../../src/runtime/pi-rpc.ts#L8) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`RpcCommandError.rejection`](../../src/runtime/pi-rpc.ts#L9) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`RpcCommandError.constructor`](../../src/runtime/pi-rpc.ts#L11) | Constructor | command, rejection | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`isRecord`](../../src/runtime/pi-rpc.ts#L19) | Function | value | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`Pending`](../../src/runtime/pi-rpc.ts#L23) | Interface |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiRpc`](../../src/runtime/pi-rpc.ts#L31) | Class |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiRpc.#input`](../../src/runtime/pi-rpc.ts#L32) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiRpc.#record`](../../src/runtime/pi-rpc.ts#L33) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiRpc.#failure`](../../src/runtime/pi-rpc.ts#L34) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiRpc.#timeout`](../../src/runtime/pi-rpc.ts#L35) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiRpc.#pending`](../../src/runtime/pi-rpc.ts#L36) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiRpc.#decoder`](../../src/runtime/pi-rpc.ts#L37) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiRpc.#buffer`](../../src/runtime/pi-rpc.ts#L38) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiRpc.#nextId`](../../src/runtime/pi-rpc.ts#L39) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiRpc.#closed`](../../src/runtime/pi-rpc.ts#L40) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiRpc.#writes`](../../src/runtime/pi-rpc.ts#L41) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiRpc.#queuedBytes`](../../src/runtime/pi-rpc.ts#L42) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PiRpc.constructor`](../../src/runtime/pi-rpc.ts#L44) | Constructor | input, output, timeout, record, failure | [Feature context](implementation/session-lifecycle.md#execution) |
| [`PiRpc.request`](../../src/runtime/pi-rpc.ts#L66) | Method | command, fields | [Feature context](implementation/session-lifecycle.md#execution) |
| [`PiRpc.write`](../../src/runtime/pi-rpc.ts#L82) | Method | record | [Feature context](implementation/session-lifecycle.md#execution) |
| [`PiRpc.close`](../../src/runtime/pi-rpc.ts#L107) | Method | error | [Feature context](implementation/stop-work.md#mechanisms) |
| [`PiRpc.fail`](../../src/runtime/pi-rpc.ts#L118) | Method | error | [Feature context](implementation/stop-work.md#mechanisms) |
| [`PiRpc.#read`](../../src/runtime/pi-rpc.ts#L124) | Method | chunk | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`PiRpc.#response`](../../src/runtime/pi-rpc.ts#L155) | Method | value | [Feature context](implementation/session-lifecycle.md#mechanisms) |


## src/server/access.ts

Feature context: [Connect a browser](implementation/pairing.md)

[Open source](../../src/server/access.ts) · 96 lines

Local dependencies: [local/files.ts](../../src/local/files.ts), [local/paths.ts](../../src/local/paths.ts), [server/auth.ts](../../src/server/auth.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`readBrowserOrigin`](../../src/server/access.ts#L8) | Function | dataDir, mode | [Feature context](implementation/pairing.md#mechanisms) |
| [`RequestAccess`](../../src/server/access.ts#L58) | Interface |  | [Feature context](implementation/pairing.md#behavior) |
| [`requestAccess`](../../src/server/access.ts#L65) | Function | headers, localOrigin, browserOrigin, mode | [Feature context](implementation/pairing.md#mechanisms) |
| [`browserCookie`](../../src/server/access.ts#L94) | Function | access, token, maxAge | [Feature context](implementation/pairing.md#mechanisms) |


## src/server/auth.ts

Feature context: [Connect a browser](implementation/pairing.md)

[Open source](../../src/server/auth.ts) · 263 lines

Local dependencies: [local/files.ts](../../src/local/files.ts), [local/paths.ts](../../src/local/paths.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`PAIRING_MS`](../../src/server/auth.ts#L12) | Module value | Inferred from initializer | [Feature context](implementation/pairing.md#behavior) |
| [`SESSION_MS`](../../src/server/auth.ts#L13) | Module value | Inferred from initializer | [Feature context](implementation/pairing.md#behavior) |
| [`MAX_SESSIONS`](../../src/server/auth.ts#L14) | Module value | Inferred from initializer | [Feature context](implementation/pairing.md#behavior) |
| [`PAIRING_ALPHABET`](../../src/server/auth.ts#L15) | Module value | Inferred from initializer | [Feature context](implementation/pairing.md#behavior) |
| [`BrowserSession`](../../src/server/auth.ts#L16) | Interface |  | [Feature context](implementation/pairing.md#behavior) |
| [`AccessError`](../../src/server/auth.ts#L22) | Class |  | [Feature context](implementation/pairing.md#behavior) |
| [`AccessError.status`](../../src/server/auth.ts#L23) | Property |  | [Feature context](implementation/pairing.md#behavior) |
| [`AccessError.code`](../../src/server/auth.ts#L24) | Property |  | [Feature context](implementation/pairing.md#behavior) |
| [`AccessError.constructor`](../../src/server/auth.ts#L25) | Constructor | status, code, message | [Feature context](implementation/pairing.md#mechanisms) |
| [`digest`](../../src/server/auth.ts#L32) | Function | value | [Feature context](implementation/pairing.md#mechanisms) |
| [`parseSessions`](../../src/server/auth.ts#L36) | Function | text | [Feature context](implementation/pairing.md#mechanisms) |
| [`LocalAuth`](../../src/server/auth.ts#L87) | Class |  | [Feature context](implementation/pairing.md#behavior) |
| [`LocalAuth.token`](../../src/server/auth.ts#L88) | Property |  | [Feature context](implementation/pairing.md#behavior) |
| [`LocalAuth.path`](../../src/server/auth.ts#L89) | Property |  | [Feature context](implementation/pairing.md#behavior) |
| [`LocalAuth.now`](../../src/server/auth.ts#L90) | Property |  | [Feature context](implementation/pairing.md#behavior) |
| [`LocalAuth.sessions`](../../src/server/auth.ts#L91) | Property |  | [Feature context](implementation/pairing.md#behavior) |
| [`LocalAuth.codes`](../../src/server/auth.ts#L92) | Property |  | [Feature context](implementation/pairing.md#behavior) |
| [`LocalAuth.attempts`](../../src/server/auth.ts#L93) | Property |  | [Feature context](implementation/pairing.md#behavior) |
| [`LocalAuth.pending`](../../src/server/auth.ts#L94) | Property |  | [Feature context](implementation/pairing.md#behavior) |
| [`LocalAuth.faulted`](../../src/server/auth.ts#L95) | Property |  | [Feature context](implementation/pairing.md#behavior) |
| [`LocalAuth.constructor`](../../src/server/auth.ts#L97) | Constructor | token, path, sessions, now | [Feature context](implementation/pairing.md#mechanisms) |
| [`LocalAuth.open`](../../src/server/auth.ts#L104) | Method | dataDir, now | [Feature context](implementation/pairing.md#mechanisms) |
| [`LocalAuth.isCli`](../../src/server/auth.ts#L121) | Method | authorization | [Feature context](implementation/pairing.md#mechanisms) |
| [`LocalAuth.available`](../../src/server/auth.ts#L130) | Method |  | [Feature context](implementation/pairing.md#mechanisms) |
| [`LocalAuth.isBrowser`](../../src/server/auth.ts#L139) | Method | token, browserKey | [Feature context](implementation/pairing.md#mechanisms) |
| [`LocalAuth.createPairing`](../../src/server/auth.ts#L158) | Method |  | [Feature context](implementation/pairing.md#mechanisms) |
| [`LocalAuth.serialize`](../../src/server/auth.ts#L181) | Method | action | [Feature context](implementation/pairing.md#mechanisms) |
| [`LocalAuth.save`](../../src/server/auth.ts#L190) | Method | sessions | [Feature context](implementation/pairing.md#mechanisms) |
| [`LocalAuth.redeem`](../../src/server/auth.ts#L204) | Method | code, browserKey | [Feature context](implementation/pairing.md#mechanisms) |
| [`LocalAuth.logout`](../../src/server/auth.ts#L241) | Method | token | [Feature context](implementation/pairing.md#mechanisms) |
| [`LocalAuth.revoke`](../../src/server/auth.ts#L252) | Method |  | [Feature context](implementation/pairing.md#mechanisms) |
| [`LocalAuth.drain`](../../src/server/auth.ts#L260) | Method |  | [Feature context](implementation/pairing.md#mechanisms) |


## src/server/http.ts

Feature context: [Run and manage the Host](implementation/host-service.md)

[Open source](../../src/server/http.ts) · 888 lines

Local dependencies: [clients/web/page.ts](../../src/clients/web/page.ts), [clients/web/script.ts](../../src/clients/web/script.ts), [integrations/configuration.ts](../../src/integrations/configuration.ts), [integrations/current.ts](../../src/integrations/current.ts), [integrations/distill.ts](../../src/integrations/distill.ts), [integrations/memory.ts](../../src/integrations/memory.ts), [local/files.ts](../../src/local/files.ts), [local/paths.ts](../../src/local/paths.ts), [server/access.ts](../../src/server/access.ts), [server/auth.ts](../../src/server/auth.ts), [server/sse.ts](../../src/server/sse.ts), [sessions/service.ts](../../src/sessions/service.ts), [shared/library.ts](../../src/shared/library.ts), [shared/memory.ts](../../src/shared/memory.ts), [shared/protocol.ts](../../src/shared/protocol.ts), [shared/sessions.ts](../../src/shared/sessions.ts), [shared/thinking.ts](../../src/shared/thinking.ts), [shared/turns.ts](../../src/shared/turns.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`HostOptions`](../../src/server/http.ts#L30) | Interface |  | [Feature context](implementation/host-service.md#behavior) |
| [`RunningHost`](../../src/server/http.ts#L40) | Interface |  | [Feature context](implementation/host-service.md#behavior) |
| [`fail`](../../src/server/http.ts#L45) | Function | status, code, message | [Feature context](implementation/pairing.md#mechanisms) |
| [`cookieToken`](../../src/server/http.ts#L48) | Function | request, name | [Feature context](implementation/pairing.md#mechanisms) |
| [`browserRequest`](../../src/server/http.ts#L56) | Function | request, origin | [Feature context](implementation/pairing.md#mechanisms) |
| [`readJson`](../../src/server/http.ts#L61) | Function | request, limit | [Feature context](implementation/pairing.md#mechanisms) |
| [`HTTP_DIAGNOSTIC_CODES`](../../src/server/http.ts#L98) | Module value | Inferred from initializer | [Feature context](implementation/host-service.md#mechanisms) |
| [`send`](../../src/server/http.ts#L121) | Function | response, status, body | [Feature context](implementation/pairing.md#mechanisms) |
| [`parseHistoryCursor`](../../src/server/http.ts#L136) | Function | query | [Feature context](implementation/pairing.md#mechanisms) |
| [`startHost`](../../src/server/http.ts#L167) | Function | {   port = DEFAULT_PORT,   mode = "production",   dataDir = dataDirectory(mode),   now = Date.now,   sessions: sessionOptions,   eventHeartbeatMs, } | [Feature context](implementation/host-service.md#mechanisms) |
| [`startHost.revalidateEventStreams`](../../src/server/http.ts#L200) | Nested function |  | [Feature context](implementation/host-service.md#mechanisms) |
| [`startHost.openEventStream`](../../src/server/http.ts#L204) | Nested function | request, response, sessionId, cursor, cookieName | [Feature context](implementation/host-service.md#mechanisms) |
| [`startHost.handle`](../../src/server/http.ts#L237) | Nested function | request, response | [Feature context](implementation/host-service.md#execution) |
| [`parseLibraryLatestQuery`](../../src/server/http.ts#L150) | Function | | [Feature context](implementation/library.md#mechanisms) |
  port = DEFAULT_PORT,
  mode = "production",
  dataDir = dataDirectory(mode),
  now = Date.now,
  sessions: sessionOptions,
  eventHeartbeatMs,
} | [Feature context](implementation/host-service.md#mechanisms) |

## src/server/session-discovery.ts

Feature context: [Choose a directory, model and thinking level](implementation/models.md)

[Open source](../../src/server/session-discovery.ts) · 600 lines

Local dependencies: [runtime/pi-process.ts](../../src/runtime/pi-process.ts), [shared/discovery.ts](../../src/shared/discovery.ts), [shared/thinking.ts](../../src/shared/thinking.ts), [shared/sessions.ts](../../src/shared/sessions.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`MAX_DIRECTORY_ENTRIES`](../../src/server/session-discovery.ts#L26) | Module value | Inferred from initializer | [Feature context](implementation/models.md#behavior) |
| [`MAX_DIRECTORY_SCAN`](../../src/server/session-discovery.ts#L27) | Module value | Inferred from initializer | [Feature context](implementation/models.md#behavior) |
| [`MAX_PATH_LENGTH`](../../src/server/session-discovery.ts#L28) | Module value | Inferred from initializer | [Feature context](implementation/models.md#behavior) |
| [`MAX_MODEL_COUNT`](../../src/server/session-discovery.ts#L29) | Module value | Inferred from initializer | [Feature context](implementation/models.md#behavior) |
| [`MAX_MODEL_OUTPUT_BYTES`](../../src/server/session-discovery.ts#L30) | Module value | Inferred from initializer | [Feature context](implementation/models.md#behavior) |
| [`MODEL_DISCOVERY_TIMEOUT_MS`](../../src/server/session-discovery.ts#L31) | Module value | Inferred from initializer | [Feature context](implementation/models.md#behavior) |
| [`MAX_CONFIG_FILE_BYTES`](../../src/server/session-discovery.ts#L32) | Module value | Inferred from initializer | [Feature context](implementation/models.md#behavior) |
| [`MAX_CONFIG_BYTES`](../../src/server/session-discovery.ts#L33) | Module value | Inferred from initializer | [Feature context](implementation/models.md#behavior) |
| [`PI_CONFIG_FILES`](../../src/server/session-discovery.ts#L34) | Module value | Inferred from initializer | [Feature context](implementation/models.md#behavior) |
| [`MODEL_LIST_COLUMNS`](../../src/server/session-discovery.ts#L41) | Module value | Inferred from initializer | [Feature context](implementation/models.md#behavior) |
| [`SessionDiscoveryError`](../../src/server/session-discovery.ts#L43) | Class |  | [Feature context](implementation/models.md#behavior) |
| [`SessionDiscoveryError.status`](../../src/server/session-discovery.ts#L44) | Property |  | [Feature context](implementation/models.md#behavior) |
| [`SessionDiscoveryError.code`](../../src/server/session-discovery.ts#L45) | Property |  | [Feature context](implementation/models.md#behavior) |
| [`SessionDiscoveryError.constructor`](../../src/server/session-discovery.ts#L47) | Constructor | status, code, message | [Feature context](implementation/models.md#mechanisms) |
| [`errnoCode`](../../src/server/session-discovery.ts#L54) | Function | error | [Feature context](implementation/models.md#mechanisms) |
| [`hostHomeDirectory`](../../src/server/session-discovery.ts#L60) | Function | env | [Feature context](implementation/models.md#mechanisms) |
| [`canonicalPathForPiAgentDirectory`](../../src/server/session-discovery.ts#L72) | Function | env, home | [Feature context](implementation/models.md#mechanisms) |
| [`directoryError`](../../src/server/session-discovery.ts#L90) | Function | error | [Feature context](implementation/models.md#mechanisms) |
| [`listHostDirectories`](../../src/server/session-discovery.ts#L112) | Function | requestedPath, homeDirectory | [Feature context](implementation/models.md#mechanisms) |
| [`DiscoveryWorkspace`](../../src/server/session-discovery.ts#L179) | Interface |  | [Feature context](implementation/models.md#behavior) |
| [`createDiscoveryWorkspace`](../../src/server/session-discovery.ts#L187) | Function |  | [Feature context](implementation/models.md#mechanisms) |
| [`isolatedEnvironment`](../../src/server/session-discovery.ts#L226) | Function | env, workspace | [Feature context](implementation/models.md#mechanisms) |
| [`discoveryEnvironment`](../../src/server/session-discovery.ts#L243) | Function | env, workspace | [Feature context](implementation/models.md#mechanisms) |
| [`copyPiConfiguration`](../../src/server/session-discovery.ts#L250) | Function | sourceDirectory, targetDirectory | [Feature context](implementation/models.md#mechanisms) |
| [`runModelList`](../../src/server/session-discovery.ts#L293) | Function | configuration, cwd, env | [Feature context](implementation/models.md#mechanisms) |
| [`modelColumnPositions`](../../src/server/session-discovery.ts#L331) | Function | line | [Feature context](implementation/models.md#mechanisms) |
| [`modelColumns`](../../src/server/session-discovery.ts#L343) | Function | line, positions | [Feature context](implementation/models.md#mechanisms) |
| [`parseModelList`](../../src/server/session-discovery.ts#L356) | Function | output | [Feature context](implementation/models.md#mechanisms) |
| [`discoverPiModels`](../../src/server/session-discovery.ts#L434) | Function | configuration, env | [Feature context](implementation/models.md#mechanisms) |
| [`discoverPiModelCapabilities`](../../src/server/session-discovery.ts#L503) | Function | configuration, env, request | [Feature context](implementation/models.md#mechanisms) |


## src/server/sse.ts

Feature context: [Run and manage the Host](implementation/host-service.md)

[Open source](../../src/server/sse.ts) · 302 lines

Local dependencies: [shared/events.ts](../../src/shared/events.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`MAX_BUFFER_BYTES`](../../src/server/sse.ts#L4) | Module value | Inferred from initializer | [Feature context](implementation/host-service.md#behavior) |
| [`HEARTBEAT`](../../src/server/sse.ts#L5) | Module value | Inferred from initializer | [Feature context](implementation/host-service.md#behavior) |
| [`STREAM_ERROR_FLUSH_MS`](../../src/server/sse.ts#L6) | Module value | Inferred from initializer | [Feature context](implementation/host-service.md#behavior) |
| [`SseStartError`](../../src/server/sse.ts#L8) | Class |  | [Feature context](implementation/host-service.md#behavior) |
| [`SseStartError.code`](../../src/server/sse.ts#L9) | Property |  | [Feature context](implementation/host-service.md#behavior) |
| [`SseStartError.constructor`](../../src/server/sse.ts#L11) | Constructor | code, message | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SseConnection`](../../src/server/sse.ts#L17) | Interface |  | [Feature context](implementation/host-service.md#behavior) |
| [`SseConnectionOptions`](../../src/server/sse.ts#L24) | Interface |  | [Feature context](implementation/host-service.md#behavior) |
| [`encodeFrame`](../../src/server/sse.ts#L30) | Function | frame | [Feature context](implementation/reconnect.md#mechanisms) |
| [`createSseConnection`](../../src/server/sse.ts#L48) | Function | response, { heartbeatMs = 15_000, isAuthorized, onClose } | [Feature context](implementation/reconnect.md#mechanisms) |
| [`createSseConnection.onDrain`](../../src/server/sse.ts#L171) | Nested function |  | [Feature context](implementation/reconnect.md#execution) |
| [`createSseConnection.onCloseResponse`](../../src/server/sse.ts#L176) | Nested function |  | [Feature context](implementation/reconnect.md#execution) |
| [`createSseConnection.onErrorResponse`](../../src/server/sse.ts#L180) | Nested function |  | [Feature context](implementation/reconnect.md#execution) |
| [`createSseConnection.enqueue`](../../src/server/sse.ts#L198) | Method | — | [Feature context](implementation/reconnect.md#execution) |
| [`createSseConnection.start`](../../src/server/sse.ts#L229) | Method | — | [Feature context](implementation/reconnect.md#execution) |
| [`createSseConnection.revalidate`](../../src/server/sse.ts#L292) | Method | — | [Feature context](implementation/reconnect.md#execution) |
| [`createSseConnection.close`](../../src/server/sse.ts#L298) | Method | — | [Feature context](implementation/reconnect.md#execution) |


## src/service/service.ts

Feature context: [Run and manage the Host](implementation/host-service.md)

[Open source](../../src/service/service.ts) · 1005 lines

Local dependencies: [local/paths.ts](../../src/local/paths.ts), [shared/protocol.ts](../../src/shared/protocol.ts), [clients/cli/status.ts](../../src/clients/cli/status.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`SERVICE_LABEL`](../../src/service/service.ts#L22) | Module value | Inferred from initializer | [Feature context](implementation/host-service.md#behavior) |
| [`SYSTEMD_UNIT`](../../src/service/service.ts#L23) | Module value | Inferred from initializer | [Feature context](implementation/host-service.md#behavior) |
| [`DATA_DIRECTORY_SEGMENTS`](../../src/service/service.ts#L24) | Module value | Inferred from initializer | [Feature context](implementation/host-service.md#behavior) |
| [`STARTUP_TIMEOUT_MS`](../../src/service/service.ts#L25) | Module value | Inferred from initializer | [Feature context](implementation/host-service.md#behavior) |
| [`POLL_INTERVAL_MS`](../../src/service/service.ts#L26) | Module value | Inferred from initializer | [Feature context](implementation/host-service.md#behavior) |
| [`COMMAND_TIMEOUT_MS`](../../src/service/service.ts#L27) | Module value | Inferred from initializer | [Feature context](implementation/host-service.md#behavior) |
| [`MAX_COMMAND_OUTPUT_BYTES`](../../src/service/service.ts#L28) | Module value | Inferred from initializer | [Feature context](implementation/host-service.md#behavior) |
| [`MAX_REGISTRATION_BYTES`](../../src/service/service.ts#L29) | Module value | Inferred from initializer | [Feature context](implementation/host-service.md#behavior) |
| [`SERVICE_ACTIONS`](../../src/service/service.ts#L31) | Module value | Inferred from initializer | [Feature context](implementation/host-service.md#behavior) |
| [`ServiceAction`](../../src/service/service.ts#L39) | TypeAlias |  | [Feature context](implementation/host-service.md#behavior) |
| [`ServiceCommandResult`](../../src/service/service.ts#L41) | Interface |  | [Feature context](implementation/host-service.md#behavior) |
| [`ServiceReadiness`](../../src/service/service.ts#L47) | Interface |  | [Feature context](implementation/host-service.md#behavior) |
| [`ServiceCommandRunner`](../../src/service/service.ts#L53) | TypeAlias |  | [Feature context](implementation/host-service.md#behavior) |
| [`ServiceCommandOptions`](../../src/service/service.ts#L58) | Interface |  | [Feature context](implementation/host-service.md#behavior) |
| [`ServicePaths`](../../src/service/service.ts#L70) | Interface |  | [Feature context](implementation/host-service.md#behavior) |
| [`ManagerState`](../../src/service/service.ts#L86) | Interface |  | [Feature context](implementation/host-service.md#behavior) |
| [`DirectoryCheck`](../../src/service/service.ts#L91) | Interface |  | [Feature context](implementation/host-service.md#behavior) |
| [`defaultRunner`](../../src/service/service.ts#L96) | Function | command, args | [Feature context](implementation/host-service.md#execution) |
| [`validatePath`](../../src/service/service.ts#L119) | Function | value, label | [Feature context](implementation/host-service.md#execution) |
| [`resolvePaths`](../../src/service/service.ts#L130) | Function | options | [Feature context](implementation/host-service.md#execution) |
| [`ensureDirectories`](../../src/service/service.ts#L197) | Function | homeDirectory, userId, segments, { create, private: requirePrivate } | [Feature context](implementation/host-service.md#mechanisms) |
| [`ensureServiceDirectories`](../../src/service/service.ts#L255) | Function | paths, create | [Feature context](implementation/host-service.md#mechanisms) |
| [`plistEscape`](../../src/service/service.ts#L275) | Function | value | [Feature context](implementation/host-service.md#mechanisms) |
| [`systemdQuote`](../../src/service/service.ts#L279) | Function | value, escapeCommandVariables | [Feature context](implementation/host-service.md#mechanisms) |
| [`launchAgentContent`](../../src/service/service.ts#L285) | Function | paths | [Feature context](implementation/host-service.md#mechanisms) |
| [`systemdUnitContent`](../../src/service/service.ts#L329) | Function | paths, legacy | [Feature context](implementation/host-service.md#mechanisms) |
| [`registrationContent`](../../src/service/service.ts#L360) | Function | paths | [Feature context](implementation/host-service.md#mechanisms) |
| [`isLegacyRegistration`](../../src/service/service.ts#L364) | Function | paths, content | [Feature context](implementation/host-service.md#mechanisms) |
| [`fileOpenFlags`](../../src/service/service.ts#L372) | Function |  | [Feature context](implementation/host-service.md#ownership) |
| [`readPrivateRegistration`](../../src/service/service.ts#L376) | Function | path, userId | [Feature context](implementation/host-service.md#ownership) |
| [`RegistrationChange`](../../src/service/service.ts#L416) | TypeAlias |  | [Feature context](implementation/host-service.md#behavior) |
| [`upgradeRegistration`](../../src/service/service.ts#L418) | Function | paths, previous, content | [Feature context](implementation/host-service.md#ownership) |
| [`writePrivateRegistration`](../../src/service/service.ts#L450) | Function | paths, content | [Feature context](implementation/host-service.md#ownership) |
| [`verifyRegistration`](../../src/service/service.ts#L506) | Function | paths, allowLegacy | [Feature context](implementation/host-service.md#ownership) |
| [`run`](../../src/service/service.ts#L527) | Function | paths, command, args | [Feature context](implementation/host-service.md#execution) |
| [`commandError`](../../src/service/service.ts#L535) | Function | command, args, result | [Feature context](implementation/host-service.md#execution) |
| [`runRequired`](../../src/service/service.ts#L542) | Function | paths, command, args | [Feature context](implementation/host-service.md#execution) |
| [`reloadLinuxManager`](../../src/service/service.ts#L552) | Function | paths | [Feature context](implementation/host-service.md#execution) |
| [`unknownSetting`](../../src/service/service.ts#L557) | Function | error | [Feature context](implementation/host-service.md#execution) |
| [`linuxAutostart`](../../src/service/service.ts#L562) | Function | paths | [Feature context](implementation/host-service.md#execution) |
| [`linuxLingering`](../../src/service/service.ts#L596) | Function | paths | [Feature context](implementation/host-service.md#execution) |
| [`linuxBootStatus`](../../src/service/service.ts#L613) | Function | paths | [Feature context](implementation/host-service.md#execution) |
| [`inspectLinux`](../../src/service/service.ts#L618) | Function | paths, repairingLegacy | [Feature context](implementation/host-service.md#ownership) |
| [`LaunchdRegistration`](../../src/service/service.ts#L667) | Interface |  | [Feature context](implementation/host-service.md#behavior) |
| [`parseLaunchdRegistration`](../../src/service/service.ts#L675) | Function | output | [Feature context](implementation/host-service.md#ownership) |
| [`validateLaunchdIdentity`](../../src/service/service.ts#L700) | Function | paths, registration | [Feature context](implementation/host-service.md#ownership) |
| [`inspectMac`](../../src/service/service.ts#L714) | Function | paths | [Feature context](implementation/host-service.md#ownership) |
| [`managerProcessIsRunning`](../../src/service/service.ts#L727) | Function | paths, state | [Feature context](implementation/host-service.md#ownership) |
| [`inspectManager`](../../src/service/service.ts#L732) | Function | paths | [Feature context](implementation/host-service.md#ownership) |
| [`readReadiness`](../../src/service/service.ts#L736) | Function | paths, processId, timeoutMs | [Feature context](implementation/host-service.md#mechanisms) |
| [`validateReadyIdentity`](../../src/service/service.ts#L744) | Function | status, expectedProcessId | [Feature context](implementation/host-service.md#mechanisms) |
| [`waitForReady`](../../src/service/service.ts#L757) | Function | paths, deadline | [Feature context](implementation/host-service.md#mechanisms) |
| [`startService`](../../src/service/service.ts#L784) | Function | paths | [Feature context](implementation/host-service.md#mechanisms) |
| [`waitForStopped`](../../src/service/service.ts#L832) | Function | paths | [Feature context](implementation/host-service.md#mechanisms) |
| [`stopService`](../../src/service/service.ts#L851) | Function | paths | [Feature context](implementation/host-service.md#mechanisms) |
| [`removeRegistration`](../../src/service/service.ts#L866) | Function | paths | [Feature context](implementation/host-service.md#mechanisms) |
| [`install`](../../src/service/service.ts#L877) | Function | paths | [Feature context](implementation/host-service.md#mechanisms) |
| [`uninstall`](../../src/service/service.ts#L904) | Function | paths | [Feature context](implementation/host-service.md#mechanisms) |
| [`runtimeStatus`](../../src/service/service.ts#L939) | Function | paths | [Feature context](implementation/host-service.md#mechanisms) |
| [`status`](../../src/service/service.ts#L974) | Function | paths | [Feature context](implementation/host-service.md#mechanisms) |
| [`runServiceCommand`](../../src/service/service.ts#L983) | Function | action, options | [Feature context](implementation/host-service.md#execution) |


## src/sessions/events.ts

Feature context: [Reconnect to ongoing work](implementation/reconnect.md)

[Open source](../../src/sessions/events.ts) · 1390 lines

Local dependencies: [runtime/message-identity.ts](../../src/runtime/message-identity.ts), [runtime/pi-rpc.ts](../../src/runtime/pi-rpc.ts), [shared/events.ts](../../src/shared/events.ts), [shared/sessions.ts](../../src/shared/sessions.ts), [shared/turns.ts](../../src/shared/turns.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`SessionEventsOptions`](../../src/sessions/events.ts#L22) | Interface |  | [Feature context](implementation/reconnect.md#behavior) |
| [`InvalidCursorError`](../../src/sessions/events.ts#L30) | Class |  | [Feature context](implementation/reconnect.md#behavior) |
| [`InvalidCursorError.constructor`](../../src/sessions/events.ts#L31) | Constructor |  | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SubscriberLimitError`](../../src/sessions/events.ts#L37) | Class |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SubscriberLimitError.constructor`](../../src/sessions/events.ts#L38) | Constructor |  | [Feature context](implementation/reconnect.md#mechanisms) |
| [`StreamCapacityError`](../../src/sessions/events.ts#L44) | Class |  | [Feature context](implementation/reconnect.md#behavior) |
| [`StreamCapacityError.constructor`](../../src/sessions/events.ts#L45) | Constructor | message | [Feature context](implementation/reconnect.md#mechanisms) |
| [`EventType`](../../src/sessions/events.ts#L51) | TypeAlias |  | [Feature context](implementation/reconnect.md#behavior) |
| [`PayloadFor`](../../src/sessions/events.ts#L52) | TypeAlias |  | [Feature context](implementation/reconnect.md#behavior) |
| [`ReplayableFrame`](../../src/sessions/events.ts#L53) | TypeAlias |  | [Feature context](implementation/reconnect.md#behavior) |
| [`StoredEvent`](../../src/sessions/events.ts#L55) | Interface |  | [Feature context](implementation/reconnect.md#behavior) |
| [`Subscriber`](../../src/sessions/events.ts#L61) | Interface |  | [Feature context](implementation/reconnect.md#behavior) |
| [`CachedView`](../../src/sessions/events.ts#L66) | Interface |  | [Feature context](implementation/reconnect.md#behavior) |
| [`LiveState`](../../src/sessions/events.ts#L73) | Interface |  | [Feature context](implementation/reconnect.md#behavior) |
| [`LiveContentBlock`](../../src/sessions/events.ts#L85) | Interface |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SessionStream`](../../src/sessions/events.ts#L94) | Interface |  | [Feature context](implementation/reconnect.md#behavior) |
| [`ParsedCursor`](../../src/sessions/events.ts#L107) | Interface |  | [Feature context](implementation/reconnect.md#behavior) |
| [`BoundedText`](../../src/sessions/events.ts#L113) | Interface |  | [Feature context](implementation/reconnect.md#behavior) |
| [`BoundedAppend`](../../src/sessions/events.ts#L118) | Interface |  | [Feature context](implementation/reconnect.md#behavior) |
| [`UUID`](../../src/sessions/events.ts#L122) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`CURSOR`](../../src/sessions/events.ts#L123) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`encoder`](../../src/sessions/events.ts#L124) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_STREAMS`](../../src/sessions/events.ts#L125) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_REPLAY_EVENTS`](../../src/sessions/events.ts#L126) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_REPLAY_BYTES`](../../src/sessions/events.ts#L127) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_SESSION_SUBSCRIBERS`](../../src/sessions/events.ts#L128) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_SUBSCRIBERS`](../../src/sessions/events.ts#L129) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_MESSAGE_JSON_BYTES`](../../src/sessions/events.ts#L130) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_MESSAGE_CONTENT_BLOCKS`](../../src/sessions/events.ts#L131) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_TOOL_FIELD_JSON_BYTES`](../../src/sessions/events.ts#L132) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_TOOL_NAME_JSON_BYTES`](../../src/sessions/events.ts#L133) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_TOOL_CALL_ID_BYTES`](../../src/sessions/events.ts#L134) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_TOOLS`](../../src/sessions/events.ts#L135) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_METADATA_DIRECTORY_JSON_BYTES`](../../src/sessions/events.ts#L136) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_METADATA_VALUE_JSON_BYTES`](../../src/sessions/events.ts#L137) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_METADATA_ERROR_JSON_BYTES`](../../src/sessions/events.ts#L138) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_TURN_ERROR_JSON_BYTES`](../../src/sessions/events.ts#L139) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_LIMITED_STRING_JSON_BYTES`](../../src/sessions/events.ts#L140) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`MAX_REPLAY_INITIAL_BYTES`](../../src/sessions/events.ts#L141) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`SSE_FRAME_OVERHEAD_BYTES`](../../src/sessions/events.ts#L142) | Module value | Inferred from initializer | [Feature context](implementation/reconnect.md#behavior) |
| [`isRecord`](../../src/sessions/events.ts#L144) | Function | value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`jsonStringBytes`](../../src/sessions/events.ts#L148) | Function | value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`boundedJsonString`](../../src/sessions/events.ts#L152) | Function | value, maxBytes | [Feature context](implementation/reconnect.md#mechanisms) |
| [`appendBoundedJsonString`](../../src/sessions/events.ts#L176) | Function | existing, addition, maxBytes | [Feature context](implementation/reconnect.md#mechanisms) |
| [`safeJsonString`](../../src/sessions/events.ts#L209) | Function | value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`equalJson`](../../src/sessions/events.ts#L217) | Function | left, right | [Feature context](implementation/reconnect.md#mechanisms) |
| [`blockDelta`](../../src/sessions/events.ts#L221) | Function | type, contentIndex, text | [Feature context](implementation/reconnect.md#mechanisms) |
| [`emptyLiveState`](../../src/sessions/events.ts#L229) | Function |  | [Feature context](implementation/reconnect.md#mechanisms) |
| [`parseCursor`](../../src/sessions/events.ts#L246) | Function | cursor, sessionId | [Feature context](implementation/reconnect.md#mechanisms) |
| [`projectSession`](../../src/sessions/events.ts#L260) | Function | value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`projectTurn`](../../src/sessions/events.ts#L315) | Function | value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`extractText`](../../src/sessions/events.ts#L341) | Function | value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`clippedToolInput`](../../src/sessions/events.ts#L352) | Function | value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`clippedToolText`](../../src/sessions/events.ts#L356) | Function | value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`eventSize`](../../src/sessions/events.ts#L360) | Function | value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`asReplayable`](../../src/sessions/events.ts#L364) | Function | frame | [Feature context](implementation/reconnect.md#mechanisms) |
| [`copyFrame`](../../src/sessions/events.ts#L368) | Function | frame | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents`](../../src/sessions/events.ts#L373) | Class |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SessionEvents.#maxSessions`](../../src/sessions/events.ts#L374) | Property |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SessionEvents.#maxReplayEvents`](../../src/sessions/events.ts#L375) | Property |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SessionEvents.#maxReplayBytes`](../../src/sessions/events.ts#L376) | Property |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SessionEvents.#maxSubscribersPerSession`](../../src/sessions/events.ts#L377) | Property |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SessionEvents.#maxSubscribers`](../../src/sessions/events.ts#L378) | Property |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SessionEvents.#streams`](../../src/sessions/events.ts#L379) | Property |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SessionEvents.#subscriberCount`](../../src/sessions/events.ts#L380) | Property |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SessionEvents.#tick`](../../src/sessions/events.ts#L381) | Property |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SessionEvents.#closed`](../../src/sessions/events.ts#L382) | Property |  | [Feature context](implementation/reconnect.md#behavior) |
| [`SessionEvents.constructor`](../../src/sessions/events.ts#L384) | Constructor | options | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.ensure`](../../src/sessions/events.ts#L399) | Method | sessionId | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.publishSession`](../../src/sessions/events.ts#L404) | Method | session | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.publishTurn`](../../src/sessions/events.ts#L441) | Method | session, activeTurn, latestTurn | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.beginTurn`](../../src/sessions/events.ts#L505) | Method | sessionId, runId, messageCounts, messageIdentityKnown | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.beginNativeExecution`](../../src/sessions/events.ts#L530) | Method | sessionId, executionId, messageCounts | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.observe`](../../src/sessions/events.ts#L573) | Method | sessionId, runId, event | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.endTurn`](../../src/sessions/events.ts#L605) | Method | sessionId, runId | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.endNativeExecution`](../../src/sessions/events.ts#L614) | Method | sessionId, executionId | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.fail`](../../src/sessions/events.ts#L638) | Method | sessionId, code, message | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.connect`](../../src/sessions/events.ts#L654) | Method | session, activeTurn, latestTurn, cursor, listener | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.close`](../../src/sessions/events.ts#L684) | Method |  | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#validView`](../../src/sessions/events.ts#L695) | Method | session, activeTurn, latestTurn | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#getOrCreate`](../../src/sessions/events.ts#L715) | Method | sessionId | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#touch`](../../src/sessions/events.ts#L747) | Method | stream | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#removeSubscriber`](../../src/sessions/events.ts#L751) | Method | stream, subscriber | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#reconcileView`](../../src/sessions/events.ts#L758) | Method | stream, session, activeTurn, latestTurn | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#publishViewLimits`](../../src/sessions/events.ts#L814) | Method | stream, _session, activeTurn, latestTurn, sessionLimited | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#initialFrames`](../../src/sessions/events.ts#L828) | Method | stream, cursor | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#snapshotFrame`](../../src/sessions/events.ts#L852) | Method | stream | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#resyncFrame`](../../src/sessions/events.ts#L883) | Method | stream, reason | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#cursor`](../../src/sessions/events.ts#L897) | Method | stream | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#emit`](../../src/sessions/events.ts#L901) | Method | stream, runId, type, payload | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#limited`](../../src/sessions/events.ts#L946) | Method | stream, scope, limit | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#projectionError`](../../src/sessions/events.ts#L953) | Method | stream | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#messageStart`](../../src/sessions/events.ts#L962) | Method | stream, event | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#messageUpdate`](../../src/sessions/events.ts#L975) | Method | stream, event | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#messageEnd`](../../src/sessions/events.ts#L1106) | Method | stream, event | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#parseContent`](../../src/sessions/events.ts#L1130) | Method | content, finished | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#contentBlock`](../../src/sessions/events.ts#L1164) | Method | stream, contentIndex, type | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#partialContent`](../../src/sessions/events.ts#L1186) | Method | partial, contentIndex, type | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#appendContent`](../../src/sessions/events.ts#L1198) | Method | content, block, text | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#publishMessage`](../../src/sessions/events.ts#L1215) | Method | stream, type, nativeKey, messageId | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#toolStart`](../../src/sessions/events.ts#L1268) | Method | stream, event | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#toolUpdate`](../../src/sessions/events.ts#L1288) | Method | stream, event | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#toolEnd`](../../src/sessions/events.ts#L1312) | Method | stream, event | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#getTool`](../../src/sessions/events.ts#L1336) | Method | stream, rawId, name, input | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#toolEventId`](../../src/sessions/events.ts#L1372) | Method | event | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.#toolEventName`](../../src/sessions/events.ts#L1380) | Method | event | [Feature context](implementation/reconnect.md#mechanisms) |
| [`boundedLimit`](../../src/sessions/events.ts#L1385) | Function | value, maximum, minimum | [Feature context](implementation/reconnect.md#mechanisms) |
| [`SessionEvents.clearHistory`](../../src/sessions/events.ts#L432) | Method | | [Feature context](implementation/history-retirement.md#mechanisms) |


## src/sessions/files.ts

[Source and explanation](../../src/sessions/files.ts) · [Implementation](implementation/saved-history.md#mechanisms)

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`nestedPath`](../../src/sessions/files.ts#L6) | Function | | [Feature context](implementation/saved-history.md#mechanisms) |
| [`SessionFileError.constructor`](../../src/sessions/files.ts#L14) | Constructor | | [Feature context](implementation/saved-history.md#mechanisms) |
| [`SessionFiles.constructor`](../../src/sessions/files.ts#L24) | Constructor | | [Feature context](implementation/saved-history.md#mechanisms) |
| [`SessionFiles.resolve`](../../src/sessions/files.ts#L28) | Method | | [Feature context](implementation/saved-history.md#mechanisms) |


## src/sessions/history.ts

Feature context: [Read saved history](implementation/saved-history.md)

[Open source](../../src/sessions/history.ts) · 528 lines

Local dependencies: [runtime/message-identity.ts](../../src/runtime/message-identity.ts), [runtime/pi-history.ts](../../src/runtime/pi-history.ts), [runtime/pi-process.ts](../../src/runtime/pi-process.ts), [runtime/pi-rpc.ts](../../src/runtime/pi-rpc.ts), [shared/history.ts](../../src/shared/history.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`ENTRY_BYTES`](../../src/sessions/history.ts#L13) | Module value | Inferred from initializer | [Feature context](implementation/saved-history.md#behavior) |
| [`PAGE_BYTES`](../../src/sessions/history.ts#L14) | Module value | Inferred from initializer | [Feature context](implementation/saved-history.md#behavior) |
| [`MAX_CONTEXT_JSON_BYTES`](../../src/sessions/history.ts#L15) | Module value | Inferred from initializer | [Feature context](implementation/saved-history.md#behavior) |
| [`MAX_CONTEXT_SOURCE_BYTES`](../../src/sessions/history.ts#L16) | Module value | Inferred from initializer | [Feature context](implementation/saved-history.md#behavior) |
| [`MAX_CONTEXT_SOURCES`](../../src/sessions/history.ts#L17) | Module value | Inferred from initializer | [Feature context](implementation/saved-history.md#behavior) |
| [`MAX_IMAGE_BYTES`](../../src/sessions/history.ts#L18) | Module value | Inferred from initializer | [Feature context](implementation/saved-history.md#behavior) |
| [`MAX_IMAGE_BASE64_CHARS`](../../src/sessions/history.ts#L19) | Module value | Inferred from initializer | [Feature context](implementation/saved-history.md#behavior) |
| [`IMAGE_TYPES`](../../src/sessions/history.ts#L20) | Module value | Inferred from initializer | [Feature context](implementation/saved-history.md#behavior) |
| [`ContextProjection`](../../src/sessions/history.ts#L22) | Interface |  | [Feature context](implementation/saved-history.md#behavior) |
| [`string`](../../src/sessions/history.ts#L27) | Function | value | [Feature context](implementation/saved-history.md#mechanisms) |
| [`block`](../../src/sessions/history.ts#L30) | Function | type, text | [Feature context](implementation/saved-history.md#mechanisms) |
| [`sections`](../../src/sessions/history.ts#L34) | Function | value | [Feature context](implementation/saved-history.md#mechanisms) |
| [`prefixUtf8`](../../src/sessions/history.ts#L38) | Function | value, limit | [Feature context](implementation/saved-history.md#mechanisms) |
| [`contextSection`](../../src/sessions/history.ts#L50) | Function | value | [Feature context](implementation/saved-history.md#mechanisms) |
| [`activeContextSources`](../../src/sessions/history.ts#L99) | Function | entries | [Feature context](implementation/saved-history.md#mechanisms) |
| [`imageMimeType`](../../src/sessions/history.ts#L122) | Function | value | [Feature context](implementation/saved-history.md#mechanisms) |
| [`savedImage`](../../src/sessions/history.ts#L126) | Function | value | [Feature context](implementation/saved-history.md#mechanisms) |
| [`toolInput`](../../src/sessions/history.ts#L139) | Function | value | [Feature context](implementation/saved-history.md#mechanisms) |
| [`project`](../../src/sessions/history.ts#L155) | Function | entry | [Feature context](implementation/saved-history.md#mechanisms) |
| [`Cursor`](../../src/sessions/history.ts#L322) | Interface |  | [Feature context](implementation/saved-history.md#behavior) |
| [`HistorySlice`](../../src/sessions/history.ts#L326) | Interface |  | [Feature context](implementation/saved-history.md#behavior) |
| [`HistoryPages`](../../src/sessions/history.ts#L336) | Class |  | [Feature context](implementation/saved-history.md#behavior) |
| [`HistoryPages.#keys`](../../src/sessions/history.ts#L337) | Property | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`HistoryPages.#cursor`](../../src/sessions/history.ts#L352) | Method | value, sessionId | [Feature context](implementation/saved-history.md#mechanisms) |
| [`HistoryPages.#encode`](../../src/sessions/history.ts#L388) | Method | cursor | [Feature context](implementation/saved-history.md#mechanisms) |
| [`HistoryPages.read`](../../src/sessions/history.ts#L395) | Method | options | [Feature context](implementation/saved-history.md#mechanisms) |
| [`HistoryPages.image`](../../src/sessions/history.ts#L484) | Method | options | [Feature context](implementation/saved-history.md#mechanisms) |
| [`project.metadata`](../../src/sessions/history.ts#L172) | Nested function | value | [Feature context](implementation/saved-history.md#mechanisms) |
| [`HistoryPages.invalidateSession`](../../src/sessions/history.ts#L339) | Method | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`HistoryPages.#key`](../../src/sessions/history.ts#L343) | Method | | [Feature context](implementation/history-retirement.md#mechanisms) |


## src/sessions/service.ts

Feature context: [Create and return to a conversation](implementation/session-lifecycle.md)

[Open source](../../src/sessions/service.ts) · 2470 lines

Local dependencies: [local/files.ts](../../src/local/files.ts), [local/paths.ts](../../src/local/paths.ts), [runtime/message-identity.ts](../../src/runtime/message-identity.ts), [runtime/pi-history.ts](../../src/runtime/pi-history.ts), [runtime/pi-process.ts](../../src/runtime/pi-process.ts), [runtime/pi-rpc.ts](../../src/runtime/pi-rpc.ts), [server/session-discovery.ts](../../src/server/session-discovery.ts), [shared/discovery.ts](../../src/shared/discovery.ts), [shared/events.ts](../../src/shared/events.ts), [shared/history.ts](../../src/shared/history.ts), [shared/images.ts](../../src/shared/images.ts), [shared/sessions.ts](../../src/shared/sessions.ts), [shared/thinking.ts](../../src/shared/thinking.ts), [shared/turns.ts](../../src/shared/turns.ts), [storage/catalog.ts](../../src/storage/catalog.ts), [sessions/events.ts](../../src/sessions/events.ts), [sessions/history.ts](../../src/sessions/history.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`SessionError`](../../src/sessions/service.ts#L67) | Class |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionError.status`](../../src/sessions/service.ts#L68) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionError.code`](../../src/sessions/service.ts#L69) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionError.constructor`](../../src/sessions/service.ts#L70) | Constructor | status, code, message | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`SessionServiceOptions`](../../src/sessions/service.ts#L77) | Interface |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`HISTORY_UNAVAILABLE`](../../src/sessions/service.ts#L94) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`MAX_OPEN_SESSIONS`](../../src/sessions/service.ts#L95) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`turnPayloadIdentity`](../../src/sessions/service.ts#L97) | Function | message, images | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`validateStored`](../../src/sessions/service.ts#L109) | Function | stored | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`ActiveTurn`](../../src/sessions/service.ts#L125) | Interface |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`HistoryIdentity`](../../src/sessions/service.ts#L141) | Interface |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`NativeExecutionRecord`](../../src/sessions/service.ts#L146) | Interface |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`NativeStateRefreshRequest`](../../src/sessions/service.ts#L157) | Interface |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`NativeStateRefresh`](../../src/sessions/service.ts#L162) | Interface |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`isMessageAfterBaseline`](../../src/sessions/service.ts#L167) | Function | key, baseline | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`messageKeysAfterBaseline`](../../src/sessions/service.ts#L179) | Function | entries, baseline | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`messageKeyDelta`](../../src/sessions/service.ts#L189) | Function | baseline, finalCounts | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`turnView`](../../src/sessions/service.ts#L203) | Function | turn | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`active`](../../src/sessions/service.ts#L208) | Function | turn | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`truncateUtf8`](../../src/sessions/service.ts#L212) | Function | value, maxBytes | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`SessionService`](../../src/sessions/service.ts#L225) | Class |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#catalog`](../../src/sessions/service.ts#L226) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#dataDir`](../../src/sessions/service.ts#L228) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#env`](../../src/sessions/service.ts#L229) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#extensions`](../../src/sessions/service.ts#L230) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#now`](../../src/sessions/service.ts#L231) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#runtimes`](../../src/sessions/service.ts#L232) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#runtimeObservers`](../../src/sessions/service.ts#L233) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#historyIdentity`](../../src/sessions/service.ts#L234) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#nativeExecutions`](../../src/sessions/service.ts#L235) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#nativeStateRefreshes`](../../src/sessions/service.ts#L236) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#turns`](../../src/sessions/service.ts#L237) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#storageFaults`](../../src/sessions/service.ts#L238) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#events`](../../src/sessions/service.ts#L239) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#historyPages`](../../src/sessions/service.ts#L240) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#reads`](../../src/sessions/service.ts#L244) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#nativeRefreshes`](../../src/sessions/service.ts#L245) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#shutdownController`](../../src/sessions/service.ts#L246) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#modelDiscovery`](../../src/sessions/service.ts#L247) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#modelCapabilityDiscoveries`](../../src/sessions/service.ts#L248) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#sessionModelReads`](../../src/sessions/service.ts#L249) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#checkpoint`](../../src/sessions/service.ts#L250) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#queue`](../../src/sessions/service.ts#L252) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#stopping`](../../src/sessions/service.ts#L253) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.#shutdown`](../../src/sessions/service.ts#L254) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionService.constructor`](../../src/sessions/service.ts#L257) | Constructor | catalog, dataDir, options | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`SessionService.create`](../../src/sessions/service.ts#L270) | Method | options | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`SessionService.runtimeCount`](../../src/sessions/service.ts#L293) | GetAccessor |  | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`SessionService.configure`](../../src/sessions/service.ts#L297) | Method | configuration | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`SessionService.listSessions`](../../src/sessions/service.ts#L320) | Method |  | [Feature context](implementation/models.md#mechanisms) |
| [`SessionService.getSession`](../../src/sessions/service.ts#L325) | Method | id | [Feature context](implementation/models.md#mechanisms) |
| [`SessionService.listDirectories`](../../src/sessions/service.ts#L401) | Method | path | [Feature context](implementation/models.md#mechanisms) |
| [`SessionService.listAvailableModels`](../../src/sessions/service.ts#L424) | Method |  | [Feature context](implementation/models.md#mechanisms) |
| [`SessionService.listSessionModels`](../../src/sessions/service.ts#L449) | Method | id | [Feature context](implementation/models.md#mechanisms) |
| [`SessionService.getSessionModelCapabilities`](../../src/sessions/service.ts#L492) | Method | id, request | [Feature context](implementation/models.md#mechanisms) |
| [`SessionService.getModelCapabilities`](../../src/sessions/service.ts#L512) | Method | request | [Feature context](implementation/models.md#mechanisms) |
| [`SessionService.subscribeEvents`](../../src/sessions/service.ts#L551) | Method | id, cursor, listener | [Feature context](implementation/models.md#mechanisms) |
| [`SessionService.#publishState`](../../src/sessions/service.ts#L582) | Method | id, withTurn | [Feature context](implementation/models.md#mechanisms) |
| [`SessionService.#storageFault`](../../src/sessions/service.ts#L605) | Method | id | [Feature context](implementation/models.md#mechanisms) |
| [`SessionService.createSession`](../../src/sessions/service.ts#L622) | Method | request | [Feature context](implementation/session-lifecycle.md#execution) |
| [`SessionService.setSessionModel`](../../src/sessions/service.ts#L706) | Method | id, request | [Feature context](implementation/session-lifecycle.md#execution) |
| [`SessionService.openSession`](../../src/sessions/service.ts#L813) | Method | id | [Feature context](implementation/session-lifecycle.md#execution) |
| [`SessionService.closeSession`](../../src/sessions/service.ts#L817) | Method | id | [Feature context](implementation/session-lifecycle.md#execution) |
| [`SessionService.getContext`](../../src/sessions/service.ts#L859) | Method | id | [Feature context](implementation/session-lifecycle.md#execution) |
| [`SessionService.getHistory`](../../src/sessions/service.ts#L871) | Method | id, cursor | [Feature context](implementation/saved-history.md#mechanisms) |
| [`SessionService.getHistoryImage`](../../src/sessions/service.ts#L989) | Method | id, entryId, imageIndex | [Feature context](implementation/saved-history.md#mechanisms) |
| [`SessionService.submitTurn`](../../src/sessions/service.ts#L1017) | Method | id, request | [Feature context](implementation/send-message.md#ownership) |
| [`SessionService.getTurn`](../../src/sessions/service.ts#L1093) | Method | id, runId | [Feature context](implementation/send-message.md#ownership) |
| [`SessionService.getTurnResult`](../../src/sessions/service.ts#L1099) | Method | id, runId | [Feature context](implementation/saved-history.md#mechanisms) |
| [`SessionService.abortTurn`](../../src/sessions/service.ts#L1151) | Method | id, runId | [Feature context](implementation/stop-work.md#mechanisms) |
| [`SessionService.abortNativeExecution`](../../src/sessions/service.ts#L1186) | Method | id, executionId | [Feature context](implementation/stop-work.md#mechanisms) |
| [`SessionService.#storedTurn`](../../src/sessions/service.ts#L1230) | Method | id, runId | [Feature context](implementation/session-lifecycle.md#execution) |
| [`SessionService.#checkStorage`](../../src/sessions/service.ts#L1238) | Method | id | [Feature context](implementation/stop-work.md#mechanisms) |
| [`SessionService.#writeTurn`](../../src/sessions/service.ts#L1247) | Method | turn | [Feature context](implementation/stop-work.md#mechanisms) |
| [`SessionService.#abortRuntime`](../../src/sessions/service.ts#L1286) | Method | slot | [Feature context](implementation/stop-work.md#mechanisms) |
| [`SessionService.#executeTurn`](../../src/sessions/service.ts#L1301) | Method | slot, message, images | [Feature context](implementation/send-message.md#ownership) |
| [`SessionService.#completeHandledTurn`](../../src/sessions/service.ts#L1494) | Method | sessionId, runId, runtime, before, historyWasExpected | [Feature context](implementation/send-message.md#ownership) |
| [`SessionService.shutdown`](../../src/sessions/service.ts#L1557) | Method |  | [Feature context](implementation/stop-work.md#mechanisms) |
| [`SessionService.#configuration`](../../src/sessions/service.ts#L1630) | Method |  | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`SessionService.#admit`](../../src/sessions/service.ts#L1641) | Method |  | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`SessionService.#mutate`](../../src/sessions/service.ts#L1646) | Method | operation | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`SessionService.#read`](../../src/sessions/service.ts#L1660) | Method | operation | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`SessionService.#stored`](../../src/sessions/service.ts#L1690) | Method | id | [Feature context](implementation/session-lifecycle.md#execution) |
| [`SessionService.#view`](../../src/sessions/service.ts#L1698) | Method | stored | [Feature context](implementation/session-lifecycle.md#execution) |
| [`SessionService.#directory`](../../src/sessions/service.ts#L1748) | Method | path | [Feature context](implementation/session-lifecycle.md#execution) |
| [`SessionService.#prune`](../../src/sessions/service.ts#L1764) | Method |  | [Feature context](implementation/session-lifecycle.md#execution) |
| [`SessionService.#checkHistory`](../../src/sessions/service.ts#L1775) | Method | stored | [Feature context](implementation/saved-history.md#mechanisms) |
| [`SessionService.#savedHistory`](../../src/sessions/service.ts#L2033) | Method | stored, options | [Feature context](implementation/saved-history.md#mechanisms) |
| [`SessionService.#identityForEntries`](../../src/sessions/service.ts#L2051) | Method | entries | [Feature context](implementation/saved-history.md#mechanisms) |
| [`SessionService.#identityForHistory`](../../src/sessions/service.ts#L2056) | Method | history | [Feature context](implementation/saved-history.md#mechanisms) |
| [`SessionService.#observeRuntime`](../../src/sessions/service.ts#L2062) | Method | sessionId, runtime | [Feature context](implementation/stop-work.md#mechanisms) |
| [`SessionService.#nativeExecutionEvent`](../../src/sessions/service.ts#L2096) | Method | sessionId, event, startedLate | [Feature context](implementation/stop-work.md#mechanisms) |
| [`SessionService.#refreshNativeHistory`](../../src/sessions/service.ts#L2182) | Method | sessionId, executionId | [Feature context](implementation/stop-work.md#mechanisms) |
| [`SessionService.#scheduleNativeStateRefresh`](../../src/sessions/service.ts#L2213) | Method | sessionId, executionId, runtime | [Feature context](implementation/stop-work.md#mechanisms) |
| [`SessionService.#refreshNativeSessionState`](../../src/sessions/service.ts#L2243) | Method | sessionId, executionId, runtime | [Feature context](implementation/stop-work.md#mechanisms) |
| [`SessionService.#open`](../../src/sessions/service.ts#L2294) | Method | stored, options | [Feature context](implementation/session-lifecycle.md#execution) |
| [`SessionService.#rememberHistory`](../../src/sessions/service.ts#L2445) | Method | stored, runtime | [Feature context](implementation/session-lifecycle.md#execution) |
| [`SessionService.#recordHistoryCheck`](../../src/sessions/service.ts#L1894) | Method | | [Feature context](implementation/saved-history.md#mechanisms) |
| [`SessionService.#historyCheckState`](../../src/sessions/service.ts#L2022) | Method | | [Feature context](implementation/saved-history.md#mechanisms) |
| [`SessionService.renameSession`](../../src/sessions/service.ts#L330) | Method |  | [Feature context](implementation/session-names.md#mechanisms) |
| [`SessionService.listLibraryReferences`](../../src/sessions/service.ts#L371) | Method | | [Feature context](implementation/library.md#mechanisms) |
| [`SessionService.addLibraryReference`](../../src/sessions/service.ts#L377) | Method | | [Feature context](implementation/library.md#mechanisms) |
| [`SessionService.removeLibraryReference`](../../src/sessions/service.ts#L392) | Method | | [Feature context](implementation/library.md#mechanisms) |
| [`SessionService.#recordMissingHistory`](../../src/sessions/service.ts#L1929) | Method | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionService.#retiredHistoryError`](../../src/sessions/service.ts#L2010) | Method | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionService.#invalidateRetiredHistory`](../../src/sessions/service.ts#L2014) | Method | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionService.#staleMissingHistory`](../../src/sessions/service.ts#L1990) | Method | | [Feature context](implementation/history-retirement.md#mechanisms) |


## src/shared/discovery.ts

Feature context: [Send a message](implementation/send-message.md)

[Open source](../../src/shared/discovery.ts) · 106 lines

Local dependencies: [shared/sessions.ts](../../src/shared/sessions.ts), [shared/thinking.ts](../../src/shared/thinking.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`HostDirectoryEntry`](../../src/shared/discovery.ts#L4) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`HostDirectoryListing`](../../src/shared/discovery.ts#L9) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`PiModelOption`](../../src/shared/discovery.ts#L16) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`AvailableModelsResponse`](../../src/shared/discovery.ts#L22) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`PiSessionModelOption`](../../src/shared/discovery.ts#L26) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`SessionModelsResponse`](../../src/shared/discovery.ts#L31) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`isSessionModelsResponse`](../../src/shared/discovery.ts#L36) | Function | value | [Feature context](implementation/models.md#mechanisms) |
| [`isObject`](../../src/shared/discovery.ts#L57) | Function | value | [Feature context](implementation/models.md#mechanisms) |
| [`isAbsolutePath`](../../src/shared/discovery.ts#L61) | Function | value | [Feature context](implementation/models.md#mechanisms) |
| [`isModelOption`](../../src/shared/discovery.ts#L68) | Function | value | [Feature context](implementation/models.md#mechanisms) |
| [`isHostDirectoryListing`](../../src/shared/discovery.ts#L81) | Function | value | [Feature context](implementation/models.md#mechanisms) |
| [`isAvailableModelsResponse`](../../src/shared/discovery.ts#L102) | Function | value | [Feature context](implementation/models.md#mechanisms) |


## src/shared/events.ts

Feature context: [Send a message](implementation/send-message.md)

[Open source](../../src/shared/events.ts) · 527 lines

Local dependencies: [shared/sessions.ts](../../src/shared/sessions.ts), [shared/turns.ts](../../src/shared/turns.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`STREAM_EVENT_MAX_BYTES`](../../src/shared/events.ts#L4) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`STREAM_SNAPSHOT_MAX_BYTES`](../../src/shared/events.ts#L5) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`TurnProjection`](../../src/shared/events.ts#L7) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`LiveMessageTextRange`](../../src/shared/events.ts#L20) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`LiveMessageBlock`](../../src/shared/events.ts#L26) | TypeAlias |  | [Feature context](implementation/send-message.md#behavior) |
| [`LiveMessageBlockDelta`](../../src/shared/events.ts#L42) | TypeAlias |  | [Feature context](implementation/send-message.md#behavior) |
| [`LiveMessage`](../../src/shared/events.ts#L46) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`LiveMessageDelta`](../../src/shared/events.ts#L56) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`LiveTool`](../../src/shared/events.ts#L63) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`LiveProjection`](../../src/shared/events.ts#L75) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`SessionSnapshot`](../../src/shared/events.ts#L81) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`StreamEventBase`](../../src/shared/events.ts#L89) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`ProjectionLimitScope`](../../src/shared/events.ts#L95) | TypeAlias |  | [Feature context](implementation/send-message.md#behavior) |
| [`StreamFrame`](../../src/shared/events.ts#L103) | TypeAlias |  | [Feature context](implementation/send-message.md#behavior) |
| [`UUID`](../../src/shared/events.ts#L137) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`CURSOR`](../../src/shared/events.ts#L138) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`SESSION_KEYS`](../../src/shared/events.ts#L139) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`TURN_PROJECTION_KEYS`](../../src/shared/events.ts#L157) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`SNAPSHOT_KEYS`](../../src/shared/events.ts#L169) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`LIVE_KEYS`](../../src/shared/events.ts#L170) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`MESSAGE_KEYS`](../../src/shared/events.ts#L171) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`MESSAGE_DELTA_KEYS`](../../src/shared/events.ts#L172) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`TOOL_KEYS`](../../src/shared/events.ts#L173) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`MAX_LIVE_MESSAGE_BLOCKS`](../../src/shared/events.ts#L174) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`MAX_LIVE_TEXT_RANGES`](../../src/shared/events.ts#L175) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`isRecord`](../../src/shared/events.ts#L177) | Function | value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`hasExactKeys`](../../src/shared/events.ts#L181) | Function | value, expected | [Feature context](implementation/reconnect.md#mechanisms) |
| [`isBoundedString`](../../src/shared/events.ts#L186) | Function | value, maxBytes | [Feature context](implementation/reconnect.md#mechanisms) |
| [`isCursorFor`](../../src/shared/events.ts#L190) | Function | value, sessionId | [Feature context](implementation/reconnect.md#mechanisms) |
| [`isSession`](../../src/shared/events.ts#L201) | Function | value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`isTurnProjection`](../../src/shared/events.ts#L213) | Function | value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`isLiveMessage`](../../src/shared/events.ts#L254) | Function | value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`isLiveMessageDelta`](../../src/shared/events.ts#L334) | Function | value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`isLiveTool`](../../src/shared/events.ts#L366) | Function | value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`isLiveProjection`](../../src/shared/events.ts#L392) | Function | value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`hasBoundedJsonSize`](../../src/shared/events.ts#L406) | Function | value, maxBytes | [Feature context](implementation/reconnect.md#mechanisms) |
| [`isCommonEvent`](../../src/shared/events.ts#L414) | Function | value | [Feature context](implementation/reconnect.md#mechanisms) |
| [`isStreamFrame`](../../src/shared/events.ts#L424) | Function | value | [Feature context](implementation/reconnect.md#mechanisms) |


## src/shared/history.ts

Feature context: [Send a message](implementation/send-message.md)

[Open source](../../src/shared/history.ts) · 229 lines

Local dependencies: [shared/sessions.ts](../../src/shared/sessions.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`HistoryBlock`](../../src/shared/history.ts#L3) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`ContextSource`](../../src/shared/history.ts#L12) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`HistoryEntry`](../../src/shared/history.ts#L19) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`HistoryPage`](../../src/shared/history.ts#L43) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`IMAGE_MIME_TYPES`](../../src/shared/history.ts#L64) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`record`](../../src/shared/history.ts#L66) | Function | value | [Feature context](implementation/saved-history.md#mechanisms) |
| [`text`](../../src/shared/history.ts#L69) | Function | value, limit | [Feature context](implementation/saved-history.md#mechanisms) |
| [`optionalText`](../../src/shared/history.ts#L72) | Function | value | [Feature context](implementation/saved-history.md#mechanisms) |
| [`optionalUuid`](../../src/shared/history.ts#L75) | Function | value | [Feature context](implementation/saved-history.md#mechanisms) |
| [`exact`](../../src/shared/history.ts#L78) | Function | value, keys | [Feature context](implementation/saved-history.md#mechanisms) |
| [`block`](../../src/shared/history.ts#L83) | Function | value | [Feature context](implementation/saved-history.md#mechanisms) |
| [`contextSource`](../../src/shared/history.ts#L104) | Function | value | [Feature context](implementation/saved-history.md#mechanisms) |
| [`entry`](../../src/shared/history.ts#L114) | Function | value | [Feature context](implementation/saved-history.md#mechanisms) |
| [`isHistoryPage`](../../src/shared/history.ts#L167) | Function | value | [Feature context](implementation/saved-history.md#mechanisms) |


## src/shared/images.ts

Feature context: [Send a message](implementation/send-message.md)

[Open source](../../src/shared/images.ts) · 98 lines

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`MAX_IMAGE_COUNT`](../../src/shared/images.ts#L3) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`MAX_IMAGE_BYTES`](../../src/shared/images.ts#L4) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`MAX_IMAGE_TOTAL_BYTES`](../../src/shared/images.ts#L5) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`MIME_TYPES`](../../src/shared/images.ts#L7) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`BASE64`](../../src/shared/images.ts#L8) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`ImageContent`](../../src/shared/images.ts#L11) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`object`](../../src/shared/images.ts#L17) | Function | value | [Feature context](implementation/compose-message.md#mechanisms) |
| [`base64ByteLength`](../../src/shared/images.ts#L21) | Function | value | [Feature context](implementation/compose-message.md#mechanisms) |
| [`decoded`](../../src/shared/images.ts#L34) | Function | value | [Feature context](implementation/compose-message.md#mechanisms) |
| [`signature`](../../src/shared/images.ts#L47) | Function | bytes, mimeType | [Feature context](implementation/compose-message.md#mechanisms) |
| [`isImageContent`](../../src/shared/images.ts#L64) | Function | value | [Feature context](implementation/compose-message.md#mechanisms) |
| [`imageByteLength`](../../src/shared/images.ts#L81) | Function | value | [Feature context](implementation/compose-message.md#mechanisms) |
| [`isImageContentArray`](../../src/shared/images.ts#L86) | Function | value | [Feature context](implementation/compose-message.md#mechanisms) |


## src/shared/protocol.ts

Feature context: [Send a message](implementation/send-message.md)

[Open source](../../src/shared/protocol.ts) · 48 lines

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`DEFAULT_PORT`](../../src/shared/protocol.ts#L1) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`HostStatus`](../../src/shared/protocol.ts#L3) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`isHostStatus`](../../src/shared/protocol.ts#L14) | Function | value | [Feature context](implementation/host-service.md#mechanisms) |


## src/shared/sessions.ts

Feature context: [Send a message](implementation/send-message.md)

[Open source](../../src/shared/sessions.ts) · 234 lines

Local dependencies: [shared/thinking.ts](../../src/shared/thinking.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`SESSION_ID`](../../src/shared/sessions.ts#L3) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`RuntimeConfiguration`](../../src/shared/sessions.ts#L5) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`SessionCreateRequest`](../../src/shared/sessions.ts#L10) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`SessionModelRequest`](../../src/shared/sessions.ts#L17) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`NativeExecutionInfo`](../../src/shared/sessions.ts#L30) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`SessionInfo`](../../src/shared/sessions.ts#L44) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`isRuntimeConfiguration`](../../src/shared/sessions.ts#L77) | Function | value | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`isSessionInfo`](../../src/shared/sessions.ts#L89) | Function | value | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`isNativeExecutionInfo`](../../src/shared/sessions.ts#L196) | Function | value | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`isSessionModelRequest`](../../src/shared/sessions.ts#L214) | Function | value | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`isHistoryCheck`](../../src/shared/sessions.ts#L181) | Function | | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`isSessionDisplayName`](../../src/shared/sessions.ts#L149) | Function |  | [Feature context](implementation/session-names.md#mechanisms) |
| [`isSessionNameRequest`](../../src/shared/sessions.ts#L160) | Function |  | [Feature context](implementation/session-names.md#mechanisms) |
| [`mergeSessionMetadata`](../../src/shared/sessions.ts#L67) | Function |  | [Feature context](implementation/session-names.md#mechanisms) |

## src/shared/thinking.ts

Feature context: [Send a message](implementation/send-message.md)

[Open source](../../src/shared/thinking.ts) · 66 lines

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`THINKING_LEVELS`](../../src/shared/thinking.ts#L1) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`ThinkingLevel`](../../src/shared/thinking.ts#L3) | TypeAlias |  | [Feature context](implementation/send-message.md#behavior) |
| [`ModelCapabilitiesRequest`](../../src/shared/thinking.ts#L5) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`ModelCapabilitiesResponse`](../../src/shared/thinking.ts#L10) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`isObject`](../../src/shared/thinking.ts#L15) | Function | value | [Feature context](implementation/models.md#mechanisms) |
| [`isThinkingLevel`](../../src/shared/thinking.ts#L19) | Function | value | [Feature context](implementation/models.md#mechanisms) |
| [`isModelCapabilitiesRequest`](../../src/shared/thinking.ts#L23) | Function | value | [Feature context](implementation/models.md#mechanisms) |
| [`isModelCapabilitiesResponse`](../../src/shared/thinking.ts#L38) | Function | value | [Feature context](implementation/models.md#mechanisms) |


## src/shared/turns.ts

Feature context: [Send a message](implementation/send-message.md)

[Open source](../../src/shared/turns.ts) · 149 lines

Local dependencies: [shared/images.ts](../../src/shared/images.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`TurnStatus`](../../src/shared/turns.ts#L3) | TypeAlias |  | [Feature context](implementation/send-message.md#behavior) |
| [`TurnError`](../../src/shared/turns.ts#L12) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`TurnCreateRequest`](../../src/shared/turns.ts#L17) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`TurnInfo`](../../src/shared/turns.ts#L23) | Interface |  | [Feature context](implementation/send-message.md#behavior) |
| [`UUID`](../../src/shared/turns.ts#L35) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`TURN_STATUSES`](../../src/shared/turns.ts#L36) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`TURN_INFO_KEYS`](../../src/shared/turns.ts#L45) | Module value | Inferred from initializer | [Feature context](implementation/send-message.md#behavior) |
| [`hasExactKeys`](../../src/shared/turns.ts#L57) | Function | value, expected | [Feature context](implementation/send-message.md#mechanisms) |
| [`isUuid`](../../src/shared/turns.ts#L62) | Function | value | [Feature context](implementation/send-message.md#mechanisms) |
| [`isTimestamp`](../../src/shared/turns.ts#L66) | Function | value | [Feature context](implementation/send-message.md#mechanisms) |
| [`isTurnError`](../../src/shared/turns.ts#L70) | Function | value | [Feature context](implementation/send-message.md#mechanisms) |
| [`isTurnCreateRequest`](../../src/shared/turns.ts#L85) | Function | value | [Feature context](implementation/send-message.md#mechanisms) |
| [`isTurnInfo`](../../src/shared/turns.ts#L114) | Function | value | [Feature context](implementation/send-message.md#mechanisms) |


## src/storage/catalog.ts

Feature context: [Create and return to a conversation](implementation/session-lifecycle.md)

[Open source](../../src/storage/catalog.ts) · 1238 lines

Local dependencies: [local/files.ts](../../src/local/files.ts), [local/paths.ts](../../src/local/paths.ts), [shared/thinking.ts](../../src/shared/thinking.ts), [shared/sessions.ts](../../src/shared/sessions.ts), [shared/turns.ts](../../src/shared/turns.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`StoredSession`](../../src/storage/catalog.ts#L19) | Interface |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`StoredTurn`](../../src/storage/catalog.ts#L44) | Interface |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SCHEMA_VERSION`](../../src/storage/catalog.ts#L46) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`V1_SCHEMA_VERSION`](../../src/storage/catalog.ts#L49) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`V2_SCHEMA_VERSION`](../../src/storage/catalog.ts#L50) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`V3_SCHEMA_VERSION`](../../src/storage/catalog.ts#L51) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`DATABASE_NAME`](../../src/storage/catalog.ts#L56) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SESSION_COLUMNS`](../../src/storage/catalog.ts#L57) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`V3_SESSION_COLUMNS`](../../src/storage/catalog.ts#L72) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`CONFIGURATION_SCHEMA`](../../src/storage/catalog.ts#L77) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`V2_SESSIONS_SCHEMA`](../../src/storage/catalog.ts#L79) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`V3_SESSIONS_SCHEMA`](../../src/storage/catalog.ts#L81) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SESSIONS_SCHEMA`](../../src/storage/catalog.ts#L89) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`TURNS_SCHEMA`](../../src/storage/catalog.ts#L91) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`ACTIVE_TURN_INDEX`](../../src/storage/catalog.ts#L93) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`TURN_COLUMNS`](../../src/storage/catalog.ts#L95) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SESSION_STATUSES`](../../src/storage/catalog.ts#L104) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`TURN_STATUSES`](../../src/storage/catalog.ts#L105) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`TERMINAL_TURN_STATUSES`](../../src/storage/catalog.ts#L114) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`ALLOWED_TURN_TRANSITIONS`](../../src/storage/catalog.ts#L120) | Module value | `Readonly<Record<TurnStatus, ReadonlySet<TurnStatus>>>` | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`PAYLOAD_IDENTITY`](../../src/storage/catalog.ts#L129) | Module value | Inferred from initializer | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`isSessionStatus`](../../src/storage/catalog.ts#L131) | Function | value | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`isTurnStatus`](../../src/storage/catalog.ts#L135) | Function | value | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`invalidCatalog`](../../src/storage/catalog.ts#L139) | Function | reason | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`isNonEmptyString`](../../src/storage/catalog.ts#L145) | Function | value | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`isNullableNonEmptyString`](../../src/storage/catalog.ts#L149) | Function | value | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`isSafeIntegerValue`](../../src/storage/catalog.ts#L153) | Function | value | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`isStoredSession`](../../src/storage/catalog.ts#L180) | Function | value | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`hasExactKeys`](../../src/storage/catalog.ts#L247) | Function | value, expected | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`isStoredTurn`](../../src/storage/catalog.ts#L252) | Function | value | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`assertRuntimeConfiguration`](../../src/storage/catalog.ts#L300) | Function | value | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`integerFromDatabase`](../../src/storage/catalog.ts#L324) | Function | row, column | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`stringFromDatabase`](../../src/storage/catalog.ts#L338) | Function | row, column | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`nullableStringFromDatabase`](../../src/storage/catalog.ts#L378) | Function | row, column | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`nullableThinkingLevelFromDatabase`](../../src/storage/catalog.ts#L390) | Function | row | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`sessionFromDatabase`](../../src/storage/catalog.ts#L411) | Function | row | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`entryIdsFromDatabase`](../../src/storage/catalog.ts#L442) | Function | row | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`nullableErrorFromDatabase`](../../src/storage/catalog.ts#L462) | Function | row | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`turnFromDatabase`](../../src/storage/catalog.ts#L477) | Function | row | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`databaseRows`](../../src/storage/catalog.ts#L501) | Function | database, sql | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`hasUserSchema`](../../src/storage/catalog.ts#L505) | Function | database | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`verifySchema`](../../src/storage/catalog.ts#L514) | Function | database, version | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`migrateV2ToV3`](../../src/storage/catalog.ts#L570) | Function | database | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`migrateV3ToV4`](../../src/storage/catalog.ts#L586) | Function | database | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`initializeSchema`](../../src/storage/catalog.ts#L659) | Function | database | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`validateDatabaseFile`](../../src/storage/catalog.ts#L741) | Function | path | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`validateRecord`](../../src/storage/catalog.ts#L765) | Function | value | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`validateTurnRecord`](../../src/storage/catalog.ts#L769) | Function | value | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`SessionCatalog`](../../src/storage/catalog.ts#L773) | Class |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionCatalog.database`](../../src/storage/catalog.ts#L774) | Property |  | [Feature context](implementation/session-lifecycle.md#behavior) |
| [`SessionCatalog.constructor`](../../src/storage/catalog.ts#L776) | Constructor | database | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`SessionCatalog.open`](../../src/storage/catalog.ts#L780) | Method | dataDir | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`SessionCatalog.configuration`](../../src/storage/catalog.ts#L819) | Method |  | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`SessionCatalog.configure`](../../src/storage/catalog.ts#L829) | Method | config | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`SessionCatalog.list`](../../src/storage/catalog.ts#L893) | Method |  | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`SessionCatalog.get`](../../src/storage/catalog.ts#L900) | Method | id | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`SessionCatalog.findRequest`](../../src/storage/catalog.ts#L907) | Method | requestId | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`SessionCatalog.insert`](../../src/storage/catalog.ts#L914) | Method | record | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`SessionCatalog.update`](../../src/storage/catalog.ts#L990) | Method | record | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`SessionCatalog.interruptCreating`](../../src/storage/catalog.ts#L1085) | Method | now | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`SessionCatalog.insertTurn`](../../src/storage/catalog.ts#L1095) | Method | record | [Feature context](implementation/send-message.md#mechanisms) |
| [`SessionCatalog.updateTurn`](../../src/storage/catalog.ts#L1114) | Method | record | [Feature context](implementation/send-message.md#mechanisms) |
| [`SessionCatalog.getTurn`](../../src/storage/catalog.ts#L1152) | Method | sessionId, runId | [Feature context](implementation/send-message.md#mechanisms) |
| [`SessionCatalog.findTurnRequest`](../../src/storage/catalog.ts#L1159) | Method | sessionId, requestId | [Feature context](implementation/send-message.md#mechanisms) |
| [`SessionCatalog.latestTurn`](../../src/storage/catalog.ts#L1166) | Method | sessionId | [Feature context](implementation/send-message.md#mechanisms) |
| [`SessionCatalog.activeTurn`](../../src/storage/catalog.ts#L1173) | Method | sessionId | [Feature context](implementation/send-message.md#mechanisms) |
| [`SessionCatalog.listTurns`](../../src/storage/catalog.ts#L1182) | Method |  | [Feature context](implementation/send-message.md#mechanisms) |
| [`SessionCatalog.markTurnDispatching`](../../src/storage/catalog.ts#L1189) | Method | record, session | [Feature context](implementation/send-message.md#mechanisms) |
| [`SessionCatalog.interruptTurns`](../../src/storage/catalog.ts#L1212) | Method | now | [Feature context](implementation/send-message.md#mechanisms) |
| [`SessionCatalog.close`](../../src/storage/catalog.ts#L1235) | Method |  | [Feature context](implementation/send-message.md#mechanisms) |
| [`isHistoryCheckState`](../../src/storage/catalog.ts#L157) | Function | | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`nullableHistoryCheckFromDatabase`](../../src/storage/catalog.ts#L399) | Function | | [Feature context](implementation/session-lifecycle.md#ownership) |
| [`migrateV4ToV5`](../../src/storage/catalog.ts#L602) | Function | | [Feature context](implementation/session-lifecycle.md#mechanisms) |
| [`migrateV5ToV6`](../../src/storage/catalog.ts#L618) | Function |  | [Feature context](implementation/session-names.md#mechanisms) |
| [`SessionCatalog.rename`](../../src/storage/catalog.ts#L942) | Method |  | [Feature context](implementation/session-names.md#mechanisms) |
| [`isCanonicalLibraryRoot`](../../src/storage/catalog.ts#L346) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`libraryBindingFromDatabase`](../../src/storage/catalog.ts#L356) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`libraryReferenceFromDatabase`](../../src/storage/catalog.ts#L368) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`migrateV6ToV7`](../../src/storage/catalog.ts#L629) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`SessionCatalog.bindLibrary`](../../src/storage/catalog.ts#L838) | Method | | [Feature context](implementation/library.md#mechanisms) |
| [`SessionCatalog.listLibraryReferences`](../../src/storage/catalog.ts#L863) | Method | | [Feature context](implementation/library.md#mechanisms) |
| [`SessionCatalog.addLibraryReference`](../../src/storage/catalog.ts#L873) | Method | | [Feature context](implementation/library.md#mechanisms) |
| [`SessionCatalog.removeLibraryReference`](../../src/storage/catalog.ts#L883) | Method | | [Feature context](implementation/library.md#mechanisms) |
| [`SessionCatalog.#validateLibraryRows`](../../src/storage/catalog.ts#L1223) | Method | | [Feature context](implementation/library.md#mechanisms) |
| [`isStoredSourceObservation`](../../src/storage/catalog.ts#L164) | Function | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`migrateV7ToV8`](../../src/storage/catalog.ts#L636) | Function | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionCatalog.sourceObservation`](../../src/storage/catalog.ts#L1019) | Method | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionCatalog.recordHistoryCheck`](../../src/storage/catalog.ts#L1034) | Method | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`StoredSourceObservation`](../../src/storage/catalog.ts#L39) | Interface | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`V7_SESSIONS_SCHEMA`](../../src/storage/catalog.ts#L87) | Module value | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SOURCE_OBSERVATIONS_SCHEMA`](../../src/storage/catalog.ts#L101) | Module value | | [Feature context](implementation/history-retirement.md#mechanisms) |


## src/integrations/configuration.ts

Feature context: [Coordinate history cleanup](implementation/history-retirement.md)

[Open source](../../src/integrations/configuration.ts) · 70 lines

Local dependencies: [src/local/files.ts](../../src/local/files.ts), [src/local/paths.ts](../../src/local/paths.ts), [src/runtime/pi-rpc.ts](../../src/runtime/pi-rpc.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`IntegrationsConfiguration`](../../src/integrations/configuration.ts#L7) | Interface | | [Feature context](implementation/history-retirement.md#ownership) |
| [`absolutePath`](../../src/integrations/configuration.ts#L13) | Function | | [Feature context](implementation/history-retirement.md#ownership) |
| [`readIntegrations`](../../src/integrations/configuration.ts#L17) | Function | | [Feature context](implementation/history-retirement.md#ownership) |

## src/integrations/distill.ts

Feature context: [Coordinate history cleanup](implementation/history-retirement.md)

[Open source](../../src/integrations/distill.ts) · 99 lines

Local dependencies: [src/runtime/pi-rpc.ts](../../src/runtime/pi-rpc.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`DistillModuleConfiguration`](../../src/integrations/distill.ts#L4) | Interface | | [Feature context](implementation/history-retirement.md#ownership) |
| [`DistillSource`](../../src/integrations/distill.ts#L9) | Interface | | [Feature context](implementation/history-retirement.md#ownership) |
| [`DistillChild`](../../src/integrations/distill.ts#L16) | Interface | | [Feature context](implementation/history-retirement.md#ownership) |
| [`DistillUseSource`](../../src/integrations/distill.ts#L21) | Type alias | | [Feature context](implementation/history-retirement.md#ownership) |
| [`DistillUseRecord`](../../src/integrations/distill.ts#L27) | Interface | | [Feature context](implementation/history-retirement.md#ownership) |
| [`DistillRecovery`](../../src/integrations/distill.ts#L39) | Type alias | | [Feature context](implementation/history-retirement.md#ownership) |
| [`DistillDeletionReceipt`](../../src/integrations/distill.ts#L43) | Interface | | [Feature context](implementation/history-retirement.md#ownership) |
| [`DistillRead`](../../src/integrations/distill.ts#L52) | Interface | | [Feature context](implementation/history-retirement.md#ownership) |
| [`DistillUse`](../../src/integrations/distill.ts#L57) | Interface | | [Feature context](implementation/history-retirement.md#ownership) |
| [`DistillStorage`](../../src/integrations/distill.ts#L64) | Interface | | [Feature context](implementation/history-retirement.md#ownership) |
| [`isDistillStorage`](../../src/integrations/distill.ts#L74) | Function | | [Feature context](implementation/history-retirement.md#ownership) |
| [`openDistill`](../../src/integrations/distill.ts#L87) | Function | | [Feature context](implementation/history-retirement.md#ownership) |

## src/sessions/source-access.ts

Feature context: [Coordinate history cleanup](implementation/history-retirement.md)

[Open source](../../src/sessions/source-access.ts) · 282 lines

Local dependencies: [src/integrations/distill.ts](../../src/integrations/distill.ts), [src/storage/catalog.ts](../../src/storage/catalog.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`SourceSession`](../../src/sessions/source-access.ts#L16) | Type alias | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`OpeningSource`](../../src/sessions/source-access.ts#L43) | Interface | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SourceAccessError`](../../src/sessions/source-access.ts#L48) | Class | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SourceAccessError.constructor`](../../src/sessions/source-access.ts#L49) | Constructor | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionSourceAccess`](../../src/sessions/source-access.ts#L58) | Class | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionSourceAccess.#storage`](../../src/sessions/source-access.ts#L59) | Property | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionSourceAccess.#reads`](../../src/sessions/source-access.ts#L60) | Property | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionSourceAccess.#children`](../../src/sessions/source-access.ts#L61) | Property | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionSourceAccess.#releases`](../../src/sessions/source-access.ts#L62) | Property | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionSourceAccess.constructor`](../../src/sessions/source-access.ts#L64) | Constructor | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionSourceAccess.read`](../../src/sessions/source-access.ts#L72) | Method | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionSourceAccess.#releaseRead`](../../src/sessions/source-access.ts#L272) | Method | lease | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionSourceAccess.begin`](../../src/sessions/source-access.ts#L145) | Method | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionSourceAccess.drain`](../../src/sessions/source-access.ts#L191) | Method | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionSourceAccess.#acquireRead`](../../src/sessions/source-access.ts#L217) | Method | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionSourceAccess.#acquireBegin`](../../src/sessions/source-access.ts#L232) | Method | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionSourceAccess.#release`](../../src/sessions/source-access.ts#L247) | Method | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`matchingDeletion`](../../src/sessions/source-access.ts#L29) | Function | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionSourceAccess.missing`](../../src/sessions/source-access.ts#L110) | Method | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SessionSourceAccess.#withReadLease`](../../src/sessions/source-access.ts#L256) | Method | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`SourceReadObservation`](../../src/sessions/source-access.ts#L18) | Interface | | [Feature context](implementation/history-retirement.md#mechanisms) |
| [`MissingSourceObservation`](../../src/sessions/source-access.ts#L24) | Interface | | [Feature context](implementation/history-retirement.md#mechanisms) |


## src/integrations/current.ts

Feature context: [Read external content in Current’s library](implementation/library.md)

[Open source](../../src/integrations/current.ts) · 264 lines

Local dependencies: [local/paths.ts](../../src/local/paths.ts), [shared/library.ts](../../src/shared/library.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`record`](../../src/integrations/current.ts#L52) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`isLibraryModule`](../../src/integrations/current.ts#L56) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`isContentLibrary`](../../src/integrations/current.ts#L66) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`clip`](../../src/integrations/current.ts#L77) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`unavailable`](../../src/integrations/current.ts#L86) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentLibraryError.constructor`](../../src/integrations/current.ts#L93) | Constructor | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentLibrary.constructor`](../../src/integrations/current.ts#L106) | Constructor | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentLibrary.open`](../../src/integrations/current.ts#L112) | Method | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentLibrary.search`](../../src/integrations/current.ts#L141) | Method | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentLibrary.latest`](../../src/integrations/current.ts#L156) | Method | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentLibrary.read`](../../src/integrations/current.ts#L170) | Method | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentLibrary.close`](../../src/integrations/current.ts#L192) | Method | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentLibrary.#call`](../../src/integrations/current.ts#L200) | Method | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentLibrary.#project`](../../src/integrations/current.ts#L210) | Method | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentLibraryConfig`](../../src/integrations/current.ts#L19) | Interface | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentLibraryModule`](../../src/integrations/current.ts#L25) | Interface | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentContentLibrary`](../../src/integrations/current.ts#L31) | Interface | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentContentItem`](../../src/integrations/current.ts#L43) | Interface | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentLibraryBatch`](../../src/integrations/current.ts#L58) | Interface | | [Feature context](implementation/library.md#mechanisms) |
| [`ERROR_MESSAGES`](../../src/integrations/current.ts#L45) | Module value | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentLibraryError`](../../src/integrations/current.ts#L90) | Class | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentLibraryError.code`](../../src/integrations/current.ts#L91) | Property | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentLibrary`](../../src/integrations/current.ts#L101) | Class | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentLibrary.binding`](../../src/integrations/current.ts#L102) | Property | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentLibrary.root`](../../src/integrations/current.ts#L103) | Property | | [Feature context](implementation/library.md#mechanisms) |
| [`CurrentLibrary.#api`](../../src/integrations/current.ts#L104) | Property | | [Feature context](implementation/library.md#mechanisms) |

## src/integrations/memory.ts

Feature context: [Search and read Memory](implementation/memory.md)

[Open source](../../src/integrations/memory.ts) · 127 lines

Local dependencies: [integrations/distill.ts](../../src/integrations/distill.ts), [runtime/pi-rpc.ts](../../src/runtime/pi-rpc.ts), [shared/memory.ts](../../src/shared/memory.ts).

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`DistillMemoryReaderV1`](../../src/integrations/memory.ts#L15) | Interface |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryReaderError`](../../src/integrations/memory.ts#L22) | Class |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryReaderError.code`](../../src/integrations/memory.ts#L23) | Property |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryReaderError.constructor`](../../src/integrations/memory.ts#L25) | Constructor | code | [Feature context](implementation/memory.md#mechanisms) |
| [`memoryErrorMessage`](../../src/integrations/memory.ts#L32) | Function | code | [Feature context](implementation/memory.md#mechanisms) |
| [`isDistillMemoryReaderV1`](../../src/integrations/memory.ts#L47) | Function | value | [Feature context](implementation/memory.md#mechanisms) |
| [`closeUnknownReader`](../../src/integrations/memory.ts#L57) | Function | value | [Feature context](implementation/memory.md#mechanisms) |
| [`asMemoryReaderError`](../../src/integrations/memory.ts#L66) | Function | error | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryReader`](../../src/integrations/memory.ts#L72) | Class |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryReader.#reader`](../../src/integrations/memory.ts#L73) | Property |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryReader.constructor`](../../src/integrations/memory.ts#L75) | Constructor | reader | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryReader.search`](../../src/integrations/memory.ts#L79) | Method | request | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryReader.read`](../../src/integrations/memory.ts#L91) | Method | request | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryReader.close`](../../src/integrations/memory.ts#L104) | Method |  | [Feature context](implementation/memory.md#mechanisms) |
| [`openMemoryReader`](../../src/integrations/memory.ts#L113) | Function | configuration | [Feature context](implementation/memory.md#mechanisms) |

## src/shared/library.ts

Feature context: [Read external content in Current’s library](implementation/library.md)

[Open source](../../src/shared/library.ts) · 248 lines

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`record`](../../src/shared/library.ts#L78) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`exact`](../../src/shared/library.ts#L82) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`keysWithOptional`](../../src/shared/library.ts#L88) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`text`](../../src/shared/library.ts#L97) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`isLibraryBinding`](../../src/shared/library.ts#L108) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`source`](../../src/shared/library.ts#L112) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`validLimit`](../../src/shared/library.ts#L116) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`isLibraryErrorCode`](../../src/shared/library.ts#L125) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`isLibrarySearchRequest`](../../src/shared/library.ts#L129) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`isLibraryLatestRequest`](../../src/shared/library.ts#L139) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`isLibraryReference`](../../src/shared/library.ts#L148) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`isLibraryReferencesResponse`](../../src/shared/library.ts#L160) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`isLibraryItemView`](../../src/shared/library.ts#L169) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`isLibraryItemsResponse`](../../src/shared/library.ts#L219) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`isLibraryLatestResponse`](../../src/shared/library.ts#L231) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`libraryItemPath`](../../src/shared/library.ts#L245) | Function | | [Feature context](implementation/library.md#mechanisms) |
| [`LIBRARY_SEARCH_LIMIT`](../../src/shared/library.ts#L1) | Module value | | [Feature context](implementation/library.md#mechanisms) |
| [`LIBRARY_EXCERPT_CHARACTERS`](../../src/shared/library.ts#L2) | Module value | | [Feature context](implementation/library.md#mechanisms) |
| [`LIBRARY_READ_CHARACTERS`](../../src/shared/library.ts#L3) | Module value | | [Feature context](implementation/library.md#mechanisms) |
| [`LIBRARY_ERROR_CODES`](../../src/shared/library.ts#L5) | Module value | | [Feature context](implementation/library.md#mechanisms) |
| [`LibraryErrorCode`](../../src/shared/library.ts#L12) | Type alias | | [Feature context](implementation/library.md#mechanisms) |
| [`LibraryCompleteness`](../../src/shared/library.ts#L13) | Type alias | | [Feature context](implementation/library.md#mechanisms) |
| [`LibraryReference`](../../src/shared/library.ts#L15) | Interface | | [Feature context](implementation/library.md#mechanisms) |
| [`LibraryReferencesResponse`](../../src/shared/library.ts#L21) | Interface | | [Feature context](implementation/library.md#mechanisms) |
| [`LibrarySearchRequest`](../../src/shared/library.ts#L25) | Interface | | [Feature context](implementation/library.md#mechanisms) |
| [`LibraryLatestRequest`](../../src/shared/library.ts#L31) | Interface | | [Feature context](implementation/library.md#mechanisms) |
| [`LibraryItemView`](../../src/shared/library.ts#L46) | TypeAlias | | [Feature context](implementation/library.md#mechanisms) |
| [`LibraryItemsResponse`](../../src/shared/library.ts#L65) | Interface | | [Feature context](implementation/library.md#mechanisms) |
| [`LibraryLatestResponse`](../../src/shared/library.ts#L70) | Interface | | [Feature context](implementation/library.md#mechanisms) |
| [`UUID`](../../src/shared/library.ts#L74) | Module value | | [Feature context](implementation/library.md#mechanisms) |
| [`BINDING`](../../src/shared/library.ts#L75) | Module value | | [Feature context](implementation/library.md#mechanisms) |
| [`SOURCE`](../../src/shared/library.ts#L76) | Module value | | [Feature context](implementation/library.md#mechanisms) |


| [`LibraryItemBase`](../../src/shared/library.ts#L36) | Interface |  | [Feature context](implementation/library.md#mechanisms) |
| [`LibraryItemBase`](../../src/shared/library.ts#L36) | Interface |  | [Feature context](implementation/library.md#mechanisms) |

## src/shared/memory.ts

Feature context: [Search and read Memory](implementation/memory.md)

[Open source](../../src/shared/memory.ts) · 198 lines

| Symbol | Kind | Parameters or type | Explanation |
| --- | --- | --- | --- |
| [`MEMORY_SEARCH_LIMIT`](../../src/shared/memory.ts#L1) | Module value |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MEMORY_QUERY_CODEPOINTS`](../../src/shared/memory.ts#L2) | Module value |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MEMORY_PREVIEW_CODEPOINTS`](../../src/shared/memory.ts#L3) | Module value |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MEMORY_READ_CODEPOINTS`](../../src/shared/memory.ts#L4) | Module value |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MEMORY_CURSOR_CHARACTERS`](../../src/shared/memory.ts#L5) | Module value |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MEMORY_ID_CODEPOINTS`](../../src/shared/memory.ts#L6) | Module value |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MEMORY_ERROR_CODES`](../../src/shared/memory.ts#L8) | Module value |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryErrorCode`](../../src/shared/memory.ts#L16) | TypeAlias |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemorySearchRequest`](../../src/shared/memory.ts#L18) | Interface |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemorySearchItem`](../../src/shared/memory.ts#L24) | Interface |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemorySearchResponse`](../../src/shared/memory.ts#L30) | Interface |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryReadRequest`](../../src/shared/memory.ts#L35) | Interface |  | [Feature context](implementation/memory.md#mechanisms) |
| [`MemoryReadResponse`](../../src/shared/memory.ts#L41) | Interface |  | [Feature context](implementation/memory.md#mechanisms) |
| [`ClientCapabilityState`](../../src/shared/memory.ts#L48) | TypeAlias |  | [Feature context](implementation/memory.md#mechanisms) |
| [`ClientCapability`](../../src/shared/memory.ts#L50) | Interface |  | [Feature context](implementation/memory.md#mechanisms) |
| [`ClientCapabilities`](../../src/shared/memory.ts#L55) | Interface |  | [Feature context](implementation/memory.md#mechanisms) |
| [`record`](../../src/shared/memory.ts#L60) | Function | value | [Feature context](implementation/memory.md#mechanisms) |
| [`exact`](../../src/shared/memory.ts#L64) | Function | value, keys | [Feature context](implementation/memory.md#mechanisms) |
| [`keysWithOptional`](../../src/shared/memory.ts#L70) | Function | value, required, optional | [Feature context](implementation/memory.md#mechanisms) |
| [`wellFormed`](../../src/shared/memory.ts#L78) | Function | value | [Feature context](implementation/memory.md#mechanisms) |
| [`text`](../../src/shared/memory.ts#L92) | Function | value, limit, allowEmpty, rejectNul | [Feature context](implementation/memory.md#mechanisms) |
| [`revision`](../../src/shared/memory.ts#L108) | Function | value | [Feature context](implementation/memory.md#mechanisms) |
| [`cursor`](../../src/shared/memory.ts#L112) | Function | value | [Feature context](implementation/memory.md#mechanisms) |
| [`memoryId`](../../src/shared/memory.ts#L116) | Function | value | [Feature context](implementation/memory.md#mechanisms) |
| [`isMemoryErrorCode`](../../src/shared/memory.ts#L120) | Function | value | [Feature context](implementation/memory.md#mechanisms) |
| [`isMemorySearchRequest`](../../src/shared/memory.ts#L124) | Function | value | [Feature context](implementation/memory.md#mechanisms) |
| [`isMemoryReadRequest`](../../src/shared/memory.ts#L138) | Function | value | [Feature context](implementation/memory.md#mechanisms) |
| [`isMemorySearchItem`](../../src/shared/memory.ts#L148) | Function | value | [Feature context](implementation/memory.md#mechanisms) |
| [`isMemorySearchResponse`](../../src/shared/memory.ts#L158) | Function | value | [Feature context](implementation/memory.md#mechanisms) |
| [`isMemoryReadResponse`](../../src/shared/memory.ts#L169) | Function | value | [Feature context](implementation/memory.md#mechanisms) |
| [`isCapability`](../../src/shared/memory.ts#L180) | Function | value | [Feature context](implementation/memory.md#mechanisms) |
| [`isClientCapabilities`](../../src/shared/memory.ts#L191) | Function | value | [Feature context](implementation/memory.md#mechanisms) |

Indexed **52 source files** and **738 callable explanations**.
