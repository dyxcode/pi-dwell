import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "pi-dwell-pack-"));
try {
  const output = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts", "--cache", temporary],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  /** @type {unknown} */
  const entries = JSON.parse(output);
  assert.ok(Array.isArray(entries) && entries.length === 1);
  /** @type {unknown} */
  const entry = entries[0];
  assert.ok(entry && typeof entry === "object" && "files" in entry && Array.isArray(entry.files));
  /** @type {unknown[]} */
  const files = entry.files;
  const paths = files.map((file) => {
    assert.ok(file && typeof file === "object" && "path" in file && typeof file.path === "string");
    return file.path;
  });
  for (const path of paths) {
    assert.ok(
      /^src\/(?:[a-z-]+\/)*[a-z-]+\.ts$/.test(path) ||
        ["package.json", "README.md", "docs/i18n/README.zh-CN.md"].includes(path),
      `Unexpected package file: ${path}`,
    );
  }
  for (const required of [
    "src/cli.ts",
    "src/server/http.ts",
    "src/server/sse.ts",
    "src/runtime/pi-process.ts",
    "src/runtime/pi-rpc.ts",
    "src/sessions/service.ts",
    "src/sessions/events.ts",
    "src/storage/catalog.ts",
    "src/shared/sessions.ts",
    "src/shared/turns.ts",
    "src/shared/events.ts",
    "src/clients/cli/runtime.ts",
    "README.md",
    "docs/i18n/README.zh-CN.md",
  ]) {
    assert.ok(paths.includes(required), `Missing package file: ${required}`);
  }
  console.log(`Package boundary checked: ${paths.length} files; local agent records excluded.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
