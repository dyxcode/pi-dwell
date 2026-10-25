import type { HostMode } from "../../local/paths.ts";
import type { ServiceAction } from "../../service/service.ts";

export type Command =
  | { kind: "help" }
  | { kind: "serve" | "status" | "pair" | "revoke"; mode: HostMode }
  | { kind: "service"; action: ServiceAction };

export function parseCommand(args: string[]): Command {
  if (args.length === 1 && args[0] === "--help") return { kind: "help" };
  const [first = "serve", ...rest] = args;
  if (
    rest.length === 1 &&
    rest[0] === "--help" &&
    ["serve", "status", "pair", "auth", "service"].includes(first)
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
