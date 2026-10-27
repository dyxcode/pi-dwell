/// <reference lib="dom" />

interface BackspaceHold {
  start: number;
  last: number;
  caret: number;
}

const MAX_HEIGHT_PX = 154;
const MIN_HEIGHT_PX = 30;
const VIEWPORT_HEIGHT_RATIO = 0.28;

export function setupComposer(
  input: HTMLTextAreaElement,
  form: HTMLFormElement,
): { resize(): void; dispose(): void } {
  const initialRows = input.rows;
  const initialHeight = input.style.height;
  const initialOverflowY = input.style.overflowY;
  const visualViewport = window.visualViewport;
  let disposed = false;
  let hold: BackspaceHold | null = null;
  let composing = false;
  let editing = false;
  let sawInput = false;
  let notifyingSyntheticInput = false;

  const resize = (): void => {
    if (disposed) return;

    input.rows = 1;
    const viewportHeight = visualViewport?.height ?? window.innerHeight;
    const maxHeight = Math.max(
      window.innerWidth <= 760 ? 28 : MIN_HEIGHT_PX,
      Math.min(
        window.innerWidth <= 760 ? 120 : MAX_HEIGHT_PX,
        viewportHeight * VIEWPORT_HEIGHT_RATIO,
      ),
    );
    input.style.height = "0px";
    const contentHeight = input.scrollHeight;
    input.style.height = `${Math.min(contentHeight, maxHeight)}px`;
    input.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  };

  const resetBackspace = (): void => {
    hold = null;
  };

  const onInput = (event: Event): void => {
    resize();
    if (editing) {
      sawInput = true;
      return;
    }
    if (notifyingSyntheticInput) {
      if (hold !== null) hold.caret = input.selectionStart;
      return;
    }
    if (
      hold !== null &&
      "inputType" in event &&
      event.inputType === "deleteContentBackward" &&
      "isComposing" in event &&
      event.isComposing === false &&
      input.selectionStart === input.selectionEnd
    ) {
      hold.caret = input.selectionStart;
      return;
    }
    resetBackspace();
  };

  const supportsNativeDelete = (): boolean => {
    try {
      return (
        typeof document.execCommand === "function" &&
        typeof document.queryCommandSupported === "function" &&
        document.queryCommandSupported("delete")
      );
    } catch {
      return false;
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (
      disposed ||
      !event.isTrusted ||
      event.defaultPrevented ||
      composing ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.key !== "Backspace" ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      input.readOnly ||
      input.disabled ||
      input.selectionStart !== input.selectionEnd
    ) {
      resetBackspace();
      return;
    }

    const now = performance.now();
    if (event.repeat !== true) {
      hold = { start: now, last: now, caret: input.selectionStart };
      return;
    }

    if (hold === null || now - hold.last > 1000 || input.selectionStart !== hold.caret) {
      resetBackspace();
      return;
    }

    hold.last = now;
    const elapsed = now - hold.start;
    const count = elapsed < 1200 ? 1 : elapsed < 2400 ? 2 : elapsed < 4000 ? 4 : 8;
    if (count === 1 || input.selectionStart === 0) return;
    if (!supportsNativeDelete()) {
      resetBackspace();
      return;
    }

    const original = input.value;
    editing = true;
    sawInput = false;
    try {
      for (let index = 0; index < count && input.selectionStart > 0; index += 1) {
        const before = input.value;
        document.execCommand("delete");
        if (input.value === before) break;
      }
    } catch {
      resetBackspace();
    } finally {
      editing = false;
    }

    if (input.value !== original) {
      event.preventDefault();
      if (!sawInput) {
        notifyingSyntheticInput = true;
        try {
          input.dispatchEvent(new Event("input", { bubbles: true }));
        } finally {
          notifyingSyntheticInput = false;
        }
      }
      if (hold !== null) hold.caret = input.selectionStart;
    } else {
      resetBackspace();
    }
  };

  const onCompositionStart = (): void => {
    composing = true;
    resetBackspace();
  };

  const onCompositionEnd = (): void => {
    composing = false;
    resetBackspace();
  };

  const onSelectionChange = (): void => {
    if (
      hold !== null &&
      (input.selectionStart !== hold.caret || input.selectionEnd !== hold.caret)
    ) {
      resetBackspace();
    }
  };

  const onSelect = (): void => {
    if (input.selectionStart !== input.selectionEnd) resetBackspace();
  };

  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onKeyDown);
  input.addEventListener("compositionstart", onCompositionStart);
  input.addEventListener("compositionend", onCompositionEnd);
  input.addEventListener("blur", resetBackspace);
  input.addEventListener("select", onSelect);
  document.addEventListener("keyup", resetBackspace);
  document.addEventListener("pointerdown", resetBackspace);
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("visibilitychange", resetBackspace);
  window.addEventListener("blur", resetBackspace);
  window.addEventListener("resize", resize);
  visualViewport?.addEventListener("resize", resize);

  let observedWidth: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target !== form || entry.contentRect.width === observedWidth) continue;
        observedWidth = entry.contentRect.width;
        resize();
      }
    });
    resizeObserver.observe(form);
  }

  resize();

  return {
    resize,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      resetBackspace();
      resizeObserver?.disconnect();
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", onKeyDown);
      input.removeEventListener("compositionstart", onCompositionStart);
      input.removeEventListener("compositionend", onCompositionEnd);
      input.removeEventListener("blur", resetBackspace);
      input.removeEventListener("select", onSelect);
      document.removeEventListener("keyup", resetBackspace);
      document.removeEventListener("pointerdown", resetBackspace);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("visibilitychange", resetBackspace);
      window.removeEventListener("blur", resetBackspace);
      window.removeEventListener("resize", resize);
      visualViewport?.removeEventListener("resize", resize);
      input.rows = initialRows;
      input.style.height = initialHeight;
      input.style.overflowY = initialOverflowY;
    },
  };
}
