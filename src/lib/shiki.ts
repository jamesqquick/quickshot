import { createHighlighter, type Highlighter } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { BUILTIN_THEMES, LANGUAGES, type ThemeName, type LanguageName } from "./options.js";
import cfBrandDark from "./themes/cf-brand-dark.json";
import cfBrandLight from "./themes/cf-brand-light.json";
import cfAccentedDark from "./themes/cf-accented-dark.json";
import cfAccentedLight from "./themes/cf-accented-light.json";

export const CUSTOM_THEMES = [cfBrandDark, cfBrandLight, cfAccentedDark, cfAccentedLight];

let highlighterPromise: Promise<Highlighter> | null = null;

/**
 * Lazily creates and caches a Shiki highlighter with all allowed
 * themes and languages pre-loaded.
 *
 * Uses the JavaScript regex engine instead of the default Oniguruma WASM
 * engine, which is incompatible with Cloudflare Workers and Vite SSR
 * (WebAssembly.instantiate() is disallowed by the embedder).
 */
export async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [...CUSTOM_THEMES, ...BUILTIN_THEMES],
      langs: [...LANGUAGES],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}

export interface HighlightResult {
  html: string;
  bg: string;
}

export async function highlightCode(
  code: string,
  language: LanguageName,
  theme: ThemeName,
  showLineNumbers: boolean,
  lineStart?: number,
  lineEnd?: number,
): Promise<HighlightResult> {
  const highlighter = await getHighlighter();

  // Slice lines if range specified
  let lines = code.split("\n");
  if (lineStart !== undefined && lineEnd !== undefined) {
    const start = Math.max(1, lineStart) - 1;
    const end = Math.min(lines.length, lineEnd);
    lines = lines.slice(start, end);
  }
  const slicedCode = lines.join("\n");

  const html = highlighter.codeToHtml(slicedCode, {
    lang: language,
    theme,
    transformers: showLineNumbers
      ? [
          {
            line(node, line) {
              // Add line number as a ::before pseudo-element
              const num = (lineStart ?? 1) + line - 1;
              node.properties.style = `${node.properties.style ?? ""};--line-num:'${num} ';`;
              // Make the ::before show the number
              const existing = (node.properties.class as string) ?? "";
              node.properties.class = `${existing} numbered-line`.trim();
            },
          },
        ]
      : [],
  });

  const themeObj = highlighter.getTheme(theme);
  const bg = themeObj.bg ?? "#22272e";

  return { html, bg };
}
