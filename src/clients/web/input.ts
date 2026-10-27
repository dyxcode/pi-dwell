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
  scroll: HTMLElement,
): { resize(): void; dispose(): void } {
  const initialRows = input.rows;
  const initialHeight = input.style.height;
  const initialOverflowY = input.style.overflowY;
  const visualViewport = window.visualViewport;
  const body = document.body;
  const initialBodyHeight = body.style.height;
  const initialBodyTop = body.style.top;
  let previousScrollClientHeight = scroll.clientHeight;
  let previousBottomGap = Math.max(0, scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop);
  let viewportFrame: number | undefined;
  let disposed = false;
  let usingVisualViewportFallback = false;
  let hold: BackspaceHold | null = null;
  let composing = false;
  let editing = false;
  let sawInput = false;
  let notifyingSyntheticInput = false;

  const restoreBodyViewport = (): void => {
    body.style.height = initialBodyHeight;
    body.style.top = initialBodyTop;
  };

  const rememberScrollPosition = (): void => {
    // A native viewport resize changes clientHeight before its queued resize callback.
    // Keep the last position until that callback has carried it into the new layout.
    if (scroll.clientHeight !== previousScrollClientHeight) return;
    previousBottomGap = Math.max(0, scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop);
  };

  const resize = (): void => {
    if (disposed) return;
    // Anchor the conversation to its lower edge: keyboard movement carries the
    // messages with the composer, preserving how far back the reader has scrolled.
    const bottomGap =
      scroll.clientHeight === previousScrollClientHeight
        ? Math.max(0, scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop)
        : previousBottomGap;
    const mobile = window.innerWidth <= 760;
    // interactive-widget=resizes-content lets 100dvh follow the keyboard natively.
    // Use visualViewport only when it proves that content is still occluded, as on
    // browsers that resize the visual viewport without resizing the layout viewport.
    if (mobile && visualViewport && Math.abs(visualViewport.scale - 1) >= 0.01) {
      // Pinch zoom changes the visual viewport, not the conversation's layout.
    } else if (
      mobile &&
      visualViewport &&
      (document.activeElement === input || usingVisualViewportFallback)
    ) {
      restoreBodyViewport();
      const bodyBounds = body.getBoundingClientRect();
      const visualTop = visualViewport.offsetTop;
      const visualBottom = visualTop + visualViewport.height;
      if (bodyBounds.top < visualTop - 1 || bodyBounds.bottom > visualBottom + 1) {
        body.style.height = `${visualViewport.height}px`;
        body.style.top = `${visualTop}px`;
        usingVisualViewportFallback = true;
      } else {
        usingVisualViewportFallback = false;
      }
    } else {
      restoreBodyViewport();
      usingVisualViewportFallback = false;
    }
    input.rows = 1;
    const viewportHeight = mobile ? body.clientHeight : window.innerHeight;
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
    scroll.scrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight - bottomGap);
    previousScrollClientHeight = scroll.clientHeight;
    previousBottomGap = Math.max(0, scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop);
  };

  const viewportChanged = (): void => {
    if (viewportFrame !== undefined || disposed) return;
    viewportFrame = requestAnimationFrame(() => {
      viewportFrame = undefined;
      resize();
    });
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
  scroll.addEventListener("scroll", rememberScrollPosition, { passive: true });
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
  window.addEventListener("resize", viewportChanged);
  window.addEventListener("pageshow", viewportChanged);
  visualViewport?.addEventListener("resize", viewportChanged);
  visualViewport?.addEventListener("scroll", viewportChanged);

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
      scroll.removeEventListener("scroll", rememberScrollPosition);
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
      window.removeEventListener("resize", viewportChanged);
      window.removeEventListener("pageshow", viewportChanged);
      visualViewport?.removeEventListener("resize", viewportChanged);
      visualViewport?.removeEventListener("scroll", viewportChanged);
      if (viewportFrame !== undefined) cancelAnimationFrame(viewportFrame);
      body.style.height = initialBodyHeight;
      body.style.top = initialBodyTop;
      input.rows = initialRows;
      input.style.height = initialHeight;
      input.style.overflowY = initialOverflowY;
    },
  };
}
