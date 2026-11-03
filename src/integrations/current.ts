import { pathToFileURL } from "node:url";
import {
  LIBRARY_EXCERPT_CHARACTERS,
  LIBRARY_READ_CHARACTERS,
  LIBRARY_SEARCH_LIMIT,
  isLibraryLatestRequest,
  isLibraryReference,
  isLibrarySearchRequest,
  type LibraryErrorCode,
  type LibraryItemView,
  type LibraryItemsResponse,
  type LibraryLatestResponse,
} from "../shared/library.ts";
import { validateDataDirectory } from "../local/paths.ts";

/** Validated by readIntegrations before the optional adapter is opened. */
export interface CurrentLibraryConfig {
  module: string;
  root: string;
  binding: string;
}

interface CurrentLibraryModuleV1 {
  contentLibraryApiVersion: 1;
  openContentLibrary(options: { root: string }): unknown;
}

/** Structural subset of the installed `pi-current/library` API v1 declaration. */
interface CurrentContentLibraryV1 {
  apiVersion: 1;
  search(
    request: { query: string; source?: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<CurrentContentItem[]>;
  latest(sourceId?: string, signal?: AbortSignal): Promise<CurrentLibraryBatch | undefined>;
  read(
    request: { itemId: string; versionId?: string; maxCharacters?: number },
    signal?: AbortSignal,
  ): Promise<CurrentContentItem | undefined>;
  close(): Promise<void>;
}

interface CurrentContentItem {
  itemId: string;
  versionId: string;
  sourceId: string;
  title: string;
  url: string;
  text: string;
  retrievedAt: string;
  sourceCompleteness: "unknown" | "known-partial";
  truncated: boolean;
  author?: string;
  summary?: string;
  displayTruncated?: boolean;
}

interface CurrentLibraryBatch {
  collectedAt: string;
  items: CurrentContentItem[];
}

const ERROR_MESSAGES: Record<LibraryErrorCode, string> = {
  library_unavailable: "The configured Current library is unavailable.",
  library_not_found: "This saved item version is unavailable.",
  library_binding_mismatch: "This item reference belongs to a different library.",
  invalid_input: "Provide a valid library request.",
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLibraryModule(value: unknown): value is CurrentLibraryModuleV1 {
  return (
    record(value) &&
    Object.hasOwn(value, "contentLibraryApiVersion") &&
    value.contentLibraryApiVersion === 1 &&
    Object.hasOwn(value, "openContentLibrary") &&
    typeof value.openContentLibrary === "function"
  );
}

function isContentLibrary(value: unknown): value is CurrentContentLibraryV1 {
  return (
    record(value) &&
    value.apiVersion === 1 &&
    typeof value.search === "function" &&
    typeof value.latest === "function" &&
    typeof value.read === "function" &&
    typeof value.close === "function"
  );
}

function clip(value: string, limit: number): { text: string; truncated: boolean } {
  const characters: string[] = [];
  for (const character of value) {
    if (characters.length === limit) return { text: characters.join(""), truncated: true };
    characters.push(character);
  }
  return { text: characters.join(""), truncated: false };
}

function unavailable(): CurrentLibraryError {
  return new CurrentLibraryError("library_unavailable");
}

export class CurrentLibraryError extends Error {
  readonly code: LibraryErrorCode;

  constructor(code: LibraryErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "CurrentLibraryError";
    this.code = code;
  }
}

/** Read-only projection of one configured pi-current/library API v1 instance. */
export class CurrentLibrary {
  readonly binding: string;
  readonly root: string;
  readonly #api: CurrentContentLibraryV1;

  private constructor(binding: string, root: string, api: CurrentContentLibraryV1) {
    this.binding = binding;
    this.root = root;
    this.#api = api;
  }

  static async open(config?: CurrentLibraryConfig): Promise<CurrentLibrary | undefined> {
    if (config === undefined) return undefined;

    let root: string;
    try {
      root = await validateDataDirectory(config.root);
    } catch {
      throw unavailable();
    }

    let loaded: unknown;
    try {
      loaded = await import(pathToFileURL(config.module).href);
    } catch {
      throw unavailable();
    }
    if (!isLibraryModule(loaded)) throw unavailable();

    let api: unknown;
    try {
      api = loaded.openContentLibrary({ root });
    } catch {
      throw unavailable();
    }
    if (!isContentLibrary(api)) throw unavailable();
    return new CurrentLibrary(config.binding, root, api);
  }

  async search(input: unknown, signal?: AbortSignal): Promise<LibraryItemsResponse> {
    if (!isLibrarySearchRequest(input)) throw new CurrentLibraryError("invalid_input");
    const request = {
      query: input.query,
      ...(input.source === undefined ? {} : { source: input.source }),
      limit: input.limit ?? LIBRARY_SEARCH_LIMIT,
    };
    const values = await this.#call(() => this.#api.search(request, signal), signal);
    const items = values
      .slice(0, request.limit)
      .map((value) => this.#project(value, LIBRARY_EXCERPT_CHARACTERS));
    return { binding: this.binding, items };
  }

  async latest(input: unknown = {}, signal?: AbortSignal): Promise<LibraryLatestResponse> {
    if (!isLibraryLatestRequest(input)) throw new CurrentLibraryError("invalid_input");
    const batch = await this.#call(() => this.#api.latest(input.source, signal), signal);
    if (batch === undefined) return { binding: this.binding, collectedAt: null, items: [] };
    const limit = input.limit ?? LIBRARY_SEARCH_LIMIT;
    const items = batch.items
      .slice(0, limit)
      .map((value) => this.#project(value, LIBRARY_EXCERPT_CHARACTERS));
    return { binding: this.binding, collectedAt: batch.collectedAt, items };
  }

  async read(input: unknown, signal?: AbortSignal): Promise<LibraryItemView> {
    if (!isLibraryReference(input)) throw new CurrentLibraryError("invalid_input");
    if (input.binding !== this.binding) throw new CurrentLibraryError("library_binding_mismatch");
    const item = await this.#call(
      () =>
        this.#api.read(
          {
            itemId: input.itemId,
            versionId: input.versionId,
            maxCharacters: LIBRARY_READ_CHARACTERS,
          },
          signal,
        ),
      signal,
    );
    if (item === undefined) throw new CurrentLibraryError("library_not_found");
    return this.#project(item, LIBRARY_READ_CHARACTERS);
  }

  async close(): Promise<void> {
    try {
      await this.#api.close();
    } catch {
      throw unavailable();
    }
  }

  async #call<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    try {
      return await operation();
    } catch (error) {
      if (signal?.aborted) throw error;
      throw unavailable();
    }
  }

  #project(value: CurrentContentItem, textLimit: number): LibraryItemView {
    const text = clip(value.text, textLimit);
    const title = clip(value.title, 500);
    const author = value.author === undefined ? undefined : clip(value.author, 250);
    const summary = value.summary === undefined ? undefined : clip(value.summary, 1_000);
    return {
      reference: {
        binding: this.binding,
        itemId: value.itemId,
        versionId: value.versionId,
      },
      sourceId: value.sourceId,
      title: title.text,
      url: value.url,
      text: text.text,
      retrievedAt: value.retrievedAt,
      sourceCompleteness: value.sourceCompleteness,
      truncated: value.truncated,
      displayTruncated:
        value.displayTruncated === true ||
        text.truncated ||
        title.truncated ||
        author?.truncated === true ||
        summary?.truncated === true,
      ...(author === undefined ? {} : { author: author.text }),
      ...(summary === undefined ? {} : { summary: summary.text }),
    };
  }
}
