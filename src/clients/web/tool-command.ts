/// <reference lib="dom" />

export interface CommandPresentation {
  preview: string;
  lineCount: number;
  multiline: boolean;
}

function commandLines(command: string): string[] {
  const lines = command.split(/\r\n|\r|\n/);
  if (/(?:\r\n|\r|\n)$/.test(command)) lines.pop();
  return lines.length > 0 ? lines : [""];
}

export function commandPresentation(command: string): CommandPresentation {
  const lines = commandLines(command);
  const multiline = lines.length > 1;
  const preview = multiline
    ? (lines.find((line) => line.trim().length > 0)?.trim() ?? "")
    : command;
  return {
    preview: `$ ${preview}`,
    lineCount: lines.length,
    multiline,
  };
}

export function appendToolCommand(summary: HTMLElement, command: string): HTMLElement | null {
  const presentation = commandPresentation(command);
  const preview = document.createElement("code");
  preview.className = "tool-command-preview";
  preview.textContent = presentation.preview;
  summary.append(preview);

  if (!presentation.multiline) return null;

  const count = document.createElement("span");
  count.className = "tool-command-lines";
  count.textContent = `${presentation.lineCount} lines`;
  summary.append(count);

  const full = document.createElement("pre");
  full.className = "tool-command-full";
  full.textContent = command;
  return full;
}
