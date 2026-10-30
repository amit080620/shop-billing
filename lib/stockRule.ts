import "server-only";
import type { createSupabaseAdminClient } from "./supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Does this shop refuse a bill for more than its stock (Settings → Stock)? On unless the owner
 * switched it off (migration 0060 turned it on for every shop); on too when it can't be read just
 * now. Off where the setting doesn't exist yet (migrations 0059/0060 not run), as before them. */
export async function shopBlocksOversell(admin: Admin, shopId: string): Promise<boolean> {
  const { data, error } = await admin.from("shops").select("block_oversell").eq("id", shopId).maybeSingle();
  if (error) return !missingColumn(error);
  return (data as { block_oversell?: boolean } | null)?.block_oversell !== false;
}

/** The database (or its API) doesn't know the column yet. */
export function missingColumn(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" || error.code === "PGRST204" || /column .* does not exist|could not find .* column/i.test(error.message ?? "");
}

const qtyText = (n: number) => String(Number(Number(n).toFixed(3)));

/** The counter's words for a refused sale. */
export function shortMessage(name: string, available: number, requested: number, unit = ""): string {
  const u = unit ? ` ${unit}` : "";
  return available > 0
    ? `${name}: only ${qtyText(available)}${u} in stock — ${qtyText(requested)}${u} asked for.`
    : `${name} is out of stock (${qtyText(available)}${u} in stock, ${qtyText(requested)}${u} asked for).`;
}

/** A stock typed over on an item: never below zero. An item already below zero (from before this
 * rule) may keep its count or be corrected upward — never made worse. */
export function stockEditError(next: number, before: number): string | null {
  if (!Number.isFinite(next)) return "Enter the stock as a number.";
  if (next >= 0 || next >= before - 1e-9) return null;
  return before < 0 ? `Stock can't go lower than it is (${qtyText(before)}) — it can only be corrected upward, to 0 or more.` : "Stock can't be below 0.";
}

type Line = { productId: string | null; productName: string; stockQuantity?: number | null; quantity: number };
type Stocked = { name: string; track_inventory: boolean; stock_quantity: number | string; unit?: string | null };

/** The first item on the bill that wants more than is in stock (all its lines together), as a
 * message for the counter — or null when every tracked item has enough. */
export function oversellError(lines: Line[], products: Map<string, Stocked>, skip: Set<string> = new Set()): string | null {
  const wanted = new Map<string, number>();
  for (const l of lines) {
    if (!l.productId || skip.has(l.productId)) continue;
    wanted.set(l.productId, (wanted.get(l.productId) ?? 0) + Number(l.stockQuantity ?? l.quantity));
  }
  for (const [id, qty] of wanted) {
    const p = products.get(id);
    if (!p?.track_inventory) continue;
    const left = Number(p.stock_quantity);
    if (qty > left + 1e-9) return `${shortMessage(p.name, left, qty, p.unit ?? "")} This shop doesn't bill more than its stock (Settings → Stock).`;
  }
  return null;
}
