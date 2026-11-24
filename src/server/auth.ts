import { randomBytes, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { createPrivateFile, prepareDataDirectory, readCredential } from "../local/files.ts";
import { hasCode } from "../local/paths.ts";

export class AccessError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class LocalAuth {
  private readonly token: string;

  private constructor(token: string) {
    this.token = token;
  }

  static async open(dataDir: string): Promise<LocalAuth> {
    const root = await prepareDataDirectory(dataDir);
    try {
      await createPrivateFile(join(root, "auth-token"), `${randomBytes(32).toString("hex")}\n`);
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
    }
    return new LocalAuth(await readCredential(root));
  }

  isCli(authorization: string | undefined): boolean {
    if (!authorization?.startsWith("Bearer ")) return false;
    const candidate = authorization.slice(7);
    return (
      /^[a-f0-9]{64}$/.test(candidate) &&
      timingSafeEqual(Buffer.from(candidate), Buffer.from(this.token))
    );
  }
}
