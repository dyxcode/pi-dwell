import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { hasCode, validateDataDirectory } from "./paths.ts";

export async function prepareDataDirectory(path: string): Promise<string> {
  const canonical = await validateDataDirectory(path);
  await mkdir(canonical, { recursive: true, mode: 0o700 });
  const info = await lstat(canonical);
  if (!info.isDirectory() || (info.mode & 0o777) !== 0o700 || info.uid !== process.getuid?.()) {
    throw new Error(`Unsafe data directory permissions: ${canonical}. Expected owner-only 0700.`);
  }
  return canonical;
}

export async function readPrivateFile(path: string): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (
      !info.isFile() ||
      info.nlink !== 1 ||
      (info.mode & 0o777) !== 0o600 ||
      info.uid !== process.getuid?.()
    ) {
      throw new Error(
        `Unsafe file type or permissions: ${path}. Expected owner-only regular file (0600).`,
      );
    }
    if (info.size > 1024 * 1024) throw new Error(`State file is too large: ${path}.`);
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

export async function createPrivateFile(path: string, contents: string): Promise<void> {
  const handle = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function replacePrivateFile(path: string, contents: string): Promise<void> {
  // Recheck existing state rather than silently replacing unsafe files.
  await readPrivateFile(path);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await createPrivateFile(temporary, contents);
    await rename(temporary, path);
    const directory = await open(dirname(path), constants.O_RDONLY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function readCredential(dataDir: string): Promise<string> {
  // CLI reads never create or repair state.
  try {
    const value = (await readPrivateFile(join(dataDir, "auth-token"))).trim();
    if (!/^[a-f0-9]{64}$/.test(value))
      throw new Error("Invalid local credential. Repair auth-token while the host is stopped.");
    return value;
  } catch (error) {
    if (hasCode(error, "ENOENT"))
      throw new Error(
        "Local credential is missing. Start Dwell first with npm start (or npm run dev for development).",
      );
    throw error;
  }
}
