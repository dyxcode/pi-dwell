import assert from "node:assert/strict";
import { Script } from "node:vm";
import { test } from "node:test";
import { BROWSER_SCRIPT } from "../src/clients/web/script.ts";
import { HOST_PAGE, STYLE } from "../src/clients/web/page.ts";

test("the browser status page loads same-origin external assets without inline code", () => {
  assert.match(HOST_PAGE, /<link rel="stylesheet" href="\/style\.css">/);
  assert.match(HOST_PAGE, /<script src="\/client\.js" defer><\/script>/);
  assert.doesNotMatch(HOST_PAGE, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.match(HOST_PAGE, /id="pair-form"/);
  assert.match(HOST_PAGE, /npm run dwell -- pair/);
  assert.match(HOST_PAGE, /pattern="\[0-9a-f\]\{32\}"/);
  assert.match(HOST_PAGE, /autocomplete="off"/);
  assert.match(HOST_PAGE, /Host mode/);
  assert.match(STYLE, /:focus-visible/);
});

test("the browser client has valid JavaScript and uses the pairing and status routes safely", () => {
  assert.doesNotThrow(() => new Script(BROWSER_SCRIPT));
  assert.match(BROWSER_SCRIPT, /\/api\/v1\/status/);
  assert.match(BROWSER_SCRIPT, /\/api\/v1\/auth\/pair/);
  assert.match(BROWSER_SCRIPT, /\/api\/v1\/auth\/logout/);
  assert.match(BROWSER_SCRIPT, /X-Dwell-Request/);
  assert.match(BROWSER_SCRIPT, /X-Dwell-Browser/);
  assert.match(BROWSER_SCRIPT, /browserKey: binding/);
  assert.match(BROWSER_SCRIPT, /credentials:\s*["']same-origin["']/);
  assert.match(BROWSER_SCRIPT, /10_000/);
  assert.equal(
    BROWSER_SCRIPT.match(/signal: AbortSignal\.timeout\(REQUEST_TIMEOUT_MS\)/g)?.length,
    3,
  );
  assert.match(BROWSER_SCRIPT, /Number\.isSafeInteger\(value\.processId\)/);
  assert.match(BROWSER_SCRIPT, /value\.processId <= 0/);
  assert.match(BROWSER_SCRIPT, /\^\[a-f0-9-\]\{36\}\$/);
  assert.match(BROWSER_SCRIPT, /value\.mode !== "production"/);
  assert.match(BROWSER_SCRIPT, /value\.mode !== "development"/);
  assert.match(BROWSER_SCRIPT, /response\.status === 429/);
  assert.match(BROWSER_SCRIPT, /Too many pairing attempts\. Wait/);
  assert.match(BROWSER_SCRIPT, /\^\[a-f0-9\]\{32\}\$/);
  assert.match(BROWSER_SCRIPT, /dwell\.browser-binding\.v1/);
  assert.match(BROWSER_SCRIPT, /new Uint8Array\(32\)/);
  assert.match(BROWSER_SCRIPT, /window\.crypto\.getRandomValues\(bytes\)/);
  assert.match(BROWSER_SCRIPT, /Browser storage is unavailable/);
  const storageCalls = Array.from(
    BROWSER_SCRIPT.matchAll(/storage\.(getItem|setItem|removeItem)\(([^)]*)\)/g),
  );
  assert.ok(storageCalls.length > 0);
  for (const call of storageCalls) assert.equal(call[2], "BROWSER_BINDING_KEY");
  assert.match(BROWSER_SCRIPT, /textContent/);
  assert.doesNotMatch(
    BROWSER_SCRIPT,
    /innerHTML|sessionStorage|document\.cookie|navigator\.clipboard|console\.|sessionToken|cliToken/i,
  );
});
