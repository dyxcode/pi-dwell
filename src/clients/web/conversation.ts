/// <reference lib="dom" />

import type { ContextSource, HistoryBlock, HistoryEntry } from "../../shared/history.ts";
import { renderMarkdown } from "./markdown.ts";

export type SavedConversationGroup =
  | { kind: "user"; entry: HistoryEntry }
  | { kind: "assistant"; entries: HistoryEntry[] };

/** Keep every saved response-side item in one group up to the next user message. */
export function groupConversationEntries(
  entries: readonly HistoryEntry[],
): SavedConversationGroup[] {
  const groups: SavedConversationGroup[] = [];
  let response: HistoryEntry[] = [];
  const flushResponse = (): void => {
    if (response.length === 0) return;
    groups.push({ kind: "assistant", entries: response });
    response = [];
  };

  for (const entry of entries) {
    if (entry.role === "user") {
      flushResponse();
      groups.push({ kind: "user", entry });
    } else {
      response.push(entry);
    }
  }
  flushResponse();
  return groups;
}

export interface ToolResultPairs {
  byCall: Map<string, HistoryEntry>;
  matchedResultIds: Set<string>;
  orphanResults: HistoryEntry[];
}

/** Match native tool result references even when other Pi messages occur between them. */
export function pairToolResults(entries: readonly HistoryEntry[]): ToolResultPairs {
  const queues = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    if (entry.role !== "toolResult" || !entry.toolCallId) continue;
    const queue = queues.get(entry.toolCallId) ?? [];
    queue.push(entry);
    queues.set(entry.toolCallId, queue);
  }

  const offsets = new Map<string, number>();
  const byCall = new Map<string, HistoryEntry>();
  const matchedResultIds = new Set<string>();
  for (const entry of entries) {
    for (const [index, block] of entry.blocks.entries()) {
      if (block.type !== "tool_call" || !block.callId) continue;
      const queue = queues.get(block.callId);
      if (!queue) continue;
      const offset = offsets.get(block.callId) ?? 0;
      const result = queue[offset];
      if (!result) continue;
      offsets.set(block.callId, offset + 1);
      byCall.set(`${entry.id}:${index}`, result);
      matchedResultIds.add(result.id);
    }
  }
  return {
    byCall,
    matchedResultIds,
    orphanResults: entries.filter(
      (entry) => entry.role === "toolResult" && !matchedResultIds.has(entry.id),
    ),
  };
}

export type SavedImageRenderer = (
  entryId: string,
  imageIndex: number,
  mimeType: string,
) => HTMLElement;

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.textContent = text;
  result.className = className;
  return result;
}

function keyed(details: HTMLDetailsElement, key: string, entryId?: string): HTMLDetailsElement {
  details.dataset.key = key;
  if (entryId) details.dataset.entryId = entryId;
  return details;
}

function markdown(parent: HTMLElement, source: string): void {
  if (source) renderMarkdown(parent, source);
}

function appendImage(
  parent: HTMLElement,
  entry: HistoryEntry,
  block: HistoryBlock,
  renderImage: SavedImageRenderer,
): void {
  if (block.imageIndex === undefined || block.mimeType === undefined) {
    parent.append(node("span", "Saved image unavailable.", "footnote"));
    return;
  }
  try {
    const image = renderImage(entry.id, block.imageIndex, block.mimeType);
    image.dataset.entryId = entry.id;
    image.dataset.imageIndex = String(block.imageIndex);
    parent.append(image);
  } catch {
    parent.append(node("span", "Saved image unavailable.", "footnote"));
  }
}

function appendMarkdownBlocks(
  parent: HTMLElement,
  entry: HistoryEntry,
  renderImage: SavedImageRenderer,
): void {
  for (const block of entry.blocks) {
    if (block.type === "thinking" || block.type === "tool_call") continue;
    if (block.type === "image") appendImage(parent, entry, block, renderImage);
    else markdown(parent, block.text);
  }
}

export function thinkingPresentation(source: string): { title: string; text: string } {
  const heading = /^(?:#{1,6}[ \t]+([^\r\n]+)|\*\*([^\r\n]+)\*\*)[ \t]*(?:\r?\n|$)/.exec(source);
  const title = (heading?.[1] ?? heading?.[2])?.trim();
  if (!heading || !title || title.length > 72) return { title: "Thinking", text: source };
  return { title, text: source.slice(heading[0].length).replace(/^(?:[ \t]*\r?\n)+/, "") };
}

function thinkingDetails(
  entry: HistoryEntry,
  block: HistoryBlock,
  index: number,
): HTMLDetailsElement {
  const details = keyed(node("details"), `thinking:${entry.id}:${index}`, entry.id);
  details.className = "thinking-run";
  const presentation = thinkingPresentation(block.text);
  const summary = node("summary", presentation.title);
  summary.setAttribute("aria-label", `Thinking details: ${presentation.title}`);
  details.append(summary);
  const content = node("div", "", "thinking-content");
  markdown(content, presentation.text);
  details.append(content);
  return details;
}

function appendRawOutput(
  parent: HTMLElement,
  entry: HistoryEntry | undefined,
  renderImage: SavedImageRenderer,
  blocks: readonly HistoryBlock[],
): void {
  let hasOutput = false;
  for (const block of blocks) {
    if (block.type === "thinking" || block.type === "tool_call") continue;
    if (block.type === "image") {
      if (entry) appendImage(parent, entry, block, renderImage);
      continue;
    }
    if (!block.text) continue;
    parent.append(node("pre", block.text, "tool-output"));
    hasOutput = true;
  }
  if (!hasOutput && !blocks.some((block) => block.type === "image"))
    parent.append(node("pre", "No output saved.", "tool-output"));
}

function bashCommand(call: HistoryBlock | undefined): string | null {
  if (call?.name !== "bash") return null;
  try {
    const value: unknown = JSON.parse(call.text);
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "command" in value &&
      typeof value.command === "string"
    )
      return value.command;
  } catch {
    /* A malformed saved input remains a generic tool call. */
  }
  return null;
}

function toolRun(
  owner: HistoryEntry,
  call: HistoryBlock | undefined,
  result: HistoryEntry | undefined,
  renderImage: SavedImageRenderer,
  key: string,
  options: { shell?: boolean; orphan?: boolean } = {},
): HTMLDetailsElement {
  const isError = owner.error === true || result?.error === true;
  const details = keyed(node("details"), key, owner.id);
  details.className = `tool-run${isError ? " error" : ""}`;
  details.open = isError;
  const summary = node("summary");
  const shell = options.shell === true || call?.name === "bash";
  const command = options.shell ? (call?.text ?? "bash") : bashCommand(call);
  const label = shell
    ? `$ ${command ?? "bash"}`
    : (call?.name ?? owner.toolName ?? (options.orphan ? "Tool result" : "Tool"));
  summary.append(node("code", label));
  const status = isError
    ? "Error"
    : result
      ? "✓"
      : options.shell
        ? "Saved"
        : options.orphan
          ? "Orphan result"
          : "No result saved";
  summary.append(node("span", status, "tool-status"));
  details.append(summary);

  const body = node("div", "", "tool-run-body");
  if (call && !shell) {
    body.append(node("div", "Input", "tool-caption"));
    body.append(node("pre", call.text, "tool-output tool-input"));
  }
  if (options.shell) {
    const output = owner.blocks.filter((block) => block !== call);
    appendRawOutput(body, owner, renderImage, output);
  } else if (result) {
    appendRawOutput(body, result, renderImage, result.blocks);
    if (result.truncated)
      body.append(node("p", "This saved result was truncated for display.", "footnote"));
  } else if (shell && call) {
    body.append(node("p", "No matching result was saved.", "footnote"));
  } else if (options.orphan) {
    appendRawOutput(body, owner, renderImage, owner.blocks);
  } else {
    body.append(node("p", "No matching result was saved.", "footnote"));
  }
  details.append(body);
  return details;
}

function appendTruncated(parent: HTMLElement, entry: HistoryEntry): void {
  if (entry.truncated)
    parent.append(node("p", "This saved entry was truncated for display.", "footnote"));
}

function renderUser(entry: HistoryEntry, renderImage: SavedImageRenderer): HTMLElement {
  const article = node("article", "", "message user");
  article.dataset.entryId = entry.id;
  article.setAttribute("aria-label", "User message");
  const body = node("div", "", "message-body");
  appendMarkdownBlocks(body, entry, renderImage);
  appendTruncated(body, entry);
  article.append(body);
  return article;
}

function renderAssistant(
  entries: readonly HistoryEntry[],
  renderImage: SavedImageRenderer,
): HTMLElement {
  const article = node("article", "", "message assistant");
  article.dataset.entryId = entries[0]?.id ?? "";
  article.setAttribute("aria-label", "Pi response");
  const body = node("div", "", "message-body");
  const pairs = pairToolResults(entries);

  for (const entry of entries) {
    if (
      entry.role === "custom" ||
      entry.role === "context" ||
      entry.role === "diagnostic" ||
      entry.role === null
    ) {
      const special = renderSpecial(entry, renderImage);
      if (special) body.append(special);
      appendTruncated(body, entry);
      continue;
    }
    if (entry.role === "toolResult") {
      if (pairs.matchedResultIds.has(entry.id)) {
        continue;
      }
      body.append(
        toolRun(entry, undefined, undefined, renderImage, `orphan:${entry.id}`, {
          orphan: true,
        }),
      );
      appendTruncated(body, entry);
      continue;
    }
    if (entry.role === "bashExecution") {
      const command = entry.blocks.find((block) => block.type === "tool_call");
      body.append(
        toolRun(entry, command, undefined, renderImage, `bash:${entry.id}`, { shell: true }),
      );
      appendTruncated(body, entry);
      continue;
    }

    for (const [index, block] of entry.blocks.entries()) {
      if (block.type === "thinking") {
        body.append(thinkingDetails(entry, block, index));
        continue;
      }
      if (block.type === "tool_call") {
        const key = `${entry.id}:${index}`;
        const result = pairs.byCall.get(key);
        body.append(toolRun(entry, block, result, renderImage, `tool:${key}`));
      } else if (block.type === "image") appendImage(body, entry, block, renderImage);
      else markdown(body, block.text);
    }
    appendTruncated(body, entry);
  }

  article.append(body);
  return article;
}

function renderSpecial(entry: HistoryEntry, renderImage: SavedImageRenderer): HTMLElement | null {
  if (entry.role === "custom") {
    const message = node("div", "", "custom-message");
    message.dataset.entryId = entry.id;
    message.setAttribute("aria-label", `${entry.toolName ?? "Pi extension"} message`);
    const body = node("div", "", "message-body");
    appendMarkdownBlocks(body, entry, renderImage);
    appendTruncated(body, entry);
    message.append(body);
    return message;
  }

  const details = keyed(node("details"), `history:${entry.id}`, entry.id);
  const diagnostic = entry.role === "diagnostic" || entry.role === null;
  details.className = diagnostic ? "history-diagnostic" : "history-context";
  const title = diagnostic
    ? "Saved history note"
    : entry.type.includes("branch")
      ? "Branch summary"
      : "Conversation summary";
  details.append(node("summary", title));
  const body = node("div", "", diagnostic ? "diagnostic-body" : "context-content");
  appendMarkdownBlocks(body, entry, renderImage);
  appendTruncated(body, entry);
  details.append(body);
  return details;
}

function renderContext(
  sources: readonly ContextSource[],
  truncated: boolean,
): HTMLDetailsElement | null {
  if (sources.length === 0 && !truncated) return null;
  const details = keyed(node("details"), "session-context");
  details.className = "session-details";
  details.append(
    node(
      "summary",
      `Context · ${sources.length} source${sources.length === 1 ? "" : "s"}${truncated ? " · preview shortened" : ""}`,
    ),
  );
  const body = node("div", "", "session-details-body");
  body.append(node("p", "Instructions saved in Pi's system context.", "session-details-caption"));
  if (truncated)
    body.append(
      node(
        "p",
        "Part of the saved instruction context is omitted from this preview.",
        "session-details-caption",
      ),
    );
  for (const source of sources) {
    const item = keyed(node("details"), `context:${source.path}`);
    item.className = "context-source";
    const label = node("summary");
    label.append(node("span", source.path));
    if (source.truncated) label.append(node("span", " · preview truncated", "footnote"));
    item.append(label);
    const content = node("div", "", "context-content");
    markdown(content, source.content);
    item.append(content);
    body.append(item);
  }
  details.append(body);
  return details;
}

/** Render a safe, grouped projection of saved Pi history into a browser fragment. */
export function renderSavedConversation(
  entries: readonly HistoryEntry[],
  contextSources: readonly ContextSource[] = [],
  contextSourcesTruncated = false,
  renderImage: SavedImageRenderer = (entryId, imageIndex, mimeType) => {
    const unavailable = node("span", "Saved image unavailable.", "footnote");
    unavailable.dataset.entryId = entryId;
    unavailable.dataset.imageIndex = String(imageIndex);
    unavailable.dataset.mimeType = mimeType;
    return unavailable;
  },
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const context = renderContext(contextSources, contextSourcesTruncated);
  if (context) fragment.append(context);
  for (const group of groupConversationEntries(entries)) {
    if (group.kind === "user") fragment.append(renderUser(group.entry, renderImage));
    else fragment.append(renderAssistant(group.entries, renderImage));
  }
  return fragment;
}
