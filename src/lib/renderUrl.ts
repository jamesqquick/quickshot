import type { RenderOptions } from "./options.js";

// Shared codec for encoding/decoding RenderOptions to/from URL search params.
// Used by the Worker (encoding for headless browser navigation) and the client
// (decoding when ?render=1 is present). Single source of truth for shape.

const RENDER_FLAG = "render";

function encodeCode(code: string): string {
  // UTF-8 safe base64
  const bytes = new TextEncoder().encode(code);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeCode(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeRenderOptions(opts: RenderOptions): URLSearchParams {
  const params = new URLSearchParams();
  params.set(RENDER_FLAG, "1");
  params.set("code", encodeCode(opts.code));
  params.set("language", opts.language);
  params.set("theme", opts.theme);
  if (opts.filename) params.set("filename", opts.filename);
  params.set("fontFamily", opts.fontFamily);
  params.set("fontSize", String(opts.fontSize));
  params.set("padding", String(opts.padding));
  params.set("cornerRadius", String(opts.cornerRadius));
  params.set("showChrome", opts.showChrome ? "1" : "0");
  params.set("showLineNumbers", opts.showLineNumbers ? "1" : "0");
  params.set("shadow", opts.shadow ? "1" : "0");
  if (opts.lineStart !== undefined) params.set("lineStart", String(opts.lineStart));
  if (opts.lineEnd !== undefined) params.set("lineEnd", String(opts.lineEnd));
  return params;
}

export interface DecodedRenderOptions {
  isRenderMode: boolean;
  options: Partial<RenderOptions>;
}

export function decodeRenderOptions(search: string | URLSearchParams): DecodedRenderOptions {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const isRenderMode = params.get(RENDER_FLAG) === "1";
  if (!isRenderMode) return { isRenderMode: false, options: {} };

  const options: Partial<RenderOptions> = {};
  const code = params.get("code");
  if (code) options.code = decodeCode(code);

  const language = params.get("language");
  if (language) options.language = language as RenderOptions["language"];

  const theme = params.get("theme");
  if (theme) options.theme = theme as RenderOptions["theme"];

  const filename = params.get("filename");
  if (filename !== null) options.filename = filename;

  const fontFamily = params.get("fontFamily");
  if (fontFamily) options.fontFamily = fontFamily as RenderOptions["fontFamily"];

  const fontSize = params.get("fontSize");
  if (fontSize) options.fontSize = Number(fontSize);

  const padding = params.get("padding");
  if (padding) options.padding = Number(padding);

  const cornerRadius = params.get("cornerRadius");
  if (cornerRadius) options.cornerRadius = Number(cornerRadius);

  const showChrome = params.get("showChrome");
  if (showChrome !== null) options.showChrome = showChrome === "1";

  const showLineNumbers = params.get("showLineNumbers");
  if (showLineNumbers !== null) options.showLineNumbers = showLineNumbers === "1";

  const shadow = params.get("shadow");
  if (shadow !== null) options.shadow = shadow === "1";

  const lineStart = params.get("lineStart");
  if (lineStart) options.lineStart = Number(lineStart);

  const lineEnd = params.get("lineEnd");
  if (lineEnd) options.lineEnd = Number(lineEnd);

  return { isRenderMode: true, options };
}
