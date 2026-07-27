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
    // **node by default; a DOM is opted into per file** with a
    // `// @vitest-environment jsdom` docblock (see `src/test/setup.ts`).
    //
    // Most of this suite tests pure functions — the formula engine, the rules
    // tables, the encounter merge — and building a jsdom for each of those
    // files cost more than running every test in the repo. Measured over the
    // 42 files that touch no DOM: 19.86s of environment setup under jsdom
    // against 9ms under node.
    //
    // The default is the fast one because of how each mistake fails. A
    // component test that forgets the docblock dies immediately and loudly on
    // `document is not defined`; a pure test that needlessly asked for jsdom
    // would just quietly be slow forever, which is the state this replaced.
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Unit tests live in src/; e2e/ is the Playwright suite (`pnpm test:e2e`).
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
