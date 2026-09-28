import { defineConfig, devices } from "@playwright/test";

/**
 * E2E configuration (PL-7, PRD §12.2).
 *
 * BASE_URL points the whole suite at a deployment: unset it and the tests run against a local dev
 * server that Playwright starts itself; set it and they run against a Vercel preview or production
 * without touching the specs.
 */
const baseURL = process.env["BASE_URL"] ?? "http://localhost:3000";
const isLocal = baseURL.startsWith("http://localhost");

export default defineConfig({
  testDir: "./e2e",
  // A demo is a single machine driving a single deployment; parallel runs would fight over the
  // rate limits in §10.1 and over admin drafts, of which there is one per module.
  workers: 1,
  fullyParallel: false,
  forbidOnly: process.env["CI"] === "true",
  retries: process.env["CI"] === "true" ? 1 : 0,
  reporter: process.env["CI"] === "true" ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(isLocal
    ? {
        webServer: {
          // DATA_SOURCE=files serves data/seed with no database, so the suite runs on a clean checkout.
          command: "DATA_SOURCE=files npm run dev",
          url: "http://localhost:3000/api/v1/health",
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }
    : {}),
});
