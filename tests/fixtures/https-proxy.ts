import { execFileSync } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { chmod, mkdir, readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { join } from "node:path";

export interface HttpsProxyFixture {
  readonly origin: string;
  readonly certificate: Buffer;
  readonly certificateSpki: string;
  setUpstreamPort(port: number): void;
  close(): Promise<void>;
}

export async function createHttpsProxy(directory: string): Promise<HttpsProxyFixture> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const keyPath = join(directory, "localhost-key.pem");
  const certificatePath = join(directory, "localhost-cert.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certificatePath,
      "-sha256",
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
    ],
    { stdio: "ignore" },
  );
  await chmod(keyPath, 0o600);
  const certificate = await readFile(certificatePath);
  const privateKey = await readFile(keyPath);
  const publicKey = new X509Certificate(certificate).publicKey.export({
    format: "der",
    type: "spki",
  });
  const certificateSpki = createHash("sha256").update(publicKey).digest("base64");
  let upstreamPort: number | undefined;

  const server = createHttpsServer({ cert: certificate, key: privateKey }, (incoming, outgoing) => {
    if (upstreamPort === undefined) {
      outgoing.writeHead(503);
      outgoing.end();
      return;
    }
    const upstream = httpRequest({
      hostname: "127.0.0.1",
      port: upstreamPort,
      method: incoming.method,
      path: incoming.url,
      headers: {
        ...incoming.headers,
        ...(incoming.headers.host === undefined
          ? {}
          : { "x-forwarded-host": incoming.headers.host }),
        "x-forwarded-for": "127.0.0.1",
        "x-forwarded-proto": "https",
      },
    });
    upstream.on("response", (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    upstream.on("error", () => {
      if (outgoing.destroyed) return;
      if (outgoing.headersSent) outgoing.destroy();
      else {
        outgoing.writeHead(502);
        outgoing.end();
      }
    });
    incoming.on("aborted", () => upstream.destroy());
    outgoing.on("close", () => upstream.destroy());
    incoming.pipe(upstream);
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("HTTPS proxy did not bind a TCP address.");
  }
  const origin = `https://127.0.0.1:${address.port}`;

  return {
    origin,
    certificate,
    certificateSpki,
    setUpstreamPort(port: number) {
      if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error("Proxy upstream port must be an integer between 1 and 65535.");
      upstreamPort = port;
    },
    async close() {
      const closed = new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      server.closeAllConnections();
      await closed;
    },
  };
}
