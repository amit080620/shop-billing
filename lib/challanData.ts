import type { createSupabaseAdminClient } from "./supabase/admin";
import { gapsReady } from "./gapsData";
import { invalidateCache } from "./cache";
import type { ChallanLine } from "./challans";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Puts a challan's goods back on the shelf (sign +1) or takes them off (-1) — only items the shop counts. */
export async function moveChallanStock(admin: Admin, shopId: string, items: ChallanLine[], sign: 1 | -1): Promise<void> {
  const ids = [...new Set(items.map((i) => i.productId).filter((x): x is string => !!x))];
  if (!ids.length) return;
  const { data: tracked } = await admin.from("products").select("id").eq("shop_id", shopId).eq("track_inventory", true).in("id", ids);
  const counted = new Set((tracked ?? []).map((p) => p.id));
  for (const i of items) {
    if (!i.productId || !counted.has(i.productId) || !(i.quantity > 0)) continue;
    await admin.rpc(sign > 0 ? "increment_stock" : "decrement_stock", { p_product_id: i.productId, p_quantity: i.quantity });
  }
  await invalidateCache(`ray:cache:products:${shopId}`);
}

/** A bill was made from these challans: they point to it, and the goods they had already taken
 * off stock go back — the bill has just taken them again, so they are counted once. */
export async function settleChallansForBill(admin: Admin, shopId: string, challanIds: string[], billId: string): Promise<void> {
  if (!challanIds.length || !(await gapsReady(admin))) return;
  const { data: rows } = await admin.from("delivery_challans").select("id, items, stock_taken").eq("shop_id", shopId).eq("status", "open").in("id", challanIds);
  for (const c of rows ?? []) {
    const { data: done } = await admin.from("delivery_challans").update({ status: "billed", bill_id: billId }).eq("id", c.id).eq("status", "open").select("id");
    if (done?.length && c.stock_taken) await moveChallanStock(admin, shopId, c.items, 1);
  }
}

/** The bill made from challans was voided: they are open again and hold their goods again. */
export async function reopenChallansOfBill(admin: Admin, shopId: string, billId: string): Promise<void> {
  if (!(await gapsReady(admin))) return;
  const { data: rows } = await admin.from("delivery_challans").select("id, items, stock_taken").eq("shop_id", shopId).eq("bill_id", billId).eq("status", "billed");
  for (const c of rows ?? []) {
    await admin.from("delivery_challans").update({ status: "open", bill_id: null }).eq("id", c.id);
    if (c.stock_taken) await moveChallanStock(admin, shopId, c.items, -1);
  }
}
