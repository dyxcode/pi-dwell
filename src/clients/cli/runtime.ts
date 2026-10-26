import { isRuntimeConfiguration, type RuntimeConfiguration } from "../../shared/sessions.ts";
import { type ClientOptions, localRequest } from "./status.ts";

const CONFIGURATION_REQUEST_TIMEOUT_MS = 60_000;

function configurationOptions(options: ClientOptions): ClientOptions {
  return {
    ...options,
    timeoutMs: Math.max(options.timeoutMs ?? 0, CONFIGURATION_REQUEST_TIMEOUT_MS),
  };
}

export async function configureRuntime(
  options: ClientOptions,
  configuration: RuntimeConfiguration,
): Promise<RuntimeConfiguration> {
  const value = await localRequest(
    "/api/v1/runtime",
    configurationOptions(options),
    "POST",
    configuration,
  );
  if (!isRuntimeConfiguration(value))
    throw new Error("Incompatible pi-dwell runtime configuration response.");
  return value;
}
