import { readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { hasCode } from "../local/paths.ts";
import type { StoredSession } from "../storage/catalog.ts";

function nestedPath(parent: string, path: string): boolean {
  const child = relative(parent, path);
  return child.length > 0 && !child.startsWith("..") && !isAbsolute(child);
}

export class SessionFileError extends Error {
  readonly code = "invalid_history";

  constructor() {
    super("Saved session history is invalid or belongs to another project.");
    this.name = "SessionFileError";
  }
}

/** Resolves Pi's one native JSONL file within a Dwell session's private directory. */
export class SessionFiles {
  readonly #sessionsDirectory: string;

  constructor(dataDirectory: string) {
    this.#sessionsDirectory = join(dataDirectory, "sessions");
  }

  async resolve(stored: StoredSession): Promise<string | undefined> {
    let sessionsDirectory: string;
    try {
      sessionsDirectory = await realpath(this.#sessionsDirectory);
    } catch (error) {
      if (hasCode(error, "ENOENT")) return undefined;
      throw new SessionFileError();
    }
    if (sessionsDirectory !== this.#sessionsDirectory) throw new SessionFileError();

    const sessionDirectory = join(sessionsDirectory, stored.id);
    let actualSessionDirectory: string;
    try {
      actualSessionDirectory = await realpath(sessionDirectory);
    } catch (error) {
      if (hasCode(error, "ENOENT")) return undefined;
      throw new SessionFileError();
    }
    if (actualSessionDirectory !== sessionDirectory) throw new SessionFileError();

    const canDiscover =
      !stored.historyExpected &&
      (stored.historyCheck === null || stored.historyCheck.state === "not-created");
    const discover = async (): Promise<string | undefined> => {
      let files: string[];
      try {
        files = (await readdir(sessionDirectory)).filter((name) =>
          name.endsWith(`_${stored.piSessionId}.jsonl`),
        );
      } catch (error) {
        if (hasCode(error, "ENOENT")) return undefined;
        throw new SessionFileError();
      }
      if (files.length > 1) throw new SessionFileError();
      const discovered = files[0];
      return discovered === undefined ? undefined : join(sessionDirectory, discovered);
    };

    const source = stored.piSessionFile ?? (await discover());
    if (source === undefined) return undefined;

    if (!isAbsolute(source) || !nestedPath(sessionDirectory, source)) throw new SessionFileError();
    let path: string;
    try {
      path = await realpath(source);
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw new SessionFileError();
      if (stored.piSessionFile === null || !canDiscover) return undefined;
      const discovered = await discover();
      if (discovered === undefined) return undefined;
      try {
        path = await realpath(discovered);
      } catch (discoveryError) {
        if (hasCode(discoveryError, "ENOENT")) return undefined;
        throw new SessionFileError();
      }
    }
    if (!nestedPath(sessionDirectory, path) || !path.endsWith(`_${stored.piSessionId}.jsonl`))
      throw new SessionFileError();
    return path;
  }
}
