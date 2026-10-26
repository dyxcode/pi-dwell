/// <reference lib="dom" />

import { isAvailableModelsResponse, isHostDirectoryListing } from "../../shared/discovery.ts";
import { type HistoryEntry, isHistoryPage } from "../../shared/history.ts";
import { isHostStatus } from "../../shared/protocol.ts";
import { isSessionInfo, type SessionInfo } from "../../shared/sessions.ts";
import { isTurnInfo, type TurnInfo } from "../../shared/turns.ts";
import { emptyConversationState, reconcileHistory, reduceFrame, SSEDecoder } from "./events.ts";
import { setupComposer } from "./input.ts";
import { ApiError, api, binding, headers, message, responseError } from "./transport.ts";

function el<T extends HTMLElement>(id: string, type: { new (): T }): T {
  const node = document.getElementById(id);
  if (!(node instanceof type)) throw new Error(`Missing ${id}`);
  return node;
}
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
const input = el("message", HTMLTextAreaElement);
const form = el("composer", HTMLFormElement);
const composer = setupComposer(input, form);
const rail = el("rail", HTMLElement),
  main = el("chat-main", HTMLElement);
const gate = el("gate", HTMLElement),
  app = el("app", HTMLElement);
const scroll = el("scroll", HTMLElement),
  conversation = el("conversation", HTMLElement);
const send = el("send", HTMLButtonElement),
  notice = el("notice", HTMLElement);
const dialog = el("new-dialog", HTMLDialogElement);
const directory = el("directory", HTMLInputElement),
  model = el("model", HTMLSelectElement);
const sessionName = el("session-name", HTMLInputElement),
  createButton = el("create-button", HTMLButtonElement);
const older = el("load-older", HTMLButtonElement);
const names = new Map<string, string>(),
  drafts = new Map<string, string>();
const turns = new Map<string, TurnInfo>();
let sessions: SessionInfo[] = [],
  selected: string | null = null;
let state = emptyConversationState();
let entries: HistoryEntry[] = [],
  nextCursor: string | null = null;
let controller: AbortController | null = null,
  generation = 0,
  authenticated = false;
let reconnectTimer: number | undefined, pollTimer: number | undefined;
let polling = false,
  suspended = false;
let historyPending = false,
  historyAgain = false,
  sending = false;
let pendingSend: { session: string; requestId: string; message: string } | null = null;
let pendingCreate: {
  requestId: string;
  directory: string;
  provider: string;
  model: string;
  name: string;
} | null = null;
let authAttempt = 0,
  browseAttempt = 0,
  modelAttempt = 0;
let hostMode = "",
  historyError = "",
  streamConnected = false;
let noticeSource: "action" | "stream" | undefined;
const localPreferences: Record<string, string> = {};
try {
  const value: unknown = JSON.parse(localStorage.getItem("dwell.web.preferences.v1") ?? "{}");
  if (value && typeof value === "object" && !Array.isArray(value))
    for (const [key, label] of Object.entries(value))
      if (typeof label === "string" && label.length <= 200) localPreferences[key] = label;
} catch {
  /* pairing separately explains unavailable storage */
}
for (const [id, name] of Object.entries(localPreferences))
  if (id !== "selected") names.set(id, name);
function savePreference(key: string, value: string): void {
  localPreferences[key] = value;
  try {
    localStorage.setItem("dwell.web.preferences.v1", JSON.stringify(localPreferences));
  } catch {
    /* names and selection can remain in memory */
  }
}
function activeSession(): SessionInfo | undefined {
  return sessions.find((s) => s.id === selected);
}
function label(s: SessionInfo): string {
  return names.get(s.id) || s.directory.split(/[\\/]/).filter(Boolean).pop() || s.directory;
}
function status(s: SessionInfo): string {
  const turn =
    s.id === selected ? (state.activeTurn ?? state.latestTurn ?? turns.get(s.id)) : turns.get(s.id);
  if (s.activeTurnId) return turn?.cancellationRequested ? "Stopping" : "Working";
  if (turn?.status === "interrupted" || s.status === "interrupted") return "Interrupted";
  if (turn?.status === "failed" || s.status === "failed" || s.runtimeState === "failed")
    return "Failed";
  if (turn?.status === "aborted") return "Stopped";
  if (s.runtimeState === "opening" || s.status === "creating") return "Opening";
  if (turn?.status === "completed") return "Completed";
  return "Idle";
}
function glyph(value: string): string {
  return value === "Working" || value === "Stopping"
    ? "◒"
    : value === "Completed"
      ? "✓"
      : value === "Failed" || value === "Interrupted"
        ? "!"
        : "○";
}
function showError(error: unknown, source: "action" | "stream" = "action"): void {
  if (error instanceof ApiError && error.status === 401) {
    disconnect("This browser needs pairing again. Your host-owned work continues.");
    return;
  }
  if (source === "stream" && noticeSource === "action") return;
  noticeSource = source;
  notice.textContent = message(error);
  notice.hidden = false;
}
function clearNotice(): void {
  noticeSource = undefined;
  notice.hidden = true;
  notice.textContent = "";
}
function nav(open: boolean): void {
  rail.classList.toggle("open", open);
  main.inert = open;
  el("scrim", HTMLButtonElement).hidden = !open;
  el("open-nav", HTMLButtonElement).setAttribute("aria-expanded", String(open));
  rail.inert = matchMedia("(max-width:760px)").matches && !open;
  if (open) el("close-nav", HTMLButtonElement).focus();
  else el("open-nav", HTMLButtonElement).focus();
}
function navigation(): void {
  const list = el("session-list", HTMLElement),
    tabs = el("status-list", HTMLElement);
  list.replaceChildren();
  tabs.replaceChildren();
  sessions.forEach((s, index) => {
    const value = status(s),
      number = String(index + 1).padStart(2, "0");
    const row = node("button", "", `name-row${s.id === selected ? " active" : ""}`);
    row.type = "button";
    row.setAttribute("aria-current", String(s.id === selected));
    row.append(node("span", number, "name-index"));
    const content = node("span", "", "name-content");
    content.append(
      node("span", label(s), "session-title"),
      node("span", `${glyph(value)} ${value}`, "sidebar-state"),
    );
    row.append(content);
    row.onclick = () => {
      void select(s.id);
      nav(false);
    };
    list.append(row);
    const tab = node("button", "", `status-chip${s.id === selected ? " active" : ""}`);
    tab.type = "button";
    tab.setAttribute("aria-label", `Session ${number}, ${value}`);
    tab.setAttribute("aria-current", String(s.id === selected));
    tab.append(
      node("span", glyph(value), "chip-icon"),
      node("span", number, "chip-index"),
      node("span", value, "chip-state"),
    );
    tab.onclick = () => {
      void select(s.id);
    };
    tabs.append(tab);
  });
  el("session-count", HTMLElement).textContent = String(sessions.length).padStart(2, "0");
  const s = activeSession();
  el("selected-directory", HTMLElement).textContent = s?.directory ?? "";
  el("model-label", HTMLElement).textContent = s ? `${s.provider} / ${s.model}` : "";
  const busy = !!s?.activeTurnId;
  input.disabled = !s || !authenticated || s.status !== "ready";
  input.readOnly = sending || pendingSend?.session === selected;
  send.disabled = !s || !authenticated || sending;
  send.textContent = busy ? "□" : pendingSend?.session === selected ? "↻" : "↑";
  send.setAttribute(
    "aria-label",
    busy
      ? "Stop response"
      : pendingSend?.session === selected
        ? "Retry the same message"
        : "Send message",
  );
}
function detail(title: string, text: string): HTMLDetailsElement {
  const result = node("details");
  result.append(node("summary", title), node("pre", text, "tool-body"));
  return result;
}
function renderEntry(entry: HistoryEntry): HTMLElement {
  const role = entry.role === "user" ? "user" : entry.role === "assistant" ? "assistant" : "system";
  const article = node("article", "", `message ${role}`);
  if (entry.role === "toolResult") {
    article.append(
      detail(entry.toolName ?? "Tool result", entry.blocks.map((b) => b.text).join("\n")),
    );
    return article;
  }
  article.append(
    node("div", role === "user" ? "You" : role === "assistant" ? "Pi" : "Context", "byline"),
  );
  const body = node("div", "", "message-body");
  for (const block of entry.blocks) {
    if (block.type === "thinking") body.append(detail("Thinking", block.text));
    else if (block.type === "tool_call") body.append(detail(block.name ?? "Tool call", block.text));
    else body.append(node("p", block.text));
  }
  if (entry.truncated)
    body.append(node("p", "This saved entry was truncated for display.", "footnote"));
  article.append(body);
  return article;
}
function renderConversation(): void {
  const atBottom = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop < 90;
  const expanded = new Set(
    Array.from(conversation.querySelectorAll<HTMLDetailsElement>("details[open]")).map(
      (d) => d.dataset.key,
    ),
  );
  conversation.replaceChildren();
  if (!selected) {
    const empty = node("div", "", "empty");
    empty.append(
      node("h1", "A little room to think."),
      node("p", "Open a directory to start a conversation."),
    );
    conversation.append(empty);
  } else {
    for (const entry of entries) {
      const element = renderEntry(entry);
      element.dataset.entryId = entry.id;
      element.querySelectorAll("details").forEach((d, index) => {
        d.dataset.key = `${entry.id}:${index}`;
        d.open = expanded.has(d.dataset.key);
      });
      conversation.append(element);
    }
    const liveVisible =
      state.liveRunId !== null && state.history?.coveredTurnId !== state.liveRunId;
    if (liveVisible) {
      for (const live of state.messages) {
        const article = node("article", "", "message assistant live");
        article.append(
          node("div", "Pi · live", "byline"),
          node("div", live.text || "…", "message-body"),
        );
        conversation.append(article);
      }
      for (const tool of state.tools)
        conversation.append(
          detail(
            `${tool.name} · ${tool.status}`,
            [tool.input, tool.output].filter(Boolean).join("\n\n"),
          ),
        );
      if (state.liveTruncated || state.liveIncomplete)
        conversation.append(
          node(
            "p",
            "Live preview is partial. Saved history will refresh when available.",
            "footnote",
          ),
        );
    }
    const turn = state.activeTurn ?? state.latestTurn;
    if (turn?.error)
      conversation.append(node("p", `${turn.status}: ${turn.error.message}`, "feedback"));
    if (state.error) conversation.append(node("p", state.error.message, "feedback"));
    if (historyError) conversation.append(node("p", historyError, "feedback"));
    if (!entries.length && !state.messages.length && !historyError)
      conversation.append(node("p", "Start a conversation in this directory.", "empty-copy"));
    if (state.history?.incompleteTail)
      conversation.append(
        node("p", "The saved history has an incomplete final record.", "footnote"),
      );
  }
  older.hidden = !nextCursor;
  if (atBottom) scroll.scrollTop = scroll.scrollHeight;
}
async function loadHistory(more = false): Promise<void> {
  if (!selected || !authenticated || suspended) return;
  if (historyPending) {
    if (!more) historyAgain = true;
    return;
  }
  const id = selected,
    epoch = generation,
    cursor = more ? nextCursor : null;
  if (more && !cursor) return;
  historyPending = true;
  older.disabled = true;
  const previousHeight = scroll.scrollHeight;
  try {
    const result = await api(
      `/api/v1/sessions/${id}/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    if (!isHistoryPage(result) || result.sessionId !== id)
      throw new Error("Invalid saved-history response.");
    if (epoch !== generation) return;
    historyError = "";
    if (more) {
      const seen = new Set(entries.map((e) => e.id));
      entries = [...result.entries.filter((e) => !seen.has(e.id)), ...entries];
    } else {
      entries = result.entries;
      state = reconcileHistory(state, result);
    }
    nextCursor = result.nextCursor;
    renderConversation();
    if (more) scroll.scrollTop += scroll.scrollHeight - previousHeight;
  } catch (error) {
    if (epoch !== generation) return;
    if (error instanceof ApiError && error.code.includes("cursor")) {
      historyAgain = true;
    } else {
      historyError = message(error);
      showError(error);
      renderConversation();
    }
  } finally {
    historyPending = false;
    older.disabled = false;
    if (historyAgain) {
      historyAgain = false;
      void loadHistory();
    }
  }
}
function stopStream(): void {
  controller?.abort();
  controller = null;
  window.clearTimeout(reconnectTimer);
}
async function stream(id: string, epoch: number): Promise<void> {
  if (epoch !== generation || !authenticated || suspended) return;
  const abort = new AbortController();
  controller = abort;
  try {
    const h = headers();
    h.set("Accept", "text/event-stream");
    if (state.cursor) h.set("Last-Event-ID", state.cursor);
    const response = await fetch(`/api/v1/sessions/${id}/events`, {
      headers: h,
      credentials: "same-origin",
      cache: "no-store",
      signal: abort.signal,
    });
    if (epoch !== generation || abort.signal.aborted) return;
    if (!response.ok) throw await responseError(response);
    if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream"))
      throw new Error("Invalid event stream.");
    streamConnected = true;
    connection("Connected");
    if (noticeSource === "stream") clearNotice();
    const reader = response.body.getReader(),
      text = new TextDecoder(),
      decoder = new SSEDecoder();
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        if (epoch !== generation) return;
        for (const frame of decoder.push(text.decode(part.value, { stream: true }))) {
          if (frame.sessionId !== id) throw new Error("Event stream changed sessions.");
          state = reduceFrame(state, frame);
          if (state.session)
            sessions = sessions.map((s) => (s.id === id && state.session ? state.session : s));
          const confirmed = state.activeTurn ?? state.latestTurn;
          if (
            pendingSend &&
            confirmed?.requestId === pendingSend.requestId &&
            confirmed.sessionId === pendingSend.session
          ) {
            drafts.set(pendingSend.session, "");
            if (selected === pendingSend.session) {
              input.value = "";
              composer.resize();
            }
            pendingSend = null;
          }
          if (frame.type === "stream.error") {
            showError(new Error(frame.payload.message), "stream");
            renderConversation();
            throw new Error(frame.payload.message);
          }
          if (
            frame.type === "snapshot" ||
            frame.type === "resync" ||
            (frame.type === "turn.updated" &&
              !["accepted", "dispatching", "running"].includes(frame.payload.status))
          )
            void loadHistory();
          navigation();
          renderConversation();
        }
      }
    } finally {
      reader.releaseLock();
    }
    throw new Error("The live connection ended. Reconnecting…");
  } catch (error) {
    if (abort.signal.aborted || epoch !== generation) return;
    streamConnected = false;
    connection("Reconnecting…");
    showError(error, "stream");
    state = { ...state, cursor: null };
    if (error instanceof ApiError && error.status === 401) {
      showError(error);
      return;
    }
    reconnectTimer = window.setTimeout(() => {
      void stream(id, epoch);
    }, 2000);
  }
}
async function select(id: string): Promise<void> {
  if (selected === id) return;
  if (selected) drafts.set(selected, input.value);
  stopStream();
  generation++;
  selected = id;
  savePreference("selected", id);
  state = emptyConversationState(id);
  entries = [];
  nextCursor = null;
  historyError = "";
  input.value = drafts.get(id) ?? "";
  composer.resize();
  navigation();
  renderConversation();
  scroll.scrollTop = 0;
  void stream(id, generation);
  await loadHistory();
}
function connection(text: string): void {
  el("connection-badge", HTMLElement).textContent = text;
}
async function refresh(): Promise<void> {
  const attempt = authAttempt;
  const result = await api("/api/v1/sessions");
  if (!Array.isArray(result) || !result.every(isSessionInfo))
    throw new Error("Invalid session list.");
  if (attempt !== authAttempt || !authenticated) return;
  sessions = result;
  if (!selected && sessions.length)
    await select(
      sessions.find((s) => s.id === localPreferences.selected)?.id ?? sessions[0]?.id ?? "",
    );
  navigation();
  const unseen = sessions.filter(
    (s) =>
      s.id !== selected &&
      s.latestTurnId &&
      (turns.get(s.id)?.runId !== s.latestTurnId ||
        ["accepted", "dispatching", "running"].includes(turns.get(s.id)?.status ?? "")),
  );
  await Promise.all(
    unseen.map(async (s) => {
      try {
        const value = await api(`/api/v1/sessions/${s.id}/turns/${s.latestTurnId}`);
        if (!isTurnInfo(value)) throw new Error("Invalid turn metadata.");
        if (attempt === authAttempt && authenticated) turns.set(s.id, value);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) showError(error);
      }
    }),
  );
  if (attempt === authAttempt && authenticated) navigation();
}
async function poll(): Promise<void> {
  if (!authenticated || polling || suspended) return;
  polling = true;
  const attempt = authAttempt;
  try {
    await refresh();
    if (attempt === authAttempt && !selected) connection("Connected");
  } catch (error) {
    if (attempt === authAttempt) {
      if (error instanceof ApiError && error.status === 401) showError(error);
      else connection("Connection lost");
    }
  } finally {
    polling = false;
    if (authenticated && !suspended) {
      window.clearTimeout(pollTimer);
      pollTimer = window.setTimeout(() => {
        void poll();
      }, 5000);
    }
  }
}
function disconnect(reason: string): void {
  authenticated = false;
  authAttempt++;
  generation++;
  dialog.close();
  el("host-dialog", HTMLDialogElement).close();
  stopStream();
  window.clearTimeout(pollTimer);
  app.hidden = true;
  gate.hidden = false;
  el("gate-message", HTMLElement).textContent = reason;
  navigation();
}
async function connect(): Promise<void> {
  const attempt = ++authAttempt;
  const button = el("retry-button", HTMLButtonElement);
  button.disabled = true;
  try {
    const value = await api("/api/v1/status");
    if (attempt !== authAttempt) return;
    if (!isHostStatus(value)) throw new Error("Incompatible Dwell host.");
    hostMode = value.mode;
    authenticated = true;
    gate.hidden = true;
    app.hidden = false;
    clearNotice();
    connection("Connected");
    await refresh();
    if (attempt !== authAttempt || !authenticated) return;
    if (selected) {
      stopStream();
      void stream(selected, generation);
    }
    window.clearTimeout(pollTimer);
    pollTimer = window.setTimeout(() => {
      void poll();
    }, 5000);
  } catch (error) {
    if (attempt !== authAttempt) return;
    disconnect(
      error instanceof ApiError && error.status === 401
        ? "Pair this browser to connect."
        : message(error),
    );
  } finally {
    button.disabled = false;
  }
}
async function submit(): Promise<void> {
  const s = activeSession();
  if (!s || sending) return;
  if (s.activeTurnId) {
    sending = true;
    navigation();
    try {
      const value = await api(`/api/v1/sessions/${s.id}/turns/${s.activeTurnId}/abort`, {});
      if (!isTurnInfo(value)) throw new Error("Invalid cancellation response.");
      turns.set(s.id, value);
    } catch (error) {
      showError(error);
    } finally {
      sending = false;
      navigation();
    }
    return;
  }
  if (pendingSend && pendingSend.session !== s.id) {
    showError(new Error("Return to the previous session to retry its unconfirmed message."));
    return;
  }
  const attempt = pendingSend ?? {
    session: s.id,
    requestId: crypto.randomUUID(),
    message: input.value,
  };
  if (!attempt.message.trim()) return;
  const payload = { requestId: attempt.requestId, message: attempt.message };
  if (
    new TextEncoder().encode(JSON.stringify(payload)).length > 8192 ||
    attempt.message.trimStart().startsWith("/")
  ) {
    showError(new Error("Send plain text under 8 KiB. Slash commands are not supported here."));
    return;
  }
  pendingSend = attempt;
  sending = true;
  navigation();
  clearNotice();
  try {
    const value = await api(`/api/v1/sessions/${s.id}/turns`, payload);
    if (!isTurnInfo(value))
      throw new Error("Invalid turn response; retry this same message to confirm it.");
    turns.set(s.id, value);
    pendingSend = null;
    drafts.set(s.id, "");
    if (selected === s.id) {
      input.value = "";
      composer.resize();
    }
    await refresh();
    if (selected === s.id) void loadHistory();
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 408
    )
      pendingSend = null;
    showError(
      pendingSend
        ? new Error(
            `${message(error)} The result is unconfirmed. Retry sends the same request safely.`,
          )
        : error,
    );
  } finally {
    sending = false;
    navigation();
  }
}
async function browse(path?: string): Promise<void> {
  if (pendingCreate) return;
  const attempt = ++browseAttempt,
    authentication = authAttempt;
  const container = el("directories", HTMLElement);
  container.replaceChildren(node("p", "Loading directories…"));
  try {
    const value = await api(
      `/api/v1/directories${path ? `?path=${encodeURIComponent(path)}` : ""}`,
    );
    if (!isHostDirectoryListing(value)) throw new Error("Invalid directory list.");
    if (
      attempt !== browseAttempt ||
      authentication !== authAttempt ||
      !dialog.open ||
      pendingCreate
    )
      return;
    directory.value = value.path;
    container.replaceChildren();
    if ("parent" in value && typeof value.parent === "string") {
      const parent = node("button", "↑ Parent directory", "directory-row");
      parent.type = "button";
      parent.onclick = () => {
        if (typeof value.parent === "string") void browse(value.parent);
      };
      container.append(parent);
    }
    if (value.truncated)
      container.append(
        node("p", "Showing the first directories. Enter a full path to reach others.", "footnote"),
      );
    for (const item of value.directories) {
      const child = node("button", item.name, "directory-row");
      child.type = "button";
      const target = item.path;
      child.onclick = () => {
        void browse(target);
      };
      container.append(child);
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) showError(error);
    if (attempt === browseAttempt && authentication === authAttempt)
      container.replaceChildren(node("p", message(error), "feedback"));
  }
}
async function newSession(): Promise<void> {
  const attempt = ++modelAttempt,
    authentication = authAttempt;
  nav(false);
  dialog.showModal();
  if (pendingCreate) return;
  sessionName.value = "";
  createButton.disabled = true;
  model.replaceChildren(node("option", "Loading models…"));
  el("create-error", HTMLElement).textContent = "";
  void browse(activeSession()?.directory);
  try {
    const value = await api("/api/v1/models");
    if (!isAvailableModelsResponse(value)) throw new Error("Invalid model list.");
    if (attempt !== modelAttempt || authentication !== authAttempt || !dialog.open) return;
    model.replaceChildren();
    for (const item of value.models) {
      const option = node("option", `${item.provider} / ${item.id}`);
      option.value = JSON.stringify([item.provider, item.id]);
      model.append(option);
    }
    createButton.disabled = model.options.length === 0;
    if (!model.options.length)
      throw new Error("Pi has no available models. Configure a provider in Pi, then try again.");
  } catch (error) {
    if (attempt !== modelAttempt || authentication !== authAttempt || !dialog.open) return;
    if (error instanceof ApiError && error.status === 401) showError(error);
    el("create-error", HTMLElement).textContent = message(error);
  }
}
async function createSession(): Promise<void> {
  if (createButton.disabled) return;
  const authentication = authAttempt;
  const choice: unknown = JSON.parse(model.value || "null");
  if (
    !Array.isArray(choice) ||
    choice.length !== 2 ||
    typeof choice[0] !== "string" ||
    typeof choice[1] !== "string"
  )
    return;
  const attempt = pendingCreate ?? {
    requestId: crypto.randomUUID(),
    directory: directory.value,
    provider: choice[0],
    model: choice[1],
    name: sessionName.value.trim(),
  };
  pendingCreate = attempt;
  createButton.disabled = true;
  directory.disabled = true;
  model.disabled = true;
  sessionName.disabled = true;
  try {
    const result = await api("/api/v1/sessions", {
      requestId: attempt.requestId,
      directory: attempt.directory,
      provider: attempt.provider,
      model: attempt.model,
    });
    if (!isSessionInfo(result))
      throw new Error("Invalid session response. Retry to confirm the same creation request.");
    if (authentication !== authAttempt) return;
    if (attempt.name) {
      names.set(result.id, attempt.name);
      savePreference(result.id, attempt.name);
    }
    pendingCreate = null;
    dialog.close();
    await refresh();
    if (authentication !== authAttempt) return;
    await select(result.id);
  } catch (error) {
    if (authentication !== authAttempt) return;
    if (
      error instanceof ApiError &&
      ((error.status >= 400 && error.status < 500) || error.code === "session_start_failed")
    )
      pendingCreate = null;
    if (error instanceof ApiError && error.status === 401) showError(error);
    el("create-error", HTMLElement).textContent =
      `${message(error)}${pendingCreate ? " Retry confirms the same request." : ""}`;
  } finally {
    createButton.disabled = false;
    directory.disabled = !!pendingCreate;
    model.disabled = !!pendingCreate;
    sessionName.disabled = !!pendingCreate;
  }
}
el("open-nav", HTMLButtonElement).onclick = () => nav(true);
el("close-nav", HTMLButtonElement).onclick = () => nav(false);
el("scrim", HTMLButtonElement).onclick = () => nav(false);
el("new-mobile", HTMLButtonElement).onclick = () => {
  void newSession();
};
el("new-session", HTMLButtonElement).onclick = () => {
  void newSession();
};
el("close-new", HTMLButtonElement).onclick = () => dialog.close();
el("browse", HTMLButtonElement).onclick = () => {
  if (!pendingCreate) void browse(directory.value);
};
el("new-form", HTMLFormElement).onsubmit = (event) => {
  event.preventDefault();
  void createSession();
};
older.onclick = () => {
  void loadHistory(true);
};
el("dismiss-notice", HTMLButtonElement).onclick = clearNotice;
el("retry-button", HTMLButtonElement).onclick = () => {
  void connect();
};
el("pair-form", HTMLFormElement).onsubmit = (event) => {
  event.preventDefault();
  const code = el("pair-code", HTMLInputElement);
  const button = el("pair-button", HTMLButtonElement);
  button.disabled = true;
  void (async () => {
    try {
      const key = binding(true);
      await api("/api/v1/auth/pair", { code: code.value.trim(), browserKey: key });
      code.value = "";
      await connect();
    } catch (error) {
      el("gate-message", HTMLElement).textContent = message(error);
    } finally {
      button.disabled = false;
    }
  })();
};
el("logout-button", HTMLButtonElement).onclick = () => {
  void (async () => {
    try {
      await api("/api/v1/auth/logout", {});
      disconnect("This browser is disconnected.");
    } catch (error) {
      showError(error);
    }
  })();
};
el("connection-badge", HTMLButtonElement).onclick = () => {
  const info = el("host-dialog", HTMLDialogElement);
  el("host-info", HTMLElement).textContent =
    `${hostMode} host · ${streamConnected ? "Live updates connected" : "Checking live connection"}`;
  info.showModal();
};
el("close-host", HTMLButtonElement).onclick = () => el("host-dialog", HTMLDialogElement).close();
form.onsubmit = (event) => {
  event.preventDefault();
  void submit();
};
input.oninput = () => {
  if (selected) drafts.set(selected, input.value);
  composer.resize();
};
input.onkeydown = (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    void submit();
  }
};
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && rail.classList.contains("open")) nav(false);
});
const viewport = matchMedia("(max-width:760px)");
function responsive(): void {
  if (!viewport.matches) {
    main.inert = false;
    rail.inert = false;
    rail.classList.remove("open");
    el("scrim", HTMLButtonElement).hidden = true;
  } else rail.inert = !rail.classList.contains("open");
}
viewport.addEventListener("change", responsive);
responsive();
window.addEventListener("storage", (event) => {
  if (event.key === "dwell.browser-binding.v1" || event.key === null) {
    disconnect("Browser credentials changed. Reconnect this browser.");
  }
});
window.addEventListener("pagehide", () => {
  suspended = true;
  generation++;
  streamConnected = false;
  stopStream();
  window.clearTimeout(pollTimer);
});
function resume(): void {
  suspended = false;
  if (!authenticated) return;
  window.clearTimeout(pollTimer);
  stopStream();
  generation++;
  streamConnected = false;
  connection("Reconnecting…");
  state = { ...state, cursor: null };
  if (selected) {
    void stream(selected, generation);
    void loadHistory();
  }
  void poll();
  composer.resize();
}
window.addEventListener("pageshow", (event) => {
  if (event.persisted) resume();
});
window.addEventListener("online", resume);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") resume();
});
void connect();
