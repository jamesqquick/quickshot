import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment, EditorSelection } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { createHighlighter } from "shiki";
import { toBlob } from "html-to-image";
import {
  BUILTIN_THEMES,
  LANGUAGES,
  DEFAULT_OPTIONS,
  type RenderOptions,
  type ThemeName,
  type LanguageName,
  type FontName,
} from "../lib/options.js";
import { CUSTOM_THEMES } from "../lib/shiki.js";

// Language extensions map
function getLangExtension(lang: string) {
  switch (lang) {
    case "typescript":
    case "tsx":
      return javascript({ typescript: true, jsx: lang === "tsx" });
    case "javascript":
    case "jsx":
      return javascript({ jsx: lang === "jsx" });
    case "html":
    case "astro":
    case "vue":
    case "svelte":
      return html();
    case "css":
      return css();
    case "json":
      return json();
    case "markdown":
      return markdown();
    case "python":
      return python();
    case "rust":
      return rust();
    default:
      return javascript();
  }
}

// Pull a scope-based color from a Shiki theme object.
// Shiki themes have a `settings` (TextMate) array; the first entry usually has
// foreground/background defaults, and subsequent entries map scopes -> colors.
function getScopeColor(themeObj: any, scopes: string[]): string | undefined {
  const settings = themeObj?.settings ?? themeObj?.tokenColors ?? [];
  for (const scope of scopes) {
    for (const rule of settings) {
      const ruleScope = rule?.scope;
      const scopeList = Array.isArray(ruleScope)
        ? ruleScope
        : typeof ruleScope === "string"
          ? ruleScope.split(",").map((s) => s.trim())
          : [];
      // Match if any rule scope starts with the requested scope
      if (
        scopeList.some(
          (rs: string) => rs === scope || rs.startsWith(`${scope}.`) || rs.startsWith(`${scope} `),
        )
      ) {
        const fg = rule?.settings?.foreground;
        if (fg) return fg;
      }
    }
  }
  return undefined;
}

interface ResolvedTheme {
  bg: string;
  fg: string;
  caret: string;
  selection: string;
  lineHighlight: string;
  gutterBg: string;
  gutterFg: string;
  keyword?: string;
  string?: string;
  number?: string;
  comment?: string;
  function?: string;
  variable?: string;
  type?: string;
  operator?: string;
  punctuation?: string;
  tag?: string;
  attribute?: string;
  property?: string;
  regex?: string;
  constant?: string;
}

function resolveTheme(themeObj: any): ResolvedTheme {
  const bg = themeObj?.bg ?? themeObj?.colors?.["editor.background"] ?? "#22272e";
  const fg = themeObj?.fg ?? themeObj?.colors?.["editor.foreground"] ?? "#e6edf3";
  const colors = themeObj?.colors ?? {};

  // Detect dark vs light to pick selection / line highlight overlays
  const isDark = isColorDark(bg);
  const overlay = (alpha: number) =>
    isDark ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;

  return {
    bg,
    fg,
    caret: colors["editorCursor.foreground"] ?? fg,
    selection: colors["editor.selectionBackground"] ?? overlay(0.18),
    lineHighlight: colors["editor.lineHighlightBackground"] ?? overlay(0.06),
    gutterBg: colors["editorGutter.background"] ?? bg,
    gutterFg: colors["editorLineNumber.foreground"] ?? overlay(0.35),
    keyword: getScopeColor(themeObj, ["keyword", "storage", "storage.type"]),
    string: getScopeColor(themeObj, ["string"]),
    number: getScopeColor(themeObj, ["constant.numeric", "constant"]),
    comment: getScopeColor(themeObj, ["comment"]),
    function: getScopeColor(themeObj, [
      "entity.name.function",
      "support.function",
      "meta.function-call",
    ]),
    variable: getScopeColor(themeObj, ["variable", "variable.other"]),
    type: getScopeColor(themeObj, [
      "entity.name.type",
      "entity.name.class",
      "support.type",
      "support.class",
    ]),
    operator: getScopeColor(themeObj, ["keyword.operator"]),
    punctuation: getScopeColor(themeObj, ["punctuation"]),
    tag: getScopeColor(themeObj, ["entity.name.tag"]),
    attribute: getScopeColor(themeObj, ["entity.other.attribute-name"]),
    property: getScopeColor(themeObj, [
      "variable.other.property",
      "meta.object-literal.key",
      "support.type.property-name",
    ]),
    regex: getScopeColor(themeObj, ["string.regexp"]),
    constant: getScopeColor(themeObj, ["constant.language", "constant"]),
  };
}

function isColorDark(hex: string): boolean {
  // Accept #rgb, #rrggbb, #rrggbbaa
  const m = hex.replace("#", "");
  if (m.length < 3) return true;
  let r: number, g: number, b: number;
  if (m.length === 3) {
    r = parseInt(m[0] + m[0], 16);
    g = parseInt(m[1] + m[1], 16);
    b = parseInt(m[2] + m[2], 16);
  } else {
    r = parseInt(m.slice(0, 2), 16);
    g = parseInt(m.slice(2, 4), 16);
    b = parseInt(m.slice(4, 6), 16);
  }
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

function buildEditorTheme(resolved: ResolvedTheme, fontFamily: string, fontSize: number) {
  return EditorView.theme(
    {
      "&": {
        backgroundColor: resolved.bg,
        color: resolved.fg,
        fontSize: `${fontSize}px`,
      },
      ".cm-scroller": {
        fontFamily: `'${fontFamily}', monospace`,
        lineHeight: "1.6",
      },
      ".cm-content": {
        caretColor: resolved.caret,
        padding: "0",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: resolved.caret,
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
        {
          backgroundColor: `${resolved.selection} !important`,
        },
      ".cm-activeLine": {
        backgroundColor: "transparent",
      },
      "&.cm-focused .cm-activeLine": {
        backgroundColor: resolved.lineHighlight,
      },
      ".cm-gutters": {
        backgroundColor: resolved.gutterBg,
        color: resolved.gutterFg,
        border: "none",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent",
      },
      "&.cm-focused .cm-activeLineGutter": {
        backgroundColor: resolved.lineHighlight,
      },
      ".cm-lineNumbers .cm-gutterElement": {
        padding: "0 8px 0 16px",
      },
    },
    { dark: isColorDark(resolved.bg) },
  );
}

function buildHighlightStyle(resolved: ResolvedTheme) {
  const specs: { tag: any; color?: string; fontStyle?: string }[] = [];

  if (resolved.keyword)
    specs.push({ tag: [t.keyword, t.modifier, t.controlKeyword], color: resolved.keyword });
  if (resolved.string)
    specs.push({ tag: [t.string, t.special(t.string)], color: resolved.string });
  if (resolved.number) specs.push({ tag: [t.number, t.bool], color: resolved.number });
  if (resolved.comment)
    specs.push({ tag: [t.comment, t.lineComment, t.blockComment], color: resolved.comment, fontStyle: "italic" });
  if (resolved.function)
    specs.push({ tag: [t.function(t.variableName), t.function(t.propertyName)], color: resolved.function });
  if (resolved.variable) specs.push({ tag: [t.variableName], color: resolved.variable });
  if (resolved.type)
    specs.push({ tag: [t.typeName, t.className, t.namespace], color: resolved.type });
  if (resolved.operator)
    specs.push({ tag: [t.operator, t.compareOperator, t.logicOperator], color: resolved.operator });
  if (resolved.punctuation)
    specs.push({ tag: [t.punctuation, t.bracket, t.paren, t.brace, t.squareBracket], color: resolved.punctuation });
  if (resolved.tag) specs.push({ tag: [t.tagName], color: resolved.tag });
  if (resolved.attribute) specs.push({ tag: [t.attributeName], color: resolved.attribute });
  if (resolved.property) specs.push({ tag: [t.propertyName], color: resolved.property });
  if (resolved.regex) specs.push({ tag: [t.regexp], color: resolved.regex });
  if (resolved.constant)
    specs.push({ tag: [t.constant(t.variableName), t.standard(t.variableName)], color: resolved.constant });

  return HighlightStyle.define(specs as any);
}

export async function initApp() {
  // --- Shiki setup ---
  const highlighter = await createHighlighter({
    themes: [...CUSTOM_THEMES, ...BUILTIN_THEMES],
    langs: [...LANGUAGES],
  });

  // --- Elements ---
  const $card = document.getElementById("code-card") as HTMLElement;
  const $chrome = document.getElementById("card-chrome") as HTMLElement;
  const $cardFilename = document.getElementById("card-filename") as HTMLElement;
  const $download = document.getElementById("btn-download")!;
  const $copy = document.getElementById("btn-copy")!;
  const $filename = document.getElementById("opt-filename") as HTMLInputElement;
  const $language = document.getElementById("opt-language") as HTMLSelectElement;
  const $theme = document.getElementById("opt-theme") as HTMLSelectElement;
  const $font = document.getElementById("opt-font") as HTMLSelectElement;
  const $fontSize = document.getElementById("opt-fontSize") as HTMLInputElement;
  const $fontSizeVal = document.getElementById("fontSize-val")!;
  const $padding = document.getElementById("opt-padding") as HTMLInputElement;
  const $paddingVal = document.getElementById("padding-val")!;
  const $cornerRadius = document.getElementById(
    "opt-cornerRadius",
  ) as HTMLInputElement;
  const $cornerRadiusVal = document.getElementById("cornerRadius-val")!;
  const $showChrome = document.getElementById(
    "opt-showChrome",
  ) as HTMLInputElement;
  const $showLineNumbers = document.getElementById(
    "opt-showLineNumbers",
  ) as HTMLInputElement;
  const $shadow = document.getElementById("opt-shadow") as HTMLInputElement;
  const $lineStart = document.getElementById(
    "opt-lineStart",
  ) as HTMLInputElement;
  const $lineEnd = document.getElementById("opt-lineEnd") as HTMLInputElement;

  // --- CodeMirror compartments ---
  const langCompartment = new Compartment();
  const themeCompartment = new Compartment();
  const highlightCompartment = new Compartment();
  const lineNumbersCompartment = new Compartment();

  function getResolvedTheme(): ResolvedTheme {
    const themeObj = highlighter.getTheme(
      $theme.value as ThemeName,
    ) as unknown as any;
    return resolveTheme(themeObj);
  }

  const initialThemeObj = highlighter.getTheme(
    DEFAULT_OPTIONS.theme,
  ) as unknown as any;
  const initialResolved = resolveTheme(initialThemeObj);

  const editorState = EditorState.create({
    doc: DEFAULT_OPTIONS.code,
    extensions: [
      basicSetup,
      lineNumbersCompartment.of([]),
      langCompartment.of(getLangExtension(DEFAULT_OPTIONS.language)),
      themeCompartment.of(
        buildEditorTheme(
          initialResolved,
          DEFAULT_OPTIONS.fontFamily,
          DEFAULT_OPTIONS.fontSize,
        ),
      ),
      highlightCompartment.of(syntaxHighlighting(buildHighlightStyle(initialResolved))),
    ],
  });

  const editorView = new EditorView({
    state: editorState,
    parent: document.getElementById("editor")!,
    root: document,
  });

  editorView.contentDOM.addEventListener("blur", () => {
    editorView.dispatch({
      selection: EditorSelection.cursor(editorView.state.selection.main.head),
    });
  });

  // --- Card visual sync ---
  function applyCardStyles() {
    const resolved = getResolvedTheme();
    const padding = Number($padding.value);
    const cornerRadius = Number($cornerRadius.value);

    $card.style.background = resolved.bg;
    $card.style.borderRadius = `${cornerRadius}px`;
    $card.style.boxShadow = $shadow.checked
      ? "0 20px 68px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.05)"
      : "none";

    // Chrome
    $chrome.style.display = $showChrome.checked ? "flex" : "none";
    $chrome.style.background = resolved.bg;
    $chrome.style.borderBottom = $showChrome.checked
      ? "1px solid rgba(255,255,255,0.06)"
      : "none";
    $cardFilename.textContent = $filename.value;
    $cardFilename.style.fontFamily = `'${$font.value}', monospace`;

    // Editor wrapper padding (visual padding inside the card matches screenshot)
    const editorEl = document.getElementById("editor")!;
    editorEl.style.padding = `${padding}px`;
    editorEl.style.background = resolved.bg;
  }

  function applyEditorTheme() {
    const resolved = getResolvedTheme();
    const fontSize = Number($fontSize.value);
    editorView.dispatch({
      effects: [
        themeCompartment.reconfigure(
          buildEditorTheme(resolved, $font.value, fontSize),
        ),
        highlightCompartment.reconfigure(
          syntaxHighlighting(buildHighlightStyle(resolved)),
        ),
      ],
    });
  }

  function applyLineNumbers() {
    // basicSetup already includes line numbers. To hide them, swap in an empty
    // extension and add CSS to hide the gutter.
    const editorEl = document.getElementById("editor")!;
    editorEl.classList.toggle("hide-line-numbers", !$showLineNumbers.checked);
  }

  function getOptions(): RenderOptions {
    return {
      code: editorView.state.doc.toString(),
      language: $language.value as LanguageName,
      filename: $filename.value,
      theme: $theme.value as ThemeName,
      fontSize: Number($fontSize.value),
      fontFamily: $font.value as FontName,
      padding: Number($padding.value),
      showChrome: $showChrome.checked,
      showLineNumbers: $showLineNumbers.checked,
      lineStart: $lineStart.value ? Number($lineStart.value) : undefined,
      lineEnd: $lineEnd.value ? Number($lineEnd.value) : undefined,
      cornerRadius: Number($cornerRadius.value),
      shadow: $shadow.checked,
    };
  }

  function applyAll() {
    applyCardStyles();
    applyEditorTheme();
    applyLineNumbers();
  }

  // --- Wire up controls ---
  const controlEls = [
    $filename,
    $language,
    $theme,
    $font,
    $fontSize,
    $padding,
    $cornerRadius,
    $showChrome,
    $showLineNumbers,
    $shadow,
    $lineStart,
    $lineEnd,
  ];

  for (const el of controlEls) {
    el.addEventListener("input", () => {
      applyAll();
    });
  }

  // Update range display values
  $fontSize.addEventListener("input", () => {
    $fontSizeVal.textContent = `${$fontSize.value}px`;
  });
  $padding.addEventListener("input", () => {
    $paddingVal.textContent = `${$padding.value}px`;
  });
  $cornerRadius.addEventListener("input", () => {
    $cornerRadiusVal.textContent = `${$cornerRadius.value}px`;
  });

  // Language change → update CodeMirror syntax
  $language.addEventListener("change", () => {
    editorView.dispatch({
      effects: langCompartment.reconfigure(getLangExtension($language.value)),
    });
  });

  // --- Presets ---
  const $presets = document.querySelectorAll<HTMLButtonElement>(".preset-pill");
  $presets.forEach((btn) => {
    btn.addEventListener("click", () => {
      const presetData = btn.getAttribute("data-preset");
      if (!presetData) return;
      const preset = JSON.parse(presetData);
      if (preset.fontSize !== undefined) {
        $fontSize.value = String(preset.fontSize);
        $fontSizeVal.textContent = `${preset.fontSize}px`;
      }
      if (preset.padding !== undefined) {
        $padding.value = String(preset.padding);
        $paddingVal.textContent = `${preset.padding}px`;
      }
      if (preset.theme !== undefined) $theme.value = preset.theme;
      if (preset.cornerRadius !== undefined) {
        $cornerRadius.value = String(preset.cornerRadius);
        $cornerRadiusVal.textContent = `${preset.cornerRadius}px`;
      }
      if (preset.shadow !== undefined) $shadow.checked = preset.shadow;
      if (preset.showChrome !== undefined) $showChrome.checked = preset.showChrome;
      if (preset.showLineNumbers !== undefined)
        $showLineNumbers.checked = preset.showLineNumbers;

      $presets.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      applyAll();
    });
  });

  // --- Download ---
  let capturing = false;

  $download.addEventListener("click", async () => {
    if (capturing) return;
    capturing = true;
    const origText = $download.textContent;
    $download.innerHTML = '<span class="spinner"></span> Rendering...';
    ($download as HTMLButtonElement).disabled = true;

    try {
      const opts = getOptions();
      const blob = await toBlob($card, { pixelRatio: 2 });
      if (!blob) {
        showToast("Download failed", "error");
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        opts.filename
          ? `${opts.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}.png`
          : "quickshot.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      showToast("Downloaded!", "success");
    } catch (err) {
      showToast("Download failed. Check console.", "error");
      console.error(err);
    } finally {
      capturing = false;
      $download.textContent = origText;
      ($download as HTMLButtonElement).disabled = false;
    }
  });

  // --- Copy to clipboard ---
  $copy.addEventListener("click", async () => {
    if (capturing) return;
    capturing = true;
    const origText = $copy.textContent;
    $copy.innerHTML = '<span class="spinner"></span>';

    try {
      const blob = await toBlob($card, { pixelRatio: 2 });
      if (!blob) {
        showToast("Copy failed", "error");
        return;
      }

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);

      showToast("Copied to clipboard!", "success");
    } catch (err) {
      showToast("Copy failed. Check console.", "error");
      console.error(err);
    } finally {
      capturing = false;
      $copy.textContent = origText;
    }
  });

  // --- Toast ---
  function showToast(message: string, type: "success" | "error") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  // --- Settings dropdown ---
  const $settingsBtn = document.getElementById("btn-settings")!;
  const $settingsDropdown = document.getElementById("settings-dropdown")!;

  function openDropdown() {
    $settingsDropdown.classList.add("open");
    $settingsBtn.setAttribute("aria-expanded", "true");
  }

  function closeDropdown() {
    $settingsDropdown.classList.remove("open");
    $settingsBtn.setAttribute("aria-expanded", "false");
  }

  $settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if ($settingsDropdown.classList.contains("open")) {
      closeDropdown();
    } else {
      openDropdown();
    }
  });

  // Close when clicking outside
  document.addEventListener("click", (e) => {
    if (
      $settingsDropdown.classList.contains("open") &&
      !$settingsDropdown.contains(e.target as Node) &&
      !$settingsBtn.contains(e.target as Node)
    ) {
      closeDropdown();
    }
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $settingsDropdown.classList.contains("open")) {
      closeDropdown();
      $settingsBtn.focus();
    }
  });

  // --- Initial render ---
  applyAll();
}
