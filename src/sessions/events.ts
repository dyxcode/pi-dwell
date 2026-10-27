import { randomUUID } from "node:crypto";
import {
  STREAM_EVENT_MAX_BYTES,
  STREAM_SNAPSHOT_MAX_BYTES,
  isStreamFrame,
  type LiveMessage,
  type LiveMessageDelta,
  type LiveProjection,
  type LiveTool,
  type ProjectionLimitScope,
  type SessionSnapshot,
  type StreamFrame,
  type TurnProjection,
} from "../shared/events.ts";
import { isSessionInfo, type SessionInfo } from "../shared/sessions.ts";
import { isTurnInfo, type TurnInfo } from "../shared/turns.ts";
import type { RpcRecord } from "../runtime/pi-rpc.ts";

export interface SessionEventsOptions {
  maxSessions?: number;
  maxReplayEvents?: number;
  maxReplayBytes?: number;
  maxSubscribersPerSession?: number;
  maxSubscribers?: number;
}

export class InvalidCursorError extends Error {
  constructor() {
    super("The event cursor is malformed or belongs to another session.");
    this.name = "InvalidCursorError";
  }
}

export class SubscriberLimitError extends Error {
  constructor() {
    super("The event subscriber limit has been reached.");
    this.name = "SubscriberLimitError";
  }
}

export class StreamCapacityError extends Error {
  constructor(message = "The session event stream capacity is full.") {
    super(message);
    this.name = "StreamCapacityError";
  }
}

type EventType = Exclude<StreamFrame["type"], "snapshot" | "resync">;
type PayloadFor<T extends EventType> = Extract<StreamFrame, { type: T }>["payload"];
type ReplayableFrame = Exclude<StreamFrame, { type: "snapshot" | "resync" }>;

interface StoredEvent {
  sequence: number;
  bytes: number;
  frame: ReplayableFrame;
}

interface Subscriber {
  readonly listener: (frame: StreamFrame) => void | Promise<void>;
  active: boolean;
}

interface CachedView {
  session: SessionInfo;
  activeTurn: TurnProjection | null;
  latestTurn: TurnProjection | null;
  metadataTruncated: boolean;
}

interface LiveState extends LiveProjection {
  readonly toolIds: Map<string, string>;
  readonly limited: Set<ProjectionLimitScope>;
  projectionErrorReported: boolean;
}

interface SessionStream {
  readonly sessionId: string;
  epoch: string;
  sequence: number;
  replay: StoredEvent[];
  replayBytes: number;
  readonly subscribers: Set<Subscriber>;
  activeRunId: string | null;
  view: CachedView | null;
  live: LiveState;
  lastUsed: number;
}

interface ParsedCursor {
  sessionId: string;
  epoch: string;
  sequence: number;
}

interface BoundedText {
  value: string;
  truncated: boolean;
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const CURSOR = /^([a-f0-9-]{36}):([a-f0-9-]{36}):(0|[1-9][0-9]*)$/;
const encoder = new TextEncoder();
const MAX_STREAMS = 64;
const MAX_REPLAY_EVENTS = 1000;
const MAX_REPLAY_BYTES = 1024 * 1024;
const MAX_SESSION_SUBSCRIBERS = 8;
const MAX_SUBSCRIBERS = 32;
const MAX_MESSAGE_JSON_BYTES = 56 * 1024;
const MAX_TOOL_FIELD_JSON_BYTES = 8 * 1024;
const MAX_TOOL_NAME_JSON_BYTES = 512;
const MAX_TOOL_CALL_ID_BYTES = 1024;
const MAX_TOOLS = 8;
const MAX_METADATA_DIRECTORY_JSON_BYTES = 8 * 1024;
const MAX_METADATA_VALUE_JSON_BYTES = 512;
const MAX_METADATA_ERROR_JSON_BYTES = 2 * 1024;
const MAX_TURN_ERROR_JSON_BYTES = 2 * 1024;
const MAX_LIMITED_STRING_JSON_BYTES = 128;
const MAX_REPLAY_INITIAL_BYTES = STREAM_SNAPSHOT_MAX_BYTES;
const SSE_FRAME_OVERHEAD_BYTES = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonStringBytes(value: string): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

function boundedJsonString(value: string, maxBytes: number): BoundedText {
  if (jsonStringBytes(value) <= maxBytes) return { value, truncated: false };
  const output: string[] = [];
  let used = 2;
  let truncated = false;
  for (const character of value) {
    const cost = jsonStringBytes(character) - 2;
    if (used + cost > maxBytes) {
      truncated = true;
      break;
    }
    output.push(character);
    used += cost;
  }
  if (!truncated) return { value: output.join(""), truncated: false };
  const suffix = "…";
  const suffixBytes = jsonStringBytes(suffix) - 2;
  while (output.length > 0 && used + suffixBytes > maxBytes) {
    const removed = output.pop();
    if (removed !== undefined) used -= jsonStringBytes(removed) - 2;
  }
  return { value: `${output.join("")}${suffix}`, truncated: true };
}

function appendBoundedJsonString(
  existing: string,
  addition: string,
  maxBytes: number,
): {
  value: string;
  delta: string;
  truncated: boolean;
} {
  let used = jsonStringBytes(existing);
  const appended: string[] = [];
  let truncated = false;
  for (const character of addition) {
    const cost = jsonStringBytes(character) - 2;
    if (used + cost > maxBytes) {
      truncated = true;
      break;
    }
    appended.push(character);
    used += cost;
  }
  if (!truncated) {
    const delta = appended.join("");
    return { value: existing + delta, delta, truncated: false };
  }
  const suffix = "…";
  const suffixBytes = jsonStringBytes(suffix) - 2;
  while (appended.length > 0 && used + suffixBytes > maxBytes) {
    const removed = appended.pop();
    if (removed !== undefined) used -= jsonStringBytes(removed) - 2;
  }
  if (used + suffixBytes > maxBytes) return { value: existing, delta: "", truncated: true };
  appended.push(suffix);
  const delta = appended.join("");
  return { value: existing + delta, delta, truncated: true };
}

function safeJsonString(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

function equalJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function emptyLiveState(): LiveState {
  return {
    message: null,
    tools: [],
    truncated: false,
    toolIds: new Map(),
    limited: new Set(),
    projectionErrorReported: false,
  };
}

function parseCursor(cursor: string, sessionId: string): ParsedCursor {
  const match = CURSOR.exec(cursor);
  const sequence = Number(match?.[3]);
  if (
    match === null ||
    match[1] !== sessionId ||
    !UUID.test(match[2] ?? "") ||
    !Number.isSafeInteger(sequence)
  ) {
    throw new InvalidCursorError();
  }
  return { sessionId, epoch: match[2] ?? "", sequence };
}

function projectSession(value: SessionInfo): { value: SessionInfo; limited: boolean } {
  const directory = boundedJsonString(value.directory, MAX_METADATA_DIRECTORY_JSON_BYTES);
  const provider =
    value.provider === null
      ? null
      : boundedJsonString(value.provider, MAX_METADATA_VALUE_JSON_BYTES);
  const model =
    value.model === null ? null : boundedJsonString(value.model, MAX_METADATA_VALUE_JSON_BYTES);
  const error =
    value.error === null ? null : boundedJsonString(value.error, MAX_METADATA_ERROR_JSON_BYTES);
  return {
    value: {
      id: value.id,
      directory: directory.value,
      provider: provider?.value ?? null,
      model: model?.value ?? null,
      thinkingLevel: value.thinkingLevel,
      piSessionId: value.piSessionId,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      status: value.status,
      runtimeState: value.runtimeState,
      historyState: value.historyState,
      error: error === null ? null : error.value,
      activeTurnId: value.activeTurnId,
      latestTurnId: value.latestTurnId,
    },
    limited:
      directory.truncated ||
      provider?.truncated === true ||
      model?.truncated === true ||
      error?.truncated === true,
  };
}

function projectTurn(value: TurnInfo): { value: TurnProjection; limited: boolean } {
  const error =
    value.error === null
      ? null
      : {
          code: boundedJsonString(value.error.code, MAX_LIMITED_STRING_JSON_BYTES),
          message: boundedJsonString(value.error.message, MAX_TURN_ERROR_JSON_BYTES),
        };
  const errorLimited = error?.code.truncated === true || error?.message.truncated === true;
  return {
    value: {
      runId: value.runId,
      sessionId: value.sessionId,
      requestId: value.requestId,
      status: value.status,
      cancellationRequested: value.cancellationRequested,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      error: error === null ? null : { code: error.code.value, message: error.message.value },
      entryCount: value.entryIds.length,
      errorTruncated: errorLimited,
    },
    limited: errorLimited,
  };
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!isRecord(value) || !Array.isArray(value.content)) return "";
  const pieces: string[] = [];
  for (const block of value.content) {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string")
      pieces.push(block.text);
  }
  return pieces.join("");
}

function clippedToolInput(value: unknown): BoundedText {
  return boundedJsonString(safeJsonString(value), MAX_TOOL_FIELD_JSON_BYTES);
}

function clippedToolText(value: unknown): BoundedText {
  return boundedJsonString(extractText(value), MAX_TOOL_FIELD_JSON_BYTES);
}

function eventSize(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

function asReplayable(frame: StreamFrame): frame is ReplayableFrame {
  return frame.type !== "snapshot" && frame.type !== "resync";
}

function copyFrame(frame: StreamFrame): StreamFrame {
  return structuredClone(frame);
}

/** A bounded, process-local projection of durable session state and Pi live events. */
export class SessionEvents {
  readonly #maxSessions: number;
  readonly #maxReplayEvents: number;
  readonly #maxReplayBytes: number;
  readonly #maxSubscribersPerSession: number;
  readonly #maxSubscribers: number;
  readonly #streams = new Map<string, SessionStream>();
  #subscriberCount = 0;
  #tick = 0;
  #closed = false;

  constructor(options: SessionEventsOptions = {}) {
    this.#maxSessions = boundedLimit(options.maxSessions, MAX_STREAMS);
    this.#maxReplayEvents = boundedLimit(options.maxReplayEvents, MAX_REPLAY_EVENTS);
    this.#maxReplayBytes = boundedLimit(
      options.maxReplayBytes,
      MAX_REPLAY_BYTES,
      STREAM_EVENT_MAX_BYTES,
    );
    this.#maxSubscribersPerSession = boundedLimit(
      options.maxSubscribersPerSession,
      MAX_SESSION_SUBSCRIBERS,
    );
    this.#maxSubscribers = boundedLimit(options.maxSubscribers, MAX_SUBSCRIBERS);
  }

  ensure(sessionId: string): void {
    if (!UUID.test(sessionId)) throw new TypeError("Invalid session ID for event stream.");
    if (!this.#getOrCreate(sessionId)) throw new StreamCapacityError();
  }

  publishSession(session: SessionInfo): void {
    try {
      if (this.#closed || !isSessionInfo(session)) return;
      const stream = this.#getOrCreate(session.id);
      if (!stream) return;
      const projected = projectSession(session);
      const current = stream.view;
      if (!current) {
        stream.view = {
          session: projected.value,
          activeTurn: null,
          latestTurn: null,
          metadataTruncated: projected.limited,
        };
        if (projected.limited) this.#limited(stream, "metadata", MAX_METADATA_DIRECTORY_JSON_BYTES);
        return;
      }
      if (equalJson(current.session, projected.value)) return;
      current.session = projected.value;
      current.metadataTruncated = projected.limited;
      this.#touch(stream);
      if (projected.limited) this.#limited(stream, "metadata", MAX_METADATA_DIRECTORY_JSON_BYTES);
      this.#emit(stream, stream.activeRunId, "session.updated", projected.value);
    } catch {
      // Session projection is a best-effort observer after durable state changes.
    }
  }

  publishTurn(
    session: SessionInfo,
    activeTurn: TurnInfo | null,
    latestTurn: TurnInfo | null,
  ): void {
    try {
      if (this.#closed || !this.#validView(session, activeTurn, latestTurn)) return;
      const stream = this.#getOrCreate(session.id);
      if (!stream) return;
      const projectedSession = projectSession(session);
      const current = stream.view;
      if (!current) {
        const projectedActive = activeTurn ? projectTurn(activeTurn).value : null;
        const projectedLatest = latestTurn ? projectTurn(latestTurn).value : null;
        stream.view = {
          session: projectedSession.value,
          activeTurn: projectedActive,
          latestTurn: projectedLatest,
          metadataTruncated: projectedSession.limited,
        };
        this.#publishViewLimits(
          stream,
          projectedSession.value,
          activeTurn,
          latestTurn,
          projectedSession.limited,
        );
        return;
      }
      const priorSession = current.session;
      const priorLatest = current.latestTurn;
      const projectedActive = activeTurn ? projectTurn(activeTurn).value : null;
      const projectedLatest = latestTurn ? projectTurn(latestTurn).value : null;
      if (
        (priorLatest?.runId ?? null) !== (projectedLatest?.runId ?? null) &&
        stream.activeRunId !== (projectedLatest?.runId ?? null)
      )
        stream.live = emptyLiveState();
      current.session = projectedSession.value;
      current.activeTurn = projectedActive;
      current.latestTurn = projectedLatest;
      current.metadataTruncated = projectedSession.limited;
      this.#touch(stream);
      this.#publishViewLimits(
        stream,
        projectedSession.value,
        activeTurn,
        latestTurn,
        projectedSession.limited,
      );

      if (!equalJson(priorSession, projectedSession.value))
        this.#emit(stream, stream.activeRunId, "session.updated", projectedSession.value);
      if (latestTurn) {
        const projectedTurn = projectTurn(latestTurn);
        if (projectedTurn.limited) this.#limited(stream, "metadata", MAX_TURN_ERROR_JSON_BYTES);
        if (!equalJson(priorLatest, projectedTurn.value))
          this.#emit(stream, latestTurn.runId, "turn.updated", projectedTurn.value);
      }
    } catch {
      // Turn projection cannot fail the owning durable turn or its Pi execution.
    }
  }

  beginTurn(sessionId: string, runId: string): void {
    try {
      if (this.#closed || !UUID.test(sessionId) || !UUID.test(runId)) return;
      const stream = this.#getOrCreate(sessionId);
      if (!stream) return;
      if (stream.activeRunId !== null && stream.activeRunId !== runId) {
        this.#projectionError(stream);
        return;
      }
      if (stream.activeRunId === runId) return;
      stream.activeRunId = runId;
      stream.live = emptyLiveState();
      this.#touch(stream);
    } catch {
      // Live observation is optional and never owns execution.
    }
  }

  observe(sessionId: string, runId: string, event: RpcRecord): void {
    const stream = this.#streams.get(sessionId);
    if (this.#closed || !stream || stream.activeRunId !== runId) return;
    try {
      this.#touch(stream);
      switch (event.type) {
        case "message_start":
          this.#messageStart(stream, event);
          break;
        case "message_update":
          this.#messageUpdate(stream, event);
          break;
        case "message_end":
          this.#messageEnd(stream, event);
          break;
        case "tool_execution_start":
          this.#toolStart(stream, event);
          break;
        case "tool_execution_update":
          this.#toolUpdate(stream, event);
          break;
        case "tool_execution_end":
          this.#toolEnd(stream, event);
          break;
        default:
          break;
      }
    } catch {
      this.#projectionError(stream);
    }
  }

  endTurn(sessionId: string, runId: string): void {
    const stream = this.#streams.get(sessionId);
    if (!stream || stream.activeRunId !== runId) return;
    stream.activeRunId = null;
    this.#touch(stream);
  }

  fail(sessionId: string, code: string, message: string): void {
    try {
      const stream = this.#streams.get(sessionId);
      if (this.#closed || !stream) return;
      const boundedCode = boundedJsonString(code, 128);
      const boundedMessage = boundedJsonString(message, 2048);
      this.#emit(stream, stream.activeRunId, "stream.error", {
        code: boundedCode.value || "stream_error",
        message: boundedMessage.value || "The session event stream encountered an error.",
      });
      this.#touch(stream);
    } catch {
      // Reporting a storage failure is best-effort and must not hide the original failure.
    }
  }

  connect(
    session: SessionInfo,
    activeTurn: TurnInfo | null,
    latestTurn: TurnInfo | null,
    cursor: string | undefined,
    listener: (frame: StreamFrame) => void | Promise<void>,
  ): { initial: StreamFrame[]; unsubscribe(): void } {
    if (this.#closed) throw new StreamCapacityError("The session event hub is closed.");
    if (!isSessionInfo(session) || !this.#validView(session, activeTurn, latestTurn))
      throw new TypeError("Invalid session event snapshot metadata.");
    const parsedCursor = cursor === undefined ? undefined : parseCursor(cursor, session.id);
    if (this.#subscriberCount >= this.#maxSubscribers) throw new SubscriberLimitError();
    const existing = this.#streams.get(session.id);
    if (existing && existing.subscribers.size >= this.#maxSubscribersPerSession)
      throw new SubscriberLimitError();
    const stream = this.#getOrCreate(session.id);
    if (!stream) throw new StreamCapacityError();

    this.#reconcileView(stream, session, activeTurn, latestTurn);
    const initial = this.#initialFrames(stream, parsedCursor);
    const subscriber: Subscriber = { listener, active: true };
    stream.subscribers.add(subscriber);
    this.#subscriberCount += 1;
    this.#touch(stream);
    return {
      initial,
      unsubscribe: () => this.#removeSubscriber(stream, subscriber),
    };
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const stream of this.#streams.values()) {
      for (const subscriber of stream.subscribers) subscriber.active = false;
      stream.subscribers.clear();
    }
    this.#streams.clear();
    this.#subscriberCount = 0;
  }

  #validView(
    session: SessionInfo,
    activeTurn: TurnInfo | null,
    latestTurn: TurnInfo | null,
  ): boolean {
    return (
      isSessionInfo(session) &&
      (activeTurn === null ||
        (isTurnInfo(activeTurn) &&
          activeTurn.sessionId === session.id &&
          activeTurn.runId === session.activeTurnId)) &&
      (latestTurn === null ||
        (isTurnInfo(latestTurn) &&
          latestTurn.sessionId === session.id &&
          latestTurn.runId === session.latestTurnId)) &&
      (activeTurn !== null || session.activeTurnId === null) &&
      (latestTurn !== null || session.latestTurnId === null)
    );
  }

  #getOrCreate(sessionId: string): SessionStream | undefined {
    if (this.#closed) return undefined;
    const existing = this.#streams.get(sessionId);
    if (existing) {
      this.#touch(existing);
      return existing;
    }
    if (this.#streams.size >= this.#maxSessions) {
      let candidate: SessionStream | undefined;
      for (const stream of this.#streams.values()) {
        if (stream.activeRunId !== null || stream.subscribers.size !== 0) continue;
        if (!candidate || stream.lastUsed < candidate.lastUsed) candidate = stream;
      }
      if (!candidate) return undefined;
      this.#streams.delete(candidate.sessionId);
    }
    const stream: SessionStream = {
      sessionId,
      epoch: randomUUID(),
      sequence: 0,
      replay: [],
      replayBytes: 0,
      subscribers: new Set(),
      activeRunId: null,
      view: null,
      live: emptyLiveState(),
      lastUsed: ++this.#tick,
    };
    this.#streams.set(sessionId, stream);
    return stream;
  }

  #touch(stream: SessionStream): void {
    stream.lastUsed = ++this.#tick;
  }

  #removeSubscriber(stream: SessionStream, subscriber: Subscriber): void {
    if (!subscriber.active) return;
    subscriber.active = false;
    if (stream.subscribers.delete(subscriber)) this.#subscriberCount -= 1;
    this.#touch(stream);
  }

  #reconcileView(
    stream: SessionStream,
    session: SessionInfo,
    activeTurn: TurnInfo | null,
    latestTurn: TurnInfo | null,
  ): void {
    const projectedSession = projectSession(session);
    const previous = stream.view;
    if (!previous) {
      const projectedActive = activeTurn ? projectTurn(activeTurn).value : null;
      const projectedLatest = latestTurn ? projectTurn(latestTurn).value : null;
      stream.view = {
        session: projectedSession.value,
        activeTurn: projectedActive,
        latestTurn: projectedLatest,
        metadataTruncated: projectedSession.limited,
      };
      this.#publishViewLimits(
        stream,
        projectedSession.value,
        activeTurn,
        latestTurn,
        projectedSession.limited,
      );
      return;
    }
    const sessionChanged = !equalJson(previous.session, projectedSession.value);
    const projectedActive = activeTurn ? projectTurn(activeTurn).value : null;
    const projectedLatest = latestTurn ? projectTurn(latestTurn).value : null;
    const latestChanged = !equalJson(previous.latestTurn, projectedLatest);
    if (
      (previous.latestTurn?.runId ?? null) !== (projectedLatest?.runId ?? null) &&
      stream.activeRunId !== (projectedLatest?.runId ?? null)
    )
      stream.live = emptyLiveState();
    previous.session = projectedSession.value;
    previous.activeTurn = projectedActive;
    previous.latestTurn = projectedLatest;
    previous.metadataTruncated = projectedSession.limited;
    this.#touch(stream);
    this.#publishViewLimits(
      stream,
      projectedSession.value,
      activeTurn,
      latestTurn,
      projectedSession.limited,
    );
    if (sessionChanged)
      this.#emit(stream, stream.activeRunId, "session.updated", projectedSession.value);
    if (latestChanged && latestTurn) {
      const projectedTurn = projectTurn(latestTurn);
      if (projectedTurn.limited) this.#limited(stream, "metadata", MAX_TURN_ERROR_JSON_BYTES);
      this.#emit(stream, latestTurn.runId, "turn.updated", projectedTurn.value);
    }
  }

  #publishViewLimits(
    stream: SessionStream,
    _session: SessionInfo,
    activeTurn: TurnInfo | null,
    latestTurn: TurnInfo | null,
    sessionLimited: boolean,
  ): void {
    if (sessionLimited) this.#limited(stream, "metadata", MAX_METADATA_DIRECTORY_JSON_BYTES);
    for (const candidate of [activeTurn, latestTurn]) {
      if (candidate && projectTurn(candidate).limited)
        this.#limited(stream, "metadata", MAX_TURN_ERROR_JSON_BYTES);
    }
  }

  #initialFrames(stream: SessionStream, cursor: ParsedCursor | undefined): StreamFrame[] {
    if (cursor === undefined) return [this.#snapshotFrame(stream)];
    if (cursor.epoch !== stream.epoch)
      return [this.#resyncFrame(stream, "epoch_changed"), this.#snapshotFrame(stream)];
    if (cursor.sequence > stream.sequence)
      return [this.#resyncFrame(stream, "cursor_ahead"), this.#snapshotFrame(stream)];
    const earliestAccepted =
      stream.replay[0]?.sequence !== undefined
        ? (stream.replay[0]?.sequence ?? 1) - 1
        : stream.sequence;
    if (cursor.sequence < earliestAccepted)
      return [this.#resyncFrame(stream, "cursor_stale"), this.#snapshotFrame(stream)];
    const replay = stream.replay
      .filter((event) => event.sequence > cursor.sequence)
      .map((event) => copyFrame(event.frame));
    const replayBytes = replay.reduce(
      (total, frame) => total + eventSize(frame) + SSE_FRAME_OVERHEAD_BYTES,
      0,
    );
    if (replayBytes > MAX_REPLAY_INITIAL_BYTES)
      return [this.#resyncFrame(stream, "replay_limit"), this.#snapshotFrame(stream)];
    return replay;
  }

  #snapshotFrame(stream: SessionStream): StreamFrame {
    const view = stream.view;
    if (!view) throw new Error("Session event stream has no metadata snapshot.");
    const snapshot: SessionSnapshot = {
      session: structuredClone(view.session),
      activeTurn: view.activeTurn ? structuredClone(view.activeTurn) : null,
      latestTurn: view.latestTurn ? structuredClone(view.latestTurn) : null,
      metadataTruncated: view.metadataTruncated,
      live: {
        message: stream.live.message ? structuredClone(stream.live.message) : null,
        tools: stream.live.tools.map((tool) => structuredClone(tool)),
        truncated: stream.live.truncated,
      },
    };
    const frame: unknown = {
      sessionId: stream.sessionId,
      cursor: this.#cursor(stream),
      type: "snapshot",
      payload: snapshot,
    };
    if (isStreamFrame(frame)) return copyFrame(frame);
    const fallback: unknown = {
      sessionId: stream.sessionId,
      cursor: this.#cursor(stream),
      type: "snapshot",
      payload: { ...snapshot, live: { message: null, tools: [], truncated: true } },
    };
    if (isStreamFrame(fallback)) return copyFrame(fallback);
    throw new StreamCapacityError("The session event snapshot exceeded its size limit.");
  }

  #resyncFrame(
    stream: SessionStream,
    reason: "cursor_stale" | "cursor_ahead" | "epoch_changed" | "replay_limit",
  ): StreamFrame {
    const frame: unknown = {
      sessionId: stream.sessionId,
      cursor: null,
      type: "resync",
      payload: { reason },
    };
    if (!isStreamFrame(frame)) throw new Error("Invalid resynchronization frame.");
    return copyFrame(frame);
  }

  #cursor(stream: SessionStream): string {
    return `${stream.sessionId}:${stream.epoch}:${stream.sequence}`;
  }

  #emit<T extends EventType>(
    stream: SessionStream,
    runId: string | null,
    type: T,
    payload: PayloadFor<T>,
  ): void {
    if (this.#closed) return;
    const sequence = stream.sequence + 1;
    const candidate: unknown = {
      sessionId: stream.sessionId,
      runId,
      cursor: `${stream.sessionId}:${stream.epoch}:${sequence}`,
      type,
      payload: structuredClone(payload),
    };
    if (!isStreamFrame(candidate) || !asReplayable(candidate)) return;
    const bytes = eventSize(candidate);
    if (bytes > STREAM_EVENT_MAX_BYTES || bytes > this.#maxReplayBytes) return;

    stream.sequence = sequence;
    const replayFrame = copyFrame(candidate);
    if (!asReplayable(replayFrame)) return;
    stream.replay.push({ sequence, bytes, frame: replayFrame });
    stream.replayBytes += bytes;
    while (
      stream.replay.length > this.#maxReplayEvents ||
      stream.replayBytes > this.#maxReplayBytes
    ) {
      const removed = stream.replay.shift();
      if (removed) stream.replayBytes -= removed.bytes;
    }

    for (const subscriber of [...stream.subscribers]) {
      if (!subscriber.active) continue;
      try {
        const result = subscriber.listener(copyFrame(candidate));
        if (result)
          void Promise.resolve(result).catch(() => this.#removeSubscriber(stream, subscriber));
      } catch {
        this.#removeSubscriber(stream, subscriber);
      }
      if (this.#closed) break;
    }
  }

  #limited(stream: SessionStream, scope: ProjectionLimitScope, limit: number): void {
    if (stream.live.limited.has(scope)) return;
    stream.live.limited.add(scope);
    if (scope !== "metadata") stream.live.truncated = true;
    this.#emit(stream, stream.activeRunId, "projection.limited", { scope, limit });
  }

  #projectionError(stream: SessionStream): void {
    if (stream.live.projectionErrorReported) return;
    stream.live.projectionErrorReported = true;
    this.#emit(stream, stream.activeRunId, "projection.error", {
      code: "invalid_pi_event",
      message: "A live Pi event could not be projected.",
    });
  }

  #messageStart(stream: SessionStream, event: RpcRecord): void {
    if (!isRecord(event.message) || typeof event.message.role !== "string") {
      this.#projectionError(stream);
      return;
    }
    if (event.message.role !== "assistant") return;
    // Pi's message_start payload can already reflect the first provider chunk;
    // text_delta events carry that chunk too, so start with an empty accumulator.
    this.#setMessage(stream, "", false, "message.started");
  }

  #messageUpdate(stream: SessionStream, event: RpcRecord): void {
    if (
      !isRecord(event.assistantMessageEvent) ||
      typeof event.assistantMessageEvent.type !== "string"
    ) {
      this.#projectionError(stream);
      return;
    }
    if (event.assistantMessageEvent.type !== "text_delta") return;
    if (typeof event.assistantMessageEvent.delta !== "string") {
      this.#projectionError(stream);
      return;
    }
    const current = stream.live.message;
    if (!current) this.#setMessage(stream, "", false, "message.started");
    const active = stream.live.message;
    if (!active || active.truncated) return;
    const bounded = appendBoundedJsonString(
      active.text,
      event.assistantMessageEvent.delta,
      MAX_MESSAGE_JSON_BYTES,
    );
    if (bounded.delta.length === 0 && !bounded.truncated) return;
    const message: LiveMessage = { ...active, text: bounded.value, truncated: bounded.truncated };
    stream.live.message = message;
    stream.live.truncated ||= bounded.truncated;
    if (bounded.truncated) this.#limited(stream, "message", MAX_MESSAGE_JSON_BYTES);
    const delta: LiveMessageDelta = {
      messageId: message.id,
      text: bounded.delta,
      truncated: bounded.truncated,
    };
    this.#emit(stream, stream.activeRunId, "message.delta", delta);
  }

  #messageEnd(stream: SessionStream, event: RpcRecord): void {
    if (!isRecord(event.message) || typeof event.message.role !== "string") {
      this.#projectionError(stream);
      return;
    }
    if (event.message.role !== "assistant") return;
    const text = this.#messageText(event.message);
    const current = stream.live.message;
    if (!current) this.#setMessage(stream, text, true, "message.finished");
    else {
      const bounded = boundedJsonString(text, MAX_MESSAGE_JSON_BYTES);
      const message: LiveMessage = {
        ...current,
        text: bounded.value,
        finished: true,
        truncated: current.truncated || bounded.truncated,
      };
      stream.live.message = message;
      stream.live.truncated ||= bounded.truncated;
      if (bounded.truncated) this.#limited(stream, "message", MAX_MESSAGE_JSON_BYTES);
      this.#emit(stream, stream.activeRunId, "message.finished", message);
    }
  }

  #messageText(message: Record<string, unknown>): string {
    if (message.content === undefined) return "";
    if (!Array.isArray(message.content)) {
      this.#projectionErrorForMessage();
      return "";
    }
    const pieces: string[] = [];
    for (const block of message.content) {
      if (isRecord(block) && block.type === "text" && typeof block.text === "string")
        pieces.push(block.text);
    }
    return pieces.join("");
  }

  #projectionErrorForMessage(): void {
    // A malformed content value is reported by its caller's guarded projection path.
    throw new Error("Invalid assistant message content.");
  }

  #setMessage(
    stream: SessionStream,
    text: string,
    finished: boolean,
    type: "message.started" | "message.finished",
  ): void {
    const bounded = boundedJsonString(text, MAX_MESSAGE_JSON_BYTES);
    const message: LiveMessage = {
      id: randomUUID(),
      text: bounded.value,
      finished,
      truncated: bounded.truncated,
    };
    stream.live.message = message;
    stream.live.truncated ||= bounded.truncated;
    if (bounded.truncated) this.#limited(stream, "message", MAX_MESSAGE_JSON_BYTES);
    this.#emit(stream, stream.activeRunId, type, message);
  }

  #toolStart(stream: SessionStream, event: RpcRecord): void {
    const rawId = this.#toolEventId(event);
    const name = this.#toolEventName(event);
    if (!rawId || !name) {
      this.#projectionError(stream);
      return;
    }
    const input = clippedToolInput(event.args);
    const tool = this.#getTool(stream, rawId, name, input);
    if (!tool) return;
    tool.name = boundedJsonString(name, MAX_TOOL_NAME_JSON_BYTES).value;
    tool.input = input.value;
    tool.status = "running";
    tool.truncated ||= input.truncated || jsonStringBytes(name) > MAX_TOOL_NAME_JSON_BYTES;
    if (input.truncated) this.#limited(stream, "tool_input", MAX_TOOL_FIELD_JSON_BYTES);
    if (jsonStringBytes(name) > MAX_TOOL_NAME_JSON_BYTES)
      this.#limited(stream, "tool_name", MAX_TOOL_NAME_JSON_BYTES);
    this.#emit(stream, stream.activeRunId, "tool.started", structuredClone(tool));
  }

  #toolUpdate(stream: SessionStream, event: RpcRecord): void {
    const rawId = this.#toolEventId(event);
    const name = this.#toolEventName(event);
    if (!rawId || !name) {
      this.#projectionError(stream);
      return;
    }
    const input = clippedToolInput(event.args);
    const tool = this.#getTool(stream, rawId, name, input);
    if (!tool) return;
    const output = clippedToolText(event.partialResult);
    tool.name = boundedJsonString(name, MAX_TOOL_NAME_JSON_BYTES).value;
    if (event.args !== undefined) tool.input = input.value;
    tool.output = output.value;
    tool.status = "running";
    tool.truncated ||=
      input.truncated || output.truncated || jsonStringBytes(name) > MAX_TOOL_NAME_JSON_BYTES;
    if (input.truncated) this.#limited(stream, "tool_input", MAX_TOOL_FIELD_JSON_BYTES);
    if (output.truncated) this.#limited(stream, "tool_output", MAX_TOOL_FIELD_JSON_BYTES);
    if (jsonStringBytes(name) > MAX_TOOL_NAME_JSON_BYTES)
      this.#limited(stream, "tool_name", MAX_TOOL_NAME_JSON_BYTES);
    this.#emit(stream, stream.activeRunId, "tool.updated", structuredClone(tool));
  }

  #toolEnd(stream: SessionStream, event: RpcRecord): void {
    const rawId = this.#toolEventId(event);
    const name = this.#toolEventName(event);
    if (!rawId || !name || typeof event.isError !== "boolean") {
      this.#projectionError(stream);
      return;
    }
    const input = clippedToolInput(event.args);
    const tool = this.#getTool(stream, rawId, name, input);
    if (!tool) return;
    const output = clippedToolText(event.result);
    tool.name = boundedJsonString(name, MAX_TOOL_NAME_JSON_BYTES).value;
    if (event.args !== undefined) tool.input = input.value;
    tool.output = output.value;
    tool.status = event.isError ? "failed" : "completed";
    tool.truncated ||=
      input.truncated || output.truncated || jsonStringBytes(name) > MAX_TOOL_NAME_JSON_BYTES;
    if (input.truncated) this.#limited(stream, "tool_input", MAX_TOOL_FIELD_JSON_BYTES);
    if (output.truncated) this.#limited(stream, "tool_output", MAX_TOOL_FIELD_JSON_BYTES);
    if (jsonStringBytes(name) > MAX_TOOL_NAME_JSON_BYTES)
      this.#limited(stream, "tool_name", MAX_TOOL_NAME_JSON_BYTES);
    this.#emit(stream, stream.activeRunId, "tool.finished", structuredClone(tool));
  }

  #getTool(
    stream: SessionStream,
    rawId: string,
    name: string,
    input: BoundedText,
  ): LiveTool | undefined {
    const existingId = stream.live.toolIds.get(rawId);
    const existing = existingId
      ? stream.live.tools.find((tool) => tool.id === existingId)
      : undefined;
    if (existing) return existing;
    if (stream.live.tools.length >= MAX_TOOLS) {
      this.#limited(stream, "tool_count", MAX_TOOLS);
      return undefined;
    }
    const boundedName = boundedJsonString(name, MAX_TOOL_NAME_JSON_BYTES);
    const tool: LiveTool = {
      id: randomUUID(),
      name: boundedName.value,
      input: input.value,
      output: "",
      status: "running",
      truncated: input.truncated || boundedName.truncated,
    };
    stream.live.tools.push(tool);
    stream.live.toolIds.set(rawId, tool.id);
    if (input.truncated) this.#limited(stream, "tool_input", MAX_TOOL_FIELD_JSON_BYTES);
    if (boundedName.truncated) this.#limited(stream, "tool_name", MAX_TOOL_NAME_JSON_BYTES);
    return tool;
  }

  #toolEventId(event: RpcRecord): string | null {
    if (typeof event.toolCallId !== "string" || event.toolCallId.length === 0) return null;
    if (event.toolCallId.length > MAX_TOOL_CALL_ID_BYTES) return null;
    return encoder.encode(event.toolCallId).byteLength <= MAX_TOOL_CALL_ID_BYTES
      ? event.toolCallId
      : null;
  }

  #toolEventName(event: RpcRecord): string | null {
    return typeof event.toolName === "string" && event.toolName.length > 0 ? event.toolName : null;
  }
}

function boundedLimit(value: number | undefined, maximum: number, minimum = 1): number {
  if (value === undefined) return maximum;
  if (!Number.isSafeInteger(value) || value < minimum)
    throw new RangeError("Session event limits must be positive safe integers.");
  return Math.min(value, maximum);
}
