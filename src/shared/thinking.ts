export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export interface ModelCapabilitiesRequest {
  provider: string;
  model: string;
}

export interface ModelCapabilitiesResponse extends ModelCapabilitiesRequest {
  thinkingLevels: ThinkingLevel[];
  supportsImages: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === "string" && THINKING_LEVELS.some((level) => level === value);
}

export function isModelCapabilitiesRequest(value: unknown): value is ModelCapabilitiesRequest {
  return (
    isObject(value) &&
    Object.keys(value).length === 2 &&
    Object.hasOwn(value, "provider") &&
    typeof value.provider === "string" &&
    value.provider.length > 0 &&
    value.provider.length <= 200 &&
    Object.hasOwn(value, "model") &&
    typeof value.model === "string" &&
    value.model.length > 0 &&
    value.model.length <= 300
  );
}

export function isModelCapabilitiesResponse(value: unknown): value is ModelCapabilitiesResponse {
  if (
    !isObject(value) ||
    Object.keys(value).length !== 4 ||
    !Object.hasOwn(value, "provider") ||
    !("provider" in value) ||
    !Object.hasOwn(value, "model") ||
    !("model" in value) ||
    !Object.hasOwn(value, "thinkingLevels") ||
    !("thinkingLevels" in value) ||
    !Object.hasOwn(value, "supportsImages") ||
    !("supportsImages" in value)
  )
    return false;
  return (
    typeof value.provider === "string" &&
    value.provider.length > 0 &&
    value.provider.length <= 200 &&
    typeof value.model === "string" &&
    value.model.length > 0 &&
    value.model.length <= 300 &&
    typeof value.supportsImages === "boolean" &&
    Array.isArray(value.thinkingLevels) &&
    value.thinkingLevels.length > 0 &&
    value.thinkingLevels.length <= THINKING_LEVELS.length &&
    value.thinkingLevels.every(isThinkingLevel) &&
    new Set(value.thinkingLevels).size === value.thinkingLevels.length
  );
}
