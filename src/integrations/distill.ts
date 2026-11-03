import { pathToFileURL } from "node:url";
import { isRecord } from "../runtime/pi-rpc.ts";

export interface DistillModuleConfiguration {
  readonly module: string;
  readonly database: string;
}

export interface DistillSource {
  readonly sessionId: string;
  readonly sessionFile: string;
  readonly cwd: string;
  readonly sourceGeneration?: string;
}

export interface DistillChild {
  readonly pid: number;
  readonly token: string;
}

export type DistillUseSource = Omit<DistillSource, "sessionFile" | "sourceGeneration"> &
  (
    | { readonly sessionFile?: never; readonly sourceGeneration?: never }
    | { readonly sessionFile: string; readonly sourceGeneration?: string }
  );

export interface DistillUseRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly sessionFile: string | null;
  readonly cwd: string;
  readonly sourceGeneration: string | null;
  readonly ownerPid: number;
  readonly createdAt: number;
  readonly state: "opening" | "attached";
  readonly child: DistillChild | null;
}

export type DistillRecovery =
  | { readonly kind: "opening-abandoned" }
  | { readonly kind: "child-exited"; readonly child: DistillChild };

export interface DistillDeletionReceipt {
  readonly sessionFile: string;
  readonly sessionId: string;
  readonly intentId: string;
  readonly fileVersion: string;
  readonly sourceGeneration: string;
  readonly state: "complete";
}

export interface DistillRead {
  readonly sourceGeneration: string | null;
  release(): void;
}

export interface DistillUse {
  readonly id: string;
  readonly sourceGeneration: string | null;
  attachChild(pid: number): DistillChild;
  releaseAfterClose(child: DistillChild): boolean;
}

export interface DistillStorage {
  readonly version: 1;
  acquireSourceRead(source: DistillSource): DistillRead | undefined;
  beginHostUse(source: DistillUseSource): DistillUse | undefined;
  listPendingHostUses(): readonly DistillUseRecord[];
  recoverHostUse(id: string, evidence: DistillRecovery): boolean;
  getCompletedDeletion(source: DistillSource): DistillDeletionReceipt | undefined;
  close(): void;
}

function isDistillStorage(value: unknown): value is DistillStorage {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.acquireSourceRead === "function" &&
    typeof value.beginHostUse === "function" &&
    typeof value.listPendingHostUses === "function" &&
    typeof value.recoverHostUse === "function" &&
    typeof value.getCompletedDeletion === "function" &&
    typeof value.close === "function"
  );
}

export async function openDistill(
  configuration: DistillModuleConfiguration,
): Promise<DistillStorage> {
  const module: unknown = await import(pathToFileURL(configuration.module).href);
  if (!isRecord(module)) throw new Error("Distill module must export openHostStorageV1.");
  const openHostStorageV1 = module.openHostStorageV1;
  if (typeof openHostStorageV1 !== "function")
    throw new Error("Distill module must export openHostStorageV1.");
  const storage: unknown = openHostStorageV1(configuration.database);
  if (!isDistillStorage(storage))
    throw new Error("Distill module must implement host storage API version 1.");
  return storage;
}
