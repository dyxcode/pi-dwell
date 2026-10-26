import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { HostMode } from "../../local/paths.ts";
import type { ServiceAction } from "../../service/service.ts";
import { SESSION_ID } from "../../shared/sessions.ts";

export type Command =
  | { kind: "help" }
  | { kind: "serve" | "status" | "pair" | "revoke"; mode: HostMode }
  | { kind: "service"; action: ServiceAction }
  | { kind: "configure"; mode: HostMode; executable: string; entryPoint?: string }
  | {
      kind: "new";
      mode: HostMode;
      directory: string;
      provider: string;
      model: string;
      requestId: string;
    }
  | { kind: "sessions-list"; mode: HostMode }
  | { kind: "session-show" | "session-open" | "session-close"; mode: HostMode; sessionId: string };

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

function resolveUserDirectory(value: string): string {
  const expanded =
    value === "~" ? homedir() : value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;
  return resolve(expanded);
}

function isUuid(value: string): boolean {
  return SESSION_ID.test(value.toLowerCase());
}

export function parseCommand(args: string[]): Command {
  if (args.length === 1 && args[0] === "--help") return { kind: "help" };
  const [first = "serve", ...rest] = args;

  if (
    rest.length === 1 &&
    rest[0] === "--help" &&
    ["serve", "status", "pair", "auth", "service", "pi", "new", "sessions"].includes(first)
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

  if (first === "new") {
    const parsed = parseOptions(rest, ["--directory", "--provider", "--model", "--request-id"]);
    if (parsed.positionals.length !== 0)
      throw new Error("new accepts only named options. Use --help.");
    const suppliedRequestId = parsed.values.get("--request-id");
    if (suppliedRequestId !== undefined && !isUuid(suppliedRequestId))
      throw new Error("--request-id must be a UUID.");
    return {
      kind: "new",
      mode: parsed.mode,
      directory: resolveUserDirectory(requiredValue(parsed.values, "--directory")),
      provider: requiredValue(parsed.values, "--provider"),
      model: requiredValue(parsed.values, "--model"),
      requestId: (suppliedRequestId ?? randomUUID()).toLowerCase(),
    };
  }

  if (first === "sessions") {
    if (rest.length === 0) return { kind: "sessions-list", mode: "production" };
    if (rest.length === 1 && rest[0] === "--dev")
      return { kind: "sessions-list", mode: "development" };
    const [action, ...actionArgs] = rest;
    if (action === "--help") return { kind: "help" };
    if (action !== "show" && action !== "open" && action !== "close")
      throw new Error(
        "Expected sessions [--dev] or sessions show|open|close <uuid> [--dev]. Use --help.",
      );
    if (actionArgs.length === 1 && actionArgs[0] === "--help") return { kind: "help" };
    const parsed = parseOptions(actionArgs, []);
    if (parsed.positionals.length !== 1)
      throw new Error(`Expected one session UUID after sessions ${action}. Use --help.`);
    const [sessionId] = parsed.positionals;
    if (sessionId === undefined || !isUuid(sessionId))
      throw new Error("Session ID must be a UUID.");
    return {
      kind:
        action === "show" ? "session-show" : action === "open" ? "session-open" : "session-close",
      mode: parsed.mode,
      sessionId: sessionId.toLowerCase(),
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
