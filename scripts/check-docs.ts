import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Lexer, walkTokens } from "marked";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function explicitAnchors(text: string): string[] {
  return [...text.matchAll(/<a\s+id="([^"]+)"\s*><\/a>/g)].map((match) => match[1] ?? "");
}

function headingAnchors(text: string): Set<string> {
  const anchors = new Set(explicitAnchors(text));
  const counts = new Map<string, number>();
  walkTokens(Lexer.lex(text), (token) => {
    if (token.type !== "heading") return;
    const slug = token.text
      .replace(/<[^>]*>/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}_ -]/gu, "")
      .replace(/ /g, "-");
    const count = counts.get(slug) ?? 0;
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
    counts.set(slug, count + 1);
  });
  return anchors;
}

const content = new Map<string, string>();
const anchors = new Map<string, Set<string>>();
let linkCount = 0;

function checkLink(from: string, href: string): void {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return;
  const [path = "", encodedAnchor = ""] = href.split("#");
  const target = path ? resolve(dirname(from), decodeURIComponent(path)) : from;
  const label = `${relative(root, from)} -> ${href}`;
  assert.ok(!relative(root, target).startsWith(".."), `Link leaves repository: ${label}`);
  if (statSync(target).isDirectory()) {
    assert.equal(encodedAnchor, "", `Directory link has an anchor: ${label}`);
    linkCount += 1;
    return;
  }
  let text = content.get(target);
  if (text === undefined) {
    text = read(target);
    content.set(target, text);
  }
  const anchor = decodeURIComponent(encodedAnchor);
  if (anchor && extname(target) === ".md") {
    let known = anchors.get(target);
    if (!known) {
      known = headingAnchors(text);
      anchors.set(target, known);
    }
    assert.ok(known.has(anchor), `Missing Markdown anchor: ${label}`);
  } else if (anchor) {
    const line = /^L([1-9][0-9]*)(?:-L([1-9][0-9]*))?$/.exec(anchor);
    assert.ok(line, `Unsupported source anchor: ${label}`);
    const start = Number(line[1]);
    const end = Number(line[2] ?? line[1]);
    const length = text.trimEnd().split("\n").length;
    assert.ok(start <= end && end <= length, `Source line out of range: ${label}`);
  }
  linkCount += 1;
}

interface Callable {
  source: string;
  symbol: string;
  line: number;
}

function callables(path: string): Callable[] {
  const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true);
  const result: Callable[] = [];
  function visit(node: ts.Node, owners: string[]): void {
    let next = owners;
    if (ts.isClassDeclaration(node) && node.name) next = [...owners, node.name.text];
    else if (ts.isFunctionDeclaration(node) && node.name) {
      next = [...owners, node.name.text];
      record(node, next);
    } else if (
      (ts.isMethodDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isConstructorDeclaration(node)) &&
      node.body
    ) {
      next = [
        ...owners,
        ts.isConstructorDeclaration(node) ? "constructor" : node.name.getText(source),
      ];
      record(node, next);
    }
    ts.forEachChild(node, (child) => visit(child, next));
  }
  function record(node: ts.Node, names: string[]): void {
    result.push({
      source: relative(root, path),
      symbol: names.join("."),
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    });
  }
  visit(source, []);
  return result;
}

const english = files(join(root, "docs/handbook")).filter((path) => path.endsWith(".md"));
const chinese = files(join(root, "docs/i18n/zh-CN/handbook")).filter((path) =>
  path.endsWith(".md"),
);
assert.deepEqual(
  english.map((path) => relative(join(root, "docs/handbook"), path)).sort(),
  chinese.map((path) => relative(join(root, "docs/i18n/zh-CN/handbook"), path)).sort(),
  "Handbook locale file sets differ",
);
const documents = [
  join(root, "README.md"),
  join(root, "docs/i18n/zh-CN/README.md"),
  ...english,
  ...chinese,
];
for (const path of documents) {
  const text = read(path);
  const ids = explicitAnchors(text);
  assert.equal(ids.length, new Set(ids).size, `Duplicate explicit anchor: ${path}`);
  walkTokens(Lexer.lex(text), (token) => {
    if (token.type === "link" || token.type === "image") checkLink(path, token.href);
    if (path.includes("/implementation/") && token.type === "code") {
      assert.equal(token.lang, "mermaid", `Implementation prose contains copied code: ${path}`);
    }
  });
  if (path.includes("docs/handbook/implementation/")) {
    const translation = path.replace("docs/handbook/", "docs/i18n/zh-CN/handbook/");
    assert.deepEqual(ids, explicitAnchors(read(translation)), `Locale anchors differ: ${path}`);
  }
}

const sourceFiles = files(join(root, "src")).filter((path) => path.endsWith(".ts"));
const declarations = sourceFiles.flatMap(callables);
for (const edition of ["docs/handbook", "docs/i18n/zh-CN/handbook"]) {
  const atlasPath = join(root, edition, "source-map.md");
  const atlas = read(atlasPath);
  const mapped = new Map<string, { line: number; explanation: string }>();
  let source = "";
  for (const line of atlas.split("\n")) {
    const heading = /^## (src\/.*\.ts)$/.exec(line);
    if (heading) source = heading[1] ?? "";
    const row =
      /^\| \[`([^`]+)`\]\(([^)]+)#L(\d+)\) \| (Function|Nested function|Method|Constructor|GetAccessor|SetAccessor) \|/.exec(
        line,
      );
    if (!row) continue;
    assert.equal(
      resolve(dirname(atlasPath), row[2] ?? ""),
      join(root, source),
      `Callable citation points to a different source: ${source} ${row[1]}`,
    );
    const links = [...line.matchAll(/\]\((implementation\/[^)]+)\)/g)];
    assert.equal(links.length, 1, `Callable needs one explanation: ${source} ${row[1]}`);
    const explanation = links[0]?.[1];
    assert.ok(explanation);
    const key = `${source}:${row[1]}`;
    assert.ok(!mapped.has(key), `Duplicate callable in atlas: ${key}`);
    mapped.set(key, { line: Number(row[3]), explanation });
  }
  for (const path of sourceFiles) {
    assert.ok(atlas.includes(`## ${relative(root, path)}\n`), `Source file missing: ${path}`);
  }
  for (const item of declarations) {
    const key = `${item.source}:${item.symbol}`;
    const entry = mapped.get(key);
    assert.ok(entry, `Missing callable explanation: ${key}`);
    assert.equal(entry.line, item.line, `Stale callable source line: ${key}`);
    checkLink(atlasPath, entry.explanation);
    const [page = "", anchor = ""] = entry.explanation.split("#");
    assert.ok(anchor, `Callable explanation needs a section anchor: ${key}`);
    const explanation = read(resolve(dirname(atlasPath), page));
    const marker = `<a id="${anchor}"></a>`;
    const start = explanation.indexOf(marker);
    assert.ok(start >= 0, `Callable explanation needs an explicit anchor: ${key}`);
    const end = explanation.indexOf("<a id=", start + marker.length);
    const section = explanation.slice(start, end < 0 ? undefined : end);
    const parts = item.symbol.split(".");
    const name = parts.at(-1) === "constructor" ? parts.at(-2) : parts.at(-1);
    assert.ok(name && section.includes(name), `Explanation section does not name callable: ${key}`);
    mapped.delete(key);
  }
  assert.equal(mapped.size, 0, `Stale callable entries: ${[...mapped.keys()].join(", ")}`);
}
console.log(
  `Documentation checked: ${documents.length} pages, ${linkCount} local links, ${sourceFiles.length} source files, ${declarations.length} callable explanations in both locales.`,
);
