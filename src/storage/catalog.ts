import { constants } from "node:fs";
import { open as openFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import { createPrivateFile, prepareDataDirectory } from "../local/files.ts";
import { hasCode } from "../local/paths.ts";
import type { RuntimeConfiguration } from "../shared/sessions.ts";

export interface StoredSession {
  id: string;
  requestId: string;
  payloadIdentity: string;
  directory: string;
  provider: string;
  model: string;
  piSessionId: string;
  piSessionFile: string | null;
  historyExpected: boolean;
  status: "creating" | "ready" | "failed" | "interrupted";
  createdAt: number;
  updatedAt: number;
  error: string | null;
}

const SCHEMA_VERSION = 1;
const DATABASE_NAME = "catalog.sqlite";
const SESSION_COLUMNS = `
  id, request_id, payload_identity, directory, provider, model, pi_session_id,
  pi_session_file, history_expected, status, created_at, updated_at, error
`;

const CONFIGURATION_SCHEMA =
  "CREATE TABLE runtime_configuration (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), executable TEXT NOT NULL CHECK (length(executable) > 0), entry_point TEXT CHECK (entry_point IS NULL OR length(entry_point) > 0)) STRICT";
const SESSIONS_SCHEMA =
  "CREATE TABLE sessions (id TEXT NOT NULL PRIMARY KEY CHECK (length(id) > 0), request_id TEXT NOT NULL UNIQUE CHECK (length(request_id) > 0), payload_identity TEXT NOT NULL CHECK (length(payload_identity) > 0), directory TEXT NOT NULL CHECK (length(directory) > 0), provider TEXT NOT NULL CHECK (length(provider) > 0), model TEXT NOT NULL CHECK (length(model) > 0), pi_session_id TEXT NOT NULL CHECK (length(pi_session_id) > 0), pi_session_file TEXT CHECK (pi_session_file IS NULL OR length(pi_session_file) > 0), history_expected INTEGER NOT NULL CHECK (history_expected IN (0, 1)), status TEXT NOT NULL CHECK (status IN ('creating', 'ready', 'failed', 'interrupted')), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error TEXT) STRICT";

const SESSION_STATUSES = new Set(["creating", "ready", "failed", "interrupted"]);

function isSessionStatus(value: unknown): value is StoredSession["status"] {
  return typeof value === "string" && SESSION_STATUSES.has(value);
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
  if (Object.keys(value).length !== 13) {
    return false;
  }
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.requestId) &&
    isNonEmptyString(value.payloadIdentity) &&
    isNonEmptyString(value.directory) &&
    isNonEmptyString(value.provider) &&
    isNonEmptyString(value.model) &&
    isNonEmptyString(value.piSessionId) &&
    isNullableNonEmptyString(value.piSessionFile) &&
    typeof value.historyExpected === "boolean" &&
    isSessionStatus(value.status) &&
    isSafeIntegerValue(value.createdAt) &&
    isSafeIntegerValue(value.updatedAt) &&
    (value.error === null || typeof value.error === "string")
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
    provider: stringFromDatabase(row, "provider"),
    model: stringFromDatabase(row, "model"),
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

function verifySchema(database: DatabaseSync): void {
  const rows = databaseRows(
    database,
    "SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  if (
    rows.length !== 2 ||
    rows[0]?.type !== "table" ||
    rows[0]?.name !== "runtime_configuration" ||
    rows[0]?.sql !== CONFIGURATION_SCHEMA ||
    rows[1]?.type !== "table" ||
    rows[1]?.name !== "sessions" ||
    rows[1]?.sql !== SESSIONS_SCHEMA
  ) {
    throw invalidCatalog("schema does not match version 1");
  }
}

function initializeSchema(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    const versionRow = database.prepare("PRAGMA user_version").get();
    if (!versionRow) throw invalidCatalog("schema version is missing");
    const version = integerFromDatabase(versionRow, "user_version");

    if (version === 0) {
      if (hasUserSchema(database)) throw invalidCatalog("unversioned schema is not empty");
      database.exec(CONFIGURATION_SCHEMA);
      database.exec(SESSIONS_SCHEMA);
      database.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    } else if (version !== SCHEMA_VERSION) {
      throw invalidCatalog(`unsupported schema version ${version}`);
    }

    verifySchema(database);
    database.exec("COMMIT");
  } catch (error) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
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
      return new SessionCatalog(database);
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
        "INSERT INTO sessions (id, request_id, payload_identity, directory, provider, model, pi_session_id, pi_session_file, history_expected, status, created_at, updated_at, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
      );
  }

  update(record: StoredSession): void {
    validateRecord(record);
    const result = this.database
      .prepare(
        "UPDATE sessions SET request_id = ?, payload_identity = ?, directory = ?, provider = ?, model = ?, pi_session_id = ?, pi_session_file = ?, history_expected = ?, status = ?, created_at = ?, updated_at = ?, error = ? WHERE id = ?",
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

  close(): void {
    if (this.database.isOpen) this.database.close();
  }
}
