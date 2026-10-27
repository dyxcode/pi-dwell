import { constants } from "node:fs";
import { open as openFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import { createPrivateFile, prepareDataDirectory } from "../local/files.ts";
import { hasCode } from "../local/paths.ts";
import { isThinkingLevel, type ThinkingLevel } from "../shared/thinking.ts";
import type { RuntimeConfiguration } from "../shared/sessions.ts";
import { isTurnInfo, type TurnError, type TurnInfo, type TurnStatus } from "../shared/turns.ts";

export interface StoredSession {
  id: string;
  requestId: string;
  payloadIdentity: string;
  directory: string;
  provider: string | null;
  model: string | null;
  thinkingLevel: ThinkingLevel | null;
  piSessionId: string;
  piSessionFile: string | null;
  historyExpected: boolean;
  status: "creating" | "ready" | "failed" | "interrupted";
  createdAt: number;
  updatedAt: number;
  error: string | null;
}

export interface StoredTurn extends TurnInfo {
  payloadIdentity: string;
}

const SCHEMA_VERSION = 4;
const V1_SCHEMA_VERSION = 1;
const V2_SCHEMA_VERSION = 2;
const V3_SCHEMA_VERSION = 3;
const DATABASE_NAME = "catalog.sqlite";
const SESSION_COLUMNS = `
  id, request_id, payload_identity, directory, provider, model, pi_session_id,
  pi_session_file, history_expected, status, created_at, updated_at, error,
  thinking_level
`;
const V3_SESSION_COLUMNS = `
  id, request_id, payload_identity, directory, provider, model, pi_session_id,
  pi_session_file, history_expected, status, created_at, updated_at, error
`;

const CONFIGURATION_SCHEMA =
  "CREATE TABLE runtime_configuration (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), executable TEXT NOT NULL CHECK (length(executable) > 0), entry_point TEXT CHECK (entry_point IS NULL OR length(entry_point) > 0)) STRICT";
const V2_SESSIONS_SCHEMA =
  "CREATE TABLE sessions (id TEXT NOT NULL PRIMARY KEY CHECK (length(id) > 0), request_id TEXT NOT NULL UNIQUE CHECK (length(request_id) > 0), payload_identity TEXT NOT NULL CHECK (length(payload_identity) > 0), directory TEXT NOT NULL CHECK (length(directory) > 0), provider TEXT NOT NULL CHECK (length(provider) > 0), model TEXT NOT NULL CHECK (length(model) > 0), pi_session_id TEXT NOT NULL CHECK (length(pi_session_id) > 0), pi_session_file TEXT CHECK (pi_session_file IS NULL OR length(pi_session_file) > 0), history_expected INTEGER NOT NULL CHECK (history_expected IN (0, 1)), status TEXT NOT NULL CHECK (status IN ('creating', 'ready', 'failed', 'interrupted')), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error TEXT) STRICT";
const V3_SESSIONS_SCHEMA =
  "CREATE TABLE sessions (id TEXT NOT NULL PRIMARY KEY CHECK (length(id) > 0), request_id TEXT NOT NULL UNIQUE CHECK (length(request_id) > 0), payload_identity TEXT NOT NULL CHECK (length(payload_identity) > 0), directory TEXT NOT NULL CHECK (length(directory) > 0), provider TEXT CHECK (provider IS NULL OR length(provider) > 0), model TEXT CHECK (model IS NULL OR length(model) > 0), pi_session_id TEXT NOT NULL CHECK (length(pi_session_id) > 0), pi_session_file TEXT CHECK (pi_session_file IS NULL OR length(pi_session_file) > 0), history_expected INTEGER NOT NULL CHECK (history_expected IN (0, 1)), status TEXT NOT NULL CHECK (status IN ('creating', 'ready', 'failed', 'interrupted')), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error TEXT, CHECK ((provider IS NULL) = (model IS NULL)), CHECK (status != 'ready' OR provider IS NOT NULL)) STRICT";
const SESSIONS_SCHEMA =
  "CREATE TABLE sessions (id TEXT NOT NULL PRIMARY KEY CHECK (length(id) > 0), request_id TEXT NOT NULL UNIQUE CHECK (length(request_id) > 0), payload_identity TEXT NOT NULL CHECK (length(payload_identity) > 0), directory TEXT NOT NULL CHECK (length(directory) > 0), provider TEXT CHECK (provider IS NULL OR length(provider) > 0), model TEXT CHECK (model IS NULL OR length(model) > 0), pi_session_id TEXT NOT NULL CHECK (length(pi_session_id) > 0), pi_session_file TEXT CHECK (pi_session_file IS NULL OR length(pi_session_file) > 0), history_expected INTEGER NOT NULL CHECK (history_expected IN (0, 1)), status TEXT NOT NULL CHECK (status IN ('creating', 'ready', 'failed', 'interrupted')), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error TEXT, thinking_level TEXT CHECK (thinking_level IS NULL OR thinking_level IN ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')), CHECK ((provider IS NULL) = (model IS NULL)), CHECK (status != 'ready' OR provider IS NOT NULL)) STRICT";
const TURNS_SCHEMA =
  "CREATE TABLE turns (run_id TEXT NOT NULL PRIMARY KEY CHECK (length(run_id) > 0), session_id TEXT NOT NULL REFERENCES sessions(id), request_id TEXT NOT NULL CHECK (length(request_id) > 0), payload_identity TEXT NOT NULL CHECK (length(payload_identity) = 64), status TEXT NOT NULL CHECK (status IN ('accepted', 'dispatching', 'running', 'completed', 'failed', 'aborted', 'interrupted')), cancellation_requested INTEGER NOT NULL CHECK (cancellation_requested IN (0, 1)), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error_code TEXT, error_message TEXT, entry_ids TEXT NOT NULL CHECK (json_valid(entry_ids)), UNIQUE (session_id, request_id), CHECK ((error_code IS NULL AND error_message IS NULL) OR (length(error_code) > 0 AND length(error_message) > 0))) STRICT";
const ACTIVE_TURN_INDEX =
  "CREATE UNIQUE INDEX one_active_turn_per_session ON turns(session_id) WHERE status IN ('accepted', 'dispatching', 'running')";
const TURN_COLUMNS =
  "run_id, session_id, request_id, payload_identity, status, cancellation_requested, created_at, updated_at, error_code, error_message, entry_ids";

const SESSION_STATUSES = new Set(["creating", "ready", "failed", "interrupted"]);
const TURN_STATUSES = new Set<string>([
  "accepted",
  "dispatching",
  "running",
  "completed",
  "failed",
  "aborted",
  "interrupted",
]);
const TERMINAL_TURN_STATUSES = new Set<TurnStatus>([
  "completed",
  "failed",
  "aborted",
  "interrupted",
]);
const ALLOWED_TURN_TRANSITIONS: Readonly<Record<TurnStatus, ReadonlySet<TurnStatus>>> = {
  accepted: new Set(["dispatching", "failed", "aborted", "interrupted"]),
  dispatching: new Set(["running", "completed", "failed", "aborted", "interrupted"]),
  running: new Set(["completed", "failed", "aborted", "interrupted"]),
  completed: new Set(),
  failed: new Set(),
  aborted: new Set(),
  interrupted: new Set(),
};
const PAYLOAD_IDENTITY = /^[a-f0-9]{64}$/;

function isSessionStatus(value: unknown): value is StoredSession["status"] {
  return typeof value === "string" && SESSION_STATUSES.has(value);
}

function isTurnStatus(value: unknown): value is TurnStatus {
  return typeof value === "string" && TURN_STATUSES.has(value);
}

function invalidCatalog(reason: string): Error {
  return new Error(
    `Invalid or unsupported session catalog: ${reason}. Repair it while the host is stopped.`,
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isSafeIntegerValue(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if (
    !Object.hasOwn(value, "id") ||
    !("id" in value) ||
    !Object.hasOwn(value, "requestId") ||
    !("requestId" in value) ||
    !Object.hasOwn(value, "payloadIdentity") ||
    !("payloadIdentity" in value) ||
    !Object.hasOwn(value, "directory") ||
    !("directory" in value) ||
    !Object.hasOwn(value, "provider") ||
    !("provider" in value) ||
    !Object.hasOwn(value, "model") ||
    !("model" in value) ||
    !Object.hasOwn(value, "thinkingLevel") ||
    !("thinkingLevel" in value) ||
    !Object.hasOwn(value, "piSessionId") ||
    !("piSessionId" in value) ||
    !Object.hasOwn(value, "piSessionFile") ||
    !("piSessionFile" in value) ||
    !Object.hasOwn(value, "historyExpected") ||
    !("historyExpected" in value) ||
    !Object.hasOwn(value, "status") ||
    !("status" in value) ||
    !Object.hasOwn(value, "createdAt") ||
    !("createdAt" in value) ||
    !Object.hasOwn(value, "updatedAt") ||
    !("updatedAt" in value) ||
    !Object.hasOwn(value, "error") ||
    !("error" in value)
  ) {
    return false;
  }
  if (Object.keys(value).length !== 14) {
    return false;
  }
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.requestId) &&
    isNonEmptyString(value.payloadIdentity) &&
    isNonEmptyString(value.directory) &&
    ((value.provider === null && value.model === null) ||
      (isNonEmptyString(value.provider) && isNonEmptyString(value.model))) &&
    (value.thinkingLevel === null || isThinkingLevel(value.thinkingLevel)) &&
    isNonEmptyString(value.piSessionId) &&
    isNullableNonEmptyString(value.piSessionFile) &&
    typeof value.historyExpected === "boolean" &&
    isSessionStatus(value.status) &&
    (value.status !== "ready" ||
      (isNonEmptyString(value.provider) && isNonEmptyString(value.model))) &&
    isSafeIntegerValue(value.createdAt) &&
    isSafeIntegerValue(value.updatedAt) &&
    (value.error === null || typeof value.error === "string")
  );
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function isStoredTurn(value: unknown): value is StoredTurn {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !hasExactKeys(value, [
      "runId",
      "sessionId",
      "requestId",
      "status",
      "cancellationRequested",
      "createdAt",
      "updatedAt",
      "error",
      "entryIds",
      "payloadIdentity",
    ]) ||
    !("runId" in value) ||
    !("sessionId" in value) ||
    !("requestId" in value) ||
    !("status" in value) ||
    !("cancellationRequested" in value) ||
    !("createdAt" in value) ||
    !("updatedAt" in value) ||
    !("error" in value) ||
    !("entryIds" in value) ||
    !("payloadIdentity" in value)
  ) {
    return false;
  }
  const info: unknown = {
    runId: value.runId,
    sessionId: value.sessionId,
    requestId: value.requestId,
    status: value.status,
    cancellationRequested: value.cancellationRequested,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    error: value.error,
    entryIds: value.entryIds,
  };
  return (
    isTurnInfo(info) &&
    typeof value.payloadIdentity === "string" &&
    PAYLOAD_IDENTITY.test(value.payloadIdentity)
  );
}

function assertRuntimeConfiguration(value: unknown): RuntimeConfiguration {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !Object.hasOwn(value, "executable") ||
    !Object.keys(value).every((key) => key === "executable" || key === "entryPoint") ||
    !("executable" in value) ||
    !isNonEmptyString(value.executable)
  ) {
    throw new TypeError("Runtime configuration requires an executable path.");
  }
  if ("entryPoint" in value) {
    if (!Object.hasOwn(value, "entryPoint")) {
      throw new TypeError("Runtime entry point must be an own configuration property.");
    }
    if (!isNonEmptyString(value.entryPoint)) {
      throw new TypeError("Runtime entry point must be a non-empty path when provided.");
    }
    return { executable: value.executable, entryPoint: value.entryPoint };
  }
  return { executable: value.executable };
}

function integerFromDatabase(row: Record<string, SQLOutputValue>, column: string): number {
  const value = row[column];
  if (typeof value === "bigint") {
    if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw invalidCatalog(`integer field ${column} is outside the safe range`);
    }
    return Number(value);
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw invalidCatalog(`integer field ${column} has an invalid value`);
  }
  return value;
}

function stringFromDatabase(row: Record<string, SQLOutputValue>, column: string): string {
  const value = row[column];
  if (typeof value !== "string" || value.length === 0) {
    throw invalidCatalog(`text field ${column} has an invalid value`);
  }
  return value;
}

function nullableStringFromDatabase(
  row: Record<string, SQLOutputValue>,
  column: string,
): string | null {
  const value = row[column];
  if (value === null) return null;
  if (typeof value !== "string" || value.length === 0) {
    throw invalidCatalog(`nullable text field ${column} has an invalid value`);
  }
  return value;
}

function nullableThinkingLevelFromDatabase(
  row: Record<string, SQLOutputValue>,
): ThinkingLevel | null {
  const value = row.thinking_level;
  if (value === null) return null;
  if (!isThinkingLevel(value)) throw invalidCatalog("thinking level is invalid");
  return value;
}

function sessionFromDatabase(row: Record<string, SQLOutputValue>): StoredSession {
  const historyExpected = integerFromDatabase(row, "history_expected");
  const status = stringFromDatabase(row, "status");
  const error = nullableStringFromDatabase(row, "error");
  if ((historyExpected !== 0 && historyExpected !== 1) || !isSessionStatus(status)) {
    throw invalidCatalog("session status or history flag is invalid");
  }
  const session: StoredSession = {
    id: stringFromDatabase(row, "id"),
    requestId: stringFromDatabase(row, "request_id"),
    payloadIdentity: stringFromDatabase(row, "payload_identity"),
    directory: stringFromDatabase(row, "directory"),
    provider: nullableStringFromDatabase(row, "provider"),
    model: nullableStringFromDatabase(row, "model"),
    thinkingLevel: nullableThinkingLevelFromDatabase(row),
    piSessionId: stringFromDatabase(row, "pi_session_id"),
    piSessionFile: nullableStringFromDatabase(row, "pi_session_file"),
    historyExpected: historyExpected === 1,
    status,
    createdAt: integerFromDatabase(row, "created_at"),
    updatedAt: integerFromDatabase(row, "updated_at"),
    error,
  };
  return session;
}

function entryIdsFromDatabase(row: Record<string, SQLOutputValue>): string[] {
  const encoded = row.entry_ids;
  if (typeof encoded !== "string") throw invalidCatalog("turn entry references are not text");
  let decoded: unknown;
  try {
    decoded = JSON.parse(encoded);
  } catch {
    throw invalidCatalog("turn entry references are not valid JSON");
  }
  if (!Array.isArray(decoded)) throw invalidCatalog("turn entry references are not an array");
  const entryIds: string[] = [];
  for (const entryId of decoded) {
    if (typeof entryId !== "string" || entryId.length === 0) {
      throw invalidCatalog("turn entry reference is invalid");
    }
    entryIds.push(entryId);
  }
  return entryIds;
}

function nullableErrorFromDatabase(row: Record<string, SQLOutputValue>): TurnError | null {
  const code = row.error_code;
  const message = row.error_message;
  if (code === null && message === null) return null;
  if (
    typeof code !== "string" ||
    code.trim().length === 0 ||
    typeof message !== "string" ||
    message.trim().length === 0
  ) {
    throw invalidCatalog("turn error fields are invalid");
  }
  return { code, message };
}

function turnFromDatabase(row: Record<string, SQLOutputValue>): StoredTurn {
  const cancellationRequested = integerFromDatabase(row, "cancellation_requested");
  const status = stringFromDatabase(row, "status");
  if ((cancellationRequested !== 0 && cancellationRequested !== 1) || !isTurnStatus(status)) {
    throw invalidCatalog("turn status or cancellation flag is invalid");
  }
  const payloadIdentity = stringFromDatabase(row, "payload_identity");
  if (!PAYLOAD_IDENTITY.test(payloadIdentity))
    throw invalidCatalog("turn payload identity is not a SHA-256 digest");
  const info: TurnInfo = {
    runId: stringFromDatabase(row, "run_id"),
    sessionId: stringFromDatabase(row, "session_id"),
    requestId: stringFromDatabase(row, "request_id"),
    status,
    cancellationRequested: cancellationRequested === 1,
    createdAt: integerFromDatabase(row, "created_at"),
    updatedAt: integerFromDatabase(row, "updated_at"),
    error: nullableErrorFromDatabase(row),
    entryIds: entryIdsFromDatabase(row),
  };
  if (!isTurnInfo(info)) throw invalidCatalog("turn identities or fields are invalid");
  return { ...info, payloadIdentity };
}

function databaseRows(database: DatabaseSync, sql: string): Record<string, SQLOutputValue>[] {
  return database.prepare(sql).all();
}

function hasUserSchema(database: DatabaseSync): boolean {
  return (
    databaseRows(
      database,
      "SELECT type, name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' LIMIT 1",
    ).length > 0
  );
}

function verifySchema(database: DatabaseSync, version: 1 | 2 | 3 | 4): void {
  const rows = databaseRows(
    database,
    "SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const expected =
    version === 1
      ? [
          { type: "table", name: "runtime_configuration", sql: CONFIGURATION_SCHEMA },
          { type: "table", name: "sessions", sql: V2_SESSIONS_SCHEMA },
        ]
      : [
          { type: "index", name: "one_active_turn_per_session", sql: ACTIVE_TURN_INDEX },
          { type: "table", name: "runtime_configuration", sql: CONFIGURATION_SCHEMA },
          {
            type: "table",
            name: "sessions",
            sql:
              version === V2_SCHEMA_VERSION
                ? V2_SESSIONS_SCHEMA
                : version === V3_SCHEMA_VERSION
                  ? V3_SESSIONS_SCHEMA
                  : SESSIONS_SCHEMA,
          },
          { type: "table", name: "turns", sql: TURNS_SCHEMA },
        ];
  if (
    rows.length !== expected.length ||
    !expected.every((schema, index) => {
      const row = rows[index];
      return row?.type === schema.type && row.name === schema.name && row.sql === schema.sql;
    })
  ) {
    throw invalidCatalog(`schema does not match version ${version}`);
  }
}

function migrateV2ToV3(database: DatabaseSync): void {
  database.exec("ALTER TABLE sessions RENAME TO sessions_v2");
  database.exec(V3_SESSIONS_SCHEMA);
  database.exec(
    `INSERT INTO sessions (${V3_SESSION_COLUMNS}) SELECT ${V3_SESSION_COLUMNS} FROM sessions_v2`,
  );
  database.exec("ALTER TABLE turns RENAME TO turns_v2");
  database.exec(TURNS_SCHEMA);
  database.exec(`INSERT INTO turns (${TURN_COLUMNS}) SELECT ${TURN_COLUMNS} FROM turns_v2`);
  database.exec("DROP TABLE turns_v2");
  database.exec(ACTIVE_TURN_INDEX);
  database.exec("DROP TABLE sessions_v2");
  database.exec(`PRAGMA user_version = ${V3_SCHEMA_VERSION}`);
  verifySchema(database, V3_SCHEMA_VERSION);
}

function migrateV3ToV4(database: DatabaseSync): void {
  database.exec("ALTER TABLE sessions RENAME TO sessions_v3");
  database.exec(SESSIONS_SCHEMA);
  database.exec(
    `INSERT INTO sessions (${SESSION_COLUMNS}) SELECT ${V3_SESSION_COLUMNS}, NULL FROM sessions_v3`,
  );
  database.exec("ALTER TABLE turns RENAME TO turns_v3");
  database.exec(TURNS_SCHEMA);
  database.exec(`INSERT INTO turns (${TURN_COLUMNS}) SELECT ${TURN_COLUMNS} FROM turns_v3`);
  database.exec("DROP TABLE turns_v3");
  database.exec(ACTIVE_TURN_INDEX);
  database.exec("DROP TABLE sessions_v3");
  database.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  verifySchema(database, SCHEMA_VERSION);
}

function initializeSchema(database: DatabaseSync): void {
  database.exec("PRAGMA foreign_keys = OFF");
  try {
    database.exec("BEGIN IMMEDIATE");
    try {
      const versionRow = database.prepare("PRAGMA user_version").get();
      if (!versionRow) throw invalidCatalog("schema version is missing");
      const version = integerFromDatabase(versionRow, "user_version");

      if (version === 0) {
        if (hasUserSchema(database)) throw invalidCatalog("unversioned schema is not empty");
        database.exec(CONFIGURATION_SCHEMA);
        database.exec(SESSIONS_SCHEMA);
        database.exec(TURNS_SCHEMA);
        database.exec(ACTIVE_TURN_INDEX);
        database.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
        verifySchema(database, SCHEMA_VERSION);
      } else if (version === V1_SCHEMA_VERSION) {
        verifySchema(database, V1_SCHEMA_VERSION);
        database.exec(TURNS_SCHEMA);
        database.exec(ACTIVE_TURN_INDEX);
        database.exec(`PRAGMA user_version = ${V2_SCHEMA_VERSION}`);
        verifySchema(database, V2_SCHEMA_VERSION);
        migrateV2ToV3(database);
        migrateV3ToV4(database);
      } else if (version === V2_SCHEMA_VERSION) {
        verifySchema(database, V2_SCHEMA_VERSION);
        migrateV2ToV3(database);
        migrateV3ToV4(database);
      } else if (version === V3_SCHEMA_VERSION) {
        verifySchema(database, V3_SCHEMA_VERSION);
        migrateV3ToV4(database);
      } else if (version === SCHEMA_VERSION) {
        verifySchema(database, SCHEMA_VERSION);
      } else {
        throw invalidCatalog(`unsupported schema version ${version}`);
      }

      const foreignKeyErrors = databaseRows(database, "PRAGMA foreign_key_check");
      if (foreignKeyErrors.length > 0) throw invalidCatalog("turn session references are invalid");
      database.exec("COMMIT");
    } catch (error) {
      if (database.isTransaction) database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }
}

async function validateDatabaseFile(path: string): Promise<void> {
  const handle = await openFile(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await handle.stat();
    const owner = process.getuid?.();
    if (
      !info.isFile() ||
      info.nlink !== 1 ||
      (info.mode & 0o777) !== 0o600 ||
      owner === undefined ||
      info.uid !== owner
    ) {
      throw new Error(
        `Unsafe catalog database file: ${path}. Expected a single-link owner-only regular file (0600).`,
      );
    }
  } finally {
    await handle.close();
  }
}

function validateRecord(value: unknown): asserts value is StoredSession {
  if (!isStoredSession(value)) throw new TypeError("Invalid stored session record.");
}

function validateTurnRecord(value: unknown): asserts value is StoredTurn {
  if (!isStoredTurn(value)) throw new TypeError("Invalid stored turn record.");
}

export class SessionCatalog {
  private readonly database: DatabaseSync;

  private constructor(database: DatabaseSync) {
    this.database = database;
  }

  static async open(dataDir: string): Promise<SessionCatalog> {
    const privateDir = await prepareDataDirectory(dataDir);
    const path = join(privateDir, DATABASE_NAME);
    try {
      await createPrivateFile(path, "");
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
    }
    await validateDatabaseFile(path);

    let database: DatabaseSync | undefined;
    try {
      database = new DatabaseSync(path, {
        enableForeignKeyConstraints: true,
        readBigInts: true,
        allowExtension: false,
      });
      initializeSchema(database);
      const journalMode = database.prepare("PRAGMA journal_mode = DELETE").get();
      if (journalMode?.journal_mode !== "delete") {
        throw invalidCatalog("DELETE journal mode could not be enabled");
      }
      database.exec("PRAGMA synchronous = FULL");
      const catalog = new SessionCatalog(database);
      catalog.listTurns();
      return catalog;
    } catch (error) {
      if (database?.isOpen) {
        try {
          database.close();
        } catch {
          // Preserve the initialization failure for the caller.
        }
      }
      throw error;
    }
  }

  configuration(): RuntimeConfiguration | undefined {
    const row = this.database
      .prepare("SELECT executable, entry_point FROM runtime_configuration WHERE singleton = 1")
      .get();
    if (!row) return undefined;
    const executable = stringFromDatabase(row, "executable");
    const entryPoint = nullableStringFromDatabase(row, "entry_point");
    return entryPoint === null ? { executable } : { executable, entryPoint };
  }

  configure(config: RuntimeConfiguration): void {
    const validated = assertRuntimeConfiguration(config);
    this.database
      .prepare(
        "INSERT INTO runtime_configuration (singleton, executable, entry_point) VALUES (1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET executable = excluded.executable, entry_point = excluded.entry_point",
      )
      .run(validated.executable, validated.entryPoint ?? null);
  }

  list(): StoredSession[] {
    return databaseRows(
      this.database,
      `SELECT ${SESSION_COLUMNS} FROM sessions ORDER BY created_at, id`,
    ).map(sessionFromDatabase);
  }

  get(id: string): StoredSession | undefined {
    const row = this.database
      .prepare(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE id = ?`)
      .get(id);
    return row ? sessionFromDatabase(row) : undefined;
  }

  findRequest(requestId: string): StoredSession | undefined {
    const row = this.database
      .prepare(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE request_id = ?`)
      .get(requestId);
    return row ? sessionFromDatabase(row) : undefined;
  }

  insert(record: StoredSession): void {
    validateRecord(record);
    this.database
      .prepare(
        `INSERT INTO sessions (${SESSION_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.requestId,
        record.payloadIdentity,
        record.directory,
        record.provider,
        record.model,
        record.piSessionId,
        record.piSessionFile,
        record.historyExpected ? 1 : 0,
        record.status,
        record.createdAt,
        record.updatedAt,
        record.error,
        record.thinkingLevel,
      );
  }

  update(record: StoredSession): void {
    validateRecord(record);
    const result = this.database
      .prepare(
        "UPDATE sessions SET request_id = ?, payload_identity = ?, directory = ?, provider = ?, model = ?, pi_session_id = ?, pi_session_file = ?, history_expected = ?, status = ?, created_at = ?, updated_at = ?, error = ?, thinking_level = ? WHERE id = ?",
      )
      .run(
        record.requestId,
        record.payloadIdentity,
        record.directory,
        record.provider,
        record.model,
        record.piSessionId,
        record.piSessionFile,
        record.historyExpected ? 1 : 0,
        record.status,
        record.createdAt,
        record.updatedAt,
        record.error,
        record.thinkingLevel,
        record.id,
      );
    if (result.changes !== 1 && result.changes !== 1n) {
      throw new Error(`Cannot update missing session: ${record.id}.`);
    }
  }

  interruptCreating(now: number): void {
    if (!Number.isSafeInteger(now))
      throw new TypeError("Interruption time must be a safe integer.");
    this.database
      .prepare(
        "UPDATE sessions SET status = 'interrupted', updated_at = ?, error = 'Session creation was interrupted by host restart.' WHERE status = 'creating'",
      )
      .run(now);
  }

  insertTurn(record: StoredTurn): void {
    validateTurnRecord(record);
    this.database
      .prepare(`INSERT INTO turns (${TURN_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        record.runId,
        record.sessionId,
        record.requestId,
        record.payloadIdentity,
        record.status,
        record.cancellationRequested ? 1 : 0,
        record.createdAt,
        record.updatedAt,
        record.error?.code ?? null,
        record.error?.message ?? null,
        JSON.stringify(record.entryIds),
      );
  }

  updateTurn(record: StoredTurn): void {
    validateTurnRecord(record);
    const current = this.getTurn(record.sessionId, record.runId);
    if (!current) throw new Error(`Cannot update missing turn: ${record.runId}.`);
    if (
      current.requestId !== record.requestId ||
      current.payloadIdentity !== record.payloadIdentity ||
      current.createdAt !== record.createdAt
    ) {
      throw new Error(`Turn identity is immutable: ${record.runId}.`);
    }
    if (
      current.status !== record.status &&
      (TERMINAL_TURN_STATUSES.has(current.status) ||
        !ALLOWED_TURN_TRANSITIONS[current.status].has(record.status))
    ) {
      throw new Error(`Invalid turn status transition: ${current.status} -> ${record.status}.`);
    }

    const result = this.database
      .prepare(
        "UPDATE turns SET status = ?, cancellation_requested = ?, updated_at = ?, error_code = ?, error_message = ?, entry_ids = ? WHERE session_id = ? AND run_id = ?",
      )
      .run(
        record.status,
        record.cancellationRequested ? 1 : 0,
        record.updatedAt,
        record.error?.code ?? null,
        record.error?.message ?? null,
        JSON.stringify(record.entryIds),
        record.sessionId,
        record.runId,
      );
    if (result.changes !== 1 && result.changes !== 1n) {
      throw new Error(`Cannot update missing turn: ${record.runId}.`);
    }
  }

  getTurn(sessionId: string, runId: string): StoredTurn | undefined {
    const row = this.database
      .prepare(`SELECT ${TURN_COLUMNS} FROM turns WHERE session_id = ? AND run_id = ?`)
      .get(sessionId, runId);
    return row ? turnFromDatabase(row) : undefined;
  }

  findTurnRequest(sessionId: string, requestId: string): StoredTurn | undefined {
    const row = this.database
      .prepare(`SELECT ${TURN_COLUMNS} FROM turns WHERE session_id = ? AND request_id = ?`)
      .get(sessionId, requestId);
    return row ? turnFromDatabase(row) : undefined;
  }

  latestTurn(sessionId: string): StoredTurn | undefined {
    const row = this.database
      .prepare(`SELECT ${TURN_COLUMNS} FROM turns WHERE session_id = ? ORDER BY rowid DESC LIMIT 1`)
      .get(sessionId);
    return row ? turnFromDatabase(row) : undefined;
  }

  activeTurn(sessionId: string): StoredTurn | undefined {
    const row = this.database
      .prepare(
        `SELECT ${TURN_COLUMNS} FROM turns WHERE session_id = ? AND status IN ('accepted', 'dispatching', 'running') LIMIT 1`,
      )
      .get(sessionId);
    return row ? turnFromDatabase(row) : undefined;
  }

  listTurns(): StoredTurn[] {
    return databaseRows(
      this.database,
      `SELECT ${TURN_COLUMNS} FROM turns ORDER BY created_at, rowid`,
    ).map(turnFromDatabase);
  }

  markTurnDispatching(record: StoredTurn, session: StoredSession): void {
    validateTurnRecord(record);
    validateRecord(session);
    if (
      record.status !== "dispatching" ||
      !session.historyExpected ||
      record.sessionId !== session.id
    ) {
      throw new TypeError(
        "Dispatch marking requires a dispatching turn and its history-expected session.",
      );
    }
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.update(session);
      this.updateTurn(record);
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
  }

  interruptTurns(now: number): void {
    if (!Number.isSafeInteger(now))
      throw new TypeError("Turn interruption time must be a safe integer.");
    this.database
      .prepare(
        "UPDATE turns SET status = 'interrupted', updated_at = CASE WHEN updated_at > ? THEN updated_at ELSE ? END, error_code = CASE WHEN status = 'accepted' THEN 'not_dispatched' ELSE 'outcome_unknown' END, error_message = CASE WHEN status = 'accepted' THEN 'Host stopped before dispatch; the prompt was not sent.' ELSE 'Turn execution was interrupted by host restart; the outcome is unknown.' END WHERE status IN ('accepted', 'dispatching', 'running')",
      )
      .run(now, now);
  }

  close(): void {
    if (this.database.isOpen) this.database.close();
  }
}
