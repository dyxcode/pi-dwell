import assert from "node:assert/strict";
import { test } from "node:test";
import { HOST_PAGE, STYLE } from "../src/clients/web/page.ts";
import { BROWSER_ASSETS, BROWSER_SCRIPT } from "../src/clients/web/script.ts";

test("the conversation page loads only same-origin external code and styles", () => {
  assert.match(HOST_PAGE, /href="\/style\.css"/);
  assert.match(HOST_PAGE, /src="\/client\.js" type="module"/);
  assert.doesNotMatch(HOST_PAGE, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.match(HOST_PAGE, /id="retry-button"/);
  assert.doesNotMatch(HOST_PAGE, /pair-form|logout-button/);
  assert.match(STYLE, /:focus-visible/);
});

test("native browser compilation exposes a fixed set of credential-safe modules", () => {
  assert.equal(BROWSER_ASSETS.get("/client.js"), BROWSER_SCRIPT);
  for (const path of [
    "/events.js",
    "/input.js",
    "/transport.js",
    "/shared/history.js",
    "/shared/events.js",
    "/shared/sessions.js",
  ])
    assert.ok(BROWSER_ASSETS.has(path));
  assert.equal(BROWSER_ASSETS.has("/server/auth.js"), false);
  assert.equal(BROWSER_ASSETS.has("/../../server/auth.js"), false);
  const transport = BROWSER_ASSETS.get("/transport.js") ?? "";
  assert.match(transport, /X-Dwell-Request/);
  assert.match(transport, /same-origin/);
  assert.match(transport, /credentials: "omit"/);
  assert.doesNotMatch(transport, /localStorage|X-Dwell-Browser/);
  assert.match(BROWSER_SCRIPT, /textContent/);
  assert.doesNotMatch(BROWSER_SCRIPT, /innerHTML|document\.cookie|navigator\.clipboard|cliToken/);
  for (const asset of BROWSER_ASSETS.values()) {
    assert.doesNotMatch(asset, /from ["']node:/);
    assert.doesNotMatch(asset, /from ["'][^"']+\.ts["']/);
  }
});

test("creation asks only for a directory and model selection sits above the composer", () => {
  assert.doesNotMatch(HOST_PAGE, /id="(?:session-name|model)"/);
  assert.match(HOST_PAGE, /id="directory"/);
  assert.match(HOST_PAGE, /id="model-dialog"/);
  const context = HOST_PAGE.indexOf('id="composer-context"');
  const composer = HOST_PAGE.indexOf('id="composer"');
  assert.ok(context > 0 && context < composer);
  const row = HOST_PAGE.slice(context, composer);
  assert.match(row, /id="composer-directory"/);
  assert.match(row, /id="choose-model"/);
});

test("the Web client has no conversation name editor", () => {
  for (const id of [
    "edit-session-name",
    "session-name-dialog",
    "session-name-input",
    "save-session-name",
    "reset-session-name",
    "import-local-name",
  ])
    assert.doesNotMatch(HOST_PAGE, new RegExp(`id="${id}"`));
  assert.doesNotMatch(BROWSER_SCRIPT, /\/sessions\/\$\{[^}]+\}\/name/);
});

test("the sidebars use one heading and avoid duplicate search instructions", () => {
  assert.doesNotMatch(HOST_PAGE, /id="session-count"|Search saved memories\./);
  assert.match(HOST_PAGE, /id="memory-title">Memory</);
  assert.match(HOST_PAGE, /id="memory-search"[^>]+>Search</);
  assert.doesNotMatch(BROWSER_SCRIPT, /Search for a memory to carry forward\./);
});
