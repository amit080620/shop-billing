import "server-only";
import type { createSupabaseAdminClient } from "./supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Does this shop refuse a bill for more than its stock (Settings → Stock)? Off until the owner
 * switches it on, and off where migration 0059 hasn't been run. */
export async function shopBlocksOversell(admin: Admin, shopId: string): Promise<boolean> {
  const { data, error } = await admin.from("shops").select("block_oversell").eq("id", shopId).maybeSingle();
  if (error) return false;
  return !!(data as { block_oversell?: boolean } | null)?.block_oversell;
}

type Line = { productId: string | null; productName: string; stockQuantity?: number | null; quantity: number };
type Stocked = { name: string; track_inventory: boolean; stock_quantity: number | string };

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
    if (qty > left + 1e-9) {
      return left > 0
        ? `${p.name}: only ${Number(left.toFixed(3))} left in stock. This shop doesn't bill more than its stock (Settings → Stock).`
        : `${p.name} is out of stock. This shop doesn't bill items it has none of (Settings → Stock).`;
    }
  }
  return null;
}
