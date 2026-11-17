import {
  MEMORY_SEARCH_LIMIT,
  MEMORY_QUERY_CODEPOINTS,
  isMemoryReadRequest,
  isMemoryReadResponse,
  isMemorySearchRequest,
  isMemorySearchResponse,
  type MemoryReadRequest,
  type MemorySearchItem,
  type MemorySearchRequest,
} from "../../shared/memory.ts";

export interface MemoryPanelState {
  query: string;
  items: MemorySearchItem[];
  nextCursor: string | null;
  selected: { id: string; revision: number } | null;
  text: string;
  readCursor: string | null;
  searchPending: boolean;
  readPending: boolean;
  searchError: string | null;
  readError: string | null;
}

type MemoryRequest = (path: string, body: unknown) => Promise<unknown>;
type StateChange = (state: MemoryPanelState) => void;

function emptyState(query = ""): MemoryPanelState {
  return {
    query,
    items: [],
    nextCursor: null,
    selected: null,
    text: "",
    readCursor: null,
    searchPending: false,
    readPending: false,
    searchError: null,
    readError: null,
  };
}

function errorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  )
    return error.code;
  return null;
}

function errorText(error: unknown): string {
  switch (errorCode(error)) {
    case "invalid_input":
      return `Enter a search query of up to ${MEMORY_QUERY_CODEPOINTS} characters.`;
    case "memory_not_found":
      return "This memory is no longer available. Search again.";
    case "memory_changed":
      return "This memory changed while it was being read. Search again to load the current version.";
    case "invalid_cursor":
      return "This page is no longer valid. Start a new search or reading.";
    case "memory_unavailable":
      return "Memory is temporarily unavailable. Retry when Distill is ready.";
  }
  return error instanceof Error ? error.message : "The memory request could not be completed.";
}

function copyState(state: MemoryPanelState): MemoryPanelState {
  return {
    ...state,
    items: state.items.map((item) => ({ ...item })),
    selected: state.selected ? { ...state.selected } : null,
  };
}

export class MemoryPanel {
  #request: MemoryRequest;
  #changed: StateChange;
  #state = emptyState();
  #searchGeneration = 0;
  #readGeneration = 0;

  constructor(request: MemoryRequest, changed: StateChange = () => {}) {
    this.#request = request;
    this.#changed = changed;
  }

  get state(): MemoryPanelState {
    return copyState(this.#state);
  }

  setQuery(query: string): void {
    if (query === this.#state.query) return;
    this.#searchGeneration++;
    this.#readGeneration++;
    this.#state = emptyState(query);
    this.#emit();
  }

  async search(query = this.#state.query): Promise<void> {
    this.setQuery(query);
    const searchGeneration = ++this.#searchGeneration;
    this.#readGeneration++;
    const trimmedQuery = query.trim();
    const request: MemorySearchRequest = { query: trimmedQuery, limit: MEMORY_SEARCH_LIMIT };
    if (!isMemorySearchRequest(request)) {
      this.#state = {
        ...emptyState(query),
        searchError: `Enter a search query of up to ${MEMORY_QUERY_CODEPOINTS} characters.`,
      };
      this.#emit();
      return;
    }
    this.#state = {
      ...emptyState(query),
      searchPending: true,
    };
    this.#emit();
    try {
      const value = await this.#request("/api/v1/memory/search", request);
      if (searchGeneration !== this.#searchGeneration) return;
      if (!isMemorySearchResponse(value))
        throw new Error("The host returned an invalid memory page.");
      this.#state = {
        ...this.#state,
        items: value.items,
        nextCursor: value.nextCursor ?? null,
        searchPending: false,
      };
      this.#emit();
    } catch (error) {
      if (searchGeneration !== this.#searchGeneration) return;
      this.#state = {
        ...this.#state,
        searchPending: false,
        searchError: errorText(error),
        nextCursor: errorCode(error) === "invalid_cursor" ? null : this.#state.nextCursor,
      };
      this.#emit();
    }
  }

  async continueSearch(): Promise<void> {
    const { query, nextCursor, items } = this.#state;
    if (nextCursor === null || this.#state.searchPending) return;
    const request: MemorySearchRequest = {
      query: query.trim(),
      cursor: nextCursor,
      limit: MEMORY_SEARCH_LIMIT,
    };
    if (!isMemorySearchRequest(request)) {
      this.#state = { ...this.#state, searchError: "This search page is no longer valid." };
      this.#emit();
      return;
    }
    const searchGeneration = this.#searchGeneration;
    this.#state = { ...this.#state, searchPending: true, searchError: null };
    this.#emit();
    try {
      const value = await this.#request("/api/v1/memory/search", request);
      if (searchGeneration !== this.#searchGeneration) return;
      if (!isMemorySearchResponse(value))
        throw new Error("The host returned an invalid memory page.");
      this.#state = {
        ...this.#state,
        items: [...items, ...value.items],
        nextCursor: value.nextCursor ?? null,
        searchPending: false,
      };
      this.#emit();
    } catch (error) {
      if (searchGeneration !== this.#searchGeneration) return;
      this.#state = {
        ...this.#state,
        searchPending: false,
        searchError: errorText(error),
        nextCursor: errorCode(error) === "invalid_cursor" ? null : this.#state.nextCursor,
      };
      this.#emit();
    }
  }

  async read(item: Pick<MemorySearchItem, "id" | "revision">): Promise<void> {
    const request: MemoryReadRequest = { id: item.id, expectedRevision: item.revision };
    if (!isMemoryReadRequest(request)) {
      this.#state = { ...this.#state, readError: "This memory reference is no longer valid." };
      this.#emit();
      return;
    }
    const queryGeneration = this.#searchGeneration;
    const readGeneration = ++this.#readGeneration;
    this.#state = {
      ...this.#state,
      selected: { id: item.id, revision: item.revision },
      text: "",
      readCursor: null,
      readPending: true,
      readError: null,
    };
    this.#emit();
    try {
      const value = await this.#request("/api/v1/memory/read", request);
      if (queryGeneration !== this.#searchGeneration || readGeneration !== this.#readGeneration)
        return;
      if (!isMemoryReadResponse(value))
        throw new Error("The host returned an invalid memory page.");
      if (value.id !== item.id || value.revision !== item.revision)
        throw Object.assign(new Error("This memory changed while it was being read."), {
          code: "memory_changed",
        });
      this.#state = {
        ...this.#state,
        text: value.text,
        readCursor: value.nextCursor ?? null,
        readPending: false,
      };
      this.#emit();
    } catch (error) {
      if (queryGeneration !== this.#searchGeneration || readGeneration !== this.#readGeneration)
        return;
      const terminalRead = ["invalid_cursor", "memory_changed", "memory_not_found"].includes(
        errorCode(error) ?? "",
      );
      this.#state = {
        ...this.#state,
        readPending: false,
        readError: errorText(error),
        text: terminalRead ? "" : this.#state.text,
        readCursor: terminalRead ? null : this.#state.readCursor,
      };
      this.#emit();
    }
  }

  async continueReading(): Promise<void> {
    const { selected, readCursor, text } = this.#state;
    if (selected === null || readCursor === null || this.#state.readPending) return;
    const request: MemoryReadRequest = {
      id: selected.id,
      expectedRevision: selected.revision,
      cursor: readCursor,
    };
    if (!isMemoryReadRequest(request)) {
      this.#state = { ...this.#state, readError: "This reading page is no longer valid." };
      this.#emit();
      return;
    }
    const queryGeneration = this.#searchGeneration;
    const readGeneration = ++this.#readGeneration;
    this.#state = { ...this.#state, readPending: true, readError: null };
    this.#emit();
    try {
      const value = await this.#request("/api/v1/memory/read", request);
      if (queryGeneration !== this.#searchGeneration || readGeneration !== this.#readGeneration)
        return;
      if (!isMemoryReadResponse(value))
        throw new Error("The host returned an invalid memory page.");
      if (value.id !== selected.id || value.revision !== selected.revision)
        throw Object.assign(new Error("This memory changed while it was being read."), {
          code: "memory_changed",
        });
      this.#state = {
        ...this.#state,
        text: text + value.text,
        readCursor: value.nextCursor ?? null,
        readPending: false,
      };
      this.#emit();
    } catch (error) {
      if (queryGeneration !== this.#searchGeneration || readGeneration !== this.#readGeneration)
        return;
      const terminalRead = ["invalid_cursor", "memory_changed", "memory_not_found"].includes(
        errorCode(error) ?? "",
      );
      this.#state = {
        ...this.#state,
        readPending: false,
        readError: errorText(error),
        text: terminalRead ? "" : this.#state.text,
        readCursor: terminalRead ? null : this.#state.readCursor,
      };
      this.#emit();
    }
  }

  closeReader(): void {
    this.#readGeneration++;
    this.#state = {
      ...this.#state,
      selected: null,
      text: "",
      readCursor: null,
      readPending: false,
      readError: null,
    };
    this.#emit();
  }

  clear(): void {
    this.#searchGeneration++;
    this.#readGeneration++;
    this.#state = emptyState();
    this.#emit();
  }

  #emit(): void {
    this.#changed(this.state);
  }
}
