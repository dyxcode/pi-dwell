/// <reference lib="dom" />

export const MAX_IMAGE_COUNT = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_TOTAL_BYTES = 5 * 1024 * 1024;

const MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** The JSON-safe image shape accepted by Pi RPC and Dwell turns. */
export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function base64ByteLength(value: string): number | null {
  if (
    value.length === 0 ||
    value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
    value.length % 4 !== 0 ||
    !BASE64.test(value)
  )
    return null;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const byteLength = (value.length / 4) * 3 - padding;
  return byteLength > 0 ? byteLength : null;
}

function decoded(value: string): Uint8Array | null {
  const expectedLength = base64ByteLength(value);
  if (expectedLength === null || expectedLength > MAX_IMAGE_BYTES) return null;
  try {
    const binary = atob(value);
    if (binary.length !== expectedLength || binary.length > MAX_IMAGE_BYTES) return null;
    if (btoa(binary) !== value) return null;
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function signature(bytes: Uint8Array, mimeType: string): boolean {
  const ascii = (start: number, text: string): boolean =>
    [...text].every((character, index) => bytes[start + index] === character.charCodeAt(0));
  switch (mimeType) {
    case "image/png":
      return bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, "PNG\r\n\u001a\n");
    case "image/jpeg":
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/webp":
      return bytes.length >= 12 && ascii(0, "RIFF") && ascii(8, "WEBP");
    case "image/gif":
      return bytes.length >= 6 && (ascii(0, "GIF87a") || ascii(0, "GIF89a"));
    default:
      return false;
  }
}

export function isImageContent(value: unknown): value is ImageContent {
  if (
    !object(value) ||
    Object.keys(value).length !== 3 ||
    !Object.hasOwn(value, "type") ||
    !Object.hasOwn(value, "mimeType") ||
    !Object.hasOwn(value, "data") ||
    value.type !== "image" ||
    typeof value.mimeType !== "string" ||
    !MIME_TYPES.has(value.mimeType) ||
    typeof value.data !== "string"
  )
    return false;
  const bytes = decoded(value.data);
  return bytes !== null && signature(bytes, value.mimeType);
}

export function imageByteLength(value: ImageContent): number {
  const padding = value.data.endsWith("==") ? 2 : value.data.endsWith("=") ? 1 : 0;
  return (value.data.length / 4) * 3 - padding;
}

export function isImageContentArray(value: unknown): value is ImageContent[] {
  if (!Array.isArray(value) || value.length > MAX_IMAGE_COUNT) return false;
  let totalBytes = 0;
  for (const image of value) {
    if (!object(image) || typeof image.data !== "string") return false;
    const bytes = base64ByteLength(image.data);
    if (bytes === null) return false;
    totalBytes += bytes;
    if (totalBytes > MAX_IMAGE_TOTAL_BYTES) return false;
    if (!isImageContent(image)) return false;
  }
  return true;
}
