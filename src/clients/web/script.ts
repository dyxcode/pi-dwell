export const BROWSER_SCRIPT = `const POLL_INTERVAL_MS = 10_000;
const REQUEST_TIMEOUT_MS = 5_000;
const BROWSER_BINDING_KEY = "dwell.browser-binding.v1";
const BROWSER_BINDING_PATTERN = /^[a-f0-9]{64}$/;
const BROWSER_STORAGE_MESSAGE = "Browser storage is unavailable. Enable storage for this site, then retry.";

function requireElement(id, expectedType) {
  const element = document.getElementById(id);
  if (!(element instanceof expectedType)) {
    throw new Error("The Dwell page is missing a required element.");
  }
  return element;
}

const panels = [
  requireElement("loading-panel", HTMLElement),
  requireElement("pairing-panel", HTMLElement),
  requireElement("offline-panel", HTMLElement),
  requireElement("connected-panel", HTMLElement),
];
const badge = requireElement("connection-badge", HTMLElement);
const pairingMessage = requireElement("pairing-message", HTMLElement);
const offlineMessage = requireElement("offline-message", HTMLElement);
const connectionMessage = requireElement("connection-message", HTMLElement);
const pairForm = requireElement("pair-form", HTMLFormElement);
const pairCode = requireElement("pair-code", HTMLInputElement);
const serviceValue = requireElement("service-value", HTMLElement);
const phaseValue = requireElement("phase-value", HTMLElement);
const modeValue = requireElement("mode-value", HTMLElement);
const protocolValue = requireElement("protocol-value", HTMLElement);
const startedValue = requireElement("started-value", HTMLElement);
const actionButtons = [
  requireElement("pair-button", HTMLButtonElement),
  requireElement("pair-retry", HTMLButtonElement),
  requireElement("retry-button", HTMLButtonElement),
  requireElement("refresh-button", HTMLButtonElement),
  requireElement("logout-button", HTMLButtonElement),
];

let requestPending = false;
let hasActiveSession = false;
let hasConnectedBefore = false;
let intentionallyDisconnected = false;
let browserStorageUnavailable = false;
let pollTimer = null;

function showPanel(id) {
  for (const panel of panels) panel.hidden = panel.id !== id;
}

function setBadge(message, state) {
  badge.textContent = message;
  badge.dataset.state = state;
}

function setBusy(busy) {
  requestPending = busy;
  for (const button of actionButtons) button.disabled = busy;
  pairCode.disabled = busy;
}

function setPairingMessage(message) {
  pairingMessage.textContent = message;
  pairingMessage.hidden = message.length === 0;
}

function stopPolling() {
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function schedulePolling() {
  if (!hasActiveSession || browserStorageUnavailable || pollTimer !== null) return;
  pollTimer = window.setTimeout(() => {
    pollTimer = null;
    void refreshStatus("poll");
  }, POLL_INTERVAL_MS);
}

function showPairing(message, badgeMessage = "Pairing required") {
  hasActiveSession = false;
  stopPolling();
  setPairingMessage(message);
  showPanel("pairing-panel");
  setBadge(badgeMessage, message.length === 0 ? "checking" : "error");
}

function showOffline(message) {
  if (hasActiveSession) {
    showPanel("connected-panel");
    connectionMessage.textContent = message;
    connectionMessage.hidden = false;
    setBadge("Connection lost", "error");
    return;
  }

  offlineMessage.textContent = message;
  showPanel("offline-panel");
  setBadge("Can’t connect", "error");
}

function showBrowserStorageUnavailable(message = BROWSER_STORAGE_MESSAGE) {
  browserStorageUnavailable = true;
  stopPolling();
  if (hasActiveSession) {
    showPanel("connected-panel");
    connectionMessage.textContent = message;
    connectionMessage.hidden = false;
    setBadge("Storage unavailable", "error");
    return;
  }

  showPairing(message, "Storage unavailable");
}

function showConnected(status) {
  serviceValue.textContent = status.service;
  phaseValue.textContent = status.phase;
  modeValue.textContent = status.mode;
  protocolValue.textContent = String(status.protocolVersion);
  startedValue.textContent = new Date(status.startedAt).toLocaleString();
  connectionMessage.textContent = "";
  connectionMessage.hidden = true;
  hasActiveSession = true;
  hasConnectedBefore = true;
  intentionallyDisconnected = false;
  showPanel("connected-panel");
  setBadge("Connected", "connected");
}

function isHostStatus(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if (
    !("service" in value) ||
    value.service !== "pi-dwell" ||
    !("protocolVersion" in value) ||
    value.protocolVersion !== 2 ||
    !("phase" in value) ||
    value.phase !== "sessions" ||
    !("startedAt" in value) ||
    typeof value.startedAt !== "string" ||
    !Number.isFinite(Date.parse(value.startedAt)) ||
    !("processId" in value) ||
    typeof value.processId !== "number" ||
    !Number.isSafeInteger(value.processId) ||
    value.processId <= 0 ||
    !("instanceId" in value) ||
    typeof value.instanceId !== "string" ||
    !/^[a-f0-9-]{36}$/.test(value.instanceId) ||
    !("mode" in value) ||
    (value.mode !== "production" && value.mode !== "development") ||
    !("capabilities" in value)
  ) {
    return false;
  }

  const capabilities = value.capabilities;
  return (
    typeof capabilities === "object" &&
    capabilities !== null &&
    !Array.isArray(capabilities) &&
    "sessions" in capabilities &&
    capabilities.sessions === true &&
    "tasks" in capabilities &&
    capabilities.tasks === false
  );
}

function isPairSuccess(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "ok" in value &&
    value.ok === true
  );
}

function readBrowserBinding() {
  try {
    const storage = window.localStorage;
    const binding = storage.getItem(BROWSER_BINDING_KEY);
    if (binding === null) {
      browserStorageUnavailable = false;
      return { kind: "available", binding: null };
    }
    if (typeof binding !== "string" || !BROWSER_BINDING_PATTERN.test(binding)) {
      storage.removeItem(BROWSER_BINDING_KEY);
      browserStorageUnavailable = false;
      return { kind: "available", binding: null };
    }
    browserStorageUnavailable = false;
    return { kind: "available", binding };
  } catch {
    browserStorageUnavailable = true;
    return { kind: "unavailable" };
  }
}

function createBrowserBinding() {
  try {
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    let binding = "";
    for (const byte of bytes) binding += byte.toString(16).padStart(2, "0");
    window.localStorage.setItem(BROWSER_BINDING_KEY, binding);
    browserStorageUnavailable = false;
    return { kind: "available", binding };
  } catch {
    browserStorageUnavailable = true;
    return { kind: "unavailable" };
  }
}

function removeBrowserBinding() {
  try {
    window.localStorage.removeItem(BROWSER_BINDING_KEY);
    browserStorageUnavailable = false;
    return true;
  } catch {
    browserStorageUnavailable = true;
    return false;
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function safeErrorCode(response) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    return null;
  }

  if (!isRecord(payload) || !isRecord(payload.error) || typeof payload.error.code !== "string") {
    return null;
  }
  return payload.error.code;
}

function retryWait(response) {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter === null) return "a short while";

  const seconds = Number(retryAfter);
  if (Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86_400) {
    return seconds === 1 ? "one second" : seconds + " seconds";
  }

  const retryAt = Date.parse(retryAfter);
  if (Number.isFinite(retryAt)) {
    const remaining = Math.ceil((retryAt - Date.now()) / 1000);
    if (remaining > 0 && remaining <= 86_400) {
      return remaining === 1 ? "one second" : remaining + " seconds";
    }
  }
  return "a short while";
}

async function fetchHostStatus() {
  const storedBinding = readBrowserBinding();
  if (storedBinding.kind === "unavailable") return { kind: "storage-unavailable" };

  const headers = { Accept: "application/json" };
  if (storedBinding.binding !== null) headers["X-Dwell-Browser"] = storedBinding.binding;

  let response;
  try {
    response = await fetch("/api/v1/status", {
      method: "GET",
      credentials: storedBinding.binding === null ? "omit" : "same-origin",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { kind: "network-error" };
  }

  if (response.status === 401) return { kind: "unauthorized" };
  if (!response.ok) return { kind: "http-error" };

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { kind: "invalid-response" };
  }

  return isHostStatus(payload)
    ? { kind: "connected", status: payload }
    : { kind: "invalid-response" };
}

function applyStatusResult(result, context) {
  if (result.kind === "connected") {
    showConnected(result.status);
    return;
  }

  if (result.kind === "unauthorized") {
    const hadActiveSession = hasActiveSession;
    hasActiveSession = false;
    stopPolling();

    if (context === "after-pair") {
      showPairing("Pairing was not confirmed. The code may have expired; create a new one and try again.");
    } else if (hadActiveSession || (hasConnectedBefore && !intentionallyDisconnected)) {
      showPairing("This browser’s session has expired or been revoked. Pair it again to reconnect.");
    } else if (intentionallyDisconnected) {
      showPairing("This browser is disconnected. Pair it again whenever you want to reconnect.");
    } else {
      showPairing("");
    }
    return;
  }

  if (result.kind === "storage-unavailable") {
    showBrowserStorageUnavailable();
    return;
  }

  if (result.kind === "network-error") {
    showOffline("Could not reach the Dwell host. Check that it is running, then retry.");
  } else if (result.kind === "http-error") {
    showOffline("The Dwell host returned an unexpected response. Retry in a moment.");
  } else {
    showOffline("The Dwell host returned an incompatible status. Refresh to try again.");
  }
}

async function refreshStatus(context = "user") {
  if (requestPending) return;
  stopPolling();
  setBusy(true);
  if (hasActiveSession) setBadge("Checking host", "checking");

  try {
    applyStatusResult(await fetchHostStatus(), context);
  } finally {
    setBusy(false);
    schedulePolling();
  }
}

async function submitPairingCode(submittedCode) {
  let code = submittedCode;
  stopPolling();
  setBusy(true);
  setBadge("Pairing browser", "checking");

  try {
    const storedBinding = readBrowserBinding();
    if (storedBinding.kind === "unavailable") {
      showBrowserStorageUnavailable();
      return;
    }

    let binding = storedBinding.binding;
    if (binding === null) {
      const createdBinding = createBrowserBinding();
      if (createdBinding.kind === "unavailable") {
        showBrowserStorageUnavailable();
        return;
      }
      binding = createdBinding.binding;
    }

    const currentBinding = readBrowserBinding();
    if (currentBinding.kind === "unavailable") {
      showBrowserStorageUnavailable();
      return;
    }
    if (currentBinding.binding === null) {
      showPairing("This browser binding was removed in another tab. Pair again to create a new binding.");
      return;
    }
    binding = currentBinding.binding;

    let response;
    try {
      response = await fetch("/api/v1/auth/pair", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Dwell-Request": "1",
          "X-Dwell-Browser": binding,
        },
        body: JSON.stringify({ code, browserKey: binding }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      showPairing("The connection was interrupted while pairing. Check the host, then use Check connection.", "Pairing needs confirmation");
      return;
    }

    if (response.status === 400 || response.status === 401) {
      showPairing("That pairing code was not accepted. Create a new code in the host terminal and try again.");
      return;
    }
    if (response.status === 429) {
      const errorCode = await safeErrorCode(response);
      if (errorCode === "session_limit") {
        showPairing(
          "This host has reached its browser session limit. Revoke older sessions with the local CLI, then pair again.",
        );
      } else {
        showPairing("Too many pairing attempts. Wait " + retryWait(response) + " before trying again.");
      }
      return;
    }
    if (!response.ok) {
      showPairing("Pairing could not be completed. Check the host and try again.");
      return;
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      showPairing("The host could not confirm pairing. Check the connection and try again.");
      return;
    }
    if (!isPairSuccess(payload)) {
      showPairing("The host could not confirm pairing. Check the connection and try again.");
      return;
    }

    applyStatusResult(await fetchHostStatus(), "after-pair");
  } finally {
    code = "";
    pairCode.value = "";
    setBusy(false);
    schedulePolling();
  }
}

async function forgetThisBrowser() {
  if (requestPending) return;
  stopPolling();
  setBusy(true);
  setBadge("Disconnecting browser", "checking");

  try {
    const storedBinding = readBrowserBinding();
    if (storedBinding.kind === "unavailable") {
      showBrowserStorageUnavailable();
      return;
    }
    if (storedBinding.binding === null) {
      hasActiveSession = false;
      showPairing("This browser binding is missing. Pair again to restore access before disconnecting this browser.");
      return;
    }

    let response;
    try {
      response = await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Dwell-Request": "1",
          "X-Dwell-Browser": storedBinding.binding,
        },
        body: "{}",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      showOffline("Could not reach the Dwell host to disconnect this browser. Retry when the host is available.");
      return;
    }

    if (response.status === 401) {
      applyStatusResult({ kind: "unauthorized" }, "user");
      return;
    }
    if (!response.ok) {
      showOffline("The Dwell host could not disconnect this browser. Retry in a moment.");
      return;
    }

    hasActiveSession = false;
    intentionallyDisconnected = true;
    stopPolling();
    if (!removeBrowserBinding()) {
      showBrowserStorageUnavailable(
        "Browser storage is unavailable. Dwell disconnected this browser, but could not remove its browser binding. Enable storage for this site, then retry.",
      );
      return;
    }
    showPairing("This browser is disconnected. Pair it again whenever you want to reconnect.");
  } finally {
    setBusy(false);
    schedulePolling();
  }
}

pairForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (requestPending) return;

  const submittedCode = pairCode.value;
  pairCode.value = "";
  if (!/^[a-f0-9]{32}$/.test(submittedCode)) {
    setPairingMessage("Enter the 32-character lowercase hexadecimal pairing code.");
    pairCode.focus();
    return;
  }

  void submitPairingCode(submittedCode);
});

requireElement("pair-retry", HTMLButtonElement).addEventListener("click", () => {
  void refreshStatus("pair-check");
});
requireElement("retry-button", HTMLButtonElement).addEventListener("click", () => {
  void refreshStatus("retry");
});
requireElement("refresh-button", HTMLButtonElement).addEventListener("click", () => {
  void refreshStatus("user");
});
requireElement("logout-button", HTMLButtonElement).addEventListener("click", () => {
  void forgetThisBrowser();
});

void refreshStatus("initial");
`;
