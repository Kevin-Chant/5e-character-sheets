import { defineConfig, devices } from "@playwright/test";

// End-to-end suite. Unlike the Vitest unit tests, these drive the real app in a
// browser and assert against the JSON the local datastore persists to
// localStorage — the same source of truth the app reloads from. Run with
// `pnpm test:e2e`; kept out of `pnpm run ci` so the fast lint/type/unit loop
// stays browser-free.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
