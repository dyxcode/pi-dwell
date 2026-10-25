import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import {
  createPrivateFile,
  prepareDataDirectory,
  readCredential,
  readPrivateFile,
  replacePrivateFile,
} from "../local/files.ts";
import { hasCode } from "../local/paths.ts";

export const PAIRING_MS = 5 * 60 * 1000;
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 100;
interface BrowserSession {
  hash: string;
  browserKeyHash: string;
  expiresAt: number;
}

export class AccessError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseSessions(text: string): BrowserSession[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Invalid browser-session state JSON; repair it while the host is stopped.");
  }
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("sessions" in value) ||
    !Array.isArray(value.sessions) ||
    Object.keys(value).length !== 2 ||
    value.sessions.length > MAX_SESSIONS
  ) {
    throw new Error("Invalid or unsupported browser-session state.");
  }
  const sessions: BrowserSession[] = [];
  const seen = new Set<string>();
  const entries: unknown[] = value.sessions;
  for (const item of entries) {
    if (
      !item ||
      typeof item !== "object" ||
      !("hash" in item) ||
      typeof item.hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(item.hash) ||
      !("browserKeyHash" in item) ||
      typeof item.browserKeyHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(item.browserKeyHash) ||
      !("expiresAt" in item) ||
      typeof item.expiresAt !== "number" ||
      !Number.isSafeInteger(item.expiresAt) ||
      item.expiresAt <= 0 ||
      Object.keys(item).length !== 3 ||
      seen.has(item.hash)
    ) {
      throw new Error("Invalid browser-session state entry.");
    }
    seen.add(item.hash);
    sessions.push({
      hash: item.hash,
      browserKeyHash: item.browserKeyHash,
      expiresAt: item.expiresAt,
    });
  }
  return sessions;
}

export class LocalAuth {
  private readonly token: string;
  private readonly path: string;
  private readonly now: () => number;
  private sessions: BrowserSession[];
  private readonly codes = new Map<string, number>();
  private attempts: number[] = [];
  private pending: Promise<void> = Promise.resolve();
  private faulted = false;

  private constructor(token: string, path: string, sessions: BrowserSession[], now: () => number) {
    this.token = token;
    this.path = path;
    this.sessions = sessions;
    this.now = now;
  }

  static async open(dataDir: string, now: () => number = Date.now): Promise<LocalAuth> {
    const root = await prepareDataDirectory(dataDir);
    try {
      await createPrivateFile(join(root, "auth-token"), `${randomBytes(32).toString("hex")}\n`);
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
    }
    const token = await readCredential(root);
    const path = join(root, "browser-sessions.json");
    try {
      await createPrivateFile(path, `${JSON.stringify({ version: 1, sessions: [] })}\n`);
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
    }
    return new LocalAuth(token, path, parseSessions(await readPrivateFile(path)), now);
  }

  isCli(authorization: string | undefined): boolean {
    if (!authorization?.startsWith("Bearer ")) return false;
    const candidate = authorization.slice(7);
    return (
      /^[a-f0-9]{64}$/.test(candidate) &&
      timingSafeEqual(Buffer.from(candidate), Buffer.from(this.token))
    );
  }

  private available(): void {
    if (this.faulted)
      throw new AccessError(
        503,
        "storage_unavailable",
        "Authentication storage failed. Restart the host after repairing its state.",
      );
  }

  isBrowser(token: string | undefined, browserKey: string | string[] | undefined): boolean {
    this.available();
    if (
      !token ||
      !/^[a-f0-9]{64}$/.test(token) ||
      typeof browserKey !== "string" ||
      !/^[a-f0-9]{64}$/.test(browserKey)
    )
      return false;
    const hash = digest(token);
    const browserKeyHash = digest(browserKey);
    return this.sessions.some(
      (session) =>
        session.hash === hash &&
        session.browserKeyHash === browserKeyHash &&
        session.expiresAt > this.now(),
    );
  }

  createPairing(): { code: string; expiresAt: number } {
    this.available();
    for (const [hash, expiresAt] of this.codes)
      if (expiresAt <= this.now()) this.codes.delete(hash);
    if (this.codes.size >= 10)
      throw new AccessError(
        429,
        "pairing_limit",
        "Too many pending pairing codes. Wait five minutes before creating another.",
      );
    const code = randomBytes(16).toString("hex");
    const expiresAt = this.now() + PAIRING_MS;
    this.codes.set(digest(code), expiresAt);
    return { code, expiresAt };
  }

  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const result = this.pending.then(action);
    this.pending = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  private async save(sessions: BrowserSession[]): Promise<void> {
    try {
      await replacePrivateFile(this.path, `${JSON.stringify({ version: 1, sessions })}\n`);
    } catch {
      this.faulted = true;
      throw new AccessError(
        503,
        "storage_unavailable",
        "Cannot save authentication state. Repair the data directory and restart Dwell.",
      );
    }
    this.sessions = sessions;
  }

  redeem(code: string, browserKey: string): Promise<string> {
    return this.serialize(async () => {
      this.available();
      const now = this.now();
      this.attempts = this.attempts.filter((time) => time > now - 60_000);
      if (this.attempts.length >= 20)
        throw new AccessError(
          429,
          "rate_limited",
          "Too many pairing attempts. Try again in one minute.",
        );
      this.attempts.push(now);
      const hash = digest(code);
      const expiresAt = this.codes.get(hash);
      if (!expiresAt || expiresAt <= now)
        throw new AccessError(
          401,
          "invalid_pairing",
          "Pairing code is invalid, expired, or already used. Create a new code with the local CLI.",
        );
      const sessions = this.sessions.filter((session) => session.expiresAt > now);
      if (sessions.length >= MAX_SESSIONS)
        throw new AccessError(
          429,
          "session_limit",
          "Browser session limit reached. Revoke browser access from the local CLI.",
        );
      const token = randomBytes(32).toString("hex");
      await this.save([
        ...sessions,
        { hash: digest(token), browserKeyHash: digest(browserKey), expiresAt: now + SESSION_MS },
      ]);
      this.codes.delete(hash);
      return token;
    });
  }

  logout(token: string): Promise<void> {
    return this.serialize(async () => {
      this.available();
      await this.save(
        this.sessions.filter(
          (session) => session.hash !== digest(token) && session.expiresAt > this.now(),
        ),
      );
    });
  }

  revoke(): Promise<void> {
    return this.serialize(async () => {
      this.available();
      await this.save([]);
      this.codes.clear();
    });
  }

  drain(): Promise<void> {
    return this.pending;
  }
}
