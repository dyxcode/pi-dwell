export const DEFAULT_PORT = 8787;

export interface HostStatus {
  service: "pi-dwell";
  protocolVersion: 1;
  phase: "scaffold";
  startedAt: string;
  processId: number;
  instanceId: string;
  mode: "production" | "development";
  capabilities: { sessions: false; tasks: false };
}

export function isHostStatus(value: unknown): value is HostStatus {
  if (typeof value !== "object" || value === null) return false;
  if (
    !("service" in value) ||
    value.service !== "pi-dwell" ||
    !("protocolVersion" in value) ||
    value.protocolVersion !== 1 ||
    !("phase" in value) ||
    value.phase !== "scaffold" ||
    !("startedAt" in value) ||
    typeof value.startedAt !== "string" ||
    !Number.isFinite(Date.parse(value.startedAt)) ||
    !("processId" in value) ||
    typeof value.processId !== "number" ||
    !Number.isSafeInteger(value.processId) ||
    value.processId <= 0 ||
    !("instanceId" in value) ||
    typeof value.instanceId !== "string" ||
    !/^[a-f0-9-]{36}$/.test(value.instanceId) ||
    !("mode" in value) ||
    (value.mode !== "production" && value.mode !== "development") ||
    !("capabilities" in value)
  )
    return false;

  const capabilities = value.capabilities;
  return (
    typeof capabilities === "object" &&
    capabilities !== null &&
    "sessions" in capabilities &&
    capabilities.sessions === false &&
    "tasks" in capabilities &&
    capabilities.tasks === false
  );
}
