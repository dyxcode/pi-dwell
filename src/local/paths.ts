import { lstat, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";

export type HostMode = "production" | "development";

export function dataDirectory(mode: HostMode = "production"): string {
  return join(homedir(), ".local", "share", mode === "production" ? "pi-dwell" : "pi-dwell-dev");
}

export function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function canonicalDestination(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return join(await canonicalDestination(parent), basename(path));
  }
}

/** Check before creating anything; parent symlinks must not bypass local isolation. */
export async function validateDataDirectory(path: string): Promise<string> {
  const canonical = await canonicalDestination(resolve(path));
  const vault = await canonicalDestination(join(homedir(), "Obsidian"));
  const insideVault = relative(vault, canonical);
  if (insideVault === "" || (!insideVault.startsWith("..") && !insideVault.startsWith("/"))) {
    throw new Error("Dwell data must be outside the Obsidian vault.");
  }
  let ancestor = canonical;
  for (;;) {
    for (const marker of [".git", ".obsidian"]) {
      try {
        await lstat(join(ancestor, marker));
      } catch (error) {
        if (hasCode(error, "ENOENT")) continue;
        throw error;
      }
      throw new Error("Dwell data must be outside repositories and Obsidian vaults.");
    }
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  return canonical;
}
