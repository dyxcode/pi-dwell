import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const handbookFiles = [
  "docs/handbook/README.md",
  "docs/handbook/implementation/README.md",
  "docs/handbook/implementation/authentication.md",
  "docs/handbook/implementation/browser-controller.md",
  "docs/handbook/implementation/browser-events.md",
  "docs/handbook/implementation/browser-input.md",
  "docs/handbook/implementation/browser-rendering.md",
  "docs/handbook/implementation/catalog.md",
  "docs/handbook/implementation/cli.md",
  "docs/handbook/implementation/coverage.md",
  "docs/handbook/implementation/discovery.md",
  "docs/handbook/implementation/events.md",
  "docs/handbook/implementation/history.md",
  "docs/handbook/implementation/http.md",
  "docs/handbook/implementation/overview.md",
  "docs/handbook/implementation/rpc.md",
  "docs/handbook/implementation/runtime.md",
  "docs/handbook/implementation/services.md",
  "docs/handbook/implementation/sessions.md",
  "docs/handbook/implementation/tooling.md",
  "docs/handbook/implementation/validators.md",
  "docs/handbook/implementation/workflow-lifecycle.md",
  "docs/handbook/implementation/workflow-message.md",
  "docs/handbook/implementation/workflow-observation.md",
  "docs/handbook/cli-service.md",
  "docs/handbook/contracts.md",
  "docs/handbook/development.md",
  "docs/handbook/errors.md",
  "docs/handbook/examples.md",
  "docs/handbook/glossary.md",
  "docs/handbook/guide.md",
  "docs/handbook/http-auth.md",
  "docs/handbook/quick-start.md",
  "docs/handbook/reference.md",
  "docs/handbook/runtime.md",
  "docs/handbook/sessions-storage.md",
  "docs/handbook/source-map.md",
  "docs/handbook/system.md",
  "docs/handbook/test-map.md",
  "docs/handbook/tutorials.md",
  "docs/handbook/web-client.md",
];

const translatedHandbookFiles = handbookFiles.map((path) =>
  path.replace("docs/handbook/", "docs/i18n/zh-CN/handbook/"),
);

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
        [
          "package.json",
          "LICENSE",
          "README.md",
          "docs/i18n/zh-CN/README.md",
          ...handbookFiles,
          ...translatedHandbookFiles,
        ].includes(path),
      `Unexpected package file: ${path}`,
    );
  }
  for (const required of [
    ...handbookFiles,
    ...translatedHandbookFiles,
    "LICENSE",
    "src/cli.ts",
    "src/server/http.ts",
    "src/server/access.ts",
    "src/server/sse.ts",
    "src/runtime/pi-process.ts",
    "src/runtime/pi-rpc.ts",
    "src/runtime/pi-history.ts",
    "src/sessions/service.ts",
    "src/sessions/events.ts",
    "src/sessions/history.ts",
    "src/storage/catalog.ts",
    "src/shared/sessions.ts",
    "src/shared/turns.ts",
    "src/shared/events.ts",
    "src/shared/history.ts",
    "src/clients/cli/runtime.ts",
    "src/clients/web/client.ts",
    "src/clients/web/input.ts",
    "src/clients/web/events.ts",
    "src/clients/web/transport.ts",
    "src/clients/web/page.ts",
    "src/clients/web/script.ts",
    "src/server/session-discovery.ts",
    "src/shared/discovery.ts",
    "README.md",
    "docs/i18n/zh-CN/README.md",
  ]) {
    assert.ok(paths.includes(required), `Missing package file: ${required}`);
  }
  console.log(`Package boundary checked: ${paths.length} files; local agent records excluded.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
