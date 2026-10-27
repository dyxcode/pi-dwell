/// <reference lib="dom" />

function elementIdentity(element: Element): string | null {
  const tag = `${element.namespaceURI ?? ""}:${element.localName}`;
  for (const attribute of ["data-key", "data-entry-id", "data-session-id"]) {
    const value = element.getAttribute(attribute);
    if (value !== null) return `${attribute}:${tag}:${value}`;
  }
  return null;
}

function compatible(left: Node, right: Node): boolean {
  if (left.nodeType !== right.nodeType) return false;
  if (left instanceof Element && right instanceof Element)
    return left.namespaceURI === right.namespaceURI && left.localName === right.localName;
  return left.nodeType === Node.TEXT_NODE;
}

function synchronizeAttributes(current: Element, desired: Element): void {
  for (const attribute of Array.from(current.attributes)) {
    if (!desired.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  }
  for (const attribute of Array.from(desired.attributes)) {
    if (current.getAttribute(attribute.name) !== attribute.value)
      current.setAttribute(attribute.name, attribute.value);
  }
}

function hasSamePreserveMarker(current: Element, desired: Element): boolean {
  const currentMarker = current.getAttribute("data-preserve");
  const desiredMarker = desired.getAttribute("data-preserve");
  return (currentMarker !== null || desiredMarker !== null) && currentMarker === desiredMarker;
}

function reconcileElement(current: Element, desired: Element): void {
  const identity = elementIdentity(current);
  const sameRenderVersion =
    identity !== null &&
    identity === elementIdentity(desired) &&
    desired.hasAttribute("data-render-version") &&
    current.getAttribute("data-render-version") === desired.getAttribute("data-render-version");
  const wasOpen = current instanceof HTMLDetailsElement && current.open;

  if (hasSamePreserveMarker(current, desired)) return;

  synchronizeAttributes(current, desired);
  if (current instanceof HTMLElement && desired instanceof HTMLElement)
    current.onclick = desired.onclick;

  if (!sameRenderVersion) reconcileChildren(current, desired);
  if (current instanceof HTMLDetailsElement && desired instanceof HTMLDetailsElement)
    current.open = wasOpen || desired.open;
}

/** Reconcile a freshly rendered child tree while keeping compatible DOM nodes alive. */
export function reconcileChildren(target: Element, desired: ParentNode): void {
  if (target === desired) return;

  const previous = Array.from(target.childNodes);
  const wanted = Array.from(desired.childNodes);
  const keyed = new Map<string, Element[]>();
  for (const child of previous) {
    if (!(child instanceof Element)) continue;
    const identity = elementIdentity(child);
    if (identity === null) continue;
    const matches = keyed.get(identity) ?? [];
    matches.push(child);
    keyed.set(identity, matches);
  }

  const used = new Set<Node>();
  const replaced = new Set<Node>();
  let unkeyedSearchFrom = 0;
  let position: Node | null = target.firstChild;

  for (const desiredChild of wanted) {
    let current: Node | undefined;
    if (desiredChild instanceof Element) {
      const identity = elementIdentity(desiredChild);
      if (identity !== null)
        current = keyed
          .get(identity)
          ?.find((candidate) => !used.has(candidate) && !replaced.has(candidate));
    }

    if (
      current === undefined &&
      !(desiredChild instanceof Element && elementIdentity(desiredChild))
    ) {
      for (let index = unkeyedSearchFrom; index < previous.length; index += 1) {
        const candidate = previous[index];
        if (!candidate || used.has(candidate) || replaced.has(candidate)) continue;
        if (candidate instanceof Element && elementIdentity(candidate) !== null) continue;
        if (!compatible(candidate, desiredChild)) continue;
        current = candidate;
        unkeyedSearchFrom = index + 1;
        break;
      }
    }

    if (
      current instanceof Element &&
      desiredChild instanceof Element &&
      (current.hasAttribute("data-preserve") || desiredChild.hasAttribute("data-preserve")) &&
      !hasSamePreserveMarker(current, desiredChild)
    ) {
      replaced.add(current);
      current = undefined;
    }

    const next = current ?? desiredChild;
    if (current !== undefined) {
      used.add(current);
      if (current instanceof Element && desiredChild instanceof Element)
        reconcileElement(current, desiredChild);
      else if (current instanceof Text && desiredChild instanceof Text) {
        if (current.data !== desiredChild.data) current.data = desiredChild.data;
      }
    }

    if (next !== position) target.insertBefore(next, position);
    position = next.nextSibling;
  }

  for (const child of previous) {
    if (!used.has(child) && child.parentNode === target) target.removeChild(child);
  }
}
