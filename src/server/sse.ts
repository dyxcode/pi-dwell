import type { ServerResponse } from "node:http";
import { isStreamFrame, type StreamFrame } from "../shared/events.ts";

const MAX_BUFFER_BYTES = 256 * 1024;
const HEARTBEAT = Buffer.from(": heartbeat\n\n");
const STREAM_ERROR_FLUSH_MS = 1000;

export class SseStartError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface SseConnection {
  enqueue(frame: StreamFrame): void;
  start(initial: readonly StreamFrame[], unsubscribe: () => void): void;
  revalidate(): boolean;
  close(): void;
}

export interface SseConnectionOptions {
  heartbeatMs?: number;
  isAuthorized(): boolean;
  onClose?(): void;
}

function encodeFrame(frame: StreamFrame): Buffer {
  if (
    !isStreamFrame(frame) ||
    typeof frame.type !== "string" ||
    !/^[A-Za-z0-9_.-]+$/u.test(frame.type) ||
    (frame.cursor !== null && /[\r\n\0]/u.test(frame.cursor))
  ) {
    throw new Error("Invalid SSE event frame.");
  }
  const data = JSON.stringify(frame);
  if (data === undefined) throw new Error("Invalid SSE event frame.");
  const lines = [`event: ${frame.type}`];
  if (frame.cursor !== null) lines.push(`id: ${frame.cursor}`);
  lines.push(`data: ${data}`);
  return Buffer.from(`${lines.join("\n")}\n\n`);
}

/** A bounded per-response SSE writer. Stream data never enters shared hub state. */
export function createSseConnection(
  response: ServerResponse,
  { heartbeatMs = 15_000, isAuthorized, onClose }: SseConnectionOptions,
): SseConnection {
  if (!Number.isFinite(heartbeatMs) || heartbeatMs < 1)
    throw new Error("SSE heartbeat interval must be positive.");

  const queue: Buffer[] = [];
  let queueBytes = 0;
  let started = false;
  let blocked = false;
  let closed = false;
  let ending = false;
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let errorFlushTimer: ReturnType<typeof setTimeout> | undefined;
  let startFailure: SseStartError | undefined;

  const detach = (): void => {
    response.off("drain", onDrain);
    response.off("close", onCloseResponse);
    response.off("error", onErrorResponse);
  };

  const stopTimers = (): void => {
    if (heartbeat) clearInterval(heartbeat);
    if (errorFlushTimer) clearTimeout(errorFlushTimer);
    heartbeat = undefined;
    errorFlushTimer = undefined;
  };

  const release = (): void => {
    if (closed) return;
    closed = true;
    stopTimers();
    queue.length = 0;
    queueBytes = 0;
    blocked = false;
    detach();
    const remove = unsubscribe;
    unsubscribe = undefined;
    try {
      remove?.();
    } catch {
      // Observer cleanup must not escape into the event producer.
    }
    try {
      onClose?.();
    } catch {
      // Host bookkeeping must not escape into the event producer.
    }
  };

  const terminate = (destroy: boolean): void => {
    if (closed) return;
    if (!started && !response.headersSent) {
      release();
      return;
    }
    release();
    if (destroy) {
      if (!response.destroyed) response.destroy();
    } else if (!response.destroyed && !response.writableEnded) {
      try {
        response.end();
      } catch {
        response.destroy();
      }
    }
  };

  const authorized = (): boolean => {
    try {
      return isAuthorized();
    } catch {
      return false;
    }
  };

  const totalBufferedBytes = (extra = 0): number =>
    Math.max(0, response.writableLength) + queueBytes + extra;

  const enqueueBuffer = (buffer: Buffer): void => {
    if (closed || ending || startFailure) return;
    if (totalBufferedBytes(buffer.byteLength) > MAX_BUFFER_BYTES) {
      if (!started && !response.headersSent) {
        startFailure = new SseStartError(
          "stream_overloaded",
          "The initial session snapshot exceeds the stream buffer limit.",
        );
      } else terminate(true);
      return;
    }
    queue.push(buffer);
    queueBytes += buffer.byteLength;
    if (started) pump();
  };

  const pump = (): void => {
    if (!started || blocked || closed || startFailure) return;
    while (queue.length > 0) {
      if (!authorized()) {
        terminate(true);
        return;
      }
      const buffer = queue.shift();
      if (!buffer) return;
      queueBytes -= buffer.byteLength;
      let canContinue: boolean;
      try {
        canContinue = response.write(buffer);
      } catch {
        terminate(true);
        return;
      }
      if (!canContinue) {
        blocked = true;
        return;
      }
    }
    if (ending) terminate(false);
  };

  function onDrain(): void {
    blocked = false;
    pump();
  }

  function onCloseResponse(): void {
    release();
  }

  function onErrorResponse(): void {
    terminate(true);
  }

  const heartbeatOnce = (): void => {
    if (closed || ending) return;
    if (!authorized()) {
      terminate(true);
      return;
    }
    enqueueBuffer(HEARTBEAT);
  };

  response.on("drain", onDrain);
  response.on("close", onCloseResponse);
  response.on("error", onErrorResponse);

  return {
    enqueue(frame) {
      if (closed || ending || startFailure) return;
      let buffer: Buffer;
      try {
        buffer = encodeFrame(frame);
      } catch {
        if (!started && !response.headersSent) {
          startFailure = new SseStartError(
            "stream_unavailable",
            "The session stream is unavailable.",
          );
        } else terminate(true);
        return;
      }
      enqueueBuffer(buffer);
      if (frame.type === "stream.error" && !closed) {
        ending = true;
        const remove = unsubscribe;
        unsubscribe = undefined;
        try {
          remove?.();
        } catch {
          // Observer cleanup must not escape into the event producer.
        }
        if (started) {
          errorFlushTimer = setTimeout(() => terminate(true), STREAM_ERROR_FLUSH_MS);
          errorFlushTimer.unref();
          pump();
        }
      }
    },
    start(initial, removeSubscription) {
      if (closed) {
        try {
          removeSubscription();
        } catch {
          // The route will surface its own initialization error.
        }
        if (startFailure) throw startFailure;
        return;
      }
      unsubscribe = removeSubscription;
      if (startFailure) {
        release();
        throw startFailure;
      }

      let initialBuffers: Buffer[];
      try {
        initialBuffers = initial.map(encodeFrame);
      } catch {
        release();
        throw new SseStartError("stream_unavailable", "The session stream is unavailable.");
      }
      const initialBytes = initialBuffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
      if (totalBufferedBytes(initialBytes) > MAX_BUFFER_BYTES) {
        release();
        throw new SseStartError(
          "stream_overloaded",
          "The initial session snapshot exceeds the stream buffer limit.",
        );
      }
      if (!authorized()) {
        release();
        throw new SseStartError("unauthenticated", "The session stream is no longer authorized.");
      }

      queue.unshift(...initialBuffers);
      queueBytes += initialBytes;
      if (ending || initial.some((frame) => frame.type === "stream.error")) {
        ending = true;
        const remove = unsubscribe;
        unsubscribe = undefined;
        try {
          remove?.();
        } catch {
          // Observer cleanup must not escape into the route.
        }
      }

      response.statusCode = 200;
      response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      started = true;
      response.flushHeaders();
      if (ending) {
        errorFlushTimer = setTimeout(() => terminate(true), STREAM_ERROR_FLUSH_MS);
        errorFlushTimer.unref();
      } else {
        heartbeat = setInterval(heartbeatOnce, heartbeatMs);
        heartbeat.unref();
      }
      pump();
    },
    revalidate() {
      if (closed) return false;
      if (authorized()) return true;
      terminate(true);
      return false;
    },
    close() {
      terminate(false);
    },
  };
}
