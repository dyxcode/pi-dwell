import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readIntegrations } from "../src/integrations/configuration.ts";

test("optional integrations use explicit local modules and storage paths", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dwell-integrations-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await readIntegrations(root), { version: 1 });
  const configuration = {
    version: 1,
    distill: { module: join(root, "host-storage.js"), database: join(root, "memories.sqlite") },
  };
  await writeFile(join(root, "integrations.json"), JSON.stringify(configuration), { mode: 0o600 });
  assert.deepEqual(await readIntegrations(root), configuration);
  for (const invalid of [
    { ...configuration, version: 2 },
    { version: 1, distill: { ...configuration.distill, module: "https://example.com/module.js" } },
    { version: 1, distill: { ...configuration.distill, database: "memories.sqlite" } },
    { version: 1, distill: { ...configuration.distill, extra: true } },
  ]) {
    await writeFile(join(root, "integrations.json"), JSON.stringify(invalid));
    await assert.rejects(readIntegrations(root), /Invalid integrations.json/);
  }
});
