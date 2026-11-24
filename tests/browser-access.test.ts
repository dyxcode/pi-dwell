import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { startHost } from "../src/server/http.ts";

const remoteOrigin = "https://dwell.example.ts.net";

async function send(
  url: string,
  path: string,
  headers: Record<string, string> = {},
  method = "GET",
): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const outgoing = request(new URL(path, url), { method, headers }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode));
      response.once("error", reject);
    });
    outgoing.once("error", reject);
    outgoing.end();
  });
}

test("an unpaired browser can use the local and private proxy lanes without gaining CLI authority", async () => {
  const root = await mkdtemp(join(tmpdir(), "dwell-browser-access-"));
  try {
    await writeFile(
      join(root, "access.json"),
      JSON.stringify({ version: 1, browserOrigin: remoteOrigin }),
      { mode: 0o600 },
    );
    const host = await startHost({ port: 0, dataDir: root });
    try {
      const browser = { "X-Dwell-Request": "1" };
      const proxy = {
        ...browser,
        Host: new URL(remoteOrigin).host,
        "X-Forwarded-Proto": "https",
      };
      const token = (await readFile(join(root, "auth-token"), "utf8")).trim();
      const cli = { Authorization: `Bearer ${token}` };
      assert.equal(await send(host.url, "/api/v1/status", browser), 200, "local browser");
      assert.equal(await send(host.url, "/api/v1/sessions", proxy), 200, "proxied browser");
      assert.equal(await send(host.url, "/api/v1/status", cli), 200, "local CLI");
      assert.equal(await send(host.url, "/api/v1/status"), 403, "no browser request marker");
      assert.equal(
        await send(host.url, "/api/v1/sessions", { ...proxy, Origin: "https://other.example" }),
        403,
        "cross-origin request",
      );
      assert.equal(
        await send(host.url, "/api/v1/sessions", { ...proxy, "Sec-Fetch-Site": "cross-site" }),
        403,
        "cross-site browser fetch",
      );
      assert.equal(
        await send(host.url, "/api/v1/status", { ...proxy, "Tailscale-Funnel-Request": "?1" }),
        403,
        "public Funnel traffic does not gain browser access",
      );
      assert.equal(
        await send(host.url, "/api/v1/status", { ...browser, Host: proxy.Host }),
        403,
        "an external Host alone does not select the proxy lane",
      );
      assert.equal(
        await send(host.url, "/api/v1/status", { ...proxy, ...cli }),
        403,
        "CLI credentials cannot cross the proxy lane",
      );
      assert.equal(
        await send(host.url, "/api/v1/status", { ...proxy, ...cli, Host: new URL(host.url).host }),
        403,
        "the proxy cannot select the CLI lane by rewriting Host",
      );
      assert.equal(
        await send(host.url, "/api/v1/runtime", { ...proxy, Origin: remoteOrigin }, "POST"),
        403,
        "runtime configuration stays CLI-only",
      );
      assert.equal(
        await send(host.url, "/api/v1/sessions", proxy, "POST"),
        403,
        "mutations still require a matching Origin",
      );
      for (const path of ["pairings", "pair", "logout", "revoke"]) {
        assert.equal(await send(host.url, `/api/v1/auth/${path}`, cli, "POST"), 404);
      }
      await assert.rejects(readFile(join(root, "browser-sessions.json")), { code: "ENOENT" });
    } finally {
      await host.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
