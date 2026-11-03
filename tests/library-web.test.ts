import assert from "node:assert/strict";
import { test } from "node:test";
import { HOST_PAGE, STYLE } from "../src/clients/web/page.ts";
import { BROWSER_ASSETS } from "../src/clients/web/script.ts";

test("the browser exposes one library dialog with desktop and mobile entry points", () => {
  for (const id of [
    "library-open",
    "library-open-mobile",
    "library-dialog",
    "library-search-form",
    "library-items",
    "library-references",
    "library-reader",
    "library-reference-action",
  ])
    assert.match(HOST_PAGE, new RegExp(`id="${id}"`));
  assert.equal((HOST_PAGE.match(/id="library-dialog"/g) ?? []).length, 1);
  assert.match(HOST_PAGE, /aria-labelledby="library-title"/);
  assert.match(STYLE, /#library-open-mobile/);
});

test("the browser reads exact library references and keeps attach actions out of turn submission", () => {
  const client = BROWSER_ASSETS.get("/client.js");
  assert.ok(client);
  assert.ok(BROWSER_ASSETS.has("/shared/library.js"));
  assert.match(client, /\/api\/v1\/library\/search/);
  assert.match(client, /\/api\/v1\/library\/latest/);
  assert.match(client, /libraryItemPath\(reference\)/);
  assert.match(client, /"DELETE"/);
  assert.match(client, /dialogAttempt !== libraryDialogGeneration/);
  assert.match(client, /selected !== sessionId/);
  assert.match(client, /selected === sessionId/);
  const boundary = client.slice(
    client.indexOf("function sameLibraryReference"),
    client.indexOf("const attachments ="),
  );
  assert.doesNotMatch(boundary, /\/turns(?:\/|["`])/);
  assert.doesNotMatch(boundary, /\/context(?:["`])/);
});

test("library reference mutations stay serialized and reload saved state after writes", () => {
  const client = BROWSER_ASSETS.get("/client.js");
  assert.ok(client);
  assert.match(client, /let libraryReferenceMutationPending = false/);
  assert.match(client, /if \(sessionId === null \|\| libraryReferenceMutationPending\) return/);
  assert.match(client, /remove\.disabled = libraryReferenceMutationPending/);
  assert.match(client, /action\.disabled = selected === null \|\| libraryReferenceMutationPending/);
  const start = client.indexOf("async function changeLibraryReference");
  const end = client.indexOf("function openLibrary", start);
  const mutation = client.slice(start, end);
  const refresh = mutation.indexOf("await loadLibraryReferences()");
  const unlock = mutation.indexOf("libraryReferenceMutationPending = false");
  assert.ok(refresh >= 0 && unlock > refresh);
  assert.doesNotMatch(mutation, /currentLibraryReferences = value\.references/);
});
