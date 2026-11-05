import "server-only";
import type { createSupabaseAdminClient } from "../supabase/admin";
import { allRows } from "../supabase/allRows";
import { latestUnitCosts } from "./data";
import type { SalesItem, SalesLine } from "./sales";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const istStart = (day: string) => `${day}T00:00:00+05:30`;
const istEnd = (day: string) => `${day}T23:59:59.999+05:30`;

/** Every tracked item with its style, stock and latest purchase price (null: never bought here). */
export async function loadSalesItems(admin: Admin, shopId: string): Promise<SalesItem[]> {
  const [{ data: products }, { data: styles }] = await Promise.all([
    allRows((a, b) => admin.from("products").select("id, name, style_id, variant_colour, variant_size, stock_quantity").eq("shop_id", shopId).eq("track_inventory", true).order("id").range(a, b)),
    allRows((a, b) => admin.from("product_styles").select("id, name").eq("shop_id", shopId).order("id").range(a, b)),
  ]);
  const styleName = new Map((styles ?? []).map((s) => [s.id, s.name]));
  const costs = await latestUnitCosts(admin, shopId, (products ?? []).map((p) => p.id));
  return (products ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    styleId: p.style_id ?? null,
    styleName: p.style_id ? (styleName.get(p.style_id) ?? null) : null,
    colour: p.variant_colour ?? null,
    size: p.variant_size ?? null,
    stock: Number(p.stock_quantity),
    cost: costs.get(p.id) ?? null,
  }));
}

/** The lines of active bills on IST days `from`…`to`, less the returns made in those days. */
export async function loadSalesLines(admin: Admin, shopId: string, from: string, to: string): Promise<SalesLine[]> {
  const [{ data: bills }, { data: returns }] = await Promise.all([
    allRows((a, b) => admin.from("bills").select("id").eq("shop_id", shopId).eq("status", "active").gte("created_at", istStart(from)).lte("created_at", istEnd(to)).order("id").range(a, b)),
    allRows((a, b) => admin.from("returns").select("id").eq("shop_id", shopId).gte("created_at", istStart(from)).lte("created_at", istEnd(to)).order("id").range(a, b)),
  ]);
  const out: SalesLine[] = [];
  const billIds = (bills ?? []).map((x) => x.id);
  for (let i = 0; i < billIds.length; i += 200) {
    const { data } = await admin.from("bill_items").select("product_id, quantity, line_subtotal, line_total").in("bill_id", billIds.slice(i, i + 200));
    for (const l of data ?? []) out.push({ productId: l.product_id, quantity: Number(l.quantity), taxable: Number(l.line_subtotal), total: Number(l.line_total) });
  }
  const returnIds = (returns ?? []).map((x) => x.id);
  for (let i = 0; i < returnIds.length; i += 200) {
    const { data } = await admin.from("return_items").select("product_id, quantity, line_subtotal, line_total").in("return_id", returnIds.slice(i, i + 200));
    for (const l of data ?? []) out.push({ productId: l.product_id, quantity: -Number(l.quantity), taxable: -Number(l.line_subtotal), total: -Number(l.line_total) });
  }
  return out;
}
