import "server-only";
import type { createSupabaseAdminClient } from "../supabase/admin";
import { garmentSchemaReady } from "./server";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type Line = { productId: string; quantity: number };

/** A garment shop's purchase goes into a godown through gd_saleable_in (migration 0063): the
 * godown's stock (the shop floor's is the rest of the total), the shop's total and a ledger row
 * marked with the purchase, per item. The godown is the one picked on the purchase when the plan has
 * godowns, else the shop floor. Returns null when the shop has no godowns yet; `left` holds the lines
 * that could not be placed, which the caller still puts in stock the plain way. */
export async function receivePurchaseIntoGodown(
  admin: Admin,
  opts: { shopId: string; staffId: string; purchaseId: string; billNumber: string; note: string; godownId: string | null; mayChoose: boolean; lines: Line[] },
): Promise<{ godown: { id: string; name: string; isDefault: boolean }; left: Line[] } | null> {
  if (!opts.lines.length || !(await garmentSchemaReady(admin))) return null;
  const { data: godowns } = await admin.from("godowns").select("id, name, is_default, is_active").eq("shop_id", opts.shopId);
  const active = (godowns ?? []).filter((g) => g.is_active !== false);
  const fallback = active.find((g) => g.is_default);
  if (!fallback) return null;
  const picked = opts.mayChoose && opts.godownId ? active.find((g) => g.id === opts.godownId) : undefined;
  const target = picked ?? fallback;

  const left: Line[] = [];
  // A few at a time: each call locks its item, and a bill of 40 sizes shouldn't take 40 round trips.
  for (let i = 0; i < opts.lines.length; i += 6) {
    const chunk = opts.lines.slice(i, i + 6);
    const results = await Promise.all(
      chunk.map((l) =>
        admin.rpc("gd_saleable_in", {
          p_shop: opts.shopId,
          p_godown: target.id,
          p_product: l.productId,
          p_qty: l.quantity,
          p_kind: "purchase",
          p_ref_type: "purchase",
          p_ref_id: opts.purchaseId,
          p_ref_number: opts.billNumber,
          p_staff: opts.staffId,
          p_note: opts.note,
        }),
      ),
    );
    results.forEach((r, j) => {
      if (r.error) {
        console.error("Purchase line not placed in the godown", opts.purchaseId, chunk[j].productId, r.error.message);
        left.push(chunk[j]);
      }
    });
  }
  return { godown: { id: target.id, name: target.name, isDefault: !!target.is_default }, left };
}
