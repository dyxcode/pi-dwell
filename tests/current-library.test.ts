import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { CurrentLibrary } from "../src/integrations/current.ts";
import {
  isLibraryItemsResponse,
  isLibraryItemView,
  isLibraryLatestResponse,
  isLibraryReference,
  libraryItemPath,
} from "../src/shared/library.ts";

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

test("Current stays optional when no binding is configured", async () => {
  assert.equal(await CurrentLibrary.open(), undefined);
});

test("library references accept the configured binding shape", () => {
  const reference = {
    binding: "Current.main_1",
    itemId: randomUUID(),
    versionId: randomUUID(),
  };
  assert.equal(isLibraryReference(reference), true);
  assert.equal(
    libraryItemPath(reference),
    `/api/v1/library/Current.main_1/items/${reference.itemId}/versions/${reference.versionId}`,
  );
});

test("Current rejects a module that does not publish API v1", async () => {
  const root = await mkdtemp(join(tmpdir(), "dwell-current-invalid-module-"));
  const wrongVersion = join(root, "wrong-version.mjs");
  await writeFile(
    wrongVersion,
    "export const contentLibraryApiVersion = 2; export function openContentLibrary() { return {}; }",
  );
  const incompleteApi = join(root, "incomplete-api.mjs");
  await writeFile(
    incompleteApi,
    "export const contentLibraryApiVersion = 1; export function openContentLibrary() { return { apiVersion: 1, search() {}, latest() {}, close() {} }; }",
  );
  try {
    for (const module of [wrongVersion, incompleteApi]) {
      await assert.rejects(
        CurrentLibrary.open({ module, root: join(root, "data"), binding: "primary-current" }),
        (error: unknown) => hasCode(error, "library_unavailable"),
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const currentModulePath = process.env.DWELL_TEST_CURRENT_MODULE;
test("Current reads exact saved versions and reports removed items", async (t) => {
  if (!currentModulePath) {
    t.skip("Set DWELL_TEST_CURRENT_MODULE to the built Current API v1 entry.");
    return;
  }
  const root = await mkdtemp(join(tmpdir(), "dwell-current-library-"));
  const moduleUrl = pathToFileURL(currentModulePath).href;
  const current = await import(moduleUrl);
  const seed = current.openContentLibrary({ root });
  let library: CurrentLibrary | undefined;
  try {
    const timestamp = "2026-11-03T00:00:00.000Z";
    const originalText = "Original synthetic body.".repeat(1_000);
    const originalExcerpt = originalText.slice(0, 20_000);
    const updatedText = "Updated synthetic body.".repeat(200);
    const sourceItem = {
      sourceId: "sample",
      externalId: "one",
      url: "https://example.com/synthetic-item",
      title: "Synthetic item",
      text: originalText,
      retrievedAt: timestamp,
      sourceCompleteness: "unknown",
      truncated: false,
      metadata: { category: "synthetic", localOnly: true },
    };
    const first = await seed.save({
      batch: {
        id: randomUUID(),
        sourceId: "sample",
        collectedAt: timestamp,
        items: [sourceItem],
        failures: [],
        stopReason: "complete",
      },
      requestedCount: 1,
      startedAt: timestamp,
    });
    const original = first.items[0];
    assert.ok(original);

    library = await CurrentLibrary.open({
      module: currentModulePath,
      root,
      binding: "primary-current",
    });
    assert.ok(library);
    assert.equal(library.binding, "primary-current");
    await assert.rejects(library.search({ query: "   " }), (error: unknown) =>
      hasCode(error, "invalid_input"),
    );
    const originalView = await library.read({
      binding: library.binding,
      itemId: original.itemId,
      versionId: original.versionId,
    });
    assert.equal(originalView.text, originalExcerpt);
    assert.equal(originalView.text.length, 20_000);
    assert.equal(originalView.displayTruncated, true);
    assert.equal(Object.hasOwn(originalView, "metadata"), false);
    assert.equal(isLibraryItemView(originalView), true);
    assert.equal(
      libraryItemPath(originalView.reference),
      `/api/v1/library/primary-current/items/${original.itemId}/versions/${original.versionId}`,
    );

    const revised = await seed.save({
      batch: {
        id: randomUUID(),
        sourceId: "sample",
        collectedAt: timestamp,
        items: [{ ...sourceItem, text: updatedText }],
        failures: [],
        stopReason: "complete",
      },
      requestedCount: 1,
      startedAt: timestamp,
    });
    assert.equal(revised.items[0]?.itemId, original.itemId);
    assert.notEqual(revised.items[0]?.versionId, original.versionId);
    const oldVersion = await library.read({
      binding: library.binding,
      itemId: original.itemId,
      versionId: original.versionId,
    });
    assert.equal(oldVersion.text, originalExcerpt);
    assert.equal(isLibraryItemView(oldVersion), true);

    const latest = await library.latest();
    assert.ok(isLibraryLatestResponse(latest));
    assert.equal(latest.items[0]?.reference.versionId, revised.items[0]?.versionId);
    assert.equal(latest.items[0]?.text.length, 2_000);
    assert.equal(latest.items[0]?.text, updatedText.slice(0, 2_000));
    assert.equal(latest.items[0]?.displayTruncated, true);
    const matches = await library.search({ query: "updated" });
    assert.ok(isLibraryItemsResponse(matches));
    assert.equal(matches.items.length, 1);
    assert.equal((await library.search({ query: "original" })).items.length, 0);

    await assert.rejects(
      library.read({
        binding: "another-current",
        itemId: original.itemId,
        versionId: original.versionId,
      }),
      (error: unknown) => hasCode(error, "library_binding_mismatch"),
    );

    assert.equal(await seed.remove(original.itemId), true);
    await assert.rejects(
      library.read({
        binding: library.binding,
        itemId: original.itemId,
        versionId: original.versionId,
      }),
      (error: unknown) => hasCode(error, "library_not_found"),
    );
    assert.equal((await library.search({ query: "updated" })).items.length, 0);

    await library.close();
    await library.close();
    await assert.rejects(library.latest(), (error: unknown) =>
      hasCode(error, "library_unavailable"),
    );
  } finally {
    await library?.close();
    await seed.close();
    await rm(root, { recursive: true, force: true });
  }
});
