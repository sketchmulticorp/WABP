import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Uses the installed Next CLI directly when the pnpm engine-store lock is unavailable. */
export default defineConfig({
  ...base,
  testMatch: ["initial-password.spec.ts", "embedded-signup.spec.ts", "setup.spec.ts"],
  use: { ...base.use, baseURL: "http://127.0.0.1:3102" },
  webServer: {
    cwd: "apps/web",
    command: "node node_modules/next/dist/bin/next start --port 3102",
    reuseExistingServer: false,
    url: "http://127.0.0.1:3102",
  },
});
