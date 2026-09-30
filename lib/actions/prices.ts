"use server";

import { revalidatePath } from "next/cache";
import { hasPermission, requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { invalidateCache } from "../cache";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Today's prices for many items at once — the vegetable and grain shop's morning job. An offer
 * price is kept only while it is below the new price (an offer at or above it isn't an offer). */
export async function bulkUpdatePricesAction(changes: { id: string; price: number; offerPrice: number | null }[]): Promise<{ error?: string; saved?: number }> {
  const session = await requireSession();
  if (!hasPermission(session, "manage_products")) return { error: "Only staff allowed to manage items can change prices." };
  const clean = changes
    .filter((c) => /^[0-9a-f-]{36}$/i.test(c.id) && Number.isFinite(Number(c.price)) && Number(c.price) >= 0 && Number(c.price) <= 10_000_000)
    .map((c) => {
      const price = round2(Number(c.price));
      const offer = c.offerPrice != null && Number(c.offerPrice) > 0 && Number(c.offerPrice) < price ? round2(Number(c.offerPrice)) : null;
      return { id: c.id, price, offer };
    });
  if (!clean.length) return { error: "Nothing to save." };
  if (clean.length > 1000) return { error: "Save at most 1,000 items at a time." };

  const admin = createSupabaseAdminClient();
  const { data: own } = await admin.from("products").select("id").eq("shop_id", session.shopId).in("id", clean.map((c) => c.id));
  const ownIds = new Set((own ?? []).map((p) => p.id));
  const mine = clean.filter((c) => ownIds.has(c.id));
  let saved = 0;
  for (let i = 0; i < mine.length; i += 25) {
    const results = await Promise.all(
      mine.slice(i, i + 25).map((c) => admin.from("products").update({ price: c.price, offer_price: c.offer }).eq("id", c.id).eq("shop_id", session.shopId)),
    );
    saved += results.filter((r) => !r.error).length;
  }
  await invalidateCache(`ray:cache:products:${session.shopId}`);
  revalidatePath("/products");
  revalidatePath("/products/prices");
  revalidatePath("/bills/new");
  return saved === mine.length ? { saved } : { saved, error: `${mine.length - saved} item(s) could not be saved — try again.` };
}
