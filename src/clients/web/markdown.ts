/// <reference lib="dom" />
import { marked } from "marked";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function entities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: "\u00a0",
  };
  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
    (original: string, name: string) => {
      if (!name.startsWith("#")) return named[name.toLowerCase()] ?? original;
      const code =
        name[1]?.toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : "\ufffd";
    },
  );
}
export function safeLink(value: string): string | null {
  try {
    const url = new URL(value, location.href);
    return ["https:", "http:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
/** Parse Markdown into explicit DOM nodes. Raw HTML never becomes executable markup. */
export function renderMarkdown(parent: HTMLElement, source: string): void {
  parent.classList.add("markdown");
  let count = 0;
  const append = (target: HTMLElement, values: unknown, depth = 0): void => {
    if (!Array.isArray(values) || depth > 64) return;
    for (const value of values) {
      if (++count > 12000) return;
      const token = record(value),
        type = text(token.type);
      if (["space", "def", "checkbox"].includes(type)) continue;
      if (type === "code") {
        const block = document.createElement("figure");
        block.className = "code-block";
        const language = text(token.lang).split(/\s/)[0];
        if (language) {
          const label = document.createElement("figcaption");
          label.textContent = language;
          block.append(label);
        }
        const pre = document.createElement("pre"),
          code = document.createElement("code");
        pre.tabIndex = 0;
        code.textContent = text(token.text);
        pre.append(code);
        block.append(pre);
        target.append(block);
        continue;
      }
      if (type === "table") {
        const wrap = document.createElement("div");
        wrap.className = "table-scroll";
        wrap.tabIndex = 0;
        const table = document.createElement("table"),
          head = document.createElement("thead"),
          body = document.createElement("tbody");
        const row = (cells: unknown, header: boolean): HTMLTableRowElement => {
          const tr = document.createElement("tr");
          for (const [index, value] of (Array.isArray(cells) ? cells : []).entries()) {
            const cell = record(value),
              td = document.createElement(header ? "th" : "td");
            if (header) td.setAttribute("scope", "col");
            const alignment = Array.isArray(token.align) ? text(token.align[index]) : "";
            if (["left", "center", "right"].includes(alignment)) td.style.textAlign = alignment;
            append(td, cell.tokens, depth + 1);
            tr.append(td);
          }
          return tr;
        };
        head.append(row(token.header, true));
        for (const cells of Array.isArray(token.rows) ? token.rows : [])
          body.append(row(cells, false));
        table.append(head, body);
        wrap.append(table);
        target.append(wrap);
        continue;
      }
      if (type === "list") {
        const list = document.createElement(token.ordered ? "ol" : "ul");
        if (token.ordered && typeof token.start === "number")
          list.setAttribute("start", String(token.start));
        for (const value of Array.isArray(token.items) ? token.items : []) {
          const item = record(value),
            li = document.createElement("li");
          if (item.task) {
            li.className = "task-item";
            const check = document.createElement("input");
            check.type = "checkbox";
            check.disabled = true;
            check.checked = item.checked === true;
            check.setAttribute("aria-label", check.checked ? "Completed" : "Not completed");
            li.append(check);
          }
          append(li, item.tokens, depth + 1);
          list.append(li);
        }
        target.append(list);
        continue;
      }
      if (type === "link" || type === "image") {
        const url = safeLink(entities(text(token.href)));
        const link = document.createElement("a");
        if (url) {
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
        if (type === "image") link.textContent = entities(text(token.text)) || "Image";
        else append(link, token.tokens, depth + 1);
        target.append(link);
        continue;
      }
      const tags: Record<string, keyof HTMLElementTagNameMap> = {
        paragraph: "p",
        blockquote: "blockquote",
        strong: "strong",
        em: "em",
        del: "del",
        br: "br",
        hr: "hr",
        codespan: "code",
      };
      const headings: Record<string, keyof HTMLElementTagNameMap> = {
        "1": "h1",
        "2": "h2",
        "3": "h3",
        "4": "h4",
        "5": "h5",
        "6": "h6",
      };
      const tag = type === "heading" ? (headings[String(token.depth)] ?? "h2") : tags[type];
      if (tag) {
        const element = document.createElement(tag);
        if (token.tokens) append(element, token.tokens, depth + 1);
        else if (token.text)
          element.textContent = type === "codespan" ? text(token.text) : entities(text(token.text));
        target.append(element);
      } else if (token.tokens) append(target, token.tokens, depth + 1);
      else
        target.append(
          document.createTextNode(
            type === "html" ? text(token.text) : entities(text(token.text) || text(token.raw)),
          ),
        );
    }
  };
  append(parent, marked.lexer(source, { gfm: true }));
}
