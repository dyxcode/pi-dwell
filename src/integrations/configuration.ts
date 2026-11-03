import { isAbsolute, join } from "node:path";
import { readPrivateFile } from "../local/files.ts";
import { hasCode } from "../local/paths.ts";
import { isRecord } from "../runtime/pi-rpc.ts";
import { isLibraryBinding } from "../shared/library.ts";

export interface IntegrationsConfiguration {
  version: 1;
  distill?: { module: string; database: string };
  current?: { module: string; root: string; binding: string };
}

function absolutePath(value: unknown): value is string {
  return typeof value === "string" && isAbsolute(value) && !value.includes("\0");
}

export async function readIntegrations(dataDir: string): Promise<IntegrationsConfiguration> {
  let text: string;
  try {
    text = await readPrivateFile(join(dataDir, "integrations.json"));
  } catch (error) {
    if (hasCode(error, "ENOENT")) return { version: 1 };
    throw error;
  }
  const invalid = () =>
    new Error(
      "Invalid integrations.json. Use version 1, absolute local module/store paths, and a Current binding name.",
    );
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw invalid();
  }
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    Object.keys(value).some((key) => !["version", "distill", "current"].includes(key))
  )
    throw invalid();
  const configuration: IntegrationsConfiguration = { version: 1 };
  if (value.distill !== undefined) {
    const distill = value.distill;
    if (
      !isRecord(distill) ||
      !absolutePath(distill.module) ||
      !absolutePath(distill.database) ||
      Object.keys(distill).length !== 2
    )
      throw invalid();
    configuration.distill = { module: distill.module, database: distill.database };
  }
  if (value.current !== undefined) {
    const current = value.current;
    if (
      !isRecord(current) ||
      !absolutePath(current.module) ||
      !absolutePath(current.root) ||
      !isLibraryBinding(current.binding) ||
      Object.keys(current).length !== 3
    )
      throw invalid();
    configuration.current = {
      module: current.module,
      root: current.root,
      binding: current.binding,
    };
  }
  return configuration;
}
