import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { BROWSER_ASSETS } from "../../src/clients/web/script.ts";
import { STYLE } from "../../src/clients/web/page.ts";

const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/client.js", ["client.js", "text/javascript; charset=utf-8"]],
  ["/history-fixture.js", ["history-fixture.js", "text/javascript; charset=utf-8"]],
]);
const modules = new Set([
  "/conversation.js",
  "/icons.js",
  "/markdown.js",
  "/tool-command.js",
  "/vendor/marked.js",
]);
const server = createServer(async (request, response) => {
  try {
    if (request.headers.host !== "127.0.0.1:8791" || request.method !== "GET") {
      response.writeHead(403).end();
      return;
    }
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const path = new URL(request.url ?? "/", "http://127.0.0.1:8791").pathname;
    if (path === "/base.css") {
      response.setHeader("Content-Type", "text/css; charset=utf-8");
      response.end(STYLE);
      return;
    }
    if (modules.has(path)) {
      const source = BROWSER_ASSETS.get(path);
      if (!source) {
        response.writeHead(404).end();
        return;
      }
      response.setHeader("Content-Type", "text/javascript; charset=utf-8");
      response.end(source);
      return;
    }
    const file = files.get(path);
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Content-Type", file[1]);
    response.end(await readFile(new URL(file[0], import.meta.url)));
  } catch {
    response.writeHead(500).end("Preview unavailable.");
  }
});
server.listen(8791, "127.0.0.1", () => console.log("UI preview: http://127.0.0.1:8791"));
