import { test, expect, type Page } from "@playwright/test";
import { adminDb, cleanUpDemo, enterDemo, timed } from "./helpers";

const tile = (page: Page, n = 0) => page.locator(".grid > button:not([disabled])").nth(n);
const qty = (page: Page, n = 0) => tile(page, n).locator('[aria-label="Change quantity"]');
const gridNumber = (page: Page, n: number) => page.locator(".fixed .grid button", { hasText: new RegExp(`^${n}$`) });

test.beforeEach(async ({ page }) => {
  await enterDemo(page);
});

test("Home → Sell opens New Bill", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.locator('nav a[href="/bills/new"]:visible')).toBeVisible();
  await timed("Home → Sell", async () => {
    await page.locator('nav a[href="/bills/new"]:visible').tap();
    await expect(page.locator("input[placeholder='Search item or scan barcode']")).toBeVisible();
  });
});

test("Fast Billing quantity: tap adds, − takes off, the grid sets an exact number", async ({ page }) => {
  await page.goto("/fast-billing");
  for (let i = 0; i < 3; i++) await tile(page).tap();
  await expect(qty(page)).toHaveText("3");
  await tile(page).locator('[aria-label="Remove one"]').tap();
  await expect(qty(page)).toHaveText("2");
  await qty(page).tap();
  await expect(page.locator('.fixed .grid button[aria-pressed="true"]')).toHaveText("2");
  await gridNumber(page, 5).tap();
  await expect(qty(page)).toHaveText("5");
  await qty(page).tap();
  await page.getByRole("button", { name: /Remove from bill/ }).tap();
  await expect(qty(page)).toHaveCount(0);
});

test("Fast Billing: pressing and holding opens the grid without adding one", async ({ page }) => {
  await page.goto("/fast-billing");
  await expect(tile(page, 1)).toBeVisible();
  const box = (await tile(page, 1).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(page.locator(".fixed .grid button").first()).toBeVisible();
  await expect(qty(page, 1)).toHaveCount(0);
  await gridNumber(page, 8).tap();
  await expect(qty(page, 1)).toHaveText("8");
});

test("Fast Billing customer: suggestions as the number is typed, a full number fills the customer", async ({ page }) => {
  await page.goto("/fast-billing");
  await tile(page).tap();
  await page.getByRole("button", { name: /View Bill/ }).tap();
  const phone = page.locator("input[type=tel]");
  await phone.tap();
  await phone.pressSequentially("90000", { delay: 60 });
  await expect(page.locator("input[type=tel] + ul li").first()).toBeVisible();
  await phone.pressSequentially("10014", { delay: 60 });
  await expect(page.locator('[aria-label="Change customer"]')).toBeVisible();
  await expect(page.locator("main, body").first()).toContainText("Karan Nair");
});

test("Fast Billing: a bill for a new customer is saved and linked to them", async ({ page }) => {
  test.skip(!adminDb(), "needs SUPABASE_SERVICE_ROLE_KEY to clean up after itself");
  const since = new Date().toISOString();
  const newPhone = `91${String(Date.now()).slice(-8)}`;
  try {
    await page.goto("/fast-billing");
    await tile(page).tap();
    await page.getByRole("button", { name: /View Bill/ }).tap();
    const phone = page.locator("input[type=tel]");
    await phone.tap();
    await phone.pressSequentially(newPhone, { delay: 40 });
    await expect(page.getByText(/New customer/)).toBeVisible();
    await page.locator('input[placeholder^="Customer name"]').pressSequentially("E2E Grahak", { delay: 30 });
    await page.locator('input[placeholder^="Customer name"]').blur();
    await timed("Checkout → invoice", async () => {
      await page.locator("form button", { hasText: /Checkout/ }).tap();
      await expect(page).toHaveURL(/\/print\/bill\//);
      await expect(page.locator("body")).toContainText("E2E Grahak");
    });
  } finally {
    await cleanUpDemo("grocery", since, [newPhone]);
  }
});

test("opening the app at / goes straight to the shop's home screen from the edge", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.locator('nav a[href="/bills/new"]:visible')).toBeVisible();
  const res = await timed("/ → home redirect", () => page.request.get("/", { maxRedirects: 0 }), 3000);
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toMatch(/\/(fast-billing|bills\/new)$/);
});
