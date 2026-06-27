import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The codebase imports modules as `src/...` (CRA baseUrl style).
      src: fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 3000,
    host: true,
    allowedHosts: ["kevin-laptop.swordfish-ph.ts.net"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Unit tests live in src/; e2e/ is the Playwright suite (`pnpm test:e2e`).
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
