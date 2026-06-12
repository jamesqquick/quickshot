# Quickshot MCP Server — Design Spec

**Date:** 2026-06-12
**Branch:** `feat/mcp-server`
**Status:** Approved

## Goal

Let an agent generate Quickshot code screenshots in batch by calling a single MCP tool. The MCP server lives on the existing Quickshot Worker, uses Cloudflare Browser Run to drive the existing UI in headless mode, uploads PNGs to a public R2 bucket, and returns the R2 URL.

## Non-goals

- No AI image generation. The "image" is a code screenshot produced by Quickshot's existing render pipeline.
- No per-session state, no elicitation, no chat memory.
- No multi-image batch tool. Agents loop the tool themselves.
- No private/signed R2 URLs. Public access via `r2.dev` is sufficient.
- No custom domain for R2.
- No reimplementation of the renderer server-side. We reuse the live UI.

## Architecture

```
Agent (Claude Desktop, opencode, Cursor, …)
   │  Streamable HTTP (MCP)
   ▼
Quickshot Worker (single deploy on workers.dev)
 │
 ├─ src/worker.ts
 │    ├─ POST /mcp  → bearer-token auth → createMcpHandler(createServer(env))
 │    │                 └─ tool render_code_screenshot
 │    │                       ├─ env.BROWSER.quickAction("screenshot", { url, selector, … })
 │    │                       ├─ env.SCREENSHOTS.put(`screenshots/<uuid>.png`, bytes)
 │    │                       └─ returns { content: [{ type: "text", text: <r2 url> }] }
 │    │
 │    └─ * → env.ASSETS.fetch(request)   (serves the existing static Astro app)
 │
 ├─ ASSETS binding  → ./dist (Astro static build)
 ├─ BROWSER binding (Browser Run, remote=true)
 └─ SCREENSHOTS binding (R2 bucket, public r2.dev access)
```

## Components

### 1. Custom Worker entrypoint — `src/worker.ts`

Replaces the implicit asset-only Worker. Routes:

- `POST /mcp` — MCP endpoint (Streamable HTTP). Bearer-token auth using `MCP_TOKEN` secret. Delegates to `createMcpHandler` from `agents/mcp`.
- Everything else — `env.ASSETS.fetch(request)` to serve the static Astro build.

Astro stays in `output: "static"` mode. No SSR.

### 2. MCP server factory — `src/mcp/server.ts`

Factory function returning a fresh `McpServer` instance per request (required by MCP SDK ≥ 1.26.0 to avoid cross-client response leaks).

Single tool: `render_code_screenshot`

**Input schema (Zod):**

| Field | Type | Default | Notes |
|---|---|---|---|
| `code` | `string` | required | Source code to render, max 100KB |
| `language` | `enum(LANGUAGES)` | required | See `src/lib/options.ts` |
| `theme` | `enum(THEMES)` | required | See `src/lib/options.ts` |
| `filename` | `string` | `""` | Optional |
| `fontFamily` | `enum(FONTS)` | `"JetBrains Mono"` | Optional |
| `fontSize` | `number` int 8–72 | `16` | Optional |
| `padding` | `number` int 0–200 | `48` | Optional |
| `cornerRadius` | `number` int 0–48 | `12` | Optional |
| `showChrome` | `boolean` | `true` | Optional |
| `showLineNumbers` | `boolean` | `true` | Optional |
| `shadow` | `boolean` | `true` | Optional |
| `lineStart` | `number` int ≥ 1 | — | Optional |
| `lineEnd` | `number` int ≥ 1 | — | Optional |
| `inline` | `boolean` | `false` | When true, also return base64 image content block |

Defaults mirror `DEFAULT_OPTIONS` in `src/lib/options.ts`. The agent sees enums in the JSON schema, so theme/language/font discovery is automatic — no separate discovery tools.

**Output:**

- Always: text content block with the R2 URL.
- When `inline: true`: prepend an `image` content block with base64 PNG.

### 3. Render pipeline — `src/mcp/render.ts`

Pure function `renderScreenshot(env, opts)`:

1. Build the render URL: `${env.PUBLIC_URL}/?render=1&…` with all options as query params. `code` is base64-encoded (UTF-8 safe) so any source compiles into the URL.
2. Call `env.BROWSER.quickAction("screenshot", { ... })` with:
   - `url`
   - `selector: "#code-card"` (only screenshot the card, not the full page)
   - `viewport: { width: 1600, height: 1200, deviceScaleFactor: 2 }` (retina)
   - `gotoOptions: { waitUntil: "networkidle0", timeout: 30_000 }`
   - `waitForSelector: '[data-quickshot-ready="true"]'` (signal that Shiki + paint are done)
   - `screenshotOptions: { type: "png", omitBackground: false }`
3. Get bytes via `res.arrayBuffer()`.
4. PUT to R2: `env.SCREENSHOTS.put(\`screenshots/${crypto.randomUUID()}.png\`, bytes, { httpMetadata: { contentType: "image/png" } })`.
5. Return `{ url: \`${env.SCREENSHOTS_PUBLIC_BASE}/screenshots/<uuid>.png\`, base64?: string }`.

### 4. Shared URL codec — `src/lib/renderUrl.ts`

Encode/decode `Partial<RenderOptions>` ↔ `URLSearchParams`. Used by both the worker (encoding) and the client (decoding). Single source of truth for query param shape.

- `code` is base64-URL-safe encoded (UTF-8 via `TextEncoder`/`TextDecoder`) because it can be large and contain anything.
- Booleans encode as `"1"`/`"0"`.
- All other params encode as strings; `decode` coerces.

### 5. Client render-mode — `src/client/app.ts`

When `?render=1` is present on page load:

1. Add class `render-mode` to `<body>` (CSS hides the header).
2. Decode `URLSearchParams` via `renderUrl.ts` and apply each option to the corresponding DOM input (`#opt-filename`, `#opt-language`, etc.) before `applyAll()` runs.
3. Replace the editor doc with the decoded `code`.
4. After Shiki is ready AND one `requestAnimationFrame` after `applyAll()`, set `document.querySelector("#code-card").setAttribute("data-quickshot-ready", "true")`.

The signal at step 4 is what Browser Run waits for.

### 6. CSS — `src/styles/global.css`

Add:

```css
body.render-mode .header { display: none; }
body.render-mode .main { padding: 0; }
```

(Adjust selectors to match actual layout if needed during implementation.)

## Configuration

### `wrangler.jsonc`

```jsonc
{
  "name": "quickshot",
  "main": "./src/worker.ts",
  "compatibility_date": "2026-03-24",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "binding": "ASSETS", "directory": "./dist" },
  "browser": { "binding": "BROWSER", "remote": true },
  "r2_buckets": [
    { "binding": "SCREENSHOTS", "bucket_name": "quickshot-screenshots" }
  ],
  "vars": {
    "PUBLIC_URL": "https://quickshot.examples.workers.dev",
    "SCREENSHOTS_PUBLIC_BASE": "" // set after R2 bucket creation; see deploy steps
  },
  "observability": { "enabled": true }
}
```

### Secrets (via `wrangler secret put`)

- `MCP_TOKEN` — shared secret. MCP clients send `Authorization: Bearer <token>`.

### One-time deploy steps (documented, not automated)

1. `pnpm install`
2. `pnpm wrangler r2 bucket create quickshot-screenshots`
3. Enable the bucket's r2.dev public access via dashboard. Capture the `https://pub-<hash>.r2.dev` URL.
4. Set `SCREENSHOTS_PUBLIC_BASE` in `wrangler.jsonc` `vars` to that URL.
5. `pnpm wrangler secret put MCP_TOKEN` (generate via `openssl rand -hex 32`)
6. `pnpm build && pnpm wrangler deploy`

## Auth model

- MCP endpoint requires `Authorization: Bearer <MCP_TOKEN>`. Missing or mismatched → `401 Unauthorized`.
- Auth is checked in `src/worker.ts` before delegating to `createMcpHandler`.
- R2 reads go through r2.dev (Cloudflare's public CDN). Filenames are UUIDs, so URLs are unguessable.

## Error handling

- Input validation errors → `createMcpHandler` catches Zod failures and returns JSON-RPC `-32602 Invalid params`.
- Browser Run timeout / failure → tool throws → returned as JSON-RPC `-32603 Internal error` with message.
- R2 PUT failure → same.
- Auth failure → HTTP 401 (no MCP-level error wrapper).

## Dependencies added

- `agents` — Cloudflare Agents SDK (provides `createMcpHandler`, `WorkerTransport`)
- `@modelcontextprotocol/sdk` — `McpServer`
- `zod` — input schema

## Out of scope (YAGNI)

- Discovery tools (`list_themes` etc.) — schema enums cover this.
- Server-side batching — agents parallelize themselves.
- Content-hash caching — could add later via `crypto.subtle.digest`.
- OAuth — no need; shared-secret is enough for personal use.
- Signed URLs / R2 private mode.
- Astro server-mode SSR.

## Verification plan

After implementation:

1. `pnpm install` cleanly resolves new deps.
2. `pnpm build` succeeds (Astro static build).
3. `pnpm wrangler types` generates a usable `Env` type for the new bindings.
4. `pnpm wrangler deploy --dry-run` succeeds (bundles `src/worker.ts`).
5. Manual end-to-end deploy + tool call via MCP Inspector or `mcp-remote` once R2 + secret are configured.

(Steps 4 and 5 happen after this branch lands; this branch only changes code.)
