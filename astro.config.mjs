// @ts-check
import { defineConfig } from "astro/config";

// Quickshot is a fully static site. The Cloudflare adapter is unnecessary
// (and conflicts with our custom Worker entrypoint at src/worker.ts).
// The Worker serves the static build via the ASSETS binding.
export default defineConfig({
  output: "static",
});
