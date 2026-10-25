import { DEFAULT_PORT } from "../../shared/protocol.ts";

export type Command = { kind: "help" } | { kind: "serve" | "status"; port: number };

export function parseCommand(args: string[]): Command {
  const [first, ...rest] = args;
  if (first === "--help" && rest.length === 0) return { kind: "help" };
  const kind = first === undefined || first.startsWith("--") ? "serve" : first;
  if (kind !== "serve" && kind !== "status") {
    throw new Error(`Unknown command: ${kind}. Use --help.`);
  }
  const options = first === kind ? rest : args;
  if (options.length === 1 && options[0] === "--help") return { kind: "help" };
  if (options.length === 0) return { kind, port: DEFAULT_PORT };

  const [flag, rawPort] = options;
  if (options.length !== 2 || flag !== "--port" || !rawPort || !/^\d+$/.test(rawPort)) {
    throw new Error("Expected --port <1-65535>. Use --help.");
  }
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Port must be an integer between 1 and 65535.");
  }
  return { kind, port };
}
