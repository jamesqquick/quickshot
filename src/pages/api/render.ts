import type { APIRoute } from "astro";
import puppeteer from "@cloudflare/puppeteer";
import { env } from "cloudflare:workers";
import { validateOptions } from "../../lib/options.js";
import { highlightCode } from "../../lib/shiki.js";
import { buildCardHtml } from "../../lib/card-html.js";

export const prerender = false;

// Simple in-memory rate limiter (per-isolate, resets on cold start)
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(
  ip: string,
  max: number,
  windowSeconds: number,
): boolean {
  const now = Date.now();
  const entry = requestCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + windowSeconds * 1000 });
    return false;
  }
  entry.count++;
  return entry.count > max;
}

export const POST: APIRoute = async ({ request }) => {
  // Rate limiting
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    "unknown";
  const rateMax = Number(env.RATE_LIMIT_MAX) || 30;
  const rateWindow = Number(env.RATE_LIMIT_WINDOW_SECONDS) || 60;

  if (isRateLimited(ip, rateMax, rateWindow)) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let opts;
  try {
    opts = validateOptions(body);
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Validation failed",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    // 1. Highlight with Shiki
    const { html: highlightedHtml } = await highlightCode(
      opts.code,
      opts.language,
      opts.theme,
      opts.showLineNumbers,
      opts.lineStart,
      opts.lineEnd,
    );

    // 2. Build full HTML page
    const cardHtml = buildCardHtml(opts, highlightedHtml);

    // 3. Screenshot via Browser Rendering binding
    const browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();

    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2,
    });

    await page.setContent(cardHtml, { waitUntil: "networkidle0" });

    // Screenshot just the card element
    const cardEl = await page.$(".code-card");
    if (!cardEl) {
      await browser.close();
      return new Response(
        JSON.stringify({ error: "Failed to render code card" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const png = await cardEl.screenshot({
      type: "png",
      omitBackground: true,
    });

    await browser.close();

    // 4. Return PNG
    const filename = opts.filename
      ? `${opts.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}.png`
      : "quickshot.png";

    return new Response(png, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Render error:", err);
    return new Response(
      JSON.stringify({
        error: "Screenshot failed. Please try again.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
