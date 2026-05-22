export const CUSTOM_THEME_NAMES = [
  "cf-brand-dark",
  "cf-brand-light",
  "cf-accented-dark",
  "cf-accented-light",
] as const;

export const BUILTIN_THEMES = [
  "github-dark",
  "github-dark-dimmed",
  "github-light",
  "dracula",
  "dracula-soft",
  "vitesse-dark",
  "vitesse-light",
  "vitesse-black",
  "nord",
  "tokyo-night",
  "one-dark-pro",
  "monokai",
  "slack-dark",
  "solarized-dark",
  "solarized-light",
] as const;

export const THEMES = [...CUSTOM_THEME_NAMES, ...BUILTIN_THEMES] as const;

export type ThemeName = (typeof THEMES)[number];

export const LANGUAGES = [
  "typescript",
  "javascript",
  "tsx",
  "jsx",
  "html",
  "css",
  "json",
  "yaml",
  "toml",
  "markdown",
  "python",
  "rust",
  "go",
  "ruby",
  "php",
  "bash",
  "sql",
  "astro",
  "vue",
  "svelte",
] as const;

export type LanguageName = (typeof LANGUAGES)[number];

export const FONTS = [
  "JetBrains Mono",
  "Fira Code",
  "Geist Mono",
  "monospace",
] as const;

export type FontName = (typeof FONTS)[number];

export interface RenderOptions {
  code: string;
  language: LanguageName;
  filename: string;
  theme: ThemeName;
  fontSize: number;
  fontFamily: FontName;
  padding: number;
  showChrome: boolean;
  showLineNumbers: boolean;
  lineStart?: number;
  lineEnd?: number;
  cornerRadius: number;
  shadow: boolean;
}

export const DEFAULT_OPTIONS: RenderOptions = {
  code: `import { Hono } from "hono";\n\nconst app = new Hono();\n\napp.get("/", (c) => {\n  return c.text("Hello, World!");\n});\n\nexport default app;`,
  language: "typescript",
  filename: "index.ts",
  theme: "cf-accented-dark",
  fontSize: 16,
  fontFamily: "JetBrains Mono",
  padding: 48,
  showChrome: true,
  showLineNumbers: true,
  cornerRadius: 12,
  shadow: true,
};

export function validateOptions(opts: unknown): RenderOptions {
  const o = opts as Record<string, unknown>;

  if (typeof o.code !== "string" || o.code.length === 0) {
    throw new Error("code is required");
  }
  if (o.code.length > 100_000) {
    throw new Error("code must be <= 100KB");
  }
  if (!THEMES.includes(o.theme as ThemeName)) {
    throw new Error(`invalid theme: ${o.theme}`);
  }
  if (!LANGUAGES.includes(o.language as LanguageName)) {
    throw new Error(`invalid language: ${o.language}`);
  }
  if (!FONTS.includes(o.fontFamily as FontName)) {
    throw new Error(`invalid fontFamily: ${o.fontFamily}`);
  }

  const fontSize = Number(o.fontSize);
  if (!Number.isFinite(fontSize) || fontSize < 8 || fontSize > 72) {
    throw new Error("fontSize must be 8-72");
  }
  const padding = Number(o.padding);
  if (!Number.isFinite(padding) || padding < 0 || padding > 200) {
    throw new Error("padding must be 0-200");
  }
  const cornerRadius = Number(o.cornerRadius);
  if (!Number.isFinite(cornerRadius) || cornerRadius < 0 || cornerRadius > 48) {
    throw new Error("cornerRadius must be 0-48");
  }

  return {
    code: o.code as string,
    language: o.language as LanguageName,
    filename: typeof o.filename === "string" ? o.filename : "",
    theme: o.theme as ThemeName,
    fontSize,
    fontFamily: o.fontFamily as FontName,
    padding,
    showChrome: Boolean(o.showChrome),
    showLineNumbers: Boolean(o.showLineNumbers),
    lineStart: o.lineStart ? Number(o.lineStart) : undefined,
    lineEnd: o.lineEnd ? Number(o.lineEnd) : undefined,
    cornerRadius,
    shadow: Boolean(o.shadow),
  };
}
