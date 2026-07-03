import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "apps/web/tests",
  webServer: {
    command: "pnpm --filter @gto-lab/web build && pnpm --filter @gto-lab/web exec vite preview --host 127.0.0.1 --port 5174",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false
  },
  use: {
    baseURL: "http://127.0.0.1:5174",
    ...devices["Desktop Chrome"]
  }
});
