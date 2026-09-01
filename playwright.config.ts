import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["line"]] : "list",
  use: {
    baseURL: process.env.AUVI_E2E_BASE_URL || "http://127.0.0.1:7860",
    trace: "on-first-retry",
  },
  projects: [{
    name: "chromium",
    use: { ...devices["Desktop Chrome"], channel: "chromium" },
  }],
})
