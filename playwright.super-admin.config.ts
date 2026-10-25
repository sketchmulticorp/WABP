import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Focused synthetic-account browser checkpoint; never connects to a real API. */
export default defineConfig({
  ...base,
  testMatch: ["super-admin.spec.ts", "initial-password.spec.ts"],
  use: { ...base.use, baseURL: "http://127.0.0.1:3107" },
  webServer: {
    cwd: "apps/web",
    command: "node node_modules/next/dist/bin/next start --port 3107",
    reuseExistingServer: false,
    url: "http://127.0.0.1:3107",
  },
});
