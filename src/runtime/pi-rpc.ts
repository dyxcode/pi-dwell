import type { Readable, Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

export type RpcRecord = Record<string, unknown> & { type: string };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface Pending {
  command: string;
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

/** A bounded JSONL connection. It neither owns the child nor decides when a run ends. */
export class PiRpc {
  readonly #input: Writable;
  readonly #record: (record: RpcRecord) => void;
  readonly #failure: (error: Error) => void;
  readonly #timeout: number;
  readonly #pending = new Map<string, Pending>();
  readonly #decoder = new StringDecoder("utf8");
  #buffer = "";
  #nextId = 0;
  #closed: Error | undefined;
  #writes: Promise<void> = Promise.resolve();
  #queuedBytes = 0;

  constructor(
    input: Writable,
    output: Readable,
    timeout: number,
    record: (record: RpcRecord) => void,
    failure: (error: Error) => void,
  ) {
    this.#input = input;
    this.#record = record;
    this.#failure = failure;
    this.#timeout = timeout;
    input.on("error", () =>
      this.fail(new Error("Pi RPC input failed; execution outcome may be unknown.")),
    );
    output.on("error", () => this.fail(new Error("Pi RPC output failed.")));
    output.on("data", (chunk: Buffer) => this.#read(chunk));
    output.on("end", () => {
      const tail = this.#buffer + this.#decoder.end();
      if (tail.length > 0) this.fail(new Error("Pi RPC ended with an incomplete JSONL record."));
    });
  }

  request(command: string, fields: Record<string, unknown> = {}): Promise<unknown> {
    if (this.#closed) return Promise.reject(this.#closed);
    if (this.#pending.size >= 32)
      return Promise.reject(new Error("Too many pending Pi RPC requests."));
    const id = `dwell-${++this.#nextId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(new Error(`Pi RPC ${command} timed out; execution outcome may be unknown.`));
      }, this.#timeout);
      this.#pending.set(id, { command, resolve, reject, timer });
      void this.write({ ...fields, id, type: command }).catch((error: unknown) => {
        this.fail(error instanceof Error ? error : new Error("Pi RPC write failed."));
      });
    });
  }

  write(record: RpcRecord): Promise<void> {
    if (this.#closed) return Promise.reject(this.#closed);
    const line = `${JSON.stringify(record)}\n`;
    const bytes = Buffer.byteLength(line);
    if (bytes > 8 * 1024 * 1024 || this.#queuedBytes + bytes > 16 * 1024 * 1024) {
      return Promise.reject(new Error("Pi RPC write exceeds the buffer limit."));
    }
    this.#queuedBytes += bytes;
    const operation = this.#writes.then(
      () =>
        new Promise<void>((resolve, reject) => {
          if (this.#closed) {
            reject(this.#closed);
            return;
          }
          // Wait for the write callback before sending another record, including under backpressure.
          this.#input.write(line, (error) => (error ? reject(error) : resolve()));
        }),
    );
    this.#writes = operation.catch(() => {});
    return operation.finally(() => {
      this.#queuedBytes -= bytes;
    });
  }

  close(error = new Error("Pi RPC connection closed.")): void {
    if (this.#closed) return;
    this.#closed = error;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
    this.#buffer = "";
  }

  fail(error: Error): void {
    if (this.#closed) return;
    this.close(error);
    this.#failure(error);
  }

  #read(chunk: Buffer): void {
    if (this.#closed) return;
    this.#buffer += this.#decoder.write(chunk);
    for (;;) {
      const end = this.#buffer.indexOf("\n");
      if (end < 0) break;
      const line = this.#buffer.slice(0, end).replace(/\r$/, "");
      this.#buffer = this.#buffer.slice(end + 1);
      if (Buffer.byteLength(line) > 8 * 1024 * 1024) {
        this.fail(new Error("Pi RPC record exceeds 8 MiB."));
        return;
      }
      try {
        const value: unknown = JSON.parse(line);
        if (!isRecord(value) || typeof value.type !== "string")
          throw new Error("Invalid record envelope.");
        if (value.type === "response") {
          this.#response(value);
        } else {
          this.#record({ ...value, type: value.type });
        }
      } catch {
        this.fail(new Error("Pi emitted an invalid RPC record."));
        return;
      }
      if (this.#closed) return;
    }
    if (Buffer.byteLength(this.#buffer) > 8 * 1024 * 1024)
      this.fail(new Error("Pi RPC record exceeds 8 MiB."));
  }

  #response(value: Record<string, unknown>): void {
    if (
      typeof value.id !== "string" ||
      typeof value.command !== "string" ||
      typeof value.success !== "boolean"
    ) {
      throw new Error("Invalid response envelope.");
    }
    const pending = this.#pending.get(value.id);
    if (!pending || pending.command !== value.command) throw new Error("Unmatched Pi response.");
    if (!value.success && typeof value.error !== "string")
      throw new Error("Invalid Pi error response.");
    this.#pending.delete(value.id);
    clearTimeout(pending.timer);
    if (value.success) pending.resolve(value.data);
    else pending.reject(new Error(`Pi rejected ${pending.command}: ${String(value.error)}`));
  }
}
