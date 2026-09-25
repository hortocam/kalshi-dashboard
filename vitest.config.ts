import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Vitest must never run the app's Tailwind/PostCSS build pipeline: Vite's
  // unconditional postcss.config discovery chokes on the string-form plugin
  // Next.js accepts. An explicit empty plugin list pins that bypass (CSS
  // imports become plain strings in tests).
  css: { postcss: { plugins: [] } },
  // The app tsconfig sets jsx:"preserve" (Next/SWC compiles it); Vitest's
  // esbuild defaults to the classic React runtime, which React 19 does not
  // provide — pin the automatic runtime to match Next's behaviour.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    reporters: ["default"],
    // Data-layer golden tests build real SQLite fixtures (DDL + ~250 seed
    // rows each); 5s per test is too tight under full-suite load.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});