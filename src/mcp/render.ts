import type { RenderOptions } from "../lib/options.js";
import { encodeRenderOptions } from "../lib/renderUrl.js";

// Subset of the Worker env that the render pipeline uses. Mirrors the bindings
// declared in wrangler.jsonc.
export interface RenderEnv {
  BROWSER: Fetcher;
  SCREENSHOTS: R2Bucket;
  PUBLIC_URL: string;
  SCREENSHOTS_PUBLIC_BASE: string;
}

// Browser Run's quickAction() isn't surfaced in the generated Workers types
// yet (BROWSER is typed as plain Fetcher). We assert this richer shape at the
// single call site below.
interface BrowserBindingWithQuickAction {
  quickAction(action: "screenshot", options: ScreenshotQuickActionOptions): Promise<Response>;
}

interface ScreenshotQuickActionOptions {
  url?: string;
  html?: string;
  selector?: string;
  viewport?: {
    width: number;
    height: number;
    deviceScaleFactor?: number;
  };
  gotoOptions?: {
    waitUntil?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
    timeout?: number;
  };
  waitForSelector?: {
    selector: string;
    timeout?: number;
    visible?: true;
    hidden?: true;
  };
  screenshotOptions?: {
    type?: "png" | "jpeg" | "webp";
    omitBackground?: boolean;
    fullPage?: boolean;
  };
}

export interface RenderResult {
  url: string;
  base64?: string;
}

export async function renderScreenshot(
  env: RenderEnv,
  opts: RenderOptions & { inline?: boolean },
): Promise<RenderResult> {
  if (!env.PUBLIC_URL) {
    throw new Error("PUBLIC_URL is not configured");
  }
  if (!env.SCREENSHOTS_PUBLIC_BASE) {
    throw new Error(
      "SCREENSHOTS_PUBLIC_BASE is not configured. Enable Public Development URL on the R2 bucket and set the var in wrangler.jsonc.",
    );
  }

  const renderUrl = new URL(env.PUBLIC_URL);
  const params = encodeRenderOptions(opts);
  for (const [key, value] of params) {
    renderUrl.searchParams.set(key, value);
  }

  const browser = env.BROWSER as unknown as BrowserBindingWithQuickAction;
  const screenshotRes = await browser.quickAction("screenshot", {
    url: renderUrl.toString(),
    // Capture the wrapper, not #code-card. box-shadow paints outside the card's
    // own bounding box and element captures clip to that box, so targeting the
    // card silently dropped the shadow. The wrapper carries transparent padding
    // sized to contain it (only when the shadow option is on).
    selector: "#preview-container",
    viewport: { width: 1600, height: 1200, deviceScaleFactor: 2 },
    gotoOptions: { waitUntil: "networkidle0", timeout: 30_000 },
    waitForSelector: {
      selector: '[data-quickshot-ready="true"]',
      timeout: 30_000,
    },
    // omitBackground keeps the card's rounded corners transparent instead of
    // compositing the page backdrop into them. Render mode also forces the
    // html/body/preview-pane backgrounds transparent, since omitBackground only
    // suppresses the browser's *default* background, not explicit CSS ones.
    screenshotOptions: { type: "png", omitBackground: true },
  });

  if (!screenshotRes.ok) {
    const detail = await safeText(screenshotRes);
    throw new Error(`Browser Run screenshot failed: ${screenshotRes.status} ${detail}`);
  }

  const bytes = await screenshotRes.arrayBuffer();

  const key = `screenshots/${crypto.randomUUID()}.png`;
  await env.SCREENSHOTS.put(key, bytes, {
    httpMetadata: { contentType: "image/png" },
  });

  const base = env.SCREENSHOTS_PUBLIC_BASE.replace(/\/$/, "");
  const url = `${base}/${key}`;

  const result: RenderResult = { url };
  if (opts.inline) {
    result.base64 = arrayBufferToBase64(bytes);
  }
  return result;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}
