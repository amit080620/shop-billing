import { defineConfig, devices } from "@playwright/test";

/** The test robot: walks the main jobs on the live site the way a shop does, on a phone-sized
 * screen with touch, against the public demo shops. GitHub runs it after every deploy and each
 * morning (.github/workflows/e2e.yml); `npx playwright test` runs it from here. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://bill.theray.in",
    ...devices["Pixel 7"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
