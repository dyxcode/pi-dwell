# Implementation handbook

English | [简体中文](../../i18n/zh-CN/handbook/implementation/README.md)

[Documentation](../README.md)

<a id="features"></a>

## Understand the implementation by feature

Each chapter follows a feature through user behavior, module responsibilities, data ownership, execution, internal mechanisms, technology trade-offs and verification scenarios. Start with the feature you want to understand.

| Feature | Contents |
| --- | --- |
| [Run and manage the Host](host-service.md) | Background service, private storage, configuration and shutdown |
| [Connect a browser](pairing.md) | Pairing, credentials, trusted origins and revocation |
| [Create and return to a conversation](session-lifecycle.md) | Session identity, Pi processes, project resources and restart recovery |
| [Session name metadata](session-names.md) | Conversation labels, shared names and revision handling |
| [Choose a directory, model and thinking level](models.md) | Discovery, capability checks, selection and saved configuration |
| [Compose a message with images](compose-message.md) | Drafts, attachments, keyboard input and mobile layout |
| [Send a message and follow its execution](send-message.md) | Acceptance, retries, durable dispatch and results |
| [Stop work and close a conversation](stop-work.md) | Cancellation, native execution, closing and interrupted outcomes |
| [Reconnect to ongoing work](reconnect.md) | Live events, snapshots, replay and saved-state reconciliation |
| [Read saved history and context](saved-history.md) | Pi files, branches, pagination, images and concurrent reads |
| [Read and navigate a conversation](read-conversation.md) | Markdown, tools, thinking, navigation and stable rendering |
| [Search and read Memory](memory.md) | Distill-owned records, bounded search, revision-aware reading and host integration |
| [Read Library content and attach references](library.md) | Current search, exact versions, bindings and offline references |
| [Coordinate history cleanup](history-retirement.md) | Distill leases, runtime reservations, retirement and restoration |

<a id="reference"></a>

## Related reference

[Reference](../reference.md) supplies exact interfaces and configuration. The [source atlas](../source-map.md) locates implementation code, and [Development](../development.md) covers building and verification.
