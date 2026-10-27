/// <reference lib="dom" />
import {
  type ImageContent,
  imageByteLength,
  isImageContent,
  MAX_IMAGE_COUNT,
  MAX_IMAGE_TOTAL_BYTES,
} from "../../shared/images.ts";

interface Attachment {
  id: string;
  name: string;
  url: string;
  image: ImageContent;
}
export class Attachments {
  #drafts = new Map<string, Attachment[]>();
  #pending = new Set<string>();
  #session: string | null = null;
  #disabled = true;
  #intakeDisabled = true;
  #generation = 0;
  readonly #input: HTMLInputElement;
  readonly #tray: HTMLElement;
  readonly #button: HTMLButtonElement;
  readonly #change: () => void;
  readonly #error: (error: Error) => void;
  readonly #preview: (url: string, name: string) => void;
  constructor(options: {
    input: HTMLInputElement;
    tray: HTMLElement;
    button: HTMLButtonElement;
    change: () => void;
    error: (error: Error) => void;
    preview: (url: string, name: string) => void;
  }) {
    this.#input = options.input;
    this.#tray = options.tray;
    this.#button = options.button;
    this.#change = options.change;
    this.#error = options.error;
    this.#preview = options.preview;
    this.#button.onclick = () => this.#input.click();
    this.#input.onchange = () => {
      void this.add(Array.from(this.#input.files ?? []));
      this.#input.value = "";
    };
  }
  select(id: string | null): void {
    this.#session = id;
    this.#render();
  }
  setDisabled(disabled: boolean, intakeDisabled = disabled): void {
    const changed = this.#disabled !== disabled;
    this.#disabled = disabled;
    this.#intakeDisabled = disabled || intakeDisabled;
    this.#button.disabled = this.#intakeDisabled || this.busy;
    if (changed) this.#render();
  }
  get busy(): boolean {
    return this.#session !== null && this.#pending.has(this.#session);
  }
  get count(): number {
    return this.#session ? (this.#drafts.get(this.#session)?.length ?? 0) : 0;
  }
  payload(): ImageContent[] {
    return this.#session ? (this.#drafts.get(this.#session) ?? []).map((item) => item.image) : [];
  }
  clear(id: string): void {
    for (const item of this.#drafts.get(id) ?? []) URL.revokeObjectURL(item.url);
    this.#drafts.delete(id);
    if (this.#session === id) this.#render();
  }
  dispose(): void {
    this.#generation++;
    this.#pending.clear();
    for (const id of this.#drafts.keys()) this.clear(id);
    this.#session = null;
    this.#render();
  }
  paste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!files.length) return;
    event.preventDefault();
    if (!this.#intakeDisabled) void this.add(files, true);
  }
  async add(files: File[], pasted = false): Promise<void> {
    const id = this.#session;
    if (!id || this.#intakeDisabled || this.#pending.has(id)) return;
    const generation = this.#generation;
    this.#pending.add(id);
    this.#change();
    try {
      for (const file of files) {
        const items = this.#drafts.get(id) ?? [];
        if (items.length >= MAX_IMAGE_COUNT)
          throw new Error(`Attach up to ${MAX_IMAGE_COUNT} images.`);
        if (
          file.size + items.reduce((sum, item) => sum + imageByteLength(item.image), 0) >
          MAX_IMAGE_TOTAL_BYTES
        )
          throw new Error("Images can total up to 5 MiB per message.");
        if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type))
          throw new Error("Choose PNG, JPEG, WebP or GIF images.");
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === "string"
              ? resolve(reader.result.slice(reader.result.indexOf(",") + 1))
              : reject(new Error("Could not read image."));
          reader.onerror = () => reject(new Error("Could not read image."));
          reader.readAsDataURL(file);
        });
        const image = { type: "image", data, mimeType: file.type };
        if (!isImageContent(image)) throw new Error("The selected file is not a supported image.");
        const url = URL.createObjectURL(file);
        try {
          const preview = new Image();
          preview.src = url;
          await preview.decode();
        } catch {
          URL.revokeObjectURL(url);
          throw new Error("This image could not be opened.");
        }
        if (generation !== this.#generation || this.#session !== id || this.#intakeDisabled) {
          URL.revokeObjectURL(url);
          return;
        }
        const generic =
          !file.name ||
          /^(?:image|pasted[- ]?image|clipboard|blob)(?:[-_ ]?\d+)?(?:\.(?:png|jpe?g|webp|gif))?$/i.test(
            file.name,
          );
        items.push({
          id: crypto.randomUUID(),
          name: pasted && generic ? "Pasted image" : file.name || "Image",
          url,
          image,
        });
        this.#drafts.set(id, items);
        this.#render();
      }
    } catch (error) {
      if (generation === this.#generation)
        this.#error(error instanceof Error ? error : new Error("Could not add image."));
    } finally {
      if (generation === this.#generation) {
        this.#pending.delete(id);
        this.#change();
      }
    }
  }
  #render(): void {
    const items = this.#session ? (this.#drafts.get(this.#session) ?? []) : [];
    this.#tray.replaceChildren();
    this.#tray.hidden = items.length === 0;
    const pasted = items.filter((item) => item.name === "Pasted image");
    for (const item of items) {
      const label =
        item.name === "Pasted image" && pasted.length > 1
          ? `Pasted image ${pasted.indexOf(item) + 1}`
          : item.name;
      const row = document.createElement("div");
      row.className = "image-attachment";
      const view = document.createElement("button");
      view.type = "button";
      view.className = "image-chip-preview";
      view.textContent = label;
      view.title = label;
      view.setAttribute("aria-label", `Preview ${label}`);
      view.onclick = () => this.#preview(item.url, label);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "image-chip-remove";
      remove.textContent = "×";
      remove.disabled = this.#disabled;
      remove.setAttribute("aria-label", `Remove ${label}`);
      remove.onclick = () => {
        const id = this.#session;
        if (!id) return;
        this.#drafts.set(
          id,
          items.filter((value) => value.id !== item.id),
        );
        URL.revokeObjectURL(item.url);
        this.#render();
        this.#change();
      };
      row.append(view, remove);
      this.#tray.append(row);
    }
  }
}
