import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/** Opens a public demo shop, as a visitor from the demo page would. */
export async function enterDemo(page: Page, type: "grocery" | "restaurant" = "grocery") {
  // The first visit of the day can be slow while the demo shop is prepared.
  await page.goto(`/demo/enter/${type}`, { timeout: 60_000, waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/demo\/enter\//, { timeout: 45_000 });
}

/** The service-role database client, when the run has the secret (GitHub does); tests that save
 * something need it to clean up and are skipped without it. */
export function adminDb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

/** Removes what a test saved in a demo shop: its bills since `since` (stock put back) and any
 * customer it added by phone. Only ever touches the demo shop of that type. */
export async function cleanUpDemo(type: "grocery" | "restaurant", since: string, phones: string[] = []) {
  const db = adminDb();
  if (!db) return;
  const { data: shop } = await db.from("shops").select("id").eq("business_type", type).like("legal_name", "% (demo)").single();
  if (!shop) return;
  const { data: bills } = await db.from("bills").select("id").eq("shop_id", shop.id).gte("created_at", since);
  for (const bill of bills ?? []) {
    const { data: items } = await db.from("bill_items").select("product_id, quantity").eq("bill_id", bill.id);
    for (const item of items ?? []) if (item.product_id) await db.rpc("increment_stock", { p_product_id: item.product_id, p_quantity: Number(item.quantity) });
    await db.from("payments").delete().eq("bill_id", bill.id);
    await db.from("bill_items").delete().eq("bill_id", bill.id);
    await db.from("bills").delete().eq("id", bill.id);
  }
  if (phones.length) await db.from("customers").delete().eq("shop_id", shop.id).in("phone", phones);
}

/** Times a step, notes it on the test report, and fails it past `maxMs` (a gross slowdown, not
 * a tight budget: the live site is reached over the internet). */
export async function timed<T>(label: string, fn: () => Promise<T>, maxMs = 10_000): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const ms = Date.now() - start;
  test.info().annotations.push({ type: "time", description: `${label}: ${ms} ms` });
  expect(ms, `${label} took ${ms} ms`).toBeLessThan(maxMs);
  return result;
}
