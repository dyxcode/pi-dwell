import { marked } from "/marked.js";
const $ = (id) => document.getElementById(id);
function actionIcon(name) {
  const paths = {
    up: "M6 10V2m-3 3 3-3 3 3",
    left: "M10 6H2m3-3-3 3 3 3",
    right: "m4.5 3 3 3-3 3",
    open: "M3 9 9 3H3m6 0v6",
    plus: "M6 2v8M2 6h8",
    check: "m2 6 2.5 2.5L10 3",
    close: "m3 3 6 6m0-6-6 6",
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("action-icon");
  svg.setAttribute("viewBox", "0 0 12 12");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", paths[name]);
  svg.append(path);
  return svg;
}
function labelWithIcon(button, text, name, leading = false) {
  const label = document.createElement("span");
  label.className = "control-label";
  label.textContent = text;
  const icon = actionIcon(name);
  button.classList.add("icon-label");
  button.replaceChildren(...(leading ? [icon, label] : [label, icon]));
}
labelWithIcon($("send"), "Send", "up");
labelWithIcon($("attach-image"), "Image", "plus", true);
labelWithIcon($("load-older"), "Load earlier messages", "up");
labelWithIcon($("create-button"), "Start session", "open");
labelWithIcon($("reopen-session"), "Open session", "open");
labelWithIcon($("new-session"), "New session", "plus");
for (const id of [
  "close-nav",
  "close-new",
  "close-host",
  "close-model",
  "close-image",
  "dismiss-notice",
])
  $(id).replaceChildren(actionIcon("close"));
$("new-mobile").replaceChildren(actionIcon("plus"));
const models = [
  { name: "GPT-5.4", provider: "OpenAI", levels: ["low", "medium", "high", "xhigh"] },
  { name: "GPT-5.4 mini", provider: "OpenAI", levels: ["low", "medium", "high"] },
  { name: "Claude Sonnet", provider: "Anthropic", levels: ["low", "medium", "high"] },
  { name: "Claude Opus", provider: "Anthropic", levels: ["low", "medium", "high", "max"] },
];
let currentModel = models[0];
let currentThinking = "medium";
let pendingModel = null;
const levelNames = { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" };
const levelCopy = {
  low: "Quick tasks",
  medium: "Everyday work",
  high: "Complex problems",
  xhigh: "Deeper analysis",
  max: "Most demanding tasks",
};
let sessions = [
  {
    directory: "/home/you/projects/pi-dwell",
    messages: [
      ["user", "Run the tests and tell me if this is ready to review."],
      [
        "assistant",
        {
          thinking:
            "## Clarifying the contents\n\nThe request covers the message layout and command output. I’ll check them together.",
          intro: "I’ll check the test suite.",
          command: "npm test",
          output: "24 tests passed\n0 failed · 1.2s",
          text: "All 24 tests passed. The changes are ready to review.",
        },
      ],
      ["user", "What changed?"],
      [
        "assistant",
        "Your messages sit on the right. Pi replies stay on the page, with commands and output tucked into the same response.",
      ],
    ],
  },
];
let selected = 0;
let withDistill = new URLSearchParams(location.search).get("view") === "distill";

function renderMarkdown(parent, source) {
  const append = (target, tokens) => {
    for (const token of tokens) {
      const tag = {
        paragraph: "p",
        heading: "h" + token.depth,
        blockquote: "blockquote",
        strong: "strong",
        em: "em",
        del: "del",
        br: "br",
        hr: "hr",
        codespan: "code",
      }[token.type];
      if (token.type === "space" || token.type === "def" || token.type === "checkbox") continue;
      if (token.type === "code") {
        const block = document.createElement("figure");
        block.className = "code-block";
        if (token.lang) {
          const label = document.createElement("figcaption");
          label.textContent = token.lang.split(/\s/)[0];
          block.append(label);
        }
        const pre = document.createElement("pre");
        pre.tabIndex = 0;
        const code = document.createElement("code");
        code.textContent = token.text;
        pre.append(code);
        block.append(pre);
        target.append(block);
        continue;
      }
      if (token.type === "table") {
        const wrap = document.createElement("div");
        wrap.className = "table-scroll";
        wrap.tabIndex = 0;
        const table = document.createElement("table");
        const head = document.createElement("thead");
        const body = document.createElement("tbody");
        const row = (cells, header) => {
          const tr = document.createElement("tr");
          for (const cell of cells) {
            const td = document.createElement(header ? "th" : "td");
            if (header) td.scope = "col";
            if (cell.align) td.style.textAlign = cell.align;
            append(td, cell.tokens);
            tr.append(td);
          }
          return tr;
        };
        head.append(row(token.header, true));
        for (const cells of token.rows) body.append(row(cells, false));
        table.append(head, body);
        wrap.append(table);
        target.append(wrap);
        continue;
      }
      if (token.type === "list") {
        const list = document.createElement(token.ordered ? "ol" : "ul");
        if (token.ordered) list.start = Number(token.start);
        for (const item of token.items) {
          const li = document.createElement("li");
          if (item.task) {
            li.className = "task-item";
            const check = document.createElement("input");
            check.type = "checkbox";
            check.disabled = true;
            check.checked = Boolean(item.checked);
            check.setAttribute("aria-label", item.checked ? "Completed" : "Not completed");
            li.append(check);
          }
          append(li, item.tokens);
          list.append(li);
        }
        target.append(list);
        continue;
      }
      if (token.type === "link" || token.type === "image") {
        let url;
        try {
          url = new URL(token.href, location.href);
        } catch {}
        const valid = url && ["http:", "https:", "mailto:"].includes(url.protocol);
        const link = document.createElement(valid ? "a" : "span");
        if (valid) {
          link.href = url.href;
          link.rel = "noopener noreferrer";
          link.target = "_blank";
        }
        if (token.type === "image") link.textContent = token.text || "Image";
        else append(link, token.tokens);
        target.append(link);
        continue;
      }
      if (tag) {
        const node = document.createElement(tag);
        if (token.tokens) append(node, token.tokens);
        else if (token.text) node.textContent = token.text;
        target.append(node);
        continue;
      }
      if (token.tokens) append(target, token.tokens);
      else target.append(document.createTextNode(token.text || token.raw || ""));
    }
  };
  parent.classList.add("markdown");
  append(parent, marked.lexer(source, { gfm: true }));
}

function message(role, text) {
  const article = document.createElement("article");
  article.className = "message " + role;
  article.setAttribute("aria-label", role === "user" ? "Your message" : "Pi response");
  const body = document.createElement("div");
  body.className = "message-body";
  if (role === "user" && typeof text === "object" && text.kind === "images") {
    for (const part of text.parts) {
      if (part.type === "text") {
        const prose = document.createElement("div");
        renderMarkdown(prose, part.text);
        body.append(prose);
      } else {
        const preview = document.createElement("button");
        preview.type = "button";
        preview.className = "sent-image";
        preview.setAttribute("aria-label", "Preview " + part.image.name);
        const image = document.createElement("img");
        image.src = part.image.url;
        image.alt = part.image.name;
        preview.append(image);
        preview.onclick = () => showImage(part.image);
        body.append(preview);
      }
    }
  } else if (typeof text === "string") renderMarkdown(body, text);
  else {
    if (text.thinking) {
      const details = document.createElement("details");
      details.className = "thinking-preview";
      details.open = Boolean(text.thinkingOpen);
      const summary = document.createElement("summary");
      const firstHeading = /^(?:#{1,6}\s+([^\n]+)|\*\*([^\n]+)\*\*)\s*(?:\n|$)/.exec(text.thinking);
      const title = firstHeading?.[1] || firstHeading?.[2];
      const useTitle = title && title.length <= 72;
      summary.textContent = useTitle ? title : "Thinking";
      summary.setAttribute("aria-label", "Thinking details: " + summary.textContent);
      const content = document.createElement("div");
      content.className = "thinking-preview-content markdown";
      renderMarkdown(
        content,
        useTitle ? text.thinking.slice(firstHeading[0].length) : text.thinking,
      );
      details.append(summary, content);
      details.addEventListener("toggle", () => {
        text.thinkingOpen = details.open;
      });
      body.append(details);
    }
    const intro = document.createElement("div");
    renderMarkdown(intro, text.intro);
    body.append(intro);
    const run = document.createElement("details");
    run.className = "tool-run";
    run.open = text.toolOpen ?? Boolean(text.failed);
    run.addEventListener("toggle", () => {
      text.toolOpen = run.open;
    });
    const summary = document.createElement("summary");
    summary.setAttribute("aria-label", "Bash command and output");
    const command = document.createElement("code");
    command.textContent = "$ " + text.command;
    const status = document.createElement("span");
    status.className = "tool-status";
    if (text.failed) status.textContent = "Failed";
    else status.append(actionIcon("check"));
    status.setAttribute("aria-label", text.failed ? "Failed" : "Completed");
    summary.append(command, status);
    const output = document.createElement("pre");
    output.className = "tool-output";
    output.textContent = text.output;
    run.append(summary, output);
    body.append(run);
    const reply = document.createElement("div");
    reply.className = "after-tool";
    renderMarkdown(reply, text.text);
    body.append(reply);
  }
  article.append(body);
  $("conversation").append(article);
}

function sessionDetails(session) {
  if (!session.context?.length) return null;
  const details = document.createElement("details");
  details.className = "session-details";
  details.open = Boolean(session.detailsOpen);
  const summary = document.createElement("summary");
  summary.textContent = "Context";
  details.append(summary);
  const panel = document.createElement("div");
  panel.className = "session-details-body";
  const caption = document.createElement("p");
  caption.className = "session-details-caption";
  caption.textContent = "Example instruction sources";
  panel.append(caption);
  for (const source of session.context) {
    const entry = document.createElement("details");
    entry.className = "context-source";
    entry.open = Boolean(source.open);
    const heading = document.createElement("summary");
    const path = document.createElement("span");
    path.textContent = source.path;
    heading.append(path);
    const content = document.createElement("div");
    content.className = "context-content";
    renderMarkdown(content, source.content);
    entry.append(heading, content);
    entry.addEventListener("toggle", () => {
      source.open = entry.open;
    });
    panel.append(entry);
  }
  details.append(panel);
  details.addEventListener("toggle", () => {
    session.detailsOpen = details.open;
  });
  return details;
}

let closeArmed = false;
let pendingClose = null;
const statusPaths = {
  ready: '<path d="m5 12 4 4 10-10"/>',
  working: '<circle cx="12" cy="12" r="8" opacity=".25"/><path d="M12 4a8 8 0 0 1 8 8"/>',
  attention: '<path d="M12 7v6m0 4h.01"/><circle cx="12" cy="12" r="9"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};
function statusIcon(state) {
  const span = document.createElement("span");
  span.className = "tab-symbol " + state;
  span.setAttribute("aria-hidden", "true");
  span.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    statusPaths[state] +
    "</svg>";
  return span;
}
function assignSlots() {
  const used = new Set(sessions.filter((s) => !s.closed && s.tabSlot).map((s) => s.tabSlot));
  for (const session of sessions) {
    if (session.closed) {
      delete session.tabSlot;
      continue;
    }
    if (!session.tabSlot) {
      let slot = 1;
      while (used.has(slot)) slot++;
      session.tabSlot = slot;
      used.add(slot);
    }
  }
}
function latestPrompt(session) {
  const message = session.messages.findLast(([role]) => role === "user")?.[1];
  const text =
    typeof message === "string"
      ? message
      : message?.kind === "images"
        ? message.parts
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join(" ")
        : "";
  const short = text.replace(/\s+/g, " ").trim();
  return short.length > 100 ? short.slice(0, 99) + "…" : short;
}
function renderTabs() {
  assignSlots();
  $("status-list").replaceChildren();
  sessions.forEach((s, i) => {
    if (s.closed) return;
    const index = String(s.tabSlot).padStart(2, "0");
    const state = s.demoState || "ready";
    const label =
      state === "working" ? "Working" : state === "attention" ? "Needs attention" : "Ready";
    const tab = document.createElement("div");
    tab.className =
      "status-tab" +
      (i === selected ? " active" : "") +
      (i === selected && closeArmed ? " close-armed" : "");
    tab.dataset.index = String(i);
    const select = document.createElement("button");
    select.type = "button";
    select.className = "tab-select";
    select.setAttribute(
      "aria-label",
      "Session " +
        index +
        ", " +
        label +
        (i === selected ? ", selected. Activate to show close." : ""),
    );
    select.setAttribute("aria-pressed", String(i === selected));
    select.title =
      (withDistill ? "" : index + " · ") +
      label +
      "\n" +
      s.directory.replace("/home/you", "~") +
      (latestPrompt(s) ? "\n" + latestPrompt(s) : "");
    if (withDistill)
      select.setAttribute(
        "aria-label",
        label + ", " + s.directory + (i === selected ? ", selected. Activate to show close." : ""),
      );
    const number = document.createElement("span");
    number.textContent = index;
    if (!withDistill) select.append(number);
    const armed = i === selected && closeArmed;
    if (!armed) select.append(statusIcon(state));
    select.onclick = () => {
      if (selected === i) {
        closeArmed = !closeArmed;
        renderTabs();
        $("status-list")
          .querySelector('[data-index="' + i + '"] button')
          .focus();
      } else {
        selected = i;
        closeArmed = false;
        render();
      }
    };
    if (!withDistill || !armed) tab.append(select);
    if (armed) {
      const close = document.createElement("button");
      close.type = "button";
      close.className = "tab-close";
      close.setAttribute(
        "aria-label",
        withDistill ? "Close current session" : "Close session " + index,
      );
      close.title = withDistill ? "Close current session" : "Close session " + index;
      close.append(statusIcon("close"));
      close.onclick = () => showClose(i);
      tab.append(close);
    }
    $("status-list").append(tab);
  });
}
function showClose(index) {
  pendingClose = index;
  const running = sessions[index].demoState === "working";
  $("close-session-number").textContent =
    (withDistill ? "" : String(sessions[index].tabSlot).padStart(2, "0") + " · ") +
    sessions[index].directory.replace("/home/you", "~");
  $("close-session-title").textContent = running ? "Stop and close?" : "Close session?";
  const excerpt = latestPrompt(sessions[index]);
  $("close-session-copy").textContent = excerpt ? "“" + excerpt + "”" : "";
  $("close-session-copy").hidden = !excerpt;
  $("confirm-session-close").textContent = running ? "Stop & close" : "Close";
  $("close-session-dialog").showModal();
  $("cancel-session-close").focus();
}
$("cancel-session-close").onclick = () => $("close-session-dialog").close();
$("close-session-dialog").addEventListener("close", () => {
  pendingClose = null;
  closeArmed = false;
  renderTabs();
  const current = $("status-list").querySelector(".active .tab-select");
  (current || $("new-mobile")).focus();
});
$("confirm-session-close").onclick = () => {
  if (pendingClose === null) return;
  const index = pendingClose;
  sessions[index].closed = true;
  sessions[index].demoState = "ready";
  const remaining = sessions.map((s, i) => (s.closed ? -1 : i)).filter((i) => i >= 0);
  selected = remaining.find((i) => i > index) ?? remaining.at(-1) ?? index;
  closeArmed = false;
  render();
  $("close-session-dialog").close();
};
document.addEventListener("click", (event) => {
  if (
    closeArmed &&
    !event.composedPath().includes($("status-list")) &&
    !event.composedPath().includes($("close-session-dialog"))
  ) {
    closeArmed = false;
    renderTabs();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("close-session-dialog").open && closeArmed) {
    closeArmed = false;
    renderTabs();
    $("status-list").querySelector(".active .tab-select")?.focus();
  }
});
const exampleMemories = [
  {
    title: "Keep the interface lean",
    body: "Design for mobile first. Use lightweight text actions and keep the composer compact.",
  },
  {
    title: "Dwell’s visual direction",
    body: "Use cream paper, teal controls and lavender accents. Keep the same body text size for both speakers.",
  },
];
$("memory-search").oninput = () => {
  const query = $("memory-search").value.trim().toLowerCase();
  $("memory-results").replaceChildren();
  const matches = query
    ? exampleMemories.filter((item) => (item.title + " " + item.body).toLowerCase().includes(query))
    : [];
  for (const item of matches) {
    const details = document.createElement("details");
    details.className = "memory-note";
    const title = document.createElement("summary");
    title.textContent = item.title;
    const body = document.createElement("p");
    body.textContent = item.body;
    details.append(title, body);
    $("memory-results").append(details);
  }
  $("memory-search-hint").hidden = matches.length > 0;
  $("memory-search-hint").textContent = query
    ? "No matching example memories."
    : "Find what you want to carry forward.";
};
$("reopen-session").onclick = () => {
  sessions[selected].closed = false;
  render();
  editor.focus();
};
$("preview-mode").onchange = () => {
  withDistill = $("preview-mode").value === "distill";
  const url = new URL(location.href);
  url.searchParams.set("view", withDistill ? "distill" : "standalone");
  history.replaceState(null, "", url);
  render();
};
function render() {
  assignSlots();
  syncDraft();
  currentModel = sessions[selected].model ?? models[0];
  currentThinking = sessions[selected].thinkingLevel ?? "medium";
  updateModelLabel();
  document.body.classList.toggle("with-distill", withDistill);
  closeArmed = false;
  $("preview-mode").value = withDistill ? "distill" : "standalone";
  $("sessions-heading").textContent = withDistill ? "SESSIONS" : "CONVERSATIONS";
  $("memory-preview").hidden = !withDistill;
  $("conversation-heading").hidden = withDistill;
  $("session-list").hidden = withDistill;

  $("selected-directory").hidden = withDistill;

  $("session-list").replaceChildren();
  $("status-list").replaceChildren();
  $("conversation").replaceChildren();
  $("session-count").textContent = String(sessions.length).padStart(2, "0");
  sessions.forEach((s, i) => {
    const row = document.createElement("button");
    row.className = "name-row" + (i === selected && !s.closed ? " active" : "");
    const slot = document.createElement("span");
    slot.className = "sidebar-slot";
    slot.textContent = s.closed ? "" : String(s.tabSlot).padStart(2, "0");
    const title = document.createElement("span");
    title.className = "session-title";
    title.textContent = [
      s.directory.split("/").filter(Boolean).at(-1) || "/",
      (s.model ?? models[0]).name,
      levelNames[s.thinkingLevel ?? "medium"],
    ].join(" · ");
    row.title = title.textContent;
    row.setAttribute("aria-label", title.textContent);
    row.append(slot, title);
    row.onclick = () => {
      s.closed = false;
      selected = i;
      closeArmed = false;
      render();
      nav(false);
    };
    $("session-list").append(row);
  });
  renderTabs();
  const hasOpen = sessions.some((s) => !s.closed);
  document.querySelector("footer").hidden = !hasOpen;
  if (!hasOpen) {
    $("conversation").replaceChildren();
    const empty = document.createElement("div");
    empty.className = "empty all-closed";
    const h = document.createElement("h1");
    h.textContent = "Room for something new.";
    const p = document.createElement("p");
    p.textContent = withDistill
      ? "Start a fresh conversation with ＋."
      : "Open a conversation from the sidebar, or start fresh with ＋.";
    empty.append(h, p);
    $("conversation").append(empty);
    return;
  }
  $("composer").hidden = Boolean(sessions[selected].closed);
  $("closed-session").hidden = !sessions[selected].closed;
  $("choose-model").hidden = Boolean(sessions[selected].closed);
  $("attachment-notice").hidden = true;
  updateComposer();
  $("selected-directory").textContent = sessions[selected].directory;
  $("composer-directory").textContent = sessions[selected].directory.replace("/home/you", "~");
  $("composer-directory").title = sessions[selected].directory;
  const context = sessionDetails(sessions[selected]);
  if (context) $("conversation").append(context);
  if (!sessions[selected].messages.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = "<h1>Start where you are.</h1><p>What would you like to work on?</p>";
    $("conversation").append(empty);
  }
  sessions[selected].messages.forEach(([r, t]) => message(r, t));
  $("connection-badge").textContent = "Local UI demo";
}
function nav(open) {
  $("rail").classList.toggle("open", open);
  $("scrim").hidden = !open;
  $("open-nav").setAttribute("aria-expanded", String(open));
}
$("open-nav").onclick = () => nav(true);
$("close-nav").onclick = $("scrim").onclick = () => nav(false);
const dirs = ["/home/you/projects/pi-dwell", "/home/you/projects/website", "/home/you/notes"];
function directories() {
  $("directories").replaceChildren();
  dirs.forEach((path) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "directory-choice" + ($("directory").value === path ? " selected" : "");
    labelWithIcon(b, path.split("/").at(-1), $("directory").value === path ? "check" : "open");
    b.onclick = () => {
      $("directory").value = path;
      directories();
    };
    $("directories").append(b);
  });
}
function newSession() {
  nav(false);
  $("directory").value = sessions[selected].directory;
  directories();
  $("new-dialog").showModal();
  $("close-new").focus();
}
$("new-session").onclick = $("new-mobile").onclick = newSession;
$("close-new").onclick = () => $("new-dialog").close();
$("browse").onclick = directories;
$("new-form").onsubmit = (e) => {
  e.preventDefault();
  const directory = $("directory").value.trim();
  if (!directory) return;
  sessions.push({ directory, messages: [] });
  selected = sessions.length - 1;
  $("new-dialog").close();
  render();
};
function updateModelLabel() {
  $("model-label").textContent = currentModel.name;
  $("thinking-label").textContent = "· " + levelNames[currentThinking];
  $("choose-model").setAttribute(
    "aria-label",
    "Choose model and thinking level, current: " +
      currentModel.name +
      ", " +
      levelNames[currentThinking],
  );
  $("choose-model").title = currentModel.name + " · " + levelNames[currentThinking];
}
function optionButton(title, subtitle, current, kind) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "model-option " + kind + (current ? " selected" : "");
  b.setAttribute("aria-pressed", String(current));
  const text = document.createElement("span");
  const name = document.createElement("strong");
  name.textContent = title;
  const detail = document.createElement("small");
  detail.textContent = subtitle;
  text.append(name, detail);
  b.append(text);
  const end = document.createElement("span");
  end.className = current ? "tick" : "option-arrow";
  if (current || kind === "model-choice") end.append(actionIcon(current ? "check" : "right"));
  b.append(end);
  return b;
}
function modelOptions() {
  const query = $("model-search").value.toLowerCase();
  $("model-options").replaceChildren();
  models
    .filter((m) => (m.name + " " + m.provider).toLowerCase().includes(query))
    .forEach((m) => {
      const b = optionButton(m.name, m.provider, m === currentModel, "model-choice");
      b.onclick = () => showThinking(m);
      $("model-options").append(b);
    });
  if (!$("model-options").childElementCount) $("model-options").textContent = "No matching models.";
}
function showModelStep() {
  pendingModel = null;
  $("model-step").hidden = false;
  $("model-step").textContent = "MODEL";
  $("model-title").textContent = "Model";
  $("model-search").hidden = false;
  $("back-models").hidden = true;
  modelOptions();
  $("close-model").focus();
}
function showThinking(model) {
  pendingModel = model;
  $("model-step").hidden = true;
  $("model-title").textContent = "Thinking level";
  $("model-search").hidden = true;
  $("back-models").hidden = false;
  labelWithIcon($("back-models"), model.name, "left", true);
  $("model-options").replaceChildren();
  for (const level of model.levels) {
    const current = model === currentModel && level === currentThinking;
    const b = optionButton(levelNames[level], levelCopy[level], current, "thinking-choice");
    b.dataset.level = level;
    b.onclick = () => {
      currentModel = model;
      currentThinking = level;
      sessions[selected].model = model;
      sessions[selected].thinkingLevel = level;
      $("model-dialog").close();
      render();
    };
    $("model-options").append(b);
  }
  $("back-models").focus();
}
$("choose-model").onclick = () => {
  $("model-search").value = "";
  showModelStep();
  $("model-dialog").showModal();
  $("close-model").focus();
};
$("back-models").onclick = showModelStep;
$("close-model").onclick = () => $("model-dialog").close();
$("model-dialog").addEventListener("close", () => {
  pendingModel = null;
});
$("model-search").oninput = modelOptions;
updateModelLabel();
for (const dialog of document.querySelectorAll("dialog"))
  dialog.addEventListener("click", (e) => {
    const r = dialog.getBoundingClientRect();
    if (
      e.target === dialog &&
      (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
    )
      dialog.close();
  });
// Text and separate image attachments preview. Files stay in this browser tab.
const editor = $("message");
let imageSequence = 0;
let draftSession = sessions[selected];
function readParts() {
  const parts = [];
  let text = "";
  const flush = () => {
    if (text) {
      parts.push({ type: "text", text });
      text = "";
    }
  };
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      text += "\n";
      return;
    }
    if ((node.tagName === "DIV" || node.tagName === "P") && text && !text.endsWith("\n"))
      text += "\n";
    for (const child of node.childNodes) walk(child);
  };
  for (const node of editor.childNodes) walk(node);
  flush();
  for (const image of sessions[selected].attachments || []) parts.push({ type: "image", image });
  return parts;
}
function updateComposer() {
  const parts = readParts();
  const hasText = parts.some((p) => p.type === "text" && p.text.trim());
  const attachments = sessions[selected].attachments || [];
  editor.dataset.empty = String(!hasText);
  $("send").disabled =
    (!hasText && !attachments.length) || Boolean(sessions[selected].pendingImages);
  const tray = $("image-attachments");
  tray.replaceChildren(...attachments.map((image) => imageChip(image, attachments)));
  tray.hidden = !attachments.length;
  const composer = $("composer");
  composer.classList.remove("expanded");
  editor.style.height = innerWidth <= 760 ? "28px" : "30px";
  const multiline =
    editor.scrollHeight > (innerWidth <= 760 ? 34 : 36) ||
    editor.innerText.includes("\n") ||
    attachments.length > 0;
  composer.classList.toggle("expanded", multiline);
  const limit = Math.min(innerWidth <= 760 ? 120 : 156, Math.max(78, innerHeight * 0.22));
  editor.style.height = Math.min(editor.scrollHeight, limit) + "px";
  editor.style.overflowY = editor.scrollHeight > limit ? "auto" : "hidden";
}

function syncDraft() {
  if (draftSession === sessions[selected]) return;
  draftSession.draftNodes = Array.from(editor.childNodes);
  editor.replaceChildren(...(sessions[selected].draftNodes || []));
  draftSession = sessions[selected];
  $("attachment-notice").hidden = true;
  updateComposer();
}
function currentRange() {
  const selection = window.getSelection();
  if (selection?.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer))
    return selection.getRangeAt(0).cloneRange();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  return range;
}
function selectRange(range) {
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  editor.focus();
}
function showImage(image) {
  $("preview-image").src = image.url;
  $("preview-image").alt = image.name;
  $("image-title").textContent = image.label || image.name;
  $("image-dialog").showModal();
}
$("close-image").onclick = () => $("image-dialog").close();
$("image-dialog").addEventListener("close", () => {
  $("preview-image").removeAttribute("src");
});
function imageChip(image, attachments) {
  const pasted = attachments.filter((item) => item.name === "Pasted image");
  const label =
    image.name === "Pasted image" && pasted.length > 1
      ? "Pasted image " + (pasted.indexOf(image) + 1)
      : image.name;
  image.label = label;
  const chip = document.createElement("div");
  chip.className = "image-attachment";
  chip.dataset.imageId = image.id;
  const preview = document.createElement("button");
  preview.type = "button";
  preview.className = "image-chip-preview";
  preview.setAttribute("aria-label", "Preview " + label);
  preview.title = label;
  preview.onclick = () => showImage(image);
  preview.textContent = label;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "image-chip-remove";
  remove.append(actionIcon("close"));
  remove.setAttribute("aria-label", "Remove " + label);
  remove.onclick = () => {
    sessions[selected].attachments = sessions[selected].attachments.filter(
      (item) => item !== image,
    );
    URL.revokeObjectURL(image.url);
    updateComposer();
    editor.focus();
  };
  chip.append(preview, remove);
  return chip;
}

async function addImages(files, pasted = false) {
  const session = sessions[selected];
  let failures = [];
  session.pendingImages = (session.pendingImages || 0) + 1;
  updateComposer();
  try {
    for (const file of files) {
      if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
        failures.push("Choose PNG, JPEG, WebP or GIF images.");
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        failures.push("Each image can be up to 10 MB.");
        continue;
      }
      const url = URL.createObjectURL(file);
      try {
        const check = new Image();
        check.src = url;
        await check.decode();
      } catch {
        URL.revokeObjectURL(url);
        failures.push("This image could not be opened.");
        continue;
      }
      if (sessions[selected] !== session) {
        URL.revokeObjectURL(url);
        return;
      }
      if ((session.attachments || []).length >= 4) {
        URL.revokeObjectURL(url);
        failures.push("You can attach up to 4 images per message.");
        continue;
      }
      const number = ++imageSequence;
      const generic =
        !file.name ||
        /^(?:image|pasted[- ]?image|clipboard|blob)(?:[-_ ]?\d+)?(?:\.(?:png|jpe?g|webp|gif))?$/i.test(
          file.name,
        );
      const name = pasted && generic ? "Pasted image" : file.name || "Image";
      const image = { id: String(number), number, name, url };
      session.attachments ??= [];
      session.attachments.push(image);
      updateComposer();
    }
    $("attachment-notice").textContent = [...new Set(failures)].join(" ");
    $("attachment-notice").hidden = !failures.length;
  } finally {
    session.pendingImages--;
    if (sessions[selected] === session) updateComposer();
  }
}
$("attach-image").onclick = () => $("image-files").click();
$("image-files").onchange = () => {
  void addImages(Array.from($("image-files").files || []));
  $("image-files").value = "";
};
editor.addEventListener("paste", (event) => {
  event.preventDefault();
  const files = Array.from(event.clipboardData?.files || []);
  const range = currentRange();
  if (files.length) {
    void addImages(files, true);
    return;
  }
  const text = event.clipboardData?.getData("text/plain") || "";
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selectRange(range);
  updateComposer();
});
editor.addEventListener("drop", (event) => {
  event.preventDefault();
});
editor.addEventListener("input", updateComposer);
window.addEventListener("resize", updateComposer);
$("composer").onsubmit = (event) => {
  event.preventDefault();
  if (sessions[selected].closed || sessions[selected].pendingImages) return;
  const parts = readParts();
  if (!parts.some((p) => p.type === "image" || p.text.trim())) return;
  const message = parts.some((p) => p.type === "image")
    ? { kind: "images", parts }
    : parts.map((p) => p.text).join("");
  sessions[selected].messages.push(
    ["user", message],
    ["assistant", "This is a local UI preview. Pi is not connected."],
  );
  editor.replaceChildren();
  draftSession.draftNodes = [];
  draftSession.attachments = [];
  $("attachment-notice").hidden = true;
  updateComposer();
  render();
  $("scroll").scrollTop = $("scroll").scrollHeight;
};
updateComposer();

const markdownUser =
  "Show me the common Markdown blocks. Long messages should use the full chat width, while short messages stay compact. Keep the same body font size for both of us.";
const markdownSample = [
  "# Markdown preview",
  "Ordinary Pi text uses the same size as your message. **Bold**, *italic*, ~~strikethrough~~ and `inline code` keep their own emphasis.",
  "## Lists and tasks",
  "- Mobile first\n- One continuous reply\n  - Commands and output stay together\n  - Long lines scroll inside their block",
  "1. Choose a directory\n2. Start a conversation",
  "- [x] Match user and Pi body sizes\n- [ ] Review the mobile preview",
  "## Quoted text",
  "> A quote belongs inside the reply.\n>\n> It can contain **formatting** and multiple paragraphs.",
  "## Code and plain text",
  "```text\nproject/\n  src/\n    client.ts\n  README.md\n\nWhitespace and indentation stay intact.\n```",
  '```ts\nconst message = "A long code line keeps its layout and scrolls within this block instead of widening the chat page.";\nconsole.log(message);\n```',
  "    Indented code works too.\n    <div>This stays literal text.</div>",
  "## Table",
  "| Element | Presentation | Behavior |\n| :--- | :--- | :--- |\n| User message | Soft lilac background | Full width when needed |\n| Pi response | Plain page background | Same body text size |\n| Long code or tables | Contained block | Horizontal scrolling |",
  "---",
  "### Links and line breaks",
  "[Visit the Pi project](https://github.com/earendil-works/pi) or use an autolink: https://example.com.\n\nFirst line with a hard break.  \nSecond line.",
  "A final paragraph after the blocks.",
].join("\n\n");

if (new URLSearchParams(location.search).has("markdown")) {
  sessions[0].messages = [
    ["user", markdownUser],
    ["assistant", markdownSample],
  ];
}
sessions[0].context = [
  {
    path: "~/AGENTS.md",
    content: "# Home layout\n\nUse `~/Projects/` for repositories and `~/Work/` for experiments.",
  },
  {
    path: "~/Projects/example/AGENTS.md",
    content:
      "# Project guidance\n\n- Keep changes focused.\n- Follow the existing code style.\n- Verify the behavior you change.",
  },
];
sessions.push(
  {
    directory: "/home/you/projects/website",
    messages: [["assistant", "Example session: a response is in progress."]],
    demoState: "working",
  },
  {
    directory: "/home/you/notes",
    messages: [["assistant", "Example session: the last response needs attention."]],
    demoState: "attention",
  },
);
$("dismiss-notice").hidden = true;
render();

if (new URLSearchParams(location.search).has("images")) {
  const canvas = document.createElement("canvas");
  canvas.width = 360;
  canvas.height = 240;
  const paint = canvas.getContext("2d");
  paint.fillStyle = "#f3eee3";
  paint.fillRect(0, 0, 360, 240);
  paint.fillStyle = "#3e8983";
  paint.fillRect(20, 20, 320, 40);
  paint.fillStyle = "#fbf8f0";
  paint.font = "bold 15px monospace";
  paint.fillText("Layout reference", 32, 46);
  paint.fillStyle = "#ccbae2";
  paint.fillRect(20, 76, 90, 144);
  paint.fillStyle = "#e0ebe3";
  paint.fillRect(126, 76, 214, 90);
  paint.fillStyle = "#82796c";
  paint.font = "12px monospace";
  paint.fillText("Example image", 126, 198);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  await addImages([new File([blob], "layout-reference.png", { type: "image/png" })]);
}
