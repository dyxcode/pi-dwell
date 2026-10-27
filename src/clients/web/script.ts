import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

// A fixed asset allowlist, compiled by Node's native type stripper. No filesystem
// path comes from a request and no build-time package is required by the host.
const modules = {
  "/dom.js": new URL("./dom.ts", import.meta.url),
  "/tool-command.js": new URL("./tool-command.ts", import.meta.url),
  "/icons.js": new URL("./icons.ts", import.meta.url),
  "/client.js": new URL("./client.ts", import.meta.url),
  "/events.js": new URL("./events.ts", import.meta.url),
  "/conversation.js": new URL("./conversation.ts", import.meta.url),
  "/markdown.js": new URL("./markdown.ts", import.meta.url),
  "/attachments.js": new URL("./attachments.ts", import.meta.url),
  "/shared/images.js": new URL("../../shared/images.ts", import.meta.url),
  "/shared/thinking.js": new URL("../../shared/thinking.ts", import.meta.url),
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
    stripTypeScriptTypes(readFileSync(url, "utf8"), { mode: "strip" })
      .replace(/(from\s+["'][^"']+)\.ts(["'])/g, "$1.js$2")
      .replace(/from "marked"/g, 'from "/vendor/marked.js"'),
  ]),
);
BROWSER_ASSETS.set(
  "/vendor/marked.js",
  readFileSync(new URL(import.meta.resolve("marked")), "utf8"),
);
export const BROWSER_SCRIPT = BROWSER_ASSETS.get("/client.js") ?? "";
