import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

// A fixed asset allowlist, compiled by Node's native type stripper. No filesystem
// path comes from a request and no build-time package is required by the host.
const modules = {
  "/client.js": new URL("./client.ts", import.meta.url),
  "/events.js": new URL("./events.ts", import.meta.url),
  "/input.js": new URL("./input.ts", import.meta.url),
  "/transport.js": new URL("./transport.ts", import.meta.url),
  "/shared/sessions.js": new URL("../../shared/sessions.ts", import.meta.url),
  "/shared/turns.js": new URL("../../shared/turns.ts", import.meta.url),
  "/shared/discovery.js": new URL("../../shared/discovery.ts", import.meta.url),
  "/shared/history.js": new URL("../../shared/history.ts", import.meta.url),
  "/shared/events.js": new URL("../../shared/events.ts", import.meta.url),
  "/shared/protocol.js": new URL("../../shared/protocol.ts", import.meta.url),
};
export const BROWSER_ASSETS = new Map<string, string>(
  Object.entries(modules).map(([path, url]) => [
    path,
    stripTypeScriptTypes(readFileSync(url, "utf8"), { mode: "strip" }).replace(
      /(from\s+["'][^"']+)\.ts(["'])/g,
      "$1.js$2",
    ),
  ]),
);
export const BROWSER_SCRIPT = BROWSER_ASSETS.get("/client.js") ?? "";
