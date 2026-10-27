/// <reference lib="dom" />

import {
  isAvailableModelsResponse,
  isHostDirectoryListing,
  type PiModelOption,
} from "../../shared/discovery.ts";
import { type ContextSource, type HistoryEntry, isHistoryPage } from "../../shared/history.ts";
import { isHostStatus } from "../../shared/protocol.ts";
import { isSessionInfo, type SessionInfo } from "../../shared/sessions.ts";
import { isTurnInfo, type TurnInfo } from "../../shared/turns.ts";
import { emptyConversationState, reconcileHistory, reduceFrame, SSEDecoder } from "./events.ts";
import { actionIcon, labelWithIcon } from "./icons.ts";
import { Attachments } from "./attachments.ts";
import { renderMarkdown } from "./markdown.ts";
import { renderSavedConversation } from "./conversation.ts";
import type { ImageContent } from "../../shared/images.ts";
import {
  isModelCapabilitiesResponse,
  type ModelCapabilitiesResponse,
  type ThinkingLevel,
} from "../../shared/thinking.ts";
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
const rail = el("rail", HTMLElement),
  main = el("chat-main", HTMLElement);
const gate = el("gate", HTMLElement),
  app = el("app", HTMLElement);
const scroll = el("scroll", HTMLElement),
  conversation = el("conversation", HTMLElement);
const composer = setupComposer(input, form, scroll);
const send = el("send", HTMLButtonElement),
  notice = el("notice", HTMLElement);
const dialog = el("new-dialog", HTMLDialogElement);
const directory = el("directory", HTMLInputElement);
const createButton = el("create-button", HTMLButtonElement);
const closeDialog = el("close-session-dialog", HTMLDialogElement);
const closeDirectory = el("close-session-number", HTMLElement);
const closeTitle = el("close-session-title", HTMLElement);
const closeCopy = el("close-session-copy", HTMLElement);
const closeError = el("close-session-error", HTMLElement);
const cancelClose = el("cancel-session-close", HTMLButtonElement);
const confirmClose = el("confirm-session-close", HTMLButtonElement);
const modelDialog = el("model-dialog", HTMLDialogElement);
const modelSearch = el("model-search", HTMLInputElement);
const chooseModel = el("choose-model", HTMLButtonElement);
let availableModels: PiModelOption[] = [];
const capabilities = new Map<string, ModelCapabilitiesResponse>();
const capabilityRequests = new Map<string, Promise<ModelCapabilitiesResponse>>();
const capabilityErrors = new Set<string>();
let capabilityGeneration = 0;
let thinkingChoice: PiModelOption | null = null;
const levelNames: Record<ThinkingLevel, string> = {
  off: "Off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};
let modelSession: string | null = null,
  changingModel: string | null = null;
const older = el("load-older", HTMLButtonElement);

labelWithIcon(el("attach-image", HTMLButtonElement), "Image", "plus", true);
labelWithIcon(older, "Load earlier messages", "up");
labelWithIcon(createButton, "Start session", "open");
labelWithIcon(el("new-session", HTMLButtonElement), "New session", "plus");
for (const id of [
  "close-nav",
  "close-new",
  "close-host",
  "close-model",
  "close-image",
  "dismiss-notice",
])
  el(id, HTMLButtonElement).replaceChildren(actionIcon("close"));
el("new-mobile", HTMLButtonElement).replaceChildren(actionIcon("plus"));

const names = new Map<string, string>(),
  drafts = new Map<string, string>();
const turns = new Map<string, TurnInfo>();
let sessions: SessionInfo[] = [],
  selected: string | null = null;
let state = emptyConversationState();
let contextSources: ContextSource[] = [];
let contextSourcesTruncated = false;
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
let pendingSend: {
  session: string;
  requestId: string;
  message: string;
  images: ImageContent[];
} | null = null;
let pendingCreate: {
  requestId: string;
  directory: string;
} | null = null;
const tabSlots = new Map<string, number>();
const openingSessions = new Set<string>();
let closeArmedSession: string | null = null;
let preparingCloseSession: string | null = null;
let closeTarget: { id: string; activeRunId: string | null; attempted: boolean } | null = null;
let closingSession: string | null = null;
let closePreparationGeneration = 0;
let closeAttemptGeneration = 0;
let sessionRefreshGeneration = 0;
let sessionStateGeneration = 0;
let selectionGeneration = 0;
let openIntentGeneration = 0;
let authAttempt = 0,
  browseAttempt = 0,
  modelAttempt = 0;
let hostMode = "",
  historyError = "",
  streamConnected = false;
let noticeSource: "action" | "stream" | undefined;
const imageDialog = el("image-dialog", HTMLDialogElement);
function showImage(url: string, name: string): void {
  el("preview-image", HTMLImageElement).src = url;
  el("preview-image", HTMLImageElement).alt = name;
  el("image-title", HTMLElement).textContent = name;
  imageDialog.showModal();
}
const attachments = new Attachments({
  input: el("image-files", HTMLInputElement),
  tray: el("image-attachments", HTMLElement),
  button: el("attach-image", HTMLButtonElement),
  change: () => navigation(),
  error: (error) => showError(error),
  preview: showImage,
});
const attachButton = el("attach-image", HTMLButtonElement);
const imageFiles = el("image-files", HTMLInputElement);
attachButton.onclick = () => {
  const session = activeSession();
  if (!session || !authenticated || session.provider === null || session.model === null) return;
  const key = modelCapabilityKey(session.provider, session.model);
  if (key === null) return;
  const capability = capabilities.get(key);
  if (capability?.supportsImages) {
    imageFiles.click();
    return;
  }
  if (capabilityErrors.has(key)) {
    const authentication = authAttempt;
    const epoch = capabilityGeneration;
    void requestModelCapabilities({ provider: session.provider, id: session.model })
      .then((result) => {
        if (
          result.supportsImages &&
          authentication === authAttempt &&
          epoch === capabilityGeneration &&
          authenticated &&
          selected === session.id &&
          activeSession()?.provider === session.provider &&
          activeSession()?.model === session.model
        )
          imageFiles.click();
      })
      .catch((error: unknown) => {
        if (
          authentication === authAttempt &&
          epoch === capabilityGeneration &&
          error instanceof ApiError &&
          error.status === 401
        )
          showError(error);
      });
  }
};
const imageCache = new Map<string, Promise<string>>();
let imageQueue: Promise<unknown> = Promise.resolve();
let liveOrder: { kind: "message" | "tool"; id: string }[] = [];
function releaseImages(): void {
  for (const value of imageCache.values())
    void value.then(
      (url) => URL.revokeObjectURL(url),
      () => {},
    );
  imageCache.clear();
}
function historyImage(entryId: string, index: number, mimeType: string): HTMLElement {
  const button = node("button", "Loading image…", "sent-image");
  button.type = "button";
  const session = selected,
    epoch = generation;
  const key = `/api/v1/sessions/${session}/history/${encodeURIComponent(entryId)}/images/${index}`;
  let pending = imageCache.get(key);
  if (!pending) {
    pending = imageQueue.then(async () => {
      if (selected !== session || generation !== epoch) throw new Error("Session changed.");
      const response = await fetch(key, {
        headers: headers(),
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw await responseError(response);
      if (response.headers.get("content-type") !== mimeType)
        throw new Error("Invalid saved image type.");
      const blob = await response.blob();
      if (blob.size > 5 * 1024 * 1024) throw new Error("Saved image exceeds the display limit.");
      return URL.createObjectURL(blob);
    });
    imageQueue = pending.catch(() => {});
    imageCache.set(key, pending);
  }
  void pending.then(
    (url) => {
      if (selected !== session || generation !== epoch) return;
      const image = node("img");
      image.alt = `Image ${index + 1}`;
      image.onload = () => {
        if (selected !== session || generation !== epoch || !button.isConnected) return;
        const atBottom = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop < 90;
        button.replaceChildren(image);
        if (atBottom) scroll.scrollTop = scroll.scrollHeight;
      };
      image.onerror = () => {
        if (button.isConnected) button.textContent = "Saved image cannot be displayed.";
      };
      image.src = url;
      button.setAttribute("aria-label", `Preview image ${index + 1}`);
      button.onclick = () => showImage(url, `Image ${index + 1}`);
    },
    (error) => {
      if (selected === session && generation === epoch) {
        button.textContent = "Image unavailable · retry";
        button.onclick = () => {
          imageCache.delete(key);
          renderConversation();
        };
        if (error instanceof ApiError && error.status === 401) showError(error);
      }
    },
  );
  return button;
}
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
function modelCapabilityKey(provider: string | null, model: string | null): string | null {
  return provider !== null && model !== null ? JSON.stringify([provider, model]) : null;
}
function requestModelCapabilities(choice: PiModelOption): Promise<ModelCapabilitiesResponse> {
  const key = modelCapabilityKey(choice.provider, choice.id);
  if (key === null) return Promise.reject(new Error("This session has no selected model."));
  const cached = capabilities.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = capabilityRequests.get(key);
  if (existing) return existing;

  const epoch = capabilityGeneration;
  capabilityErrors.delete(key);
  let pending: Promise<ModelCapabilitiesResponse>;
  pending = api("/api/v1/model-capabilities", {
    provider: choice.provider,
    model: choice.id,
  })
    .then((value) => {
      if (
        !isModelCapabilitiesResponse(value) ||
        value.provider !== choice.provider ||
        value.model !== choice.id
      )
        throw new Error("Invalid model capabilities.");
      if (epoch === capabilityGeneration) capabilities.set(key, value);
      return value;
    })
    .catch((error: unknown) => {
      if (epoch === capabilityGeneration) capabilityErrors.add(key);
      throw error;
    })
    .finally(() => {
      if (capabilityRequests.get(key) === pending) capabilityRequests.delete(key);
      if (epoch === capabilityGeneration) navigation();
    });
  capabilityRequests.set(key, pending);
  navigation();
  return pending;
}
function probeCurrentModel(sessionId: string | null = selected): void {
  if (!authenticated || !sessionId) return;
  const session = sessions.find((value) => value.id === sessionId);
  if (!session || session.provider === null || session.model === null) return;
  const key = modelCapabilityKey(session.provider, session.model);
  if (key === null) return;
  if (capabilities.has(key) || capabilityRequests.has(key) || capabilityErrors.has(key)) return;
  const authentication = authAttempt;
  const epoch = capabilityGeneration;
  void requestModelCapabilities({ provider: session.provider, id: session.model }).catch(
    (error: unknown) => {
      if (
        authentication === authAttempt &&
        epoch === capabilityGeneration &&
        error instanceof ApiError &&
        error.status === 401
      )
        showError(error);
    },
  );
}
function label(s: SessionInfo): string {
  const directory =
    names.get(s.id) || s.directory.split(/[\\/]/).filter(Boolean).pop() || s.directory;
  return [directory, s.model, s.thinkingLevel ? levelNames[s.thinkingLevel] : null]
    .filter(Boolean)
    .join(" · ");
}
function runtimeOpen(s: SessionInfo): boolean {
  return s.runtimeState !== "closed";
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
type TabStatus = "ready" | "working" | "attention" | "stopped" | "opening";
function tabStatus(s: SessionInfo): TabStatus {
  const value = status(s);
  if (value === "Working" || value === "Stopping") return "working";
  if (value === "Failed" || value === "Interrupted") return "attention";
  if (value === "Stopped") return "stopped";
  if (value === "Opening") return "opening";
  return "ready";
}
function tabStatusLabel(value: TabStatus): string {
  return value === "working"
    ? "Working"
    : value === "attention"
      ? "Needs attention"
      : value === "stopped"
        ? "Stopped"
        : value === "opening"
          ? "Opening"
          : "Ready";
}
const SVG_NS = "http://www.w3.org/2000/svg";
const statusPaths: Record<
  "ready" | "working" | "attention" | "stopped" | "opening" | "close",
  string
> = {
  ready: "M5 12l4 4L19 6",
  working: "M12 4a8 8 0 1 0 8 8",
  attention: "M12 7v6m0 4h.01M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18",
  stopped: "M8 8l8 8M16 8l-8 8M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18",
  opening: "M12 4a8 8 0 1 0 8 8",
  close: "M6 6l12 12M18 6L6 18",
};
function tabSymbol(value: keyof typeof statusPaths): HTMLElement {
  const wrapper = node("span", "", `tab-symbol ${value}`);
  wrapper.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", statusPaths[value]);
  svg.append(path);
  wrapper.append(svg);
  return wrapper;
}
function synchronizeTabSlots(): void {
  const open = new Set(sessions.filter(runtimeOpen).map((s) => s.id));
  for (const id of tabSlots.keys()) if (!open.has(id)) tabSlots.delete(id);
  const used = new Set(tabSlots.values());
  for (const s of sessions) {
    if (!open.has(s.id) || tabSlots.has(s.id)) continue;
    let slot = 1;
    while (used.has(slot)) slot++;
    tabSlots.set(s.id, slot);
    used.add(slot);
  }
}
function openTabIds(): string[] {
  return sessions.filter(runtimeOpen).map((s) => s.id);
}
function closeBlockedReason(): string | null {
  if (!authenticated) return "Reconnect to close a session.";
  if (sending) return "Finish the current request before closing.";
  if (pendingSend) return "Resolve the pending message before closing.";
  if (changingModel !== null) return "Wait for the model change.";
  if (attachments.busy) return "Wait for the image upload.";
  if (pendingCreate) return "Wait for the new session.";
  if (openingSessions.size > 0) return "Wait for the session to open.";
  return null;
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
  synchronizeTabSlots();
  list.replaceChildren();
  tabs.replaceChildren();
  const slotNumber = (id: string): string => String(tabSlots.get(id) ?? 0).padStart(2, "0");
  sessions.forEach((s) => {
    const row = node("button", "", `name-row${s.id === selected ? " active" : ""}`);
    row.type = "button";
    row.dataset.sessionId = s.id;
    row.title = label(s);
    row.setAttribute("aria-label", label(s));
    row.setAttribute("aria-current", String(s.id === selected && runtimeOpen(s)));
    row.disabled = !authenticated || attachments.busy || openingSessions.has(s.id);
    row.append(
      node("span", runtimeOpen(s) ? slotNumber(s.id) : "", "sidebar-slot"),
      node("span", label(s), "session-title"),
    );
    row.onclick = () => {
      void openFromSidebar(s.id);
    };
    list.append(row);
  });
  for (const s of sessions) {
    if (!runtimeOpen(s)) continue;
    const number = slotNumber(s.id),
      selectedTab = s.id === selected,
      armed = selectedTab && closeArmedSession === s.id,
      symbol = tabStatus(s),
      description = tabStatusLabel(symbol);
    const tab = node(
      "div",
      "",
      `status-tab${selectedTab ? " active" : ""}${armed ? " close-armed" : ""}`,
    );
    tab.dataset.sessionId = s.id;
    const selectButton = node("button", "", "tab-select");
    selectButton.type = "button";
    selectButton.setAttribute(
      "aria-label",
      `Session ${number}, ${description}${selectedTab ? ", selected. Activate to show close." : ""}`,
    );
    selectButton.title = `Session ${number} · ${description}\n${s.directory}`;
    selectButton.setAttribute("aria-current", String(selectedTab));
    selectButton.disabled = attachments.busy || closeDialog.open;
    selectButton.append(node("span", number));
    if (!armed) selectButton.append(tabSymbol(symbol));
    selectButton.onclick = () => {
      if (selectedTab) closeArmedSession = armed ? null : s.id;
      else {
        closeArmedSession = null;
        void select(s.id);
      }
      navigation();
      tabs.querySelector<HTMLButtonElement>(`[data-session-id="${s.id}"] .tab-select`)?.focus();
    };
    tab.append(selectButton);
    if (armed) {
      const closeButton = node("button", "", "tab-close");
      closeButton.type = "button";
      closeButton.setAttribute("aria-label", `Close session ${number}`);
      closeButton.title = `Close session ${number}`;
      closeButton.disabled =
        closeBlockedReason() !== null ||
        closeDialog.open ||
        closeTarget !== null ||
        preparingCloseSession !== null;
      closeButton.append(tabSymbol("close"));
      closeButton.onclick = () => {
        void prepareClose(s.id);
      };
      tab.append(closeButton);
    }
    tabs.append(tab);
  }
  el("session-count", HTMLElement).textContent = String(sessions.length).padStart(2, "0");
  const s = activeSession();
  el("composer-footer", HTMLElement).hidden = !s;
  el("composer-context", HTMLElement).hidden = !s;
  const contextDirectory = el("composer-directory", HTMLElement);
  contextDirectory.textContent = s?.directory ?? "";
  contextDirectory.title = s?.directory ?? "";
  contextDirectory.setAttribute("aria-label", `Current directory: ${s?.directory ?? ""}`);
  el("model-label", HTMLElement).textContent = s?.model ?? "Choose model";
  el("thinking-label", HTMLElement).textContent = s?.thinkingLevel
    ? `· ${levelNames[s.thinkingLevel]}`
    : "";
  chooseModel.title = s?.model ? `${s.provider} / ${s.model}` : "Choose model";
  chooseModel.setAttribute("aria-label", `Choose model, current: ${s?.model ?? "not selected"}`);
  const busy = !!s?.activeTurnId;
  chooseModel.disabled =
    !s ||
    !authenticated ||
    s.status !== "ready" ||
    busy ||
    sending ||
    changingModel !== null ||
    attachments.busy ||
    pendingSend?.session === selected;
  if (modelDialog.open) {
    const disabled = chooseModel.disabled || modelSession !== selected;
    el("model-options", HTMLElement)
      .querySelectorAll("button")
      .forEach((button) => {
        button.disabled = disabled;
      });
  }
  input.disabled = !s || !authenticated || s.status !== "ready";
  input.readOnly = sending || changingModel === selected || pendingSend?.session === selected;
  const key = s ? modelCapabilityKey(s.provider, s.model) : null;
  const capability = key !== null ? capabilities.get(key) : undefined;
  const capabilityChecking = key !== null && capabilityRequests.has(key);
  const capabilityFailed = key !== null && capabilityErrors.has(key);
  const capabilityUnknown = s !== undefined && (key === null || (!capability && !capabilityFailed));
  const attachmentBaseDisabled =
    !s ||
    !authenticated ||
    s.status !== "ready" ||
    sending ||
    busy ||
    changingModel !== null ||
    pendingSend !== null;
  const attachmentIntakeDisabled =
    attachmentBaseDisabled ||
    capabilityChecking ||
    capabilityUnknown ||
    capabilityFailed ||
    capability?.supportsImages === false;
  attachments.setDisabled(attachmentBaseDisabled, attachmentIntakeDisabled);
  const retryCapability = capabilityFailed && !attachmentBaseDisabled && !attachments.busy;
  attachButton.disabled = attachments.busy || (attachmentIntakeDisabled && !retryCapability);
  attachButton.title =
    capabilityChecking || capabilityUnknown
      ? "Checking image support for this model"
      : capabilityFailed
        ? "Image support check failed · select to retry"
        : capability?.supportsImages === false
          ? "Choose a model that supports images"
          : "Add images";
  attachButton.setAttribute(
    "aria-label",
    capabilityChecking || capabilityUnknown
      ? "Checking image support"
      : capabilityFailed
        ? "Retry image support check"
        : capability?.supportsImages === false
          ? "Images are not supported by this model"
          : "Add images",
  );
  send.disabled =
    !s ||
    !authenticated ||
    sending ||
    changingModel === selected ||
    attachments.busy ||
    (!busy && !pendingSend && !input.value.trim() && attachments.count === 0);
  const retry = pendingSend?.session === selected;
  labelWithIcon(
    send,
    busy ? "Stop" : retry ? "Retry" : "Send",
    busy ? "stop" : retry ? "retry" : "up",
  );
  send.setAttribute(
    "aria-label",
    busy
      ? "Stop response"
      : pendingSend?.session === selected
        ? "Retry the same message"
        : "Send message",
  );
}
function updatedSession(session: SessionInfo): string[] {
  const previousTabs = openTabIds();
  const existing = sessions.some((value) => value.id === session.id);
  sessions = existing
    ? sessions.map((value) => (value.id === session.id ? session : value))
    : [...sessions, session];
  sessionStateGeneration++;
  synchronizeTabSlots();
  return previousTabs;
}
function neighborAfterClose(id: string, previousTabs: readonly string[]): string | null {
  const currentOpen = new Set(openTabIds());
  const index = previousTabs.indexOf(id);
  if (index >= 0) {
    for (let i = index + 1; i < previousTabs.length; i++) {
      const candidate = previousTabs[i];
      if (candidate && currentOpen.has(candidate)) return candidate;
    }
    for (let i = index - 1; i >= 0; i--) {
      const candidate = previousTabs[i];
      if (candidate && currentOpen.has(candidate)) return candidate;
    }
  }
  return openTabIds()[0] ?? null;
}
function reconcileClosedRuntime(id: string, previousTabs: readonly string[]): void {
  const current = sessions.find((session) => session.id === id);
  if (!current || runtimeOpen(current) || closingSession === id) return;
  if (closeTarget?.id === id && closeDialog.open) {
    closeDialog.close();
    showError(new Error("This session was closed from another browser."));
  }
  if (selected === id) void select(neighborAfterClose(id, previousTabs));
}
function userMessageSnippet(values: readonly HistoryEntry[]): string {
  const latest = [...values].reverse().find((entry) => entry.role === "user");
  if (!latest) return "";
  const compact = latest.blocks
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return "";
  const characters = Array.from(compact);
  return characters.length > 100 ? `${characters.slice(0, 99).join("")}…` : compact;
}
function showCloseError(error: unknown): void {
  closeError.textContent = message(error);
  closeError.hidden = false;
}
async function prepareClose(id: string): Promise<void> {
  if (closeDialog.open || closeTarget || closingSession || preparingCloseSession !== null) return;
  const blocked = closeBlockedReason();
  if (blocked) {
    showError(new Error(blocked));
    return;
  }
  if (selected !== id || !sessions.some((session) => session.id === id && runtimeOpen(session)))
    return;
  const authentication = authAttempt,
    selectedAtStart = selectionGeneration,
    stateAtStart = sessionStateGeneration,
    preparation = ++closePreparationGeneration;
  const tab = sessions.find((session) => session.id === id);
  if (!tab) return;
  preparingCloseSession = id;
  closeArmedSession = null;
  navigation();
  try {
    const [sessionValue, historyValue] = await Promise.all([
      api(`/api/v1/sessions/${id}`),
      api(`/api/v1/sessions/${id}/history`).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) throw error;
        return null;
      }),
    ]);
    if (
      authentication !== authAttempt ||
      !authenticated ||
      selected !== id ||
      selectedAtStart !== selectionGeneration ||
      closeDialog.open ||
      closeTarget !== null
    )
      return;
    if (!isSessionInfo(sessionValue) || sessionValue.id !== id)
      throw new Error("Invalid session response while preparing to close.");
    const latestSession =
      stateAtStart === sessionStateGeneration ? sessionValue : await sessionSnapshot(id);
    if (
      authentication !== authAttempt ||
      !authenticated ||
      selected !== id ||
      selectedAtStart !== selectionGeneration
    )
      return;
    if (!isSessionInfo(latestSession) || latestSession.id !== id)
      throw new Error("Invalid session response while preparing to close.");
    const previousTabs = updatedSession(latestSession);
    navigation();
    if (!runtimeOpen(latestSession)) {
      reconcileClosedRuntime(id, previousTabs);
      showError(new Error("This session was closed elsewhere."));
      return;
    }
    const snippet =
      isHistoryPage(historyValue) && historyValue.sessionId === id
        ? userMessageSnippet(historyValue.entries)
        : "";
    closeTarget = { id, activeRunId: latestSession.activeTurnId, attempted: false };
    closeDirectory.textContent = `${String(tabSlots.get(id) ?? 0).padStart(2, "0")} · ${latestSession.directory}`;
    closeTitle.textContent = latestSession.activeTurnId ? "Stop and close?" : "Close session?";
    closeCopy.textContent = snippet ? `“${snippet}”` : "";
    closeCopy.hidden = !snippet;
    closeError.textContent = "";
    closeError.hidden = true;
    confirmClose.textContent = latestSession.activeTurnId ? "Stop and close" : "Close";
    confirmClose.disabled = false;
    cancelClose.disabled = false;
    closeDialog.showModal();
    cancelClose.focus();
  } catch (error) {
    if (authentication === authAttempt) showError(error);
  } finally {
    if (preparation === closePreparationGeneration && preparingCloseSession === id)
      preparingCloseSession = null;
    navigation();
  }
}
async function sessionSnapshot(id: string): Promise<SessionInfo> {
  const value = await api(`/api/v1/sessions/${id}`);
  if (!isSessionInfo(value) || value.id !== id)
    throw new Error("Invalid session response while closing.");
  return value;
}
async function turnSnapshot(id: string, runId: string): Promise<TurnInfo> {
  const value = await api(`/api/v1/sessions/${id}/turns/${runId}`);
  if (!isTurnInfo(value) || value.sessionId !== id || value.runId !== runId)
    throw new Error("Invalid turn response while closing.");
  return value;
}
function turnIsActive(turn: TurnInfo): boolean {
  return turn.status === "accepted" || turn.status === "dispatching" || turn.status === "running";
}
async function waitForTurnAndRuntime(
  id: string,
  runId: string,
  authentication: number,
): Promise<SessionInfo | null> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const turn = await turnSnapshot(id, runId);
    if (authentication !== authAttempt || !authenticated) return null;
    const session = await sessionSnapshot(id);
    if (authentication !== authAttempt || !authenticated) return null;
    const previousTabs = updatedSession(session);
    navigation();
    if (session.activeTurnId !== null && session.activeTurnId !== runId)
      throw new Error("A new response started. Review and close again.");
    if (!turnIsActive(turn) && session.activeTurnId === null) return session;
    if (Date.now() >= deadline)
      throw new Error("The response is still active. Review and close again.");
    if (session.runtimeState === "closed") {
      reconcileClosedRuntime(id, previousTabs);
      return session;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
  }
}
async function finishClose(id: string, previousTabs: readonly string[]): Promise<void> {
  closeArmedSession = null;
  if (closeDialog.open) closeDialog.close();
  if (selected === id) await select(neighborAfterClose(id, previousTabs));
  else navigation();
}
async function confirmSessionClose(): Promise<void> {
  const target = closeTarget;
  if (!target || target.attempted || closingSession !== null) return;
  const blocked = closeBlockedReason();
  if (blocked) {
    showCloseError(new Error(blocked));
    return;
  }
  target.attempted = true;
  closingSession = target.id;
  const operation = ++closeAttemptGeneration;
  const authentication = authAttempt;
  const previousTabs = openTabIds();
  confirmClose.disabled = true;
  cancelClose.disabled = true;
  closeError.hidden = true;
  closeError.textContent = "";
  navigation();
  try {
    let session = await sessionSnapshot(target.id);
    if (authentication !== authAttempt || !authenticated) return;
    updatedSession(session);
    navigation();
    if (target.activeRunId !== null) {
      const turn = await turnSnapshot(target.id, target.activeRunId);
      if (authentication !== authAttempt || !authenticated) return;
      session = await sessionSnapshot(target.id);
      if (authentication !== authAttempt || !authenticated) return;
      updatedSession(session);
      navigation();
      if (session.activeTurnId !== null && session.activeTurnId !== target.activeRunId)
        throw new Error("A new response started. Review and close again.");
      if (turnIsActive(turn) && !turn.cancellationRequested) {
        const value = await api(
          `/api/v1/sessions/${target.id}/turns/${target.activeRunId}/abort`,
          {},
        );
        if (
          !isTurnInfo(value) ||
          value.sessionId !== target.id ||
          value.runId !== target.activeRunId
        )
          throw new Error("Invalid cancellation response while closing.");
        if (authentication !== authAttempt || !authenticated) return;
      }
      const settled = await waitForTurnAndRuntime(target.id, target.activeRunId, authentication);
      if (!settled || authentication !== authAttempt || !authenticated) return;
      session = settled;
      if (session.activeTurnId !== null)
        throw new Error("A new response started. Review and close again.");
    } else {
      if (session.activeTurnId !== null)
        throw new Error("A response started. Review and close again.");
      session = await sessionSnapshot(target.id);
      if (authentication !== authAttempt || !authenticated) return;
      updatedSession(session);
      navigation();
      if (session.activeTurnId !== null)
        throw new Error("A response started. Review and close again.");
    }
    if (authentication !== authAttempt || !authenticated) return;
    if (session.runtimeState === "closed") {
      await finishClose(target.id, previousTabs);
      return;
    }
    const value = await api(`/api/v1/sessions/${target.id}/close`, {});
    if (authentication !== authAttempt || !authenticated) return;
    if (!isSessionInfo(value) || value.id !== target.id || value.runtimeState !== "closed")
      throw new Error("Invalid close-session response.");
    updatedSession(value);
    await finishClose(target.id, previousTabs);
  } catch (error) {
    if (authentication !== authAttempt) return;
    if (error instanceof ApiError && error.status === 401) {
      showError(error);
      return;
    }
    showCloseError(error);
    try {
      await refresh();
      const latest = sessions.find((session) => session.id === target.id);
      if (latest && !runtimeOpen(latest)) await finishClose(target.id, previousTabs);
    } catch {
      /* The visible error remains; polling will refresh authoritative state. */
    }
  } finally {
    if (operation === closeAttemptGeneration && closingSession === target.id) closingSession = null;
    if (closeDialog.open) {
      confirmClose.disabled = true;
      cancelClose.disabled = false;
    }
    navigation();
  }
}
async function openFromSidebar(id: string): Promise<void> {
  if (!authenticated) return;
  if (attachments.busy) {
    showError(new Error("Wait for image uploads to finish."));
    return;
  }
  const session = sessions.find((value) => value.id === id);
  if (!session) return;
  const intent = ++openIntentGeneration,
    selectedAtStart = selectionGeneration;
  closeArmedSession = null;
  nav(false);
  if (runtimeOpen(session) && session.runtimeState !== "failed") {
    await select(id);
    return;
  }
  if (openingSessions.has(id)) return;
  const authentication = authAttempt;
  openingSessions.add(id);
  navigation();
  try {
    const value = await api(`/api/v1/sessions/${id}/open`, {});
    if (!isSessionInfo(value) || value.id !== id)
      throw new Error("Invalid session response while opening.");
    if (authentication !== authAttempt || !authenticated) return;
    updatedSession(value);
    navigation();
    if (intent === openIntentGeneration && selectedAtStart === selectionGeneration)
      await select(id);
  } catch (error) {
    if (authentication === authAttempt) showError(error);
  } finally {
    openingSessions.delete(id);
    navigation();
  }
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
    conversation.append(
      renderSavedConversation(entries, contextSources, contextSourcesTruncated, historyImage),
    );
    for (const element of Array.from(
      conversation.querySelectorAll<HTMLDetailsElement>("details[data-key]"),
    )) {
      if (expanded.has(element.dataset.key)) element.open = true;
    }
    const liveVisible =
      state.liveRunId !== null && state.history?.coveredTurnId !== state.liveRunId;
    if (liveVisible) {
      const article = node("article", "", "message assistant live"),
        body = node("div", "", "message-body");
      article.setAttribute("aria-label", "Pi live response");
      article.append(body);
      const order = [...liveOrder];
      for (const item of state.messages)
        if (!order.some((value) => value.kind === "message" && value.id === item.id))
          order.push({ kind: "message", id: item.id });
      for (const item of state.tools)
        if (!order.some((value) => value.kind === "tool" && value.id === item.id))
          order.push({ kind: "tool", id: item.id });
      for (const item of order) {
        if (item.kind === "message") {
          const live = state.messages.find((value) => value.id === item.id);
          if (!live?.text) continue;
          const text = node("div");
          renderMarkdown(text, live.text);
          body.append(text);
        } else {
          const tool = state.tools.find((value) => value.id === item.id);
          if (!tool) continue;
          let title = tool.name,
            input = tool.input;
          try {
            const parsed: unknown = JSON.parse(input);
            if (
              tool.name === "bash" &&
              parsed &&
              typeof parsed === "object" &&
              "command" in parsed &&
              typeof parsed.command === "string"
            ) {
              title = `$ ${parsed.command}`;
              input = "";
            }
          } catch {
            /* incomplete live input */
          }
          const detail = node("details", "", "tool-run");
          detail.dataset.key = `live-tool:${tool.id}`;
          const summary = node("summary");
          const status = node("span", "", "tool-status");
          if (tool.status === "running" || tool.status === "failed")
            status.textContent = tool.status === "running" ? "Running" : "Failed";
          else {
            status.append(actionIcon("check"));
            status.setAttribute("aria-label", "Completed");
          }
          summary.append(node("code", title), status);
          detail.append(
            summary,
            node("pre", [input, tool.output].filter(Boolean).join("\n\n"), "tool-output"),
          );
          detail.open = expanded.has(detail.dataset.key) || tool.status === "failed";
          body.append(detail);
        }
      }
      if (body.childNodes.length) conversation.append(article);
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
    contextSources = result.contextSources ?? [];
    contextSourcesTruncated = result.contextSourcesTruncated === true;
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
          const previousRun = state.liveRunId;
          state = reduceFrame(state, frame);
          if (
            state.liveRunId !== previousRun ||
            frame.type === "resync" ||
            frame.type === "snapshot"
          )
            liveOrder = [];
          const liveItem =
            frame.type === "message.started" || frame.type === "message.finished"
              ? { kind: "message" as const, id: frame.payload.id }
              : frame.type === "message.delta"
                ? { kind: "message" as const, id: frame.payload.messageId }
                : frame.type === "tool.started" ||
                    frame.type === "tool.updated" ||
                    frame.type === "tool.finished"
                  ? { kind: "tool" as const, id: frame.payload.id }
                  : null;
          if (
            liveItem &&
            !liveOrder.some((value) => value.kind === liveItem.kind && value.id === liveItem.id)
          )
            liveOrder = [...liveOrder.slice(-127), liveItem];
          if (state.session) {
            const previous = activeSession();
            const previousKey = previous
              ? modelCapabilityKey(previous.provider, previous.model)
              : null;
            const previousTabs = openTabIds();
            sessions = sessions.map((s) => (s.id === id && state.session ? state.session : s));
            sessionStateGeneration++;
            synchronizeTabSlots();
            if (!runtimeOpen(state.session)) reconcileClosedRuntime(id, previousTabs);
            const current = activeSession();
            if (
              id === selected &&
              current &&
              modelCapabilityKey(current.provider, current.model) !== previousKey
            )
              probeCurrentModel(id);
          }
          const confirmed = state.activeTurn ?? state.latestTurn;
          if (
            pendingSend &&
            confirmed?.requestId === pendingSend.requestId &&
            confirmed.sessionId === pendingSend.session
          ) {
            drafts.set(pendingSend.session, "");
            attachments.clear(pendingSend.session);
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
async function select(id: string | null): Promise<void> {
  if (selected === id) return;
  if (id !== null && !sessions.some((session) => session.id === id && runtimeOpen(session))) return;
  selectionGeneration++;
  closeArmedSession = null;
  modelDialog.close();
  modelAttempt++;
  if (selected) drafts.set(selected, input.value);
  stopStream();
  generation++;
  selected = id;
  attachments.select(id);
  releaseImages();
  contextSources = [];
  contextSourcesTruncated = false;
  liveOrder = [];
  if (id !== null) savePreference("selected", id);
  state = emptyConversationState(id ?? undefined);
  entries = [];
  nextCursor = null;
  historyError = "";
  input.value = id === null ? "" : (drafts.get(id) ?? "");
  composer.resize();
  navigation();
  renderConversation();
  scroll.scrollTop = 0;
  if (id) {
    probeCurrentModel(id);
    void stream(id, generation);
    await loadHistory();
  }
}
function connection(text: string): void {
  el("connection-badge", HTMLElement).textContent = text;
}
async function refresh(): Promise<void> {
  const attempt = authAttempt,
    refreshGeneration = ++sessionRefreshGeneration,
    stateGeneration = sessionStateGeneration,
    previousTabs = openTabIds();
  const previous = activeSession();
  const previousKey = previous ? modelCapabilityKey(previous.provider, previous.model) : null;
  const result = await api("/api/v1/sessions");
  if (!Array.isArray(result) || !result.every(isSessionInfo))
    throw new Error("Invalid session list.");
  if (
    attempt !== authAttempt ||
    !authenticated ||
    refreshGeneration !== sessionRefreshGeneration ||
    stateGeneration !== sessionStateGeneration
  )
    return;
  sessions = result;
  sessionStateGeneration++;
  synchronizeTabSlots();
  if (selected && !sessions.some((session) => session.id === selected && runtimeOpen(session))) {
    const closedId = selected;
    if (closeTarget?.id === closedId && closingSession !== closedId && closeDialog.open) {
      closeDialog.close();
      showError(new Error("This session was closed from another browser."));
    }
    await select(neighborAfterClose(closedId, previousTabs));
  }
  const openSessions = sessions.filter(runtimeOpen);
  if (!selected && openSessions.length) {
    const preferred = openSessions.find((session) => session.id === localPreferences.selected);
    await select((preferred ?? openSessions[0])?.id ?? null);
  }
  const current = activeSession();
  if (current && modelCapabilityKey(current.provider, current.model) !== previousKey)
    probeCurrentModel(selected);
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
        if (
          attempt === authAttempt &&
          authenticated &&
          refreshGeneration === sessionRefreshGeneration &&
          sessions.find((session) => session.id === s.id)?.latestTurnId === value.runId
        )
          turns.set(s.id, value);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) showError(error);
      }
    }),
  );
  if (attempt === authAttempt && authenticated && refreshGeneration === sessionRefreshGeneration)
    navigation();
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
  attachments.dispose();
  capabilityGeneration++;
  capabilities.clear();
  capabilityRequests.clear();
  capabilityErrors.clear();
  releaseImages();
  imageDialog.close();
  authenticated = false;
  authAttempt++;
  generation++;
  dialog.close();
  modelDialog.close();
  closeDialog.close();
  closeArmedSession = null;
  preparingCloseSession = null;
  closeTarget = null;
  modelAttempt++;
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
      if (sessions.some((session) => session.id === selected)) {
        attachments.select(selected);
        probeCurrentModel(selected);
      }
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
  if (!s || sending || changingModel === s.id) return;
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
    images: attachments.payload(),
  };
  if (
    attempt.images.length > 0 &&
    capabilities.get(modelCapabilityKey(s.provider, s.model) ?? "")?.supportsImages === false
  ) {
    showError(new Error("Choose an image-capable model or remove the attached images."));
    return;
  }
  if (attachments.busy || (!attempt.message.trim() && attempt.images.length === 0)) return;
  const payload = {
    requestId: attempt.requestId,
    message: attempt.message,
    ...(attempt.images.length ? { images: attempt.images } : {}),
  };
  if (
    new TextEncoder().encode(attempt.message).length > 8192 ||
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
    attachments.clear(s.id);
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
      const parent = node("button", "", "directory-row");
      labelWithIcon(parent, "Parent directory", "up");
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
      const child = node("button", "", "directory-row");
      labelWithIcon(child, item.name, "open");
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
function renderModels(): void {
  const container = el("model-options", HTMLElement);
  const query = modelSearch.value.trim().toLowerCase();
  const session = activeSession();
  container.replaceChildren();
  for (const item of availableModels) {
    if (!`${item.provider} ${item.id}`.toLowerCase().includes(query)) continue;
    const current = item.provider === session?.provider && item.id === session.model;
    const button = node("button", "", `model-option${current ? " selected" : ""}`);
    button.type = "button";
    button.setAttribute("aria-pressed", String(current));
    button.disabled = chooseModel.disabled || modelSession !== selected;
    const text = node("span");
    text.append(node("strong", item.id), node("small", item.provider));
    button.append(text);
    const indicator = node("span", "", current ? "tick" : "option-arrow");
    indicator.append(actionIcon(current ? "check" : "right"));
    button.append(indicator);
    button.onclick = () => {
      void showThinking(item);
    };
    container.append(button);
  }
  if (!container.childElementCount)
    container.append(
      node("p", query ? "No matching models." : "Pi has no available models.", "footnote"),
    );
}
async function showModels(): Promise<void> {
  const session = activeSession();
  if (!session || chooseModel.disabled) return;
  const attempt = ++modelAttempt,
    authentication = authAttempt;
  modelSession = session.id;
  availableModels = [];
  thinkingChoice = null;
  modelSearch.hidden = false;
  el("back-models", HTMLButtonElement).hidden = true;
  el("model-title", HTMLElement).textContent = "Model";
  modelSearch.value = "";
  el("model-error", HTMLElement).textContent = "";
  el("model-options", HTMLElement).replaceChildren(node("p", "Loading models…", "footnote"));
  modelDialog.showModal();
  el("close-model", HTMLButtonElement).focus();
  try {
    const result = await api("/api/v1/models");
    if (!isAvailableModelsResponse(result)) throw new Error("Invalid model list.");
    if (
      attempt !== modelAttempt ||
      authentication !== authAttempt ||
      !modelDialog.open ||
      selected !== session.id
    )
      return;
    availableModels = result.models;
    renderModels();
  } catch (error) {
    if (attempt !== modelAttempt || authentication !== authAttempt || !modelDialog.open) return;
    if (error instanceof ApiError && error.status === 401) showError(error);
    el("model-options", HTMLElement).replaceChildren();
    el("model-error", HTMLElement).textContent = message(error);
  }
}
async function showThinking(choice: PiModelOption): Promise<void> {
  const session = activeSession();
  if (!session) return;
  const attempt = ++modelAttempt,
    authentication = authAttempt;
  thinkingChoice = choice;
  modelSearch.hidden = true;
  el("model-title", HTMLElement).textContent = "Thinking level";
  const back = el("back-models", HTMLButtonElement);
  back.hidden = false;
  labelWithIcon(back, choice.id, "left", true);
  const container = el("model-options", HTMLElement);
  container.replaceChildren(node("p", "Checking Pi capabilities…", "footnote"));
  el("model-error", HTMLElement).textContent = "";
  try {
    const result = await requestModelCapabilities(choice);
    if (
      attempt !== modelAttempt ||
      authentication !== authAttempt ||
      !modelDialog.open ||
      selected !== session.id
    )
      return;
    if (result.thinkingLevels.length === 1) {
      const level = result.thinkingLevels[0];
      if (level) await changeModel(choice, level);
      return;
    }
    container.replaceChildren();
    for (const level of result.thinkingLevels) {
      const current =
        session.provider === choice.provider &&
        session.model === choice.id &&
        session.thinkingLevel === level;
      const button = node(
        "button",
        "",
        `model-option thinking-choice${current ? " selected" : ""}`,
      );
      button.type = "button";
      button.dataset.level = level;
      button.setAttribute("aria-pressed", String(current));
      button.append(node("strong", levelNames[level]));
      if (current) {
        const indicator = node("span", "", "tick");
        indicator.append(actionIcon("check"));
        button.append(indicator);
      }
      button.onclick = () => {
        void changeModel(choice, level);
      };
      container.append(button);
    }
    back.focus();
  } catch (error) {
    if (attempt !== modelAttempt || authentication !== authAttempt || !modelDialog.open) return;
    if (error instanceof ApiError && error.status === 401) showError(error);
    container.replaceChildren();
    el("model-error", HTMLElement).textContent = message(error);
  }
}
async function changeModel(choice: PiModelOption, thinkingLevel: ThinkingLevel): Promise<void> {
  const session = activeSession();
  if (!session || modelSession !== session.id || chooseModel.disabled) return;
  if (
    session.provider === choice.provider &&
    session.model === choice.id &&
    session.thinkingLevel === thinkingLevel
  ) {
    modelDialog.close();
    return;
  }
  const authentication = authAttempt;
  changingModel = session.id;
  el("model-error", HTMLElement).textContent = "";
  navigation();
  try {
    const result = await api(`/api/v1/sessions/${session.id}/model`, {
      provider: choice.provider,
      model: choice.id,
      thinkingLevel,
    });
    if (!isSessionInfo(result) || result.id !== session.id)
      throw new Error("Invalid model response. Reopen the picker to check the current model.");
    if (authentication !== authAttempt) return;
    sessions = sessions.map((s) => (s.id === session.id ? result : s));
    if (selected === session.id) modelDialog.close();
    await refresh();
  } catch (error) {
    if (authentication !== authAttempt) return;
    if (error instanceof ApiError && error.status === 401) showError(error);
    else if (modelDialog.open && selected === session.id)
      el("model-error", HTMLElement).textContent = message(error);
    else showError(error);
    // Read back authoritative metadata after a response failure; never replay the mutation.
    try {
      await refresh();
    } catch {
      /* normal polling will retry this read */
    }
  } finally {
    changingModel = null;
    navigation();
    if (modelDialog.open && !thinkingChoice) renderModels();
  }
}
function newSession(): void {
  nav(false);
  dialog.showModal();
  if (pendingCreate) return;
  el("create-error", HTMLElement).textContent = "";
  directory.value = activeSession()?.directory ?? "";
  void browse(activeSession()?.directory);
}
async function createSession(): Promise<void> {
  if (createButton.disabled) return;
  const authentication = authAttempt;
  const attempt = pendingCreate ?? {
    requestId: crypto.randomUUID(),
    directory: directory.value,
  };
  pendingCreate = attempt;
  createButton.disabled = true;
  directory.disabled = true;
  try {
    const result = await api("/api/v1/sessions", {
      requestId: attempt.requestId,
      directory: attempt.directory,
    });
    if (!isSessionInfo(result))
      throw new Error("Invalid session response. Retry to confirm the same creation request.");
    if (authentication !== authAttempt) return;
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
  }
}
chooseModel.onclick = () => {
  void showModels();
};
el("close-model", HTMLButtonElement).onclick = () => modelDialog.close();
modelSearch.oninput = renderModels;
modelDialog.addEventListener("close", () => {
  if (!modelDialog.open) modelAttempt++;
});
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
cancelClose.onclick = dismissCloseDialog;
confirmClose.onclick = () => {
  void confirmSessionClose();
};
closeDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  if (closingSession === null) dismissCloseDialog();
});
function resetCloseDialog(): void {
  closeArmedSession = null;
  closeTarget = null;
  confirmClose.disabled = false;
  cancelClose.disabled = false;
  closeError.textContent = "";
  closeError.hidden = true;
  navigation();
  const active = el("status-list", HTMLElement).querySelector<HTMLButtonElement>(
    ".status-tab.active .tab-select",
  );
  (active ?? el("new-mobile", HTMLButtonElement)).focus();
}
function dismissCloseDialog(): void {
  closeDialog.close();
  resetCloseDialog();
}
closeDialog.addEventListener("close", () => {
  // Native close events are queued: do not erase a later reveal or dialog.
  if (!closeDialog.open && closeTarget !== null) resetCloseDialog();
});

directory.oninput = () => {
  browseAttempt++;
  el("directories", HTMLElement).replaceChildren();
};
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
const pairingCode = el("pair-code", HTMLInputElement);
pairingCode.oninput = () => {
  const trimmed = pairingCode.value.trim();
  if (trimmed !== pairingCode.value) pairingCode.value = trimmed;
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
input.addEventListener("paste", (event) => attachments.paste(event));
el("close-image", HTMLButtonElement).onclick = () => imageDialog.close();
imageDialog.addEventListener("close", () =>
  el("preview-image", HTMLImageElement).removeAttribute("src"),
);
el("back-models", HTMLButtonElement).onclick = () => {
  modelAttempt++;
  thinkingChoice = null;
  modelSearch.hidden = false;
  el("back-models", HTMLButtonElement).hidden = true;
  el("model-title", HTMLElement).textContent = "Model";
  el("model-error", HTMLElement).textContent = "";
  renderModels();
};
input.oninput = () => {
  if (selected) drafts.set(selected, input.value);
  composer.resize();
  navigation();
};
input.onkeydown = (event) => {
  if (
    matchMedia("(pointer:fine)").matches &&
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing &&
    event.keyCode !== 229
  ) {
    event.preventDefault();
    void submit();
  }
};
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || closeDialog.open) return;
  if (closeArmedSession !== null) {
    closeArmedSession = null;
    navigation();
  }
  if (rail.classList.contains("open")) nav(false);
});
document.addEventListener("click", (event) => {
  if (
    closeArmedSession !== null &&
    !event.composedPath().includes(el("status-list", HTMLElement)) &&
    !event.composedPath().includes(closeDialog)
  ) {
    closeArmedSession = null;
    navigation();
  }
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
