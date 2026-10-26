import { isAbsolute } from "node:path";
import type { HostMode } from "../../local/paths.ts";
import type { ServiceAction } from "../../service/service.ts";

export type Command =
  | { kind: "help" }
  | { kind: "serve" | "status" | "pair" | "revoke"; mode: HostMode }
  | { kind: "service"; action: ServiceAction }
  | { kind: "configure"; mode: HostMode; executable: string; entryPoint?: string };

interface ParsedOptions {
  mode: HostMode;
  values: Map<string, string>;
  positionals: string[];
}

function parseOptions(args: string[], valueOptions: string[]): ParsedOptions {
  const values = new Map<string, string>();
  const positionals: string[] = [];
  let development = false;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--dev") {
      if (development) throw new Error("Do not repeat --dev.");
      development = true;
      continue;
    }
    if (valueOptions.includes(argument ?? "")) {
      const option = argument ?? "";
      const value = args[index + 1];
      if (values.has(option)) throw new Error(`Do not repeat ${option}.`);
      if (value === undefined || value.startsWith("--"))
        throw new Error(`Expected a value after ${option}.`);
      values.set(option, value);
      index++;
      continue;
    }
    if (argument?.startsWith("-")) throw new Error(`Unsupported option ${argument}. Use --help.`);
    if (argument === undefined) throw new Error("Invalid command arguments.");
    positionals.push(argument);
  }

  return { mode: development ? "development" : "production", values, positionals };
}

function requiredValue(values: Map<string, string>, option: string): string {
  const value = values.get(option);
  if (value === undefined || value.trim().length === 0)
    throw new Error(`Missing required option ${option}. Use --help.`);
  return value;
}

function absolutePath(value: string, option: string): string {
  if (!isAbsolute(value)) throw new Error(`${option} must be an absolute path.`);
  return value;
}

export function parseCommand(args: string[]): Command {
  if (args.length === 1 && args[0] === "--help") return { kind: "help" };
  const [first = "serve", ...rest] = args;

  if (
    rest.length === 1 &&
    rest[0] === "--help" &&
    ["serve", "status", "pair", "auth", "service", "pi"].includes(first)
  )
    return { kind: "help" };

  if (first === "service") {
    const [action] = rest;
    if (
      rest.length === 1 &&
      (action === "install" ||
        action === "uninstall" ||
        action === "start" ||
        action === "stop" ||
        action === "restart" ||
        action === "status")
    )
      return { kind: "service", action };
    throw new Error("Expected service install|uninstall|start|stop|restart|status. Use --help.");
  }

  if (first === "pi") {
    const [action, ...optionArgs] = rest;
    if (action !== "configure") throw new Error("Expected pi configure. Use --help.");
    if (optionArgs.length === 1 && optionArgs[0] === "--help") return { kind: "help" };
    const parsed = parseOptions(optionArgs, ["--executable", "--entry-point"]);
    if (parsed.positionals.length !== 0)
      throw new Error("pi configure accepts only named options. Use --help.");
    const executable = absolutePath(requiredValue(parsed.values, "--executable"), "--executable");
    const entryPoint = parsed.values.get("--entry-point");
    return {
      kind: "configure",
      mode: parsed.mode,
      executable,
      ...(entryPoint === undefined
        ? {}
        : { entryPoint: absolutePath(entryPoint, "--entry-point") }),
    };
  }

  const options = first === "auth" ? rest.slice(1) : rest;
  const kind = first === "auth" && rest[0] === "revoke" ? "revoke" : first;
  if (
    kind !== "serve" &&
    kind !== "status" &&
    kind !== "pair" &&
    !(first === "auth" && kind === "revoke")
  )
    throw new Error("Unknown command. Use --help.");
  if (options.length > 1 || (options.length === 1 && options[0] !== "--dev"))
    throw new Error("Only --dev is supported. Dwell uses one fixed local port. Use --help.");
  return { kind, mode: options[0] === "--dev" ? "development" : "production" };
}
