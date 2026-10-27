import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { prepareDataDirectory } from "../local/files.ts";
import { hasCode } from "../local/paths.ts";
import { savedMessageKeys } from "../runtime/message-identity.ts";
import { HistoryReadError, readSavedHistory, type SavedHistory } from "../runtime/pi-history.ts";
import {
  type NativeExecutionEvent,
  type PiEntry,
  PiProcess,
  verifyPiConfiguration,
} from "../runtime/pi-process.ts";
import { isRecord, RpcCommandError } from "../runtime/pi-rpc.ts";
import {
  discoverPiModelCapabilities,
  discoverPiModels,
  listHostDirectories,
  SessionDiscoveryError,
} from "../server/session-discovery.ts";
import type { HostDirectoryListing, PiModelOption } from "../shared/discovery.ts";
import type { StreamFrame } from "../shared/events.ts";
import type { HistoryPage } from "../shared/history.ts";
import type { ImageContent } from "../shared/images.ts";
import {
  isSessionModelRequest,
  type NativeExecutionInfo,
  type RuntimeConfiguration,
  SESSION_ID,
  type SessionCreateRequest,
  type SessionInfo,
  type SessionModelRequest,
} from "../shared/sessions.ts";
import {
  isModelCapabilitiesRequest,
  type ModelCapabilitiesRequest,
  type ModelCapabilitiesResponse,
  type ThinkingLevel,
} from "../shared/thinking.ts";
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

function turnPayloadIdentity(message: string, images: readonly ImageContent[]): string {
  const hash = createHash("sha256");
  if (images.length === 0) return hash.update(message).digest("hex");
  const canonicalImages = images.map((image) => ({
    type: image.type,
    mimeType: image.mimeType,
    data: image.data,
  }));
  hash.update(JSON.stringify({ version: 1, message, images: canonicalImages }));
  return hash.digest("hex");
}

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
  historyAbort: AbortController;
  runtime?: PiProcess;
  dispatched: boolean;
  abort?: Promise<void>;
  abortFailed: boolean;
  historyMaterialized: boolean;
}

interface HistoryIdentity {
  known: boolean;
  counts: Map<string, number>;
}

interface NativeExecutionRecord {
  info: NativeExecutionInfo;
  /** Full assistant identity counts captured immediately before this execution, when known. */
  messageBaseline?: Map<string, number>;
  expectedMessageKeys?: string[];
  coverageBlocked: boolean;
  coverageFromFile: boolean;
  settledLeafId?: string;
  abort?: Promise<void>;
}

interface NativeStateRefreshRequest {
  runtime: PiProcess;
  executionId: string;
}

interface NativeStateRefresh {
  pending: NativeStateRefreshRequest | undefined;
  promise: Promise<void>;
}

function isMessageAfterBaseline(key: string, baseline: ReadonlyMap<string, number>): boolean {
  const separator = key.lastIndexOf(":");
  if (separator < 0) return false;
  const digest = key.slice(0, separator);
  const occurrence = Number(key.slice(separator + 1));
  return (
    /^[a-f0-9]{64}$/.test(digest) &&
    Number.isSafeInteger(occurrence) &&
    occurrence > (baseline.get(digest) ?? 0)
  );
}

function messageKeysAfterBaseline(
  entries: readonly PiEntry[],
  baseline: ReadonlyMap<string, number>,
): string[] | undefined {
  const keys = [...savedMessageKeys(entries).keys.values()].filter((key) =>
    isMessageAfterBaseline(key, baseline),
  );
  return keys.length <= 1024 ? keys : undefined;
}

function messageKeyDelta(
  baseline: ReadonlyMap<string, number>,
  finalCounts: ReadonlyMap<string, number>,
): string[] | undefined {
  const keys: string[] = [];
  for (const [digest, finalCount] of finalCounts) {
    const first = (baseline.get(digest) ?? 0) + 1;
    if (finalCount < first - 1 || finalCount - first + 1 + keys.length > 1024) return undefined;
    for (let occurrence = first; occurrence <= finalCount; occurrence += 1)
      keys.push(`${digest}:${occurrence}`);
  }
  return keys;
}

function turnView(turn: StoredTurn): TurnInfo {
  const { payloadIdentity: _identity, ...view } = turn;
  return view;
}

function active(turn: TurnInfo): boolean {
  return ["accepted", "dispatching", "running"].includes(turn.status);
}

function truncateUtf8(value: string, maxBytes: number): string {
  let bytes = 0;
  let result = "";
  for (const character of value) {
    const size = Buffer.byteLength(character, "utf8");
    if (bytes + size > maxBytes) break;
    bytes += size;
    result += character;
  }
  return result;
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
  readonly #historyIdentity = new Map<string, HistoryIdentity>();
  readonly #nativeExecutions = new Map<string, NativeExecutionRecord>();
  readonly #nativeStateRefreshes = new Map<string, NativeStateRefresh>();
  readonly #turns = new Map<string, ActiveTurn>();
  readonly #storageFaults = new Set<string>();
  readonly #events = new SessionEvents();
  readonly #historyPages = new HistoryPages();
  readonly #reads = new Set<Promise<unknown>>();
  readonly #nativeRefreshes = new Set<Promise<void>>();
  readonly #shutdownController = new AbortController();
  #modelDiscovery: Promise<PiModelOption[]> | undefined;
  readonly #modelCapabilityDiscoveries = new Map<string, Promise<ModelCapabilitiesResponse>>();
  readonly #checkpoint: SessionServiceOptions["turnCheckpoint"];
  #queue: Promise<void> = Promise.resolve();
  #stopping = false;
  #shutdown: Promise<void> | undefined;

  private constructor(catalog: SessionCatalog, dataDir: string, options: SessionServiceOptions) {
    this.#catalog = catalog;
    this.#dataDir = dataDir;
    this.#env = { ...(options.env ?? process.env) };
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

  getModelCapabilities(request: ModelCapabilitiesRequest): Promise<ModelCapabilitiesResponse> {
    try {
      this.#admit();
      if (!isModelCapabilitiesRequest(request))
        throw new SessionError(400, "invalid_input", "Provide a valid Pi provider and model.");
      const configuration = this.#configuration();
      const key = JSON.stringify([request.provider, request.model]);
      const existing = this.#modelCapabilityDiscoveries.get(key);
      if (existing) return existing;
      if (this.#modelCapabilityDiscoveries.size >= 2)
        throw new SessionError(
          429,
          "model_discovery_busy",
          "Two model capability checks are already active. Try again shortly.",
        );
      const discovery = discoverPiModelCapabilities(configuration, this.#env, request).catch(
        (error: unknown) => {
          if (error instanceof SessionDiscoveryError)
            throw new SessionError(error.status, error.code, error.message);
          throw error;
        },
      );
      this.#modelCapabilityDiscoveries.set(key, discovery);
      void discovery.then(
        () => {
          if (this.#modelCapabilityDiscoveries.get(key) === discovery)
            this.#modelCapabilityDiscoveries.delete(key);
        },
        () => {
          if (this.#modelCapabilityDiscoveries.get(key) === discovery)
            this.#modelCapabilityDiscoveries.delete(key);
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
        thinkingLevel: null,
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
      if (!isSessionModelRequest(request))
        throw new SessionError(
          400,
          "invalid_input",
          "Provide a valid provider, model, and optional thinking level.",
        );

      const stored = this.#stored(id);
      this.#checkStorage(id);
      if (stored.status !== "ready")
        throw new SessionError(409, "session_not_ready", "Only a ready session can change model.");
      if (this.#turns.has(id))
        throw new SessionError(409, "session_busy", "Abort active work before changing model.");
      if (
        stored.provider === request.provider &&
        stored.model === request.model &&
        (request.thinkingLevel === undefined || stored.thinkingLevel === request.thinkingLevel)
      )
        return this.#view(stored);

      await this.#open(stored);
      const runtime = this.#runtimes.get(id);
      if (runtime?.state !== "ready")
        throw new SessionError(409, "session_busy", "The session is not idle.");

      let selected: { provider: string; model: string };
      let thinkingLevel: ThinkingLevel;
      try {
        const before = await runtime.getState();
        if (before.sessionId !== stored.piSessionId || !before.model)
          throw new Error("Pi session state did not match the stored session.");
        selected =
          before.model.provider === request.provider && before.model.id === request.model
            ? { provider: request.provider, model: request.model }
            : await runtime.setModel(request.provider, request.model);
        if (request.thinkingLevel !== undefined)
          await runtime.setThinkingLevel(request.thinkingLevel);
        const state = await runtime.getState();
        if (
          state.sessionId !== stored.piSessionId ||
          !state.model ||
          state.model.provider !== selected.provider ||
          state.model.id !== selected.model
        )
          throw new Error("Pi did not confirm the selected session model.");
        thinkingLevel = state.thinkingLevel;
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
        thinkingLevel,
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
        const native = this.#nativeExecutions.get(id);
        if (native && native.info.status !== "running" && native.messageBaseline)
          await this.#refreshNativeHistory(id, native.info.id);
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
    return this.#read(async (signal) => {
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
          contextSources: [],
          contextSourcesTruncated: false,
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
        signal,
      });
      const session = this.#view(this.#stored(id));
      const latest = this.#catalog.latestTurn(id);
      const covered =
        !this.#storageFaults.has(id) &&
        latest &&
        !active(latest) &&
        latest.entryIds.length > 0 &&
        latest.entryIds.every((entryId) => slice.branchIds.has(entryId));
      const native = this.#nativeExecutions.get(id);
      if (
        native &&
        native.info.status !== "running" &&
        !native.coverageBlocked &&
        native.expectedMessageKeys === undefined &&
        native.messageBaseline &&
        !slice.history.incompleteTail
      ) {
        const expected = messageKeysAfterBaseline(slice.history.entries, native.messageBaseline);
        if (expected === undefined) native.coverageBlocked = true;
        else {
          native.expectedMessageKeys = expected;
          native.coverageBlocked = expected.length === 0;
          delete native.messageBaseline;
        }
      }
      const savedMessageKeyEntries = savedMessageKeys(slice.history.entries).keys;
      const branchMessageKeys = new Set(
        [...savedMessageKeyEntries]
          .filter(([entryId]) => slice.branchIds.has(entryId))
          .map(([, key]) => key),
      );
      if (
        native &&
        native.info.status !== "running" &&
        !native.coverageBlocked &&
        native.expectedMessageKeys !== undefined &&
        native.expectedMessageKeys.length > 0 &&
        !slice.history.incompleteTail &&
        native.expectedMessageKeys.every((key) => branchMessageKeys.has(key)) &&
        slice.history.leafId !== null
      ) {
        native.settledLeafId = slice.history.leafId;
        delete native.expectedMessageKeys;
        delete native.messageBaseline;
      }
      const coveredNative =
        !this.#storageFaults.has(id) &&
        native &&
        native.info.status !== "running" &&
        !slice.history.incompleteTail &&
        native.settledLeafId !== undefined &&
        slice.branchIds.has(native.settledLeafId);
      if (
        native?.info.status !== "running" &&
        !slice.history.incompleteTail &&
        this.#runtimeObservers.has(id)
      )
        this.#historyIdentity.set(id, this.#identityForHistory(slice.history));
      return {
        sessionId: id,
        status: "available",
        revision: slice.history.revision,
        leafId: slice.history.leafId,
        entries: slice.entries,
        nextCursor: slice.nextCursor,
        incompleteTail: slice.history.incompleteTail,
        contextSources: slice.contextSources,
        contextSourcesTruncated: slice.contextSourcesTruncated,
        activeTurnId: session.activeTurnId,
        latestTurnId: session.latestTurnId,
        coveredTurnId: covered && latest ? latest.runId : null,
        ...(coveredNative && native ? { coveredNativeExecutionId: native.info.id } : {}),
      };
    });
  }

  getHistoryImage(
    id: string,
    entryId: string,
    imageIndex: number,
  ): Promise<{ mimeType: string; data: Buffer } | null> {
    return this.#read(async (signal) => {
      const stored = this.#stored(id);
      const file = await this.#history(stored);
      if (!file) {
        if (stored.historyExpected)
          throw new SessionError(410, "history_unavailable", HISTORY_UNAVAILABLE);
        return null;
      }
      return this.#historyPages.image({
        sessionId: id,
        file,
        piSessionId: stored.piSessionId,
        directory: stored.directory,
        entryId,
        imageIndex,
        signal,
      });
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
          "Provide a request UUID and message text or supported images (no slash commands).",
        );
      const images = request.images ?? [];
      const identity = turnPayloadIdentity(request.message, images);
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
      const runtime = this.#runtimes.get(id);
      const native = this.#nativeExecutions.get(id);
      if (runtime?.activeExecution?.source === "native" || native?.info.status === "running")
        throw new SessionError(409, "session_busy", "The session is busy with native Pi work.");
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
      // A new durable turn becomes the selected live result; the previous native run
      // remains only in Pi's saved transcript and is never relabeled as this turn.
      this.#nativeExecutions.delete(id);
      let finish!: () => void;
      const done = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const slot: ActiveTurn = {
        sessionId: id,
        runId: turn.runId,
        done,
        historyAbort: new AbortController(),
        dispatched: false,
        abortFailed: false,
        historyMaterialized: this.#stored(id).historyExpected,
      };
      this.#turns.set(id, slot);
      this.#publishState(id, true);
      setImmediate(() => {
        void this.#executeTurn(slot, request.message, images)
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
    return this.#read(async (signal) => {
      this.#checkStorage(id);
      const turn = this.#storedTurn(id, runId);
      if (active(turn))
        throw new SessionError(409, "turn_pending", "The turn has not settled yet.");
      if (!turn.entryIds.length) {
        if (turn.status === "completed") return { runId, entries: [] };
        throw new SessionError(410, "result_unavailable", "Saved turn result is unavailable.");
      }
      const stored = this.#stored(id);
      const file = await this.#history(stored);
      if (!file)
        throw new SessionError(410, "result_unavailable", "Saved turn result is unavailable.");
      const { entries } = await readSavedHistory({
        file,
        piSessionId: stored.piSessionId,
        directory: stored.directory,
        signal,
        cancelQueuedOnly: true,
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
      else slot.historyAbort.abort();
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

  async abortNativeExecution(id: string, executionId: string): Promise<SessionInfo> {
    this.#admit();
    this.#stored(id);
    if (!SESSION_ID.test(executionId))
      throw new SessionError(400, "invalid_input", "Invalid native execution ID.");
    const record = this.#nativeExecutions.get(id);
    if (!record || record.info.id !== executionId)
      throw new SessionError(
        409,
        "native_execution_stale",
        "This native execution is no longer the current session execution.",
      );
    if (record.info.status !== "running") return this.#view(this.#stored(id));

    const runtime = this.#runtimes.get(id);
    const current = runtime?.activeExecution;
    if (!runtime || current?.source !== "native" || current.executionId !== executionId) {
      if (record.info.status !== "running") return this.#view(this.#stored(id));
      throw new SessionError(
        409,
        "native_execution_stale",
        "This native execution is no longer active in Pi.",
      );
    }

    record.abort ??= (async () => {
      try {
        await runtime.abort();
      } catch {
        try {
          await runtime.stop();
        } catch {
          throw new SessionError(
            503,
            "native_abort_failed",
            "Pi could not stop the native execution reliably.",
          );
        }
      }
    })();
    await record.abort;
    return this.#view(this.#stored(id));
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

  async #executeTurn(
    slot: ActiveTurn,
    message: string,
    images: readonly ImageContent[],
  ): Promise<void> {
    const id = slot.sessionId;
    let markedHistory = false;
    let historyWasExpected = false;
    let unobserve: (() => void) | undefined;
    try {
      await this.#checkpoint?.("accepted", turnView(this.#storedTurn(id, slot.runId)));
      this.#checkStorage(id);
      const accepted = this.#storedTurn(id, slot.runId);
      if (!active(accepted)) return;
      if (this.#stopping) {
        this.#writeTurn({
          ...accepted,
          cancellationRequested: true,
          status: "aborted",
          updatedAt: this.#now(),
        });
        return;
      }
      const historySignal = AbortSignal.any([
        this.#shutdownController.signal,
        slot.historyAbort.signal,
      ]);
      await this.#mutate(() => this.#open(this.#stored(id), { signal: historySignal }));
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
      if (images.length > 0 && !(await runtime.supportsImages()))
        throw new SessionError(
          400,
          "unsupported_image_model",
          "The selected Pi model does not accept image input.",
        );
      const historyBefore = await this.#savedHistory(source, { signal: historySignal });
      const savedBefore = historyBefore?.entries ?? [];
      const identityBefore = this.#identityForHistory(historyBefore);
      this.#historyIdentity.set(id, identityBefore);
      const before = new Set(savedBefore.map((entry) => entry.id));
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
      this.#events.beginTurn(id, slot.runId, identityBefore.counts, identityBefore.known);
      unobserve = runtime.subscribe(
        (event) => {
          this.#events.observe(id, slot.runId, event);
        },
        { interactive: false },
      );
      const run = runtime.startRun(message, images);
      slot.dispatched = true;
      const disposition = await run.accepted;
      if (disposition === "handled") {
        unobserve?.();
        unobserve = undefined;
      }
      if (disposition === "started") {
        this.#writeTurn({
          ...this.#storedTurn(id, slot.runId),
          status: "running",
          updatedAt: this.#now(),
        });
        await this.#checkpoint?.("running", turnView(this.#storedTurn(id, slot.runId)));
      }
      const result = await run.settled;
      await this.#checkpoint?.("settled", turnView(this.#storedTurn(id, slot.runId)));
      if (slot.abort) await slot.abort;
      if (slot.abortFailed) throw new Error("Cancellation outcome is uncertain.");
      if (result.outcome === "handled") {
        await this.#completeHandledTurn(id, slot.runId, runtime, before, historyWasExpected);
        return;
      }
      await this.#rememberHistory(this.#stored(id), runtime);
      const historyAfter = await this.#savedHistory(this.#stored(id));
      const savedAfter = historyAfter?.entries ?? [];
      this.#historyIdentity.set(id, this.#identityForHistory(historyAfter));
      const entries = savedAfter.filter((entry) => !before.has(entry.id));
      this.#writeTurn({
        ...this.#storedTurn(id, slot.runId),
        status: result.outcome,
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
        const shutdownBeforeDispatch = this.#stopping && !slot.dispatched;
        if (active(turn))
          this.#writeTurn({
            ...turn,
            status: shutdownBeforeDispatch
              ? "aborted"
              : slot.dispatched && !rejectedPrompt
                ? "interrupted"
                : "failed",
            cancellationRequested: shutdownBeforeDispatch ? true : turn.cancellationRequested,
            updatedAt: this.#now(),
            error: shutdownBeforeDispatch
              ? null
              : {
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

  async #completeHandledTurn(
    sessionId: string,
    runId: string,
    runtime: PiProcess,
    before: ReadonlySet<string>,
    historyWasExpected: boolean,
  ): Promise<void> {
    const state = await runtime.getState();
    const latest = this.#stored(sessionId);
    if (state.sessionId !== latest.piSessionId)
      throw new SessionError(503, "runtime_mismatch", "Pi returned a different session state.");
    const sessionFile = state.sessionFile ?? latest.piSessionFile;
    const withState: StoredSession = {
      ...latest,
      piSessionFile: sessionFile,
      provider: state.model?.provider ?? latest.provider,
      model: state.model?.id ?? latest.model,
      thinkingLevel: state.thinkingLevel,
    };
    const file = await this.#history(withState);
    if (!file && historyWasExpected)
      throw new SessionError(410, "history_unavailable", HISTORY_UNAVAILABLE);
    const history = file
      ? await this.#savedHistory({ ...withState, historyExpected: true })
      : undefined;
    const entries = history?.entries.filter((entry) => !before.has(entry.id)) ?? [];
    try {
      this.#catalog.update({
        ...withState,
        historyExpected: file !== undefined,
        error: null,
        updatedAt: this.#now(),
      });
    } catch {
      this.#storageFault(sessionId);
      throw new SessionError(
        503,
        "storage_unavailable",
        "Handled session state could not be saved.",
      );
    }
    this.#historyIdentity.set(sessionId, this.#identityForHistory(history));
    this.#writeTurn({
      ...this.#storedTurn(sessionId, runId),
      status: "completed",
      entryIds: entries.map((entry) => entry.id),
      updatedAt: this.#now(),
      error: null,
    });
  }

  shutdown(): Promise<void> {
    if (this.#shutdown) return this.#shutdown;
    this.#stopping = true;
    let failedBeforeQueue = false;
    for (const slot of this.#turns.values()) {
      if (slot.dispatched) continue;
      try {
        const turn = this.#storedTurn(slot.sessionId, slot.runId);
        if (active(turn))
          this.#writeTurn({
            ...turn,
            cancellationRequested: true,
            status: "aborted",
            updatedAt: this.#now(),
          });
        slot.historyAbort.abort();
      } catch {
        failedBeforeQueue = true;
        slot.historyAbort.abort();
      }
    }
    this.#shutdownController.abort();
    this.#shutdown = (async () => {
      await this.#queue;
      let failed = failedBeforeQueue;
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
        ...this.#nativeRefreshes,
        ...(this.#modelDiscovery ? [this.#modelDiscovery] : []),
        ...this.#modelCapabilityDiscoveries.values(),
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

  #read<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
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
    const signal = this.#shutdownController.signal;
    const result = Promise.resolve()
      .then(() => operation(signal))
      .catch((error: unknown) => {
        if (error instanceof HistoryReadError)
          throw new SessionError(error.status, error.code, error.message);
        if (signal.aborted && error instanceof Error && error.name === "AbortError")
          throw new SessionError(503, "shutting_down", "Dwell sessions are stopping.");
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
      thinkingLevel: stored.thinkingLevel,
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
      nativeExecution: this.#nativeExecutions.get(stored.id)?.info ?? null,
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

  async #savedHistory(
    stored: StoredSession,
    options: { signal?: AbortSignal; cancelQueuedOnly?: boolean } = {},
  ): Promise<SavedHistory | undefined> {
    const file = await this.#history(stored);
    if (!file) {
      if (stored.historyExpected)
        throw new SessionError(410, "history_unavailable", HISTORY_UNAVAILABLE);
      return undefined;
    }
    return readSavedHistory({
      file,
      piSessionId: stored.piSessionId,
      directory: stored.directory,
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.cancelQueuedOnly ? { cancelQueuedOnly: true } : {}),
    });
  }

  #identityForEntries(entries: readonly PiEntry[]): HistoryIdentity {
    const { counts } = savedMessageKeys(entries);
    return { known: true, counts };
  }

  #identityForHistory(history: SavedHistory | undefined): HistoryIdentity {
    if (!history) return { known: true, counts: new Map() };
    if (history.incompleteTail) return { known: false, counts: new Map() };
    return this.#identityForEntries(history.entries);
  }

  async #captureHistoryIdentity(
    stored: StoredSession,
    signal?: AbortSignal,
  ): Promise<HistoryIdentity> {
    try {
      const history = await this.#savedHistory(stored, {
        signal: signal ?? this.#shutdownController.signal,
        cancelQueuedOnly: signal === undefined,
      });
      if (signal?.aborted) throw signal.reason;
      return this.#identityForHistory(history);
    } catch (error) {
      if (signal?.aborted) throw error;
      // Without a complete saved baseline, native messages stay unmatched in the client.
      return { known: false, counts: new Map() };
    }
  }

  #observeRuntime(sessionId: string, runtime: PiProcess): void {
    const unobserveState = runtime.subscribeState(() => {
      this.#publishState(sessionId);
    });
    let nativeWasActiveOnAttach = runtime.activeExecution?.source === "native";
    const unobserveNative = runtime.subscribeNativeExecution((event) => {
      this.#nativeExecutionEvent(
        sessionId,
        event,
        nativeWasActiveOnAttach && event.type === "started",
      );
      if (event.type === "started") nativeWasActiveOnAttach = false;
    });
    const unobserveRecords = runtime.subscribe(
      (event) => {
        const execution = runtime.activeExecution;
        if (execution?.source === "native")
          this.#events.observe(sessionId, execution.executionId, event);
      },
      { interactive: false },
    );
    this.#runtimeObservers.set(sessionId, () => {
      unobserveRecords();
      unobserveNative();
      unobserveState();
      if (this.#runtimes.get(sessionId) === runtime) this.#historyIdentity.delete(sessionId);
      const native = this.#nativeExecutions.get(sessionId);
      if (native?.info.status !== "running" && native?.messageBaseline) {
        native.coverageBlocked = true;
        delete native.messageBaseline;
      }
    });
  }

  #nativeExecutionEvent(sessionId: string, event: NativeExecutionEvent, startedLate = false): void {
    if (event.type === "started") {
      const current = this.#nativeExecutions.get(sessionId);
      if (current?.info.id === event.executionId && current.info.status === "running") return;
      const identity = this.#historyIdentity.get(sessionId);
      const record: NativeExecutionRecord = {
        info: { id: event.executionId, status: "running", error: null },
        coverageBlocked: !identity?.known,
        coverageFromFile: startedLate,
        ...(identity?.known ? { messageBaseline: new Map(identity.counts) } : {}),
      };
      this.#nativeExecutions.set(sessionId, record);
      const observedBaseline = this.#events.beginNativeExecution(
        sessionId,
        event.executionId,
        identity?.known ? identity.counts : undefined,
      );
      if (observedBaseline) {
        if (observedBaseline.messageIdentityKnown) {
          record.messageBaseline = observedBaseline.messageCounts;
          record.coverageBlocked = false;
        } else {
          delete record.messageBaseline;
          record.coverageBlocked = true;
        }
      } else if (this.#turns.has(sessionId)) {
        delete record.messageBaseline;
        record.coverageBlocked = true;
      }
      this.#publishState(sessionId);
      return;
    }

    let record = this.#nativeExecutions.get(sessionId);
    if (!record || record.info.id !== event.executionId) {
      const identity = this.#historyIdentity.get(sessionId);
      record = {
        info: { id: event.executionId, status: "running", error: null },
        coverageBlocked: !identity?.known,
        coverageFromFile: true,
        ...(identity?.known ? { messageBaseline: new Map(identity.counts) } : {}),
      };
      this.#nativeExecutions.set(sessionId, record);
    }
    if (record.info.status !== "running") return;

    const error = event.result.error;
    record.info = {
      id: event.executionId,
      status: event.result.outcome,
      error: error === undefined ? null : truncateUtf8(error, 2048),
    };
    this.#publishState(sessionId);
    const liveBaseline = this.#events.endNativeExecution(sessionId, event.executionId);
    if (liveBaseline && !record.coverageFromFile) {
      if (
        !record.messageBaseline ||
        !liveBaseline.messageIdentityKnown ||
        liveBaseline.unidentifiedMessages > 0
      ) {
        record.coverageBlocked = true;
        delete record.messageBaseline;
      } else {
        const expected = messageKeyDelta(record.messageBaseline, liveBaseline.messageCounts);
        if (expected === undefined || expected.length === 0) record.coverageBlocked = true;
        else record.expectedMessageKeys = expected;
        record.coverageFromFile = false;
        delete record.messageBaseline;
      }
    }
    if (liveBaseline?.messageIdentityKnown) {
      this.#historyIdentity.set(sessionId, {
        known: true,
        counts: liveBaseline.messageCounts,
      });
    }
    const refresh = this.#refreshNativeHistory(sessionId, event.executionId);
    this.#reads.add(refresh);
    void refresh.then(
      () => this.#reads.delete(refresh),
      () => this.#reads.delete(refresh),
    );
    const runtime = this.#runtimes.get(sessionId);
    if (runtime) this.#scheduleNativeStateRefresh(sessionId, event.executionId, runtime);
  }

  async #refreshNativeHistory(sessionId: string, executionId: string): Promise<void> {
    const history = await this.#savedHistory(this.#stored(sessionId), {
      signal: this.#shutdownController.signal,
      cancelQueuedOnly: true,
    });
    const record = this.#nativeExecutions.get(sessionId);
    if (record?.info.id !== executionId || record.info.status === "running") return;
    if (!this.#runtimeObservers.has(sessionId)) return;
    if (
      history &&
      !history.incompleteTail &&
      !record.coverageBlocked &&
      record.expectedMessageKeys === undefined &&
      record.messageBaseline
    ) {
      const expected = messageKeysAfterBaseline(history.entries, record.messageBaseline);
      if (expected === undefined || expected.length === 0) record.coverageBlocked = true;
      else record.expectedMessageKeys = expected;
      record.coverageFromFile = false;
      delete record.messageBaseline;
    }
    if (history && !history.incompleteTail)
      this.#historyIdentity.set(sessionId, this.#identityForHistory(history));
  }

  #scheduleNativeStateRefresh(sessionId: string, executionId: string, runtime: PiProcess): void {
    const current = this.#nativeStateRefreshes.get(sessionId);
    if (current) {
      current.pending = { runtime, executionId };
      return;
    }

    const refresh: NativeStateRefresh = { pending: undefined, promise: Promise.resolve() };
    const run = async (): Promise<void> => {
      let request: NativeStateRefreshRequest | undefined = { runtime, executionId };
      while (request) {
        await this.#refreshNativeSessionState(sessionId, request.executionId, request.runtime);
        request = refresh.pending;
        refresh.pending = undefined;
      }
    };
    refresh.promise = run()
      .catch(() => {})
      .finally(() => {
        if (this.#nativeStateRefreshes.get(sessionId) === refresh)
          this.#nativeStateRefreshes.delete(sessionId);
      });
    this.#nativeStateRefreshes.set(sessionId, refresh);
    this.#nativeRefreshes.add(refresh.promise);
    void refresh.promise.then(
      () => this.#nativeRefreshes.delete(refresh.promise),
      () => this.#nativeRefreshes.delete(refresh.promise),
    );
  }

  async #refreshNativeSessionState(
    sessionId: string,
    executionId: string,
    runtime: PiProcess,
  ): Promise<void> {
    const before = this.#nativeExecutions.get(sessionId);
    if (before?.info.id !== executionId || before.info.status === "running") return;
    try {
      const storedBefore = this.#stored(sessionId);
      const state = await runtime.getState();
      const current = this.#nativeExecutions.get(sessionId);
      if (
        this.#runtimes.get(sessionId) !== runtime ||
        !this.#runtimeObservers.has(sessionId) ||
        current?.info.id !== executionId ||
        current.info.status === "running"
      )
        return;
      const stored = this.#stored(sessionId);
      if (
        state.sessionId !== stored.piSessionId ||
        !state.model ||
        stored.provider !== storedBefore.provider ||
        stored.model !== storedBefore.model ||
        stored.thinkingLevel !== storedBefore.thinkingLevel
      )
        return;
      if (
        state.model.provider === stored.provider &&
        state.model.id === stored.model &&
        state.thinkingLevel === stored.thinkingLevel
      )
        return;
      try {
        this.#catalog.update({
          ...stored,
          provider: state.model.provider,
          model: state.model.id,
          thinkingLevel: state.thinkingLevel,
          updatedAt: this.#now(),
        });
      } catch {
        this.#storageFault(sessionId);
        return;
      }
      this.#publishState(sessionId);
    } catch {
      /* Native state observation does not change the execution's settled outcome. */
    }
  }

  async #open(stored: StoredSession, options: { signal?: AbortSignal } = {}): Promise<SessionInfo> {
    if (options.signal?.aborted) throw options.signal.reason;
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
    const historyIdentity = await this.#captureHistoryIdentity(stored, options.signal);
    if (options.signal?.aborted) throw options.signal.reason;
    let runtime: PiProcess;
    try {
      runtime = await PiProcess.start({
        ...configuration,
        cwd: directory,
        env: this.#env,
        sessionDirectory: join(this.#dataDir, "sessions", stored.id),
        ...(resumeFile ? { resumeFile } : { sessionId: stored.piSessionId }),
        ...(resumeFile === undefined && stored.provider !== null && stored.model !== null
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
    this.#runtimes.set(stored.id, runtime);
    this.#historyIdentity.set(stored.id, historyIdentity);
    this.#observeRuntime(stored.id, runtime);
    try {
      let state = await runtime.getState();
      if (
        state.sessionId !== stored.piSessionId ||
        !state.model ||
        (resumeFile === undefined &&
          ((stored.provider !== null && state.model.provider !== stored.provider) ||
            (stored.model !== null && state.model.id !== stored.model))) ||
        !state.sessionFile
      )
        throw new SessionError(
          503,
          "runtime_mismatch",
          "Pi did not use the requested session and model selection.",
        );
      if (
        resumeFile === undefined &&
        stored.thinkingLevel !== null &&
        state.thinkingLevel !== stored.thinkingLevel &&
        runtime.activeExecution?.source !== "native"
      ) {
        await runtime.setThinkingLevel(stored.thinkingLevel);
        state = await runtime.getState();
      }
      if (
        !state.model ||
        state.sessionId !== stored.piSessionId ||
        !state.sessionFile ||
        (resumeFile === undefined &&
          ((stored.provider !== null && state.model.provider !== stored.provider) ||
            (stored.model !== null && state.model.id !== stored.model)))
      )
        throw new SessionError(503, "runtime_mismatch", "Pi did not restore the saved session.");
      const ready: StoredSession = {
        ...stored,
        provider: state.model.provider,
        model: state.model.id,
        thinkingLevel: state.thinkingLevel,
        status: "ready",
        updatedAt: this.#now(),
        error: null,
        piSessionFile: state.sessionFile,
        historyExpected: stored.historyExpected || resumeFile !== undefined,
      };
      this.#catalog.update(ready);
      this.#publishState(stored.id);
      return this.#view(ready);
    } catch (error) {
      await runtime.stop();
      this.#runtimeObservers.get(stored.id)?.();
      this.#runtimeObservers.delete(stored.id);
      this.#runtimes.delete(stored.id);
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
