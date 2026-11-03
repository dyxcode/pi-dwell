import type { DistillChild, DistillRead, DistillStorage } from "../integrations/distill.ts";
import type { StoredSession } from "../storage/catalog.ts";

type SourceSession = Pick<StoredSession, "piSessionId" | "piSessionFile" | "directory">;

export interface OpeningSource {
  onSpawn(pid: number, closed: Promise<void>): void;
  abandon(): void;
}

export class SourceAccessError extends Error {
  constructor() {
    super(
      "Distill source coordination is busy or unavailable. Try again after its current operation finishes.",
    );
    this.name = "SourceAccessError";
  }
}

/** Owns Dwell's short reads and the reservations for its actual Pi children. */
export class SessionSourceAccess {
  readonly #storage: DistillStorage | undefined;
  readonly #reads = new Set<DistillRead>();
  readonly #children = new Set<string>();
  readonly #releases = new Map<string, () => boolean>();

  constructor(storage?: DistillStorage) {
    this.#storage = storage;
    for (const use of storage?.listPendingHostUses() ?? []) {
      if (use.state === "attached" && use.child)
        storage?.recoverHostUse(use.id, { kind: "child-exited", child: use.child });
    }
  }

  async read<T>(source: SourceSession, file: string, read: () => Promise<T>): Promise<T> {
    const storage = this.#storage;
    if (!storage) return read();
    const lease = storage.acquireSourceRead({
      sessionId: source.piSessionId,
      sessionFile: file,
      cwd: source.directory,
    });
    if (!lease) throw new SourceAccessError();
    let value: T;
    try {
      value = await read();
    } catch (error) {
      try {
        this.#releaseRead(lease);
      } catch (releaseError) {
        throw new AggregateError([error, releaseError], "History read and source release failed.");
      }
      throw error;
    }
    this.#releaseRead(lease);
    return value;
  }

  #releaseRead(lease: DistillRead): void {
    try {
      lease.release();
      this.#reads.delete(lease);
    } catch (error) {
      this.#reads.add(lease);
      throw error;
    }
  }

  begin(source: SourceSession): OpeningSource | undefined {
    const storage = this.#storage;
    if (!storage) return undefined;
    const use = storage.beginHostUse({
      sessionId: source.piSessionId,
      cwd: source.directory,
      ...(source.piSessionFile === null ? {} : { sessionFile: source.piSessionFile }),
    });
    if (!use) throw new SourceAccessError();
    let spawned = false;
    return {
      onSpawn: (pid, closed) => {
        spawned = true;
        this.#children.add(use.id);
        let child: DistillChild | undefined;
        try {
          child = use.attachChild(pid);
        } finally {
          void closed.then(() => {
            this.#children.delete(use.id);
            this.#releases.set(use.id, () => {
              if (child) return use.releaseAfterClose(child);
              return storage.recoverHostUse(use.id, { kind: "opening-abandoned" });
            });
            try {
              this.#release(use.id);
            } catch {
              // Keep the durable reservation and retry its release during shutdown.
            }
          });
        }
      },
      abandon: () => {
        if (spawned) return;
        this.#releases.set(use.id, () =>
          storage.recoverHostUse(use.id, { kind: "opening-abandoned" }),
        );
        this.#release(use.id);
      },
    };
  }

  async drain(): Promise<void> {
    // ChildProcess close callbacks run before their awaited stop operation resumes.
    await Promise.resolve();
    const errors: unknown[] = [];
    for (const lease of this.#reads) {
      try {
        this.#releaseRead(lease);
      } catch (error) {
        errors.push(error);
      }
    }
    for (const id of this.#releases.keys()) {
      try {
        this.#release(id);
      } catch (error) {
        errors.push(error);
      }
    }
    if (this.#children.size > 0)
      errors.push(
        new Error("Pi children have not closed; their Distill reservations remain active."),
      );
    if (errors.length > 0)
      throw new AggregateError(errors, "Distill source access could not be drained.");
  }

  #release(id: string): void {
    const release = this.#releases.get(id);
    if (!release) return;
    const completed = release();
    if (!completed && this.#storage?.listPendingHostUses().some((use) => use.id === id))
      throw new Error("Distill retained a host-use reservation after release.");
    this.#releases.delete(id);
  }
}
