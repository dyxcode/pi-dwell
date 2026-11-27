import { pathToFileURL } from "node:url";
import { isRecord } from "../runtime/pi-rpc.ts";
import {
  isMemoryErrorCode,
  isMemoryListResponse,
  type MemoryListRequest,
  type MemoryListResponse,
  isMemoryReadResponse,
  isMemorySearchResponse,
  type MemoryErrorCode,
  type MemoryReadRequest,
  type MemoryReadResponse,
  type MemorySearchRequest,
  type MemorySearchResponse,
} from "../shared/memory.ts";
import type { DistillModuleConfiguration } from "./distill.ts";

interface DistillMemoryReaderV1 {
  readonly version: 1;
  list(request: MemoryListRequest): unknown;
  search(request: MemorySearchRequest): unknown;
  read(request: MemoryReadRequest): unknown;
  close(): void;
}

export class MemoryReaderError extends Error {
  readonly code: MemoryErrorCode;

  constructor(code: MemoryErrorCode) {
    super(memoryErrorMessage(code));
    this.name = "MemoryReaderError";
    this.code = code;
  }
}

function memoryErrorMessage(code: MemoryErrorCode): string {
  switch (code) {
    case "invalid_input":
      return "Memory request is invalid.";
    case "memory_not_found":
      return "This memory is unavailable.";
    case "memory_changed":
      return "This memory changed. Search again before reading it.";
    case "invalid_cursor":
      return "Memory cursor is invalid.";
    case "memory_unavailable":
      return "The configured Distill memory reader is unavailable.";
  }
}

function isDistillMemoryReaderV1(value: unknown): value is DistillMemoryReaderV1 {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.list === "function" &&
    typeof value.search === "function" &&
    typeof value.read === "function" &&
    typeof value.close === "function"
  );
}

function closeUnknownReader(value: unknown): void {
  if (!isRecord(value) || typeof value.close !== "function") return;
  try {
    Reflect.apply(value.close, value, []);
  } catch {
    // A malformed reader cannot be retained; best-effort cleanup precedes startup fallback.
  }
}

function asMemoryReaderError(error: unknown): MemoryReaderError {
  if (error instanceof MemoryReaderError) return error;
  if (isRecord(error) && isMemoryErrorCode(error.code)) return new MemoryReaderError(error.code);
  return new MemoryReaderError("memory_unavailable");
}

export class MemoryReader {
  readonly #reader: DistillMemoryReaderV1;

  constructor(reader: DistillMemoryReaderV1) {
    this.#reader = reader;
  }

  async list(request: MemoryListRequest): Promise<MemoryListResponse> {
    try {
      const response: unknown = await this.#reader.list(request);
      if (!isMemoryListResponse(response) || response.items.length > (request.limit ?? 20))
        throw new MemoryReaderError("memory_unavailable");
      return response;
    } catch (error) {
      throw asMemoryReaderError(error);
    }
  }

  async search(request: MemorySearchRequest): Promise<MemorySearchResponse> {
    try {
      const response: unknown = await this.#reader.search(request);
      const maximumItems = request.limit ?? 20;
      if (!isMemorySearchResponse(response) || response.items.length > maximumItems)
        throw new MemoryReaderError("memory_unavailable");
      return response;
    } catch (error) {
      throw asMemoryReaderError(error);
    }
  }

  async read(request: MemoryReadRequest): Promise<MemoryReadResponse> {
    try {
      const response: unknown = await this.#reader.read(request);
      if (!isMemoryReadResponse(response)) throw new MemoryReaderError("memory_unavailable");
      if (response.id !== request.id) throw new MemoryReaderError("memory_unavailable");
      if (response.revision !== request.expectedRevision)
        throw new MemoryReaderError("memory_changed");
      return response;
    } catch (error) {
      throw asMemoryReaderError(error);
    }
  }

  close(): void {
    try {
      this.#reader.close();
    } catch (error) {
      throw asMemoryReaderError(error);
    }
  }
}

export async function openMemoryReader(
  configuration: DistillModuleConfiguration,
): Promise<MemoryReader> {
  const module: unknown = await import(pathToFileURL(configuration.module).href);
  if (!isRecord(module) || typeof module.openMemoryReaderV1 !== "function")
    throw new Error("Distill module must export openMemoryReaderV1.");
  const reader: unknown = await Reflect.apply(module.openMemoryReaderV1, module, [
    configuration.database,
  ]);
  if (!isDistillMemoryReaderV1(reader)) {
    closeUnknownReader(reader);
    throw new Error("Distill module must implement memory reader API version 1.");
  }
  return new MemoryReader(reader);
}
