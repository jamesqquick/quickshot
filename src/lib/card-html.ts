import type { RenderOptions } from "./options.js";

/**
 * Builds a standalone HTML document containing the styled code card.
 * Used by the Browser Rendering screenshot endpoint and the client-side preview.
 * `highlightedCode` is already Shiki-rendered HTML (the <pre> block).
 */
export function buildCardHtml(
  opts: RenderOptions,
  highlightedCode: string,
): string {
  const bgColor = "var(--shiki-bg, #22272e)";
  const chromeHtml = opts.showChrome
    ? `<div class="chrome">
        <div class="dots">
          <span class="dot" style="background:#ff5f57"></span>
          <span class="dot" style="background:#febc2e"></span>
          <span class="dot" style="background:#28c840"></span>
        </div>
        ${opts.filename ? `<span class="filename">${escapeHtml(opts.filename)}</span>` : ""}
      </div>`
    : "";

  const shadowStyle = opts.shadow
    ? "box-shadow: 0 20px 68px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.05);"
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Fira+Code:wght@400;500;700&family=Geist+Mono:wght@400;500;700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    display: inline-flex;
    background: transparent;
    padding: 24px;
  }

  .code-card {
    display: inline-block;
    border-radius: ${opts.cornerRadius}px;
    overflow: hidden;
    ${shadowStyle}
  }

  .chrome {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: ${bgColor};
    border-bottom: 1px solid rgba(255,255,255,0.06);
    position: relative;
  }

  .dots {
    display: flex;
    gap: 6px;
  }

  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .filename {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    font-family: '${opts.fontFamily}', monospace;
    font-size: 13px;
    color: rgba(255,255,255,0.5);
  }

  .code-card pre.shiki {
    margin: 0 !important;
    padding: ${opts.padding}px !important;
    font-size: ${opts.fontSize}px !important;
    line-height: 1.6 !important;
    font-family: '${opts.fontFamily}', monospace !important;
    border-radius: 0 !important;
    overflow: visible !important;
    tab-size: 2;
  }

  .code-card pre.shiki code {
    font-family: inherit !important;
    font-size: inherit !important;
    line-height: inherit !important;
  }

  .code-card pre.shiki .line::before {
    ${opts.showLineNumbers ? "" : "display: none !important;"}
  }
</style>
</head>
<body>
  <div class="code-card">
    ${chromeHtml}
    ${highlightedCode}
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
