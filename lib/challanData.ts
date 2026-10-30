import type { createSupabaseAdminClient } from "./supabase/admin";
import { gapsReady } from "./gapsData";
import { invalidateCache } from "./cache";
import type { ChallanLine } from "./challans";
import { moveStock, type StockMoveResult } from "./stockMoves";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Puts a challan's goods back on the shelf (sign +1) or takes them off (-1) — only items the shop
 * counts, all together in one go (lib/stockMoves). Taking more than is in stock is refused unless
 * `allowShort` (then stock stops at zero and the shortfall is written down). */
export async function moveChallanStock(
  admin: Admin,
  shopId: string,
  items: ChallanLine[],
  sign: 1 | -1,
  opts: { staffId: string | null; challanId?: string | null; allowShort: boolean },
): Promise<StockMoveResult> {
  const ids = [...new Set(items.map((i) => i.productId).filter((x): x is string => !!x))];
  if (!ids.length) return { ok: true };
  const { data: tracked } = await admin.from("products").select("id").eq("shop_id", shopId).eq("track_inventory", true).in("id", ids);
  const counted = new Set((tracked ?? []).map((p) => p.id));
  const lines = items.filter((i) => i.productId && counted.has(i.productId) && Number(i.quantity) > 0).map((i) => ({ productId: i.productId, quantity: Number(i.quantity) }));
  const result = await moveStock(admin, { shopId, staffId: opts.staffId, source: "challan", sourceId: opts.challanId ?? null, ...(sign > 0 ? { give: lines } : { take: lines }), allowShort: opts.allowShort });
  if (!result.ok) console.error("Could not move a challan's stock", opts.challanId, result.error);
  await invalidateCache(`ray:cache:products:${shopId}`);
  return result;
}

/** A bill was made from these challans: they point to it. The bill did not take their goods off
 * stock again (createBillCore skips what they already took); any of their goods left off the bill
 * came back, so those go back on the shelf. */
export async function settleChallansForBill(admin: Admin, shopId: string, challanIds: string[], billId: string): Promise<void> {
  if (!challanIds.length || !(await gapsReady(admin))) return;
  const { data: rows } = await admin.from("delivery_challans").select("id, items, stock_taken").eq("shop_id", shopId).eq("status", "open").in("id", challanIds);
  const out = new Map<string, number>();
  for (const c of rows ?? []) {
    const { data: done } = await admin.from("delivery_challans").update({ status: "billed", bill_id: billId }).eq("id", c.id).eq("status", "open").select("id");
    if (done?.length && c.stock_taken) for (const l of c.items) if (l.productId) out.set(l.productId, (out.get(l.productId) ?? 0) + Number(l.quantity));
  }
  if (!out.size) return;
  const { data: lines } = await admin.from("bill_items").select("product_id, quantity").eq("bill_id", billId);
  const billed = new Map<string, number>();
  for (const l of lines ?? []) if (l.product_id) billed.set(l.product_id, (billed.get(l.product_id) ?? 0) + Number(l.quantity));
  const back = [...out].map(([productId, qty]) => ({ productId, name: "", unit: "", quantity: Math.round((qty - (billed.get(productId) ?? 0)) * 1000) / 1000 })).filter((l) => l.quantity > 0);
  if (back.length) await moveChallanStock(admin, shopId, back, 1, { staffId: null, challanId: null, allowShort: false });
}

/** The bill made from challans was voided: they are open again and hold their goods again. */
export async function reopenChallansOfBill(admin: Admin, shopId: string, billId: string): Promise<void> {
  if (!(await gapsReady(admin))) return;
  const { data: rows } = await admin.from("delivery_challans").select("id, items, stock_taken").eq("shop_id", shopId).eq("bill_id", billId).eq("status", "billed");
  for (const c of rows ?? []) {
    await admin.from("delivery_challans").update({ status: "open", bill_id: null }).eq("id", c.id);
    // The goods are out with the customer again: taken whatever the stock says (never below zero).
    if (c.stock_taken) await moveChallanStock(admin, shopId, c.items, -1, { staffId: null, challanId: c.id, allowShort: true });
  }
}
