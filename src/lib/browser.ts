import { UUID } from "crypto";

// crypto.randomUUID is only exposed in secure contexts (HTTPS/localhost); fall
// back to a v4 UUID built from getRandomValues, which works everywhere.
export function randomUUID(): UUID {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-") as UUID;
}

// navigator.clipboard is also secure-context only; fall back to
// execCommand("copy") against an off-screen textarea.
export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    return Promise.resolve();
  } catch (err) {
    return Promise.reject(err);
  } finally {
    document.body.removeChild(textarea);
  }
}
