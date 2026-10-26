import assert from "node:assert/strict";
import { test } from "node:test";
import { HOST_PAGE, STYLE } from "../src/clients/web/page.ts";

test("the real conversation shell exposes pairing, history, stop, and directory creation", () => {
  for (const id of [
    "pair-form",
    "composer",
    "message",
    "conversation",
    "status-list",
    "session-list",
    "new-session",
    "directory",
    "choose-model",
    "model-dialog",
    "composer-directory",
    "load-older",
  ])
    assert.match(HOST_PAGE, new RegExp(`id="${id}"`));
  assert.match(HOST_PAGE, /type="module"/);
  assert.match(HOST_PAGE, /Message Pi…/);
  assert.doesNotMatch(HOST_PAGE, /Sample|synthetic|What stays|✳|Not available/);
  assert.match(STYLE, /#f3eee3/);
});

test("browser modules are public but directory and model discovery require authentication", async () => {
  const { startHost } = await import("../src/server/http.ts");
  const { createPiEnvironment } = await import("./fixtures/pi-environment.ts");
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const environment = await createPiEnvironment();
  const dataDir = join(environment.root, "web-host");
  const host = await startHost({ port: 0, dataDir, sessions: { env: environment.env } });
  try {
    const token = (await readFile(join(dataDir, "auth-token"), "utf8")).trim();
    const headers = { Authorization: `Bearer ${token}` };
    const { BROWSER_ASSETS } = await import("../src/clients/web/script.ts");
    for (const [path, source] of BROWSER_ASSETS) {
      const response = await fetch(host.url + path);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /javascript/);
      assert.equal(await response.text(), source);
    }
    for (const path of ["/api/v1/models", "/api/v1/directories"]) {
      assert.equal((await fetch(host.url + path)).status, 401);
      assert.equal(
        (await fetch(host.url + path, { headers: { ...headers, Origin: "https://example.com" } }))
          .status,
        403,
      );
    }
    const directory = await fetch(
      `${host.url}/api/v1/directories?path=${encodeURIComponent(environment.root)}`,
      { headers },
    );
    assert.equal(directory.status, 200);
    const value: unknown = await directory.json();
    const { isHostDirectoryListing } = await import("../src/shared/discovery.ts");
    assert.ok(isHostDirectoryListing(value));
    assert.ok(value.directories.some((entry) => entry.name === "cwd"));
    assert.equal(
      (await fetch(`${host.url}/api/v1/directories?path=/&path=/tmp`, { headers })).status,
      400,
    );
    assert.equal((await fetch(`${host.url}/api/v1/models`, { headers })).status, 503);
    assert.equal((await fetch(`${host.url}/server/auth.ts`)).status, 404);
  } finally {
    await host.close();
    await environment.cleanup();
  }
});
