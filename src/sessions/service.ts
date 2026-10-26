import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { prepareDataDirectory } from "../local/files.ts";
import { hasCode } from "../local/paths.ts";
import { PiProcess, verifyPiConfiguration } from "../runtime/pi-process.ts";
import { isRecord } from "../runtime/pi-rpc.ts";
import {
  type RuntimeConfiguration,
  SESSION_ID,
  type SessionCreateRequest,
  type SessionInfo,
} from "../shared/sessions.ts";
import { SessionCatalog, type StoredSession } from "../storage/catalog.ts";

export class SessionError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface SessionServiceOptions {
  dataDir: string;
  /** Explicit embedding/test environment and resources; public clients cannot set them. */
  env?: NodeJS.ProcessEnv;
  extensions?: readonly string[];
  now?: () => number;
}

const HISTORY_UNAVAILABLE = "Saved session history is unavailable.";
const MAX_OPEN_SESSIONS = 8;

function validateStored(stored: StoredSession): void {
  if (
    !SESSION_ID.test(stored.id) ||
    !SESSION_ID.test(stored.requestId) ||
    !SESSION_ID.test(stored.piSessionId) ||
    !isAbsolute(stored.directory) ||
    (stored.piSessionFile !== null && !isAbsolute(stored.piSessionFile))
  ) {
    throw new SessionError(
      500,
      "invalid_catalog",
      "Session catalog contains invalid identities or paths.",
    );
  }
}

/** Durable session identities and live runtime ownership; no turn submission yet. */
export class SessionService {
  readonly #catalog: SessionCatalog;
  readonly #dataDir: string;
  readonly #env: NodeJS.ProcessEnv;
  readonly #extensions: readonly string[];
  readonly #now: () => number;
  readonly #runtimes = new Map<string, PiProcess>();
  #queue: Promise<void> = Promise.resolve();
  #stopping = false;
  #shutdown: Promise<void> | undefined;

  private constructor(catalog: SessionCatalog, dataDir: string, options: SessionServiceOptions) {
    this.#catalog = catalog;
    this.#dataDir = dataDir;
    this.#env = { ...(options.env ?? process.env), PI_OFFLINE: "1" };
    this.#extensions = options.extensions ?? [];
    this.#now = options.now ?? Date.now;
  }

  static async create(options: SessionServiceOptions): Promise<SessionService> {
    const dataDir = await prepareDataDirectory(options.dataDir);
    const catalog = await SessionCatalog.open(dataDir);
    try {
      for (const stored of catalog.list()) validateStored(stored);
      catalog.interruptCreating((options.now ?? Date.now)());
    } catch (error) {
      catalog.close();
      throw error;
    }
    return new SessionService(catalog, dataDir, options);
  }

  get runtimeCount(): number {
    return this.#runtimes.size;
  }

  configure(configuration: RuntimeConfiguration): Promise<RuntimeConfiguration> {
    return this.#mutate(async () => {
      if (this.#runtimes.size > 0)
        throw new SessionError(
          409,
          "runtime_busy",
          "Close the open sessions before changing Pi configuration.",
        );
      let verified: RuntimeConfiguration;
      try {
        verified = await verifyPiConfiguration(configuration, this.#dataDir, this.#env);
      } catch (error) {
        throw new SessionError(
          400,
          "invalid_runtime",
          error instanceof Error ? error.message : "Invalid Pi executable.",
        );
      }
      this.#catalog.configure(verified);
      return verified;
    });
  }

  listSessions(): SessionInfo[] {
    this.#admit();
    return this.#catalog.list().map((stored) => this.#view(stored));
  }

  getSession(id: string): SessionInfo {
    this.#admit();
    return this.#view(this.#stored(id));
  }

  createSession(request: SessionCreateRequest): Promise<SessionInfo> {
    return this.#mutate(async () => {
      if (
        !SESSION_ID.test(request.requestId) ||
        !isAbsolute(request.directory) ||
        request.directory.length > 4096 ||
        !request.provider ||
        request.provider.length > 200 ||
        !request.model ||
        request.model.length > 300
      )
        throw new SessionError(
          400,
          "invalid_input",
          "Provide a request UUID, absolute directory, provider, and model.",
        );
      // Compare the original admitted payload before touching the filesystem: retries remain identifiable after directory removal.
      const identity = createHash("sha256")
        .update(JSON.stringify([request.directory, request.provider, request.model]))
        .digest("hex");
      const existing = this.#catalog.findRequest(request.requestId);
      if (existing) {
        if (existing.payloadIdentity !== identity)
          throw new SessionError(
            409,
            "request_conflict",
            "This request ID was used with different session settings.",
          );
        return this.#view(existing);
      }
      this.#configuration();
      const directory = await this.#directory(request.directory);
      await this.#prune();
      if (this.#runtimes.size >= MAX_OPEN_SESSIONS)
        throw new SessionError(
          409,
          "session_limit",
          "Close an idle session before opening another (limit: 8).",
        );
      const now = this.#now();
      const stored: StoredSession = {
        id: randomUUID(),
        requestId: request.requestId,
        payloadIdentity: identity,
        directory,
        provider: request.provider,
        model: request.model,
        piSessionId: randomUUID(),
        piSessionFile: null,
        historyExpected: false,
        status: "creating",
        createdAt: now,
        updatedAt: now,
        error: null,
      };
      this.#catalog.insert(stored); // Admission is durable before any child is launched.
      try {
        return await this.#open(stored);
      } catch (error) {
        const failed: StoredSession = {
          ...stored,
          status: "failed",
          updatedAt: this.#now(),
          error: error instanceof SessionError ? error.message : "Pi session startup failed.",
        };
        this.#catalog.update(failed);
        return this.#view(failed);
      }
    });
  }

  openSession(id: string): Promise<SessionInfo> {
    return this.#mutate(() => this.#open(this.#stored(id)));
  }

  closeSession(id: string): Promise<SessionInfo> {
    return this.#mutate(async () => {
      const stored = this.#stored(id);
      const runtime = this.#runtimes.get(id);
      if (runtime) {
        if (runtime.state === "running")
          throw new SessionError(
            409,
            "session_busy",
            "Abort active work before closing its runtime.",
          );
        await this.#rememberHistory(stored, runtime);
        await runtime.stop();
        this.#runtimes.delete(id);
      }
      return this.#view(this.#stored(id));
    });
  }

  getContext(id: string): Promise<{ messages: Record<string, unknown>[] }> {
    return this.#mutate(async () => {
      await this.#open(this.#stored(id));
      const runtime = this.#runtimes.get(id);
      if (!runtime)
        throw new SessionError(503, "runtime_unavailable", "Pi runtime is unavailable.");
      const messages = await runtime.getMessages();
      await this.#rememberHistory(this.#stored(id), runtime);
      return { messages };
    });
  }

  shutdown(): Promise<void> {
    if (this.#shutdown) return this.#shutdown;
    this.#stopping = true;
    this.#shutdown = (async () => {
      await this.#queue;
      let failed = false;
      for (const [id, runtime] of this.#runtimes) {
        try {
          await this.#rememberHistory(this.#stored(id), runtime);
        } catch {
          failed = true;
        }
        try {
          await runtime.stop();
        } catch {
          failed = true;
        }
      }
      this.#runtimes.clear();
      this.#catalog.close();
      if (failed) throw new Error("Session shutdown could not save all runtime metadata.");
    })();
    return this.#shutdown;
  }

  #configuration(): RuntimeConfiguration {
    const configuration = this.#catalog.configuration();
    if (!configuration)
      throw new SessionError(
        503,
        "runtime_unavailable",
        "Pi is not configured. Run pi configure from the local Dwell CLI.",
      );
    return configuration;
  }

  #admit(): void {
    if (this.#stopping)
      throw new SessionError(503, "shutting_down", "Dwell sessions are stopping.");
  }

  #mutate<T>(operation: () => Promise<T>): Promise<T> {
    try {
      this.#admit();
    } catch (error) {
      return Promise.reject(error);
    }
    const result = this.#queue.then(operation);
    this.#queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  #stored(id: string): StoredSession {
    if (!SESSION_ID.test(id)) throw new SessionError(400, "invalid_input", "Invalid session ID.");
    const stored = this.#catalog.get(id);
    if (!stored) throw new SessionError(404, "session_not_found", "Unknown Dwell session.");
    validateStored(stored);
    return stored;
  }

  #view(stored: StoredSession): SessionInfo {
    validateStored(stored);
    const state = this.#runtimes.get(stored.id)?.state;
    return {
      id: stored.id,
      directory: stored.directory,
      provider: stored.provider,
      model: stored.model,
      piSessionId: stored.piSessionId,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
      status: stored.status,
      runtimeState:
        state === "starting"
          ? "opening"
          : state === "stopping"
            ? "closing"
            : state === "ready" || state === "running"
              ? "ready"
              : state === "failed"
                ? "failed"
                : "closed",
      historyState:
        stored.error === HISTORY_UNAVAILABLE
          ? "unavailable"
          : stored.historyExpected
            ? "available"
            : "empty",
      error: stored.error,
    };
  }

  async #directory(path: string): Promise<string> {
    if (!isAbsolute(path))
      throw new SessionError(400, "invalid_directory", "Project directory must be absolute.");
    try {
      const canonical = await realpath(path);
      if ((await stat(canonical)).isDirectory()) return canonical;
    } catch {
      /* Normalize filesystem errors at the API boundary. */
    }
    throw new SessionError(
      400,
      "invalid_directory",
      "Select an existing project directory on the host.",
    );
  }

  async #prune(): Promise<void> {
    for (const [id, runtime] of this.#runtimes)
      if (runtime.state === "failed" || runtime.state === "exited") {
        await runtime.stop();
        this.#runtimes.delete(id);
      }
  }

  async #history(stored: StoredSession): Promise<string | undefined> {
    let source = stored.piSessionFile;
    if (!stored.historyExpected) {
      try {
        const files = (await readdir(join(this.#dataDir, "sessions", stored.id))).filter((name) =>
          name.endsWith(`_${stored.piSessionId}.jsonl`),
        );
        if (files.length > 1)
          throw new SessionError(
            409,
            "invalid_history",
            "Multiple files claim this session identity.",
          );
        if (files[0]) source = join(this.#dataDir, "sessions", stored.id, files[0]);
      } catch (error) {
        if (!hasCode(error, "ENOENT")) throw error;
      }
    }
    if (!source) return undefined;
    try {
      const path = await realpath(source);
      const directory = await realpath(join(this.#dataDir, "sessions", stored.id));
      const nested = relative(directory, path);
      if (nested.startsWith("..") || isAbsolute(nested))
        throw new Error("Session history escaped its owning directory.");
      const handle = await open(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const info = await handle.stat();
        if (!info.isFile()) throw new Error("Session history is not a regular file.");
        const buffer = Buffer.alloc(8192);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        const firstLine = buffer.subarray(0, bytesRead).toString("utf8").split("\n")[0];
        const header: unknown = JSON.parse(firstLine ?? "");
        if (
          !isRecord(header) ||
          header.type !== "session" ||
          header.id !== stored.piSessionId ||
          header.cwd !== stored.directory ||
          header.version !== 3
        )
          throw new Error("Session history identity is invalid.");
      } finally {
        await handle.close();
      }
      return path;
    } catch (error) {
      if (hasCode(error, "ENOENT")) return undefined;
      throw new SessionError(
        409,
        "invalid_history",
        "Saved session history is invalid or belongs to another project.",
      );
    }
  }

  async #open(stored: StoredSession): Promise<SessionInfo> {
    const existing = this.#runtimes.get(stored.id);
    if (existing && existing.state === "ready") return this.#view(stored);
    if (existing && existing.state === "running")
      throw new SessionError(409, "session_busy", "The session is running.");
    await this.#prune();
    if (this.#runtimes.size >= MAX_OPEN_SESSIONS)
      throw new SessionError(
        409,
        "session_limit",
        "Close an idle session before opening another (limit: 8).",
      );
    const configuration = this.#configuration();
    const directory = await this.#directory(stored.directory);
    if (directory !== stored.directory)
      throw new SessionError(
        409,
        "directory_changed",
        "The saved project directory now resolves to a different location.",
      );
    const resumeFile = await this.#history(stored);
    if (stored.historyExpected && !resumeFile) {
      this.#catalog.update({ ...stored, updatedAt: this.#now(), error: HISTORY_UNAVAILABLE });
      throw new SessionError(410, "history_unavailable", HISTORY_UNAVAILABLE);
    }
    let runtime: PiProcess;
    try {
      runtime = await PiProcess.start({
        ...configuration,
        cwd: directory,
        env: this.#env,
        sessionDirectory: join(this.#dataDir, "sessions", stored.id),
        ...(resumeFile ? { resumeFile } : { sessionId: stored.piSessionId }),
        provider: stored.provider,
        model: stored.model,
        extensions: this.#extensions,
      });
    } catch {
      throw new SessionError(
        503,
        "runtime_unavailable",
        "Pi session startup failed. Check the saved executable, provider, and model.",
      );
    }
    try {
      const state = await runtime.getState();
      if (
        state.sessionId !== stored.piSessionId ||
        state.model?.provider !== stored.provider ||
        state.model.id !== stored.model ||
        !state.sessionFile
      )
        throw new SessionError(
          503,
          "runtime_mismatch",
          "Pi did not use the requested session, provider, and model.",
        );
      const ready: StoredSession = {
        ...stored,
        status: "ready",
        updatedAt: this.#now(),
        error: null,
        piSessionFile: state.sessionFile,
        historyExpected: stored.historyExpected || resumeFile !== undefined,
      };
      this.#catalog.update(ready);
      this.#runtimes.set(stored.id, runtime);
      return this.#view(ready);
    } catch (error) {
      await runtime.stop();
      throw error;
    }
  }

  async #rememberHistory(stored: StoredSession, runtime: PiProcess): Promise<void> {
    if (runtime.state === "failed" || runtime.state === "exited") return;
    const state = await runtime.getState();
    const current = { ...stored, piSessionFile: state.sessionFile ?? stored.piSessionFile };
    const file = await this.#history(current);
    this.#catalog.update({
      ...current,
      historyExpected: stored.historyExpected || file !== undefined,
      error: stored.historyExpected && file === undefined ? HISTORY_UNAVAILABLE : stored.error,
      updatedAt: this.#now(),
    });
  }
}
