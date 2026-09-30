"use server";

import { revalidatePath } from "next/cache";
import { hasPermission, requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { invalidateCache } from "../cache";
import { wholesaleReady, WHOLESALE_NOT_READY } from "../wholesaleData";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (v: unknown) => (v === null || v === "" || v === undefined ? null : Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 10_000_000 ? round2(Number(v)) : undefined);

/** The rate list saved in one go: each item's MRP, retail rate and wholesale rate. */
export async function saveRateListAction(changes: { id: string; mrp: number | null; price: number; wholesalePrice: number | null }[]): Promise<{ error?: string; saved?: number }> {
  const session = await requireSession();
  if (!hasPermission(session, "manage_products")) return { error: "Only staff allowed to manage items can change rates." };
  const admin = createSupabaseAdminClient();
  if (!(await wholesaleReady(admin))) return { error: WHOLESALE_NOT_READY };
  const clean = changes
    .filter((c) => /^[0-9a-f-]{36}$/i.test(c.id))
    .map((c) => ({ id: c.id, mrp: money(c.mrp), price: money(c.price), wholesale: money(c.wholesalePrice) }))
    .filter((c): c is { id: string; mrp: number | null; price: number; wholesale: number | null } => c.mrp !== undefined && c.price != null && c.wholesale !== undefined);
  if (!clean.length) return { error: "Nothing to save." };
  if (clean.length > 1000) return { error: "Save at most 1,000 items at a time." };
  const { data: own } = await admin.from("products").select("id").eq("shop_id", session.shopId).in("id", clean.map((c) => c.id));
  const ownIds = new Set((own ?? []).map((p) => p.id));
  const mine = clean.filter((c) => ownIds.has(c.id));
  let saved = 0;
  for (let i = 0; i < mine.length; i += 25) {
    const results = await Promise.all(
      mine.slice(i, i + 25).map((c) => admin.from("products").update({ mrp: c.mrp, price: c.price, wholesale_price: c.wholesale }).eq("id", c.id).eq("shop_id", session.shopId)),
    );
    saved += results.filter((r) => !r.error).length;
  }
  await invalidateCache(`ray:cache:products:${session.shopId}`);
  revalidatePath("/products/rates");
  revalidatePath("/bills/new");
  return saved === mine.length ? { saved } : { saved, error: `${mine.length - saved} item(s) could not be saved — try again.` };
}
