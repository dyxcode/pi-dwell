<a id="catalog-implementation"></a>

# Session catalog

English | [简体中文](../../i18n/zh-CN/handbook/implementation/catalog.md)

[Implementation index](README.md) · [Session service](sessions.md) · [Session/storage overview](../sessions-storage.md)

`SessionCatalog` is the SQLite boundary for durable Pi configuration, Dwell session metadata, and turn outcomes. It never stores the conversation transcript: Pi's native JSONL session file remains authoritative for saved content. The catalog validates both values going into SQLite and values coming back from it, and treats unexpected schema or semantic state as corruption instead of trying to repair it silently.

<a id="catalog-records-and-validation"></a>

## Stored records and validation

[`StoredSession` and `StoredTurn`](../../../src/storage/catalog.ts#L11) are the internal rows. A session row retains request identity, canonical project directory, optional provider/model pair, confirmed thinking level, Pi session ID/file, whether native history is expected, lifecycle status, timestamps, and error. A turn adds a private payload digest to the public `TurnInfo` fields. The digest enables request-key idempotency without exposing original message/image content.

The small validators define the accepted vocabulary. [`isSessionStatus` and `isTurnStatus`](../../../src/storage/catalog.ts#L89) check membership in their explicit status sets. [`invalidCatalog`](../../../src/storage/catalog.ts#L97) standardizes unsupported/corrupt-catalog failures and directs repair to a stopped host. [`isNonEmptyString`, `isNullableNonEmptyString`, and `isSafeIntegerValue`](../../../src/storage/catalog.ts#L103) are the primitive field checks used by record guards and SQLite decoders.

[`isStoredSession`](../../../src/storage/catalog.ts#L115) requires exactly the 14 own fields used by the current record shape. It validates non-empty identifiers/path/digest, either two null model fields or two non-empty strings, a supported thinking level, optional non-empty Pi file, boolean history flag, allowed lifecycle status, safe integer timestamps, and nullable error text. A `ready` record additionally requires provider/model values. [`hasExactKeys`](../../../src/storage/catalog.ts#L172) performs the exact own-key comparison reused for strict turn shapes. [`isStoredTurn`](../../../src/storage/catalog.ts#L177) constructs the public turn portion and delegates its field/state checks to `isTurnInfo`, then requires a 64-character lowercase hexadecimal SHA-256 payload identity. [`assertRuntimeConfiguration`](../../../src/storage/catalog.ts#L225) accepts only an object with a non-empty executable and optional non-empty entry point, rejecting unknown keys and inherited/non-own entry-point values.

The SQLite decoding helpers reject type coercion. [`integerFromDatabase`](../../../src/storage/catalog.ts#L249) accepts safe JavaScript integers or in-range SQLite `bigint`; [`stringFromDatabase`](../../../src/storage/catalog.ts#L263) requires non-empty text; [`nullableStringFromDatabase`](../../../src/storage/catalog.ts#L271) permits exactly SQL `NULL` or non-empty text; and [`nullableThinkingLevelFromDatabase`](../../../src/storage/catalog.ts#L283) checks the shared thinking-level vocabulary. [`sessionFromDatabase`](../../../src/storage/catalog.ts#L292) validates the 0/1 history flag and status, then constructs the complete session record. [`entryIdsFromDatabase`](../../../src/storage/catalog.ts#L318) parses JSON text as an array of non-empty string IDs. [`nullableErrorFromDatabase`](../../../src/storage/catalog.ts#L338) accepts either two null error fields or two nonblank strings. [`turnFromDatabase`](../../../src/storage/catalog.ts#L353) combines those decoders, validates the cancellation flag/status/digest, checks the assembled value through `isTurnInfo`, and returns the private digest alongside it.

[`validateRecord` and `validateTurnRecord`](../../../src/storage/catalog.ts#L533) guard every insert/update entrypoint. Invalid in-memory records raise `TypeError` before SQL binding; invalid persisted values are reported as catalog corruption.

<a id="catalog-schema-and-migrations"></a>

## Schema verification and migration order

The current schema is version 4. `runtime_configuration` is a checked singleton containing the absolute executable and optional Node entry point. `sessions` is keyed by Dwell ID with a unique create-request ID and enforces paired provider/model nullability, supported statuses, confirmed model metadata for ready sessions, and optional thinking level. `turns` references `sessions`, stores request and payload identities, status/cancellation/timestamps/errors, and JSON entry IDs. A partial unique index permits at most one `accepted`, `dispatching`, or `running` turn per session. SQL constraints and TypeScript validation jointly enforce the catalog's accepted shapes. [`SCHEMA_VERSION`, schema declarations, and status-transition sets`](../../../src/storage/catalog.ts#L32)

[`databaseRows`](../../../src/storage/catalog.ts#L377) reads the `all()` result from a prepared query. [`hasUserSchema`](../../../src/storage/catalog.ts#L381) distinguishes a truly empty unversioned database from one with user objects. [`verifySchema`](../../../src/storage/catalog.ts#L390) reads non-SQLite objects in name order and requires exact object count, object type/name, and original SQL text for the selected version. A same-named but altered table/index is rejected.

Migrations preserve rows by renaming and rebuilding tables inside one surrounding transaction. [`migrateV2ToV3`](../../../src/storage/catalog.ts#L427) rebuilds nullable provider/model session fields while retaining turns and recreates the active-turn index. [`migrateV3ToV4`](../../../src/storage/catalog.ts#L443) adds nullable `thinking_level`, copies prior session fields with `NULL`, retains turns, and recreates the index. Both update `user_version` and verify the result. [`initializeSchema`](../../../src/storage/catalog.ts#L459) disables foreign-key enforcement only around the migration transaction, then handles: empty version 0 by creating v4; v1 by validating v1, adding turn storage as v2, then applying v2→v3→v4; v2 with v2→v3→v4; v3 with v3→v4; and v4 by verification only. It checks foreign-key consistency before commit, rolls back on any failure, and always reenables foreign keys. Any other version or nonempty unversioned database is rejected.

<a id="catalog-file-safety-and-open"></a>

## File safety and opening the catalog

[`validateDatabaseFile`](../../../src/storage/catalog.ts#L509) opens the catalog without following symlinks and without blocking on special files. It requires a regular file with one hard link, exact owner-only `0600` permissions, and a known process UID matching the file owner. It closes the handle on both success and failure.

[`SessionCatalog.constructor` and `SessionCatalog.open`](../../../src/storage/catalog.ts#L544) are the only creation path. `open` prepares the private parent directory, creates an owner-only empty file if absent, tolerates only the expected `EEXIST` race, validates the file, and opens `DatabaseSync` with foreign keys enabled, big-integer reads, and SQLite extensions disabled. After schema initialization it requires DELETE journal mode and sets `synchronous = FULL`, constructs the catalog, and reads all turns once to validate persisted semantic identifiers before returning. If any step fails, it closes an opened database and preserves the initialization error.

<a id="catalog-session-operations"></a>

## Configuration and session-row operations

[`configuration`](../../../src/storage/catalog.ts#L586) returns `undefined` when no row exists, otherwise decodes the executable and nullable entry point into the public runtime configuration shape. [`configure`](../../../src/storage/catalog.ts#L596) runs `assertRuntimeConfiguration` and upserts singleton row 1, clearing an old entry point when the new configuration omits it.

[`list`](../../../src/storage/catalog.ts#L605) returns all decoded sessions ordered by creation time then ID. [`get`](../../../src/storage/catalog.ts#L612) fetches one by primary key; [`findRequest`](../../../src/storage/catalog.ts#L619) resolves the globally unique create request ID. [`insert`](../../../src/storage/catalog.ts#L626) validates then inserts all 14 fields, encoding the history boolean as 0/1. [`update`](../../../src/storage/catalog.ts#L650) validates and replaces all mutable/stored fields by session ID; if exactly one row was not changed, it reports a missing session. Catalog methods do not hide SQLite constraint errors such as a duplicate request ID.

[`interruptCreating`](../../../src/storage/catalog.ts#L677) checks its timestamp and marks all persisted `creating` rows `interrupted` with a restart explanation. Service startup calls it before recreating runtimes; the row does not identify whether Pi had started.

<a id="catalog-turn-operations"></a>

## Durable turn ledger and recovery

[`insertTurn`](../../../src/storage/catalog.ts#L687) validates the full stored turn and inserts its immutable identity, initial status, cancellation flag, optional error pair, and serialized saved-entry ID list. The SQL foreign key requires the session to exist; the per-session request uniqueness and partial active-turn index enforce deduplication and one active turn.

[`updateTurn`](../../../src/storage/catalog.ts#L706) rereads the current turn first. The request ID, payload digest, and creation time are immutable. A changed status is allowed only by `ALLOWED_TURN_TRANSITIONS`, and terminal statuses cannot transition again. It then updates status, cancellation flag, updated time, error pair, and entry IDs; a missing row is an error. Same-status updates remain possible for recording cancellation intent and refreshed outcome metadata.

[`getTurn`](../../../src/storage/catalog.ts#L744) fetches by session/run identity; [`findTurnRequest`](../../../src/storage/catalog.ts#L751) fetches a turn's idempotency key within a session. [`latestTurn`](../../../src/storage/catalog.ts#L758) orders by SQLite `rowid` so it reflects insertion/admission order even if a supplied clock regresses. [`activeTurn`](../../../src/storage/catalog.ts#L765) selects one nonterminal status; the unique partial index guarantees no second match. [`listTurns`](../../../src/storage/catalog.ts#L774) validates every row in creation-time/rowid order and is also used during service startup to surface corruption before Pi starts.

[`markTurnDispatching`](../../../src/storage/catalog.ts#L781) requires a `dispatching` turn, a matching session, and `historyExpected: true`. It executes the session update and turn update in one `BEGIN IMMEDIATE` transaction; a failure rolls both back. This is the durable boundary immediately before Pi may receive the prompt. It means the host can distinguish known-not-sent `accepted` work from a potentially side-effecting dispatched turn after a crash.

[`interruptTurns`](../../../src/storage/catalog.ts#L804) validates the recovery timestamp and makes all active turns terminal `interrupted`, using the greater of old and recovery timestamps. An `accepted` turn gets `not_dispatched` and an explanation that the prompt was not sent; `dispatching` or `running` gets `outcome_unknown`, because the external runtime may already have acted. It never retries those turns. [`close`](../../../src/storage/catalog.ts#L814) closes only an open SQLite handle and is safe to call after prior closure.

Related behavior is exercised by [catalog tests](../../../tests/catalog.test.ts), [turn/catalog tests](../../../tests/turn-catalog.test.ts), and [session restart tests](../../../tests/sessions.test.ts).
