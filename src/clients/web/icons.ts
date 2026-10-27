/// <reference lib="dom" />

type ActionIcon = "up" | "left" | "right" | "open" | "plus" | "check" | "close" | "stop" | "retry";

export function actionIcon(name: ActionIcon): SVGSVGElement {
  const paths = {
    stop: "M3 3h6v6H3z",
    retry: "M9.5 4A4 4 0 1 0 10 7M9.5 1v3h-3",
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
export function labelWithIcon(
  button: HTMLElement,
  text: string,
  name: ActionIcon,
  leading = false,
): void {
  const label = document.createElement("span");
  label.className = "control-label";
  label.textContent = text;
  const icon = actionIcon(name);
  button.classList.add("icon-label");
  button.replaceChildren(...(leading ? [icon, label] : [label, icon]));
}
