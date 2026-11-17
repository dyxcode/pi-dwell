import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));

test("documentation maps source declarations to feature prose without exposing symbols", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "dwell-docs-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path: string, value: string) => writeFileSync(join(root, path), value);
  for (const directory of [
    "scripts",
    "src",
    "docs/handbook/implementation",
    "docs/i18n/zh-CN/handbook/implementation",
  ])
    mkdirSync(join(root, directory), { recursive: true });
  symlinkSync(join(repository, "node_modules"), join(root, "node_modules"), "dir");
  copyFileSync(join(repository, "scripts/check-docs.ts"), join(root, "scripts/check-docs.ts"));
  write("package.json", '{"type":"module"}\n');
  write("README.md", "# Fixture\n");
  write("docs/i18n/zh-CN/README.md", "# 测试\n");
  write("src/example.ts", "export function saveName(): void {}\n");
  write("src/other.ts", "export const other = true;\n");
  const prose =
    '<a id="mechanisms"></a>\n\n## Version checks\n\nA saved name advances its version.\n';
  const atlas = (prefix: string) =>
    `## src/example.ts\n\n| [\`saveName\`](${prefix}src/example.ts#L1) | Function | | [Feature](implementation/names.md#mechanisms) |\n\n## src/other.ts\n`;
  const editions = ["docs/handbook", "docs/i18n/zh-CN/handbook"];
  function reset(): void {
    for (const edition of editions) {
      write(`${edition}/source-map.md`, atlas(edition === editions[0] ? "../../" : "../../../../"));
      write(`${edition}/implementation/names.md`, prose);
    }
  }
  function run(): { status: number | null; output: string } {
    const result = spawnSync(process.execPath, ["scripts/check-docs.ts"], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
    });
    if (result.error) throw result.error;
    return { status: result.status, output: result.stdout + result.stderr };
  }
  reset();
  await t.test("accepts a conceptual explanation without the function name", () => {
    const result = run();
    assert.equal(result.status, 0, result.output);
  });
  const faults = [
    {
      name: "rejects a source citation to a different existing file",
      change: () =>
        write(
          "docs/handbook/source-map.md",
          atlas("../../").replace("example.ts#L1", "other.ts#L1"),
        ),
      error: /different source/,
    },
    {
      name: "rejects stale declaration lines",
      change: () => write("src/example.ts", "\nexport function saveName(): void {}\n"),
      error: /Stale callable source line/,
    },
    {
      name: "rejects missing callable mappings",
      change: () => write("docs/handbook/source-map.md", "## src/example.ts\n\n## src/other.ts\n"),
      error: /Missing callable/,
    },
    {
      name: "rejects missing feature anchors",
      change: () =>
        write("docs/handbook/source-map.md", atlas("../../").replace("#mechanisms", "#missing")),
      error: /Missing Markdown anchor/,
    },
    {
      name: "rejects locale anchor drift",
      change: () =>
        write("docs/i18n/zh-CN/handbook/implementation/names.md", `${prose}\n<a id="extra"></a>\n`),
      error: /Locale anchors differ/,
    },
    {
      name: "rejects different feature mappings between locales",
      change: () => {
        for (const edition of editions)
          write(
            `${edition}/implementation/names.md`,
            `${prose}\n<a id="ownership"></a>\n\n## Ownership\n\nThe Host stores shared names.\n`,
          );
        write(
          "docs/i18n/zh-CN/handbook/source-map.md",
          atlas("../../../../").replace("#mechanisms", "#ownership"),
        );
      },
      error: /Locale feature mappings differ/,
    },
    {
      name: "rejects an empty feature explanation",
      change: () => {
        for (const edition of editions)
          write(
            `${edition}/implementation/names.md`,
            '<a id="mechanisms"></a>\n\n## Version checks\n',
          );
      },
      error: /Feature section needs explanatory content/,
    },
    {
      name: "rejects source code in feature prose",
      change: () =>
        write(
          "docs/handbook/implementation/names.md",
          `${prose}\n\`\`\`ts\nconst name = 1;\n\`\`\`\n`,
        ),
      error: /copied code/,
    },
  ];
  for (const fault of faults) {
    await t.test(fault.name, () => {
      reset();
      write("src/example.ts", "export function saveName(): void {}\n");
      fault.change();
      const result = run();
      assert.notEqual(result.status, 0, result.output);
      assert.match(result.output, fault.error);
    });
  }
});
