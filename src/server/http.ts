import { createServer } from "node:http";
import { HOST_PAGE } from "../clients/web/page.ts";
import { DEFAULT_PORT, type HostStatus } from "../shared/protocol.ts";

export interface HostOptions {
  /** Zero chooses an available port, for embedding and tests. */
  port?: number;
}

export interface RunningHost {
  url: string;
  close(): Promise<void>;
}

export async function startHost({ port = DEFAULT_PORT }: HostOptions = {}): Promise<RunningHost> {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("Port must be an integer between 0 and 65535.");
  }

  const status: HostStatus = {
    service: "pi-dwell",
    protocolVersion: 1,
    phase: "scaffold",
    startedAt: new Date().toISOString(),
    capabilities: { sessions: false, tasks: false },
  };
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    response.setHeader("Content-Type", "application/json; charset=utf-8");

    if (request.method !== "GET") {
      response.writeHead(405, { Allow: "GET" });
      response.end(JSON.stringify({ error: "method_not_allowed" }));
      return;
    }

    switch (request.url?.split("?")[0]) {
      case "/healthz":
        response.end(JSON.stringify({ status: "ok" }));
        break;
      case "/api/v1/status":
        response.end(JSON.stringify(status));
        break;
      case "/":
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(HOST_PAGE);
        break;
      default:
        response.writeHead(404);
        response.end(JSON.stringify({ error: "not_found" }));
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Host did not bind a TCP address.");
  }

  let closing: Promise<void> | undefined;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close() {
      closing ??= new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
      return closing;
    },
  };
}
