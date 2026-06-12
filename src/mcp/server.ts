import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  DEFAULT_OPTIONS,
  FONTS,
  LANGUAGES,
  THEMES,
  type RenderOptions,
} from "../lib/options.js";
import { renderScreenshot, type RenderEnv } from "./render.js";

// MCP SDK >= 1.26.0 requires a fresh McpServer instance per request to prevent
// cross-client response leakage. createServer is a factory called by the
// Worker fetch handler for each /mcp request.
export function createServer(env: RenderEnv): McpServer {
  const server = new McpServer({
    name: "quickshot",
    version: "0.1.0",
  });

  server.registerTool(
    "render_code_screenshot",
    {
      title: "Render code screenshot",
      description:
        "Render a syntax-highlighted code screenshot using Quickshot and return its public R2 URL. " +
        "Use this to generate code screenshots in batch from an agent session.",
      inputSchema: {
      code: z
        .string()
        .min(1)
        .max(100_000)
        .describe("The source code to render. Up to 100KB."),
      language: z
        .enum(LANGUAGES as unknown as [string, ...string[]])
        .describe("Programming language for syntax highlighting."),
      theme: z
        .enum(THEMES as unknown as [string, ...string[]])
        .describe("Color theme name."),
      filename: z
        .string()
        .optional()
        .describe("Filename shown in the window chrome (e.g. index.ts)."),
      fontFamily: z
        .enum(FONTS as unknown as [string, ...string[]])
        .optional()
        .describe(`Font family. Defaults to ${DEFAULT_OPTIONS.fontFamily}.`),
      fontSize: z
        .number()
        .int()
        .min(8)
        .max(72)
        .optional()
        .describe(`Font size in px. Defaults to ${DEFAULT_OPTIONS.fontSize}.`),
      padding: z
        .number()
        .int()
        .min(0)
        .max(200)
        .optional()
        .describe(`Card padding in px. Defaults to ${DEFAULT_OPTIONS.padding}.`),
      cornerRadius: z
        .number()
        .int()
        .min(0)
        .max(48)
        .optional()
        .describe(`Card corner radius in px. Defaults to ${DEFAULT_OPTIONS.cornerRadius}.`),
      showChrome: z
        .boolean()
        .optional()
        .describe(`Show macOS-style window chrome. Defaults to ${DEFAULT_OPTIONS.showChrome}.`),
      showLineNumbers: z
        .boolean()
        .optional()
        .describe(`Show line numbers. Defaults to ${DEFAULT_OPTIONS.showLineNumbers}.`),
      shadow: z
        .boolean()
        .optional()
        .describe(`Drop shadow under the card. Defaults to ${DEFAULT_OPTIONS.shadow}.`),
      lineStart: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Optional first line to highlight."),
      lineEnd: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Optional last line to highlight."),
      inline: z
        .boolean()
        .optional()
        .describe(
          "When true, also return the PNG inline as a base64 image content block (in addition to the URL). Defaults to false.",
        ),
      },
    },
    async (input) => {
      const resolved: RenderOptions = {
        code: input.code,
        language: input.language as RenderOptions["language"],
        filename: input.filename ?? DEFAULT_OPTIONS.filename,
        theme: input.theme as RenderOptions["theme"],
        fontFamily: (input.fontFamily as RenderOptions["fontFamily"]) ?? DEFAULT_OPTIONS.fontFamily,
        fontSize: input.fontSize ?? DEFAULT_OPTIONS.fontSize,
        padding: input.padding ?? DEFAULT_OPTIONS.padding,
        cornerRadius: input.cornerRadius ?? DEFAULT_OPTIONS.cornerRadius,
        showChrome: input.showChrome ?? DEFAULT_OPTIONS.showChrome,
        showLineNumbers: input.showLineNumbers ?? DEFAULT_OPTIONS.showLineNumbers,
        shadow: input.shadow ?? DEFAULT_OPTIONS.shadow,
        lineStart: input.lineStart,
        lineEnd: input.lineEnd,
      };

      const { url, base64 } = await renderScreenshot(env, {
        ...resolved,
        inline: input.inline,
      });

      const content: Array<
        | { type: "text"; text: string }
        | { type: "image"; data: string; mimeType: string }
      > = [];

      if (input.inline && base64) {
        content.push({ type: "image", data: base64, mimeType: "image/png" });
      }
      content.push({ type: "text", text: url });

      return { content };
    },
  );

  return server;
}
