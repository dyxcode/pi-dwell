const MAX_ACTIVE_READS = 2;
const MAX_QUEUED_READS = 8;

export class HistoryReadBudgetError extends Error {
  constructor() {
    super("The saved history read queue is full.");
    this.name = "HistoryReadBudgetError";
  }
}

interface Waiter {
  signal: AbortSignal | undefined;
  onAbort: (() => void) | undefined;
  start(): void;
}

function abortError(): Error {
  const error = new Error("The saved history read was cancelled while waiting.");
  error.name = "AbortError";
  return error;
}

class HistoryReadBudget {
  #active = 0;
  readonly #queue: Waiter[] = [];

  run<T>(
    operation: () => Promise<T>,
    signal?: AbortSignal,
    { cancelQueuedOnly = false }: { cancelQueuedOnly?: boolean } = {},
  ): Promise<T> {
    const alreadyAborted = signal?.aborted === true;
    if (alreadyAborted && !cancelQueuedOnly) return Promise.reject(abortError());
    // Public reads accepted before shutdown may still start if a permit is immediately free.
    if (this.#active < MAX_ACTIVE_READS && this.#queue.length === 0) {
      this.#active += 1;
      return Promise.resolve()
        .then(operation)
        .finally(() => this.#release());
    }
    if (alreadyAborted) return Promise.reject(abortError());
    if (this.#queue.length >= MAX_QUEUED_READS) return Promise.reject(new HistoryReadBudgetError());

    return new Promise<T>((resolve, reject) => {
      const waiter: Waiter = {
        signal: signal ?? undefined,
        onAbort: undefined,
        start: () => {
          void Promise.resolve()
            .then(operation)
            .then(resolve, reject)
            .finally(() => this.#release());
        },
      };
      if (signal) {
        const onAbort = () => {
          const index = this.#queue.indexOf(waiter);
          if (index < 0) return;
          this.#queue.splice(index, 1);
          signal.removeEventListener("abort", onAbort);
          reject(abortError());
        };
        waiter.onAbort = onAbort;
        this.#queue.push(waiter);
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      } else {
        this.#queue.push(waiter);
      }
    });
  }

  #release(): void {
    this.#active -= 1;
    while (this.#active < MAX_ACTIVE_READS) {
      const waiter = this.#queue[0];
      if (!waiter) return;
      if (waiter.signal?.aborted) {
        waiter.onAbort?.();
        continue;
      }
      this.#queue.shift();
      if (waiter.signal && waiter.onAbort)
        waiter.signal.removeEventListener("abort", waiter.onAbort);
      waiter.onAbort = undefined;
      this.#active += 1;
      waiter.start();
    }
  }
}

const historyReadBudget = new HistoryReadBudget();

/** Runs one native-history file scan under the process-wide concurrency budget. */
export function runWithHistoryReadBudget<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
  options?: { cancelQueuedOnly?: boolean },
): Promise<T> {
  return historyReadBudget.run(operation, signal, options);
}
