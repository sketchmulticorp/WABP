import { defineConfig, devices } from "@playwright/test";

/** Browser tests exercise the workspace against deterministic API doubles, never live credentials. */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm --filter @whatsapp-platform/web exec next start --port 3100",
    reuseExistingServer: false,
    url: "http://127.0.0.1:3100",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
