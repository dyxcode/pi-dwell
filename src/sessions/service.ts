import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { prepareDataDirectory } from "../local/files.ts";
import { hasCode } from "../local/paths.ts";
import { HistoryReadError, readSavedHistory } from "../runtime/pi-history.ts";
import { type PiEntry, PiProcess, verifyPiConfiguration } from "../runtime/pi-process.ts";
import { isRecord, RpcCommandError } from "../runtime/pi-rpc.ts";
import {
  discoverPiModels,
  listHostDirectories,
  SessionDiscoveryError,
} from "../server/session-discovery.ts";
import type { HostDirectoryListing, PiModelOption } from "../shared/discovery.ts";
import type { StreamFrame } from "../shared/events.ts";
import type { HistoryPage } from "../shared/history.ts";
import {
  type RuntimeConfiguration,
  SESSION_ID,
  type SessionCreateRequest,
  type SessionInfo,
  type SessionModelRequest,
} from "../shared/sessions.ts";
import { isTurnCreateRequest, type TurnCreateRequest, type TurnInfo } from "../shared/turns.ts";
import { SessionCatalog, type StoredSession, type StoredTurn } from "../storage/catalog.ts";
import {
  InvalidCursorError,
  SessionEvents,
  StreamCapacityError,
  SubscriberLimitError,
} from "./events.ts";
import { HistoryPages } from "./history.ts";

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
  /** Internal deterministic fault-test barrier; never exposed to clients. */
  turnCheckpoint?: (
    point: "accepted" | "dispatching" | "running" | "settled",
    turn: TurnInfo,
  ) => Promise<void>;
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

interface ActiveTurn {
  sessionId: string;
  runId: string;
  done: Promise<void>;
  runtime?: PiProcess;
  dispatched: boolean;
  abort?: Promise<void>;
  abortFailed: boolean;
  historyMaterialized: boolean;
}

function turnView(turn: StoredTurn): TurnInfo {
  const { payloadIdentity: _identity, ...view } = turn;
  return view;
}

function active(turn: TurnInfo): boolean {
  return ["accepted", "dispatching", "running"].includes(turn.status);
}

/** Durable session/turn identities and host-owned runtime execution. */
export class SessionService {
  readonly #catalog: SessionCatalog;
  readonly #dataDir: string;
  readonly #env: NodeJS.ProcessEnv;
  readonly #extensions: readonly string[];
  readonly #now: () => number;
  readonly #runtimes = new Map<string, PiProcess>();
  readonly #runtimeObservers = new Map<string, () => void>();
  readonly #turns = new Map<string, ActiveTurn>();
  readonly #storageFaults = new Set<string>();
  readonly #events = new SessionEvents();
  readonly #historyPages = new HistoryPages();
  readonly #reads = new Set<Promise<unknown>>();
  #modelDiscovery: Promise<PiModelOption[]> | undefined;
  readonly #checkpoint: SessionServiceOptions["turnCheckpoint"];
  #queue: Promise<void> = Promise.resolve();
  #stopping = false;
  #shutdown: Promise<void> | undefined;

  private constructor(catalog: SessionCatalog, dataDir: string, options: SessionServiceOptions) {
    this.#catalog = catalog;
    this.#dataDir = dataDir;
    this.#env = { ...(options.env ?? process.env), PI_OFFLINE: "1" };
    this.#extensions = options.extensions ?? [];
    this.#now = options.now ?? Date.now;
    this.#checkpoint = options.turnCheckpoint;
  }

  static async create(options: SessionServiceOptions): Promise<SessionService> {
    const dataDir = await prepareDataDirectory(options.dataDir);
    const catalog = await SessionCatalog.open(dataDir);
    try {
      for (const stored of catalog.list()) validateStored(stored);
      catalog.listTurns(); // Validate durable turn identities before recovery.
      catalog.interruptCreating((options.now ?? Date.now)());
      catalog.interruptTurns((options.now ?? Date.now)());
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
      if (this.#runtimes.size > 0 || this.#turns.size > 0)
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

  listDirectories(path?: string): Promise<HostDirectoryListing> {
    try {
      this.#admit();
    } catch (error) {
      return Promise.reject(error);
    }
    const home =
      this.#env.HOME ?? (process.platform === "win32" ? this.#env.USERPROFILE : undefined);
    if (path === undefined && !home)
      return Promise.reject(
        new SessionError(
          503,
          "home_directory_unavailable",
          "Dwell could not determine the host home directory.",
        ),
      );
    return listHostDirectories(path, home ?? "").catch((error: unknown) => {
      if (error instanceof SessionDiscoveryError)
        throw new SessionError(error.status, error.code, error.message);
      throw error;
    });
  }

  listAvailableModels(): Promise<PiModelOption[]> {
    try {
      this.#admit();
      const configuration = this.#configuration();
      if (this.#modelDiscovery) return this.#modelDiscovery;
      const discovery = discoverPiModels(configuration, this.#env).catch((error: unknown) => {
        if (error instanceof SessionDiscoveryError)
          throw new SessionError(error.status, error.code, error.message);
        throw error;
      });
      this.#modelDiscovery = discovery;
      void discovery.then(
        () => {
          if (this.#modelDiscovery === discovery) this.#modelDiscovery = undefined;
        },
        () => {
          if (this.#modelDiscovery === discovery) this.#modelDiscovery = undefined;
        },
      );
      return discovery;
    } catch (error) {
      return Promise.reject(error);
    }
  }

  subscribeEvents(
    id: string,
    cursor: string | undefined,
    listener: (frame: StreamFrame) => void,
  ): { initial: StreamFrame[]; unsubscribe(): void } {
    this.#admit();
    const session = this.#view(this.#stored(id));
    this.#checkStorage(id);
    const current = session.activeTurnId
      ? this.#catalog.getTurn(id, session.activeTurnId)
      : undefined;
    const latest = this.#catalog.latestTurn(id);
    try {
      return this.#events.connect(
        session,
        current ? turnView(current) : null,
        latest ? turnView(latest) : null,
        cursor,
        listener,
      );
    } catch (error) {
      if (error instanceof InvalidCursorError)
        throw new SessionError(400, "invalid_cursor", error.message);
      if (error instanceof SubscriberLimitError)
        throw new SessionError(429, "subscriber_limit", error.message);
      if (error instanceof StreamCapacityError)
        throw new SessionError(503, "stream_unavailable", error.message);
      throw error;
    }
  }

  #publishState(id: string, withTurn = false): void {
    try {
      const session = this.#view(this.#stored(id));
      if (withTurn) {
        const current = session.activeTurnId
          ? this.#catalog.getTurn(id, session.activeTurnId)
          : undefined;
        const latest = this.#catalog.latestTurn(id);
        this.#events.publishTurn(
          session,
          current ? turnView(current) : null,
          latest ? turnView(latest) : null,
        );
      } else this.#events.publishSession(session);
    } catch {
      this.#events.fail(
        id,
        "state_unavailable",
        "Session observation could not be synchronized. Reconnect to refresh state.",
      );
    }
  }

  #storageFault(id: string): void {
    if (this.#storageFaults.has(id)) return;
    this.#storageFaults.add(id);
    this.#events.fail(
      id,
      "storage_unavailable",
      "Durable state could not be saved. Execution will not be replayed; repair storage and restart the host.",
    );
  }

  createSession(request: SessionCreateRequest): Promise<SessionInfo> {
    return this.#mutate(async () => {
      const provider = request.provider;
      const model = request.model;
      const validModelSelection =
        (provider === undefined && model === undefined) ||
        (typeof provider === "string" &&
          provider.length > 0 &&
          provider.length <= 200 &&
          typeof model === "string" &&
          model.length > 0 &&
          model.length <= 300);
      if (
        !SESSION_ID.test(request.requestId) ||
        !isAbsolute(request.directory) ||
        request.directory.length > 4096 ||
        !validModelSelection
      )
        throw new SessionError(
          400,
          "invalid_input",
          "Provide a request UUID and absolute directory, with both provider and model or neither.",
        );
      // Compare the original admitted payload before touching the filesystem: retries remain identifiable after directory removal.
      const identity = createHash("sha256")
        .update(JSON.stringify([request.directory, provider ?? null, model ?? null]))
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
        provider: typeof provider === "string" ? provider : null,
        model: typeof model === "string" ? model : null,
        piSessionId: randomUUID(),
        piSessionFile: null,
        historyExpected: false,
        status: "creating",
        createdAt: now,
        updatedAt: now,
        error: null,
      };
      this.#catalog.insert(stored); // Admission is durable before any child is launched.
      this.#publishState(stored.id);
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
        this.#publishState(failed.id);
        return this.#view(failed);
      }
    });
  }

  setSessionModel(id: string, request: SessionModelRequest): Promise<SessionInfo> {
    return this.#mutate(async () => {
      if (
        typeof request.provider !== "string" ||
        request.provider.length === 0 ||
        request.provider.length > 200 ||
        typeof request.model !== "string" ||
        request.model.length === 0 ||
        request.model.length > 300
      )
        throw new SessionError(
          400,
          "invalid_input",
          "Provide a non-empty provider and model within their length limits.",
        );

      const stored = this.#stored(id);
      this.#checkStorage(id);
      if (stored.status !== "ready")
        throw new SessionError(409, "session_not_ready", "Only a ready session can change model.");
      if (this.#turns.has(id))
        throw new SessionError(409, "session_busy", "Abort active work before changing model.");
      if (stored.provider === request.provider && stored.model === request.model)
        return this.#view(stored);

      await this.#open(stored);
      const runtime = this.#runtimes.get(id);
      if (runtime?.state !== "ready")
        throw new SessionError(409, "session_busy", "The session is not idle.");

      let selected: { provider: string; model: string };
      try {
        selected = await runtime.setModel(request.provider, request.model);
        const state = await runtime.getState();
        if (
          state.sessionId !== stored.piSessionId ||
          !state.model ||
          state.model.provider !== selected.provider ||
          state.model.id !== selected.model
        )
          throw new Error("Pi did not confirm the selected session model.");
      } catch (error) {
        this.#runtimeObservers.get(id)?.();
        this.#runtimeObservers.delete(id);
        this.#runtimes.delete(id);
        try {
          await runtime.stop();
        } catch {
          /* An unconfirmed model must not keep running under stale metadata. */
        }
        this.#publishState(id);
        if (
          error instanceof RpcCommandError &&
          error.command === "set_model" &&
          /^(Model not found:|No API key for )/u.test(error.rejection)
        )
          throw new SessionError(
            400,
            "model_unavailable",
            "Pi could not select the requested provider and model. The session was closed safely.",
          );
        if (error instanceof SessionError) throw error;
        throw new SessionError(
          503,
          "model_change_failed",
          "Pi could not confirm the model change. The session was closed safely; reopen before continuing.",
        );
      }

      const updated: StoredSession = {
        ...this.#stored(id),
        provider: selected.provider,
        model: selected.model,
        updatedAt: this.#now(),
        error: null,
      };
      try {
        this.#catalog.update(updated);
      } catch {
        this.#storageFault(id);
        this.#runtimeObservers.get(id)?.();
        this.#runtimeObservers.delete(id);
        this.#runtimes.delete(id);
        try {
          await runtime.stop();
        } catch {
          /* A failed save must not keep an unrecorded model running. */
        }
        throw new SessionError(
          503,
          "storage_unavailable",
          "The selected model could not be saved. Repair storage and restart the host.",
        );
      }
      this.#publishState(id);
      return this.#view(updated);
    });
  }

  openSession(id: string): Promise<SessionInfo> {
    return this.#mutate(() => this.#open(this.#stored(id)));
  }

  closeSession(id: string): Promise<SessionInfo> {
    return this.#mutate(async () => {
      const stored = this.#stored(id);
      if (this.#turns.has(id))
        throw new SessionError(
          409,
          "session_busy",
          "Abort active work before closing its runtime.",
        );
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
        this.#runtimeObservers.get(id)?.();
        this.#runtimeObservers.delete(id);
        this.#runtimes.delete(id);
      }
      this.#publishState(id);
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

  getHistory(id: string, cursor?: string): Promise<HistoryPage> {
    return this.#read(async () => {
      const stored = this.#stored(id);
      const file = await this.#history(stored);
      if (!file) {
        const slot = this.#turns.get(id);
        const pending =
          slot !== undefined &&
          !slot.historyMaterialized &&
          active(this.#storedTurn(id, slot.runId));
        if (stored.historyExpected && !pending)
          throw new SessionError(410, "history_unavailable", HISTORY_UNAVAILABLE);
        if (cursor !== undefined)
          throw new SessionError(400, "invalid_cursor", "No saved history exists for this cursor.");
        const session = this.#view(this.#stored(id));
        return {
          sessionId: id,
          status: pending ? "pending" : "empty",
          revision: null,
          leafId: null,
          entries: [],
          nextCursor: null,
          incompleteTail: false,
          activeTurnId: session.activeTurnId,
          latestTurnId: session.latestTurnId,
          coveredTurnId: null,
        };
      }
      const slot = this.#turns.get(id);
      if (slot) slot.historyMaterialized = true;
      const slice = await this.#historyPages.read({
        sessionId: id,
        file,
        piSessionId: stored.piSessionId,
        directory: stored.directory,
        ...(cursor === undefined ? {} : { cursor }),
      });
      const session = this.#view(this.#stored(id));
      const latest = this.#catalog.latestTurn(id);
      const covered =
        !this.#storageFaults.has(id) &&
        latest &&
        !active(latest) &&
        latest.entryIds.length > 0 &&
        latest.entryIds.every((entryId) => slice.branchIds.has(entryId));
      return {
        sessionId: id,
        status: "available",
        revision: slice.history.revision,
        leafId: slice.history.leafId,
        entries: slice.entries,
        nextCursor: slice.nextCursor,
        incompleteTail: slice.history.incompleteTail,
        activeTurnId: session.activeTurnId,
        latestTurnId: session.latestTurnId,
        coveredTurnId: covered && latest ? latest.runId : null,
      };
    });
  }

  submitTurn(
    id: string,
    request: TurnCreateRequest,
  ): Promise<{ turn: TurnInfo; created: boolean }> {
    return this.#mutate(async () => {
      this.#stored(id);
      if (!isTurnCreateRequest(request))
        throw new SessionError(
          400,
          "invalid_input",
          "Provide a request UUID and a nonempty plain-text message (no slash commands).",
        );
      const identity = createHash("sha256").update(request.message).digest("hex");
      const existing = this.#catalog.findTurnRequest(id, request.requestId);
      if (existing) {
        if (existing.payloadIdentity !== identity)
          throw new SessionError(
            409,
            "request_conflict",
            "This request ID was used with different content.",
          );
        this.#checkStorage(id);
        return { turn: turnView(existing), created: false };
      }
      this.#checkStorage(id);
      if (this.#turns.has(id) || this.#catalog.activeTurn(id))
        throw new SessionError(409, "session_busy", "The session is busy with another turn.");
      this.#configuration();
      const now = this.#now();
      const turn: StoredTurn = {
        runId: randomUUID(),
        sessionId: id,
        requestId: request.requestId,
        payloadIdentity: identity,
        status: "accepted",
        cancellationRequested: false,
        createdAt: now,
        updatedAt: now,
        error: null,
        entryIds: [],
      };
      this.#catalog.insertTurn(turn);
      let finish!: () => void;
      const done = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const slot: ActiveTurn = {
        sessionId: id,
        runId: turn.runId,
        done,
        dispatched: false,
        abortFailed: false,
        historyMaterialized: this.#stored(id).historyExpected,
      };
      this.#turns.set(id, slot);
      this.#publishState(id, true);
      setImmediate(() => {
        void this.#executeTurn(slot, request.message)
          .catch(() => {
            this.#storageFault(id);
          })
          .finally(finish);
      });
      return { turn: turnView(turn), created: true };
    });
  }

  getTurn(id: string, runId: string): TurnInfo {
    this.#admit();
    this.#checkStorage(id);
    return turnView(this.#storedTurn(id, runId));
  }

  getTurnResult(id: string, runId: string): Promise<{ runId: string; entries: PiEntry[] }> {
    return this.#read(async () => {
      this.#checkStorage(id);
      const turn = this.#storedTurn(id, runId);
      if (active(turn))
        throw new SessionError(409, "turn_pending", "The turn has not settled yet.");
      const stored = this.#stored(id);
      const file = await this.#history(stored);
      if (!turn.entryIds.length || !file)
        throw new SessionError(410, "result_unavailable", "Saved turn result is unavailable.");
      const { entries } = await readSavedHistory({
        file,
        piSessionId: stored.piSessionId,
        directory: stored.directory,
      });
      const byId = new Map(entries.map((entry) => [entry.id, entry]));
      const selected: PiEntry[] = [];
      for (const entryId of turn.entryIds) {
        const entry = byId.get(entryId);
        if (!entry)
          throw new SessionError(410, "result_unavailable", "Saved turn entries are unavailable.");
        selected.push(entry);
      }
      let serialized: string;
      try {
        serialized = JSON.stringify(selected);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        throw new SessionError(
          413,
          "result_limit",
          "Saved result is too deeply nested; use paginated history.",
        );
      }
      if (Buffer.byteLength(serialized) > 8 * 1024 * 1024)
        throw new SessionError(
          413,
          "result_limit",
          "Saved result exceeds the response limit; use paginated history.",
        );
      return { runId, entries: selected };
    });
  }

  async abortTurn(id: string, runId: string): Promise<TurnInfo> {
    this.#admit();
    const slot = this.#turns.get(id);
    try {
      this.#checkStorage(id);
      const turn = this.#storedTurn(id, runId);
      if (!active(turn)) return turnView(turn);
      if (!slot || slot.runId !== runId)
        throw new SessionError(409, "turn_interrupted", "The turn has no live execution owner.");
      this.#writeTurn({
        ...turn,
        cancellationRequested: true,
        status: slot.dispatched ? turn.status : "aborted",
        updatedAt: this.#now(),
      });
      if (slot.dispatched) await this.#abortRuntime(slot);
      return turnView(this.#storedTurn(id, runId));
    } catch (error) {
      // Persistence failure must not strand work behind a now-unusable cancel endpoint.
      if (
        slot?.runId === runId &&
        (!(error instanceof SessionError) || error.code === "storage_unavailable")
      ) {
        this.#storageFault(id);
        try {
          await slot.runtime?.stop();
        } catch {
          /* Preserve the storage error. */
        }
      }
      throw error;
    }
  }

  #storedTurn(id: string, runId: string): StoredTurn {
    this.#stored(id);
    if (!SESSION_ID.test(runId)) throw new SessionError(400, "invalid_input", "Invalid run ID.");
    const turn = this.#catalog.getTurn(id, runId);
    if (!turn) throw new SessionError(404, "turn_not_found", "Unknown turn in this session.");
    return turn;
  }

  #checkStorage(id: string): void {
    if (this.#storageFaults.has(id))
      throw new SessionError(
        503,
        "storage_unavailable",
        "Turn state could not be saved. Restart the host after repairing storage; execution will not be replayed.",
      );
  }

  #writeTurn(turn: StoredTurn): void {
    try {
      this.#catalog.updateTurn(turn);
      this.#publishState(turn.sessionId, true);
    } catch {
      this.#storageFault(turn.sessionId);
      throw new SessionError(
        503,
        "storage_unavailable",
        "Turn state could not be saved. Execution will not be replayed.",
      );
    }
  }

  #abortRuntime(slot: ActiveTurn): Promise<void> {
    if (slot.abort) return slot.abort;
    slot.abort = (async () => {
      try {
        await slot.runtime?.abort();
      } catch {
        slot.abortFailed = true;
        await slot.runtime?.stop();
      }
    })();
    // Observe immediately, including when shutdown requests cancellation without awaiting it.
    void slot.abort.catch(() => {});
    return slot.abort;
  }

  async #executeTurn(slot: ActiveTurn, message: string): Promise<void> {
    const id = slot.sessionId;
    let markedHistory = false;
    let historyWasExpected = false;
    let unobserve: (() => void) | undefined;
    try {
      await this.#checkpoint?.("accepted", turnView(this.#storedTurn(id, slot.runId)));
      this.#checkStorage(id);
      if (!active(this.#storedTurn(id, slot.runId))) return;
      await this.#mutate(() => this.#open(this.#stored(id)));
      const runtime = this.#runtimes.get(id);
      if (!runtime)
        throw new SessionError(503, "runtime_unavailable", "Pi runtime is unavailable.");
      slot.runtime = runtime;
      this.#checkStorage(id);
      const source = this.#stored(id);
      if (source.historyExpected && !(await this.#history(source))) {
        this.#catalog.update({ ...source, error: HISTORY_UNAVAILABLE, updatedAt: this.#now() });
        this.#publishState(id);
        throw new SessionError(410, "history_unavailable", HISTORY_UNAVAILABLE);
      }
      const before = new Set((await runtime.getEntries()).entries.map((entry) => entry.id));
      let turn = this.#storedTurn(id, slot.runId);
      if (!active(turn)) return;
      const stored = this.#stored(id);
      historyWasExpected = stored.historyExpected;
      turn = { ...turn, status: "dispatching", updatedAt: this.#now() };
      this.#catalog.markTurnDispatching(turn, {
        ...stored,
        historyExpected: true,
        updatedAt: this.#now(),
      });
      markedHistory = true;
      this.#publishState(id, true);
      await this.#checkpoint?.("dispatching", turnView(turn));
      turn = this.#storedTurn(id, slot.runId);
      this.#checkStorage(id);
      if (!active(turn)) return;
      if (this.#stopping || turn.cancellationRequested) {
        this.#writeTurn({
          ...turn,
          status: "aborted",
          cancellationRequested: true,
          updatedAt: this.#now(),
        });
        return;
      }
      this.#events.beginTurn(id, slot.runId);
      unobserve = runtime.subscribe(
        (event) => {
          this.#events.observe(id, slot.runId, event);
        },
        { interactive: false },
      );
      slot.dispatched = true;
      const run = runtime.startRun(message);
      const disposition = await run.accepted;
      if (disposition === "handled") {
        await runtime.stop();
        throw new SessionError(
          409,
          "unsupported_prompt",
          "An extension handled the prompt; its execution outcome is not tracked by this plain-text turn API.",
        );
      }
      this.#writeTurn({
        ...this.#storedTurn(id, slot.runId),
        status: "running",
        updatedAt: this.#now(),
      });
      await this.#checkpoint?.("running", turnView(this.#storedTurn(id, slot.runId)));
      const result = await run.settled;
      await this.#checkpoint?.("settled", turnView(this.#storedTurn(id, slot.runId)));
      if (slot.abort) await slot.abort;
      if (slot.abortFailed) throw new Error("Cancellation outcome is uncertain.");
      const entries = (await runtime.getEntries()).entries.filter((entry) => !before.has(entry.id));
      await this.#rememberHistory(this.#stored(id), runtime);
      this.#writeTurn({
        ...this.#storedTurn(id, slot.runId),
        status: result.outcome === "handled" ? "interrupted" : result.outcome,
        entryIds: entries.map((entry) => entry.id),
        updatedAt: this.#now(),
        error:
          result.outcome === "failed"
            ? { code: "provider_error", message: result.error ?? "Pi execution failed." }
            : null,
      });
    } catch (error) {
      const rejectedPrompt = error instanceof RpcCommandError && error.command === "prompt";
      try {
        const turn = this.#storedTurn(id, slot.runId);
        if (active(turn))
          this.#writeTurn({
            ...turn,
            status: slot.dispatched && !rejectedPrompt ? "interrupted" : "failed",
            updatedAt: this.#now(),
            error: {
              code:
                error instanceof SessionError
                  ? error.code
                  : slot.dispatched && !rejectedPrompt
                    ? "outcome_unknown"
                    : "execution_rejected",
              message:
                error instanceof SessionError
                  ? error.message
                  : "Execution did not complete reliably. No automatic retry was performed.",
            },
          });
      } catch {
        this.#storageFault(id);
      }
      if (slot.dispatched || this.#storageFaults.has(id)) {
        try {
          await slot.runtime?.stop();
        } catch {
          /* Slot remains held through cleanup. */
        }
      }
    } finally {
      // A known cancellation before sending cannot have created a new transcript.
      if (markedHistory && !slot.dispatched && !historyWasExpected) {
        try {
          this.#catalog.update({
            ...this.#stored(id),
            historyExpected: false,
            updatedAt: this.#now(),
          });
        } catch {
          this.#storageFault(id);
        }
      }
      if (slot.abort) {
        try {
          await slot.abort;
        } catch {
          /* The runtime is already being stopped. */
        }
      }
      unobserve?.();
      if (this.#turns.get(id) === slot) this.#turns.delete(id);
      this.#events.endTurn(id, slot.runId);
      this.#publishState(id, true);
    }
  }

  shutdown(): Promise<void> {
    if (this.#shutdown) return this.#shutdown;
    this.#stopping = true;
    this.#shutdown = (async () => {
      await this.#queue;
      let failed = false;
      const slots = [...this.#turns.values()];
      for (const slot of slots) {
        try {
          const turn = this.#storedTurn(slot.sessionId, slot.runId);
          if (active(turn))
            this.#writeTurn({
              ...turn,
              cancellationRequested: true,
              status: slot.dispatched ? turn.status : "aborted",
              updatedAt: this.#now(),
            });
          if (slot.dispatched) void this.#abortRuntime(slot).catch(() => {});
        } catch {
          failed = true;
        }
      }
      // Stop uses stdin EOF and bounded TERM/KILL escalation, concurrently across children.
      await Promise.all(
        [...this.#runtimes.values()].map(async (runtime) => {
          try {
            await runtime.stop();
          } catch {
            failed = true;
          }
        }),
      );
      await Promise.all(slots.map((slot) => slot.done));
      for (const unobserve of this.#runtimeObservers.values()) unobserve();
      this.#runtimeObservers.clear();
      this.#runtimes.clear();
      this.#events.close();
      await Promise.allSettled([
        ...this.#reads,
        ...(this.#modelDiscovery ? [this.#modelDiscovery] : []),
      ]);
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

  #read<T>(operation: () => Promise<T>): Promise<T> {
    try {
      this.#admit();
      if (this.#reads.size >= 2)
        throw new SessionError(
          429,
          "history_busy",
          "Two history reads are already active. Try again shortly.",
        );
    } catch (error) {
      return Promise.reject(error);
    }
    const result = Promise.resolve()
      .then(operation)
      .catch((error: unknown) => {
        if (error instanceof HistoryReadError)
          throw new SessionError(error.status, error.code, error.message);
        throw error;
      });
    this.#reads.add(result);
    void result.then(
      () => this.#reads.delete(result),
      () => this.#reads.delete(result),
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
      error: this.#storageFaults.has(stored.id)
        ? "Turn state could not be saved. Repair storage and restart the host."
        : stored.error,
      activeTurnId:
        this.#turns.get(stored.id)?.runId ?? this.#catalog.activeTurn(stored.id)?.runId ?? null,
      latestTurnId: this.#catalog.latestTurn(stored.id)?.runId ?? null,
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
        this.#runtimeObservers.get(id)?.();
        this.#runtimeObservers.delete(id);
        this.#runtimes.delete(id);
        this.#publishState(id);
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
      this.#publishState(stored.id);
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
        ...(stored.provider !== null && stored.model !== null
          ? { provider: stored.provider, model: stored.model }
          : {}),
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
        !state.model ||
        (stored.provider !== null && state.model.provider !== stored.provider) ||
        (stored.model !== null && state.model.id !== stored.model) ||
        !state.sessionFile
      )
        throw new SessionError(
          503,
          "runtime_mismatch",
          "Pi did not use the requested session and model selection.",
        );
      const ready: StoredSession = {
        ...stored,
        provider: state.model.provider,
        model: state.model.id,
        status: "ready",
        updatedAt: this.#now(),
        error: null,
        piSessionFile: state.sessionFile,
        historyExpected: stored.historyExpected || resumeFile !== undefined,
      };
      this.#catalog.update(ready);
      this.#runtimes.set(stored.id, runtime);
      this.#runtimeObservers.set(
        stored.id,
        runtime.subscribeState(() => {
          this.#publishState(stored.id);
        }),
      );
      this.#publishState(stored.id);
      return this.#view(ready);
    } catch (error) {
      await runtime.stop();
      throw error;
    }
  }

  async #rememberHistory(stored: StoredSession, runtime: PiProcess): Promise<void> {
    if (runtime.state === "failed" || runtime.state === "exited") return;
    const state = await runtime.getState();
    const current = {
      ...this.#stored(stored.id),
      piSessionFile: state.sessionFile ?? stored.piSessionFile,
    };
    const file = await this.#history(current);
    const latest = this.#stored(stored.id);
    try {
      this.#catalog.update({
        ...latest,
        piSessionFile: current.piSessionFile,
        historyExpected: latest.historyExpected || file !== undefined,
        error: latest.historyExpected && file === undefined ? HISTORY_UNAVAILABLE : latest.error,
        updatedAt: this.#now(),
      });
      this.#publishState(stored.id);
    } catch {
      this.#storageFault(stored.id);
      throw new SessionError(
        503,
        "storage_unavailable",
        "Session history metadata could not be saved.",
      );
    }
  }
}
