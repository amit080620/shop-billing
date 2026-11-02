import "server-only";
import type { createSupabaseAdminClient } from "./supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type LastPurchase = { rate: number; gstPercent: number; date: string; vendorId: string; freeQuantity: number; quantity: number };

/** Each item's latest purchase — the rate paid (before GST, after the vendor's discount), its GST,
 * date and vendor — from the shop's most recent purchases. The purchase screen shows it beside each
 * line and fills the rate from it; the rate list uses it as the item's cost. */
export async function lastPurchases(admin: Admin, shopId: string, recent = 400): Promise<Map<string, LastPurchase>> {
  const out = new Map<string, LastPurchase>();
  const { data: purchases } = await admin
    .from("purchases")
    .select("id, purchase_date, created_at, vendor_id")
    .eq("shop_id", shopId)
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(recent);
  if (!purchases?.length) return out;
  const order = new Map(purchases.map((p, i) => [p.id, i]));
  const byId = new Map(purchases.map((p) => [p.id, p]));
  const lines: { purchase_id: string; product_id: string | null; unit_price: number; gst_percent: number; quantity: number; free_quantity: number }[] = [];
  for (let i = 0; i < purchases.length; i += 100) {
    const { data } = await admin
      .from("purchase_items")
      .select("purchase_id, product_id, unit_price, gst_percent, quantity, free_quantity")
      .in("purchase_id", purchases.slice(i, i + 100).map((p) => p.id));
    lines.push(...(data ?? []));
  }
  lines.sort((a, b) => (order.get(a.purchase_id) ?? 0) - (order.get(b.purchase_id) ?? 0));
  for (const l of lines) {
    if (!l.product_id || out.has(l.product_id)) continue;
    const p = byId.get(l.purchase_id)!;
    out.set(l.product_id, { rate: Number(l.unit_price), gstPercent: Number(l.gst_percent), date: p.purchase_date, vendorId: p.vendor_id, freeQuantity: Number(l.free_quantity ?? 0), quantity: Number(l.quantity) });
  }
  return out;
}

/** The cost of one piece on the shelf from the latest purchase (free pieces spread the cost). */
export function costOf(last: LastPurchase | undefined): number | null {
  if (!last || last.rate <= 0) return null;
  const pieces = last.quantity + last.freeQuantity;
  return pieces > 0 ? Math.round(((last.rate * last.quantity) / pieces) * 100) / 100 : last.rate;
}
