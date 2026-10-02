import { test, expect } from "@playwright/test";
import { enterDemo } from "./helpers";

test("the server answers with its deploy id", async ({ request }) => {
  const res = await request.get("/api/version");
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).id).toBeTruthy();
});

test("login page opens", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
});

test("the Android app link hands out the newest APK", async ({ request }) => {
  const res = await request.get("/download", { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers()["location"]).toMatch(/TheRay-v[\d.]+\.apk$/);
});

test("a training video plays from YouTube", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/help/videos/01");
  const poster = page.locator("main button:has(img)").first();
  if (await poster.isVisible().catch(() => false)) await poster.tap();
  await expect(page.locator('iframe[src*="youtube"]')).toBeVisible();
});

test("restaurant demo opens its tables", async ({ page }) => {
  await enterDemo(page, "restaurant");
  await page.goto("/restaurant");
  await expect(page.locator("main")).toContainText(/table/i);
});
