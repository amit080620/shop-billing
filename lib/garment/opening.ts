import "server-only";
import { randomInt } from "node:crypto";
import type { createSupabaseAdminClient } from "../supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** An in-store EAN-13 (prefix 29: valid only inside the shop), with its check digit. */
export function inStoreEan13(): string {
  const body = `29${String(randomInt(0, 10_000_000_000)).padStart(10, "0")}`;
  const sum = body.split("").reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return body + ((10 - (sum % 10)) % 10);
}

/** Opening stock at a godown: a count marked "opening", approved and posted at once, so it lands in
 * the ledger like any count, all lines in the posting's one transaction. `lines` give what the
 * godown should hold after it. Returns the refused database error, or null. */
export async function postOpeningCount(
  admin: Admin,
  opts: { shopId: string; staffId: string; godownId: string; lines: { product_id: string; physical: number }[]; note: string },
): Promise<{ message: string; details?: string | null } | null> {
  const { data: number } = await admin.rpc("next_godown_doc_number", { p_shop: opts.shopId, p_kind: "count", p_prefix: "OP" });
  const { data: count, error } = await admin
    .from("godown_counts")
    .insert({ shop_id: opts.shopId, number: number ?? `OP/${Date.now()}`, godown_id: opts.godownId, purpose: "opening", created_by: opts.staffId })
    .select("id")
    .single();
  if (error || !count) return { message: "Couldn't start the opening stock entry." };
  for (const [fn, args] of [
    ["count_submit", { p_shop: opts.shopId, p_count: count.id, p_lines: opts.lines, p_staff: opts.staffId }],
    ["count_action", { p_shop: opts.shopId, p_count: count.id, p_action: "approve", p_staff: opts.staffId }],
    ["count_action", { p_shop: opts.shopId, p_count: count.id, p_action: "post", p_staff: opts.staffId, p_note: opts.note }],
  ] as const) {
    const { error: e } = await admin.rpc(fn as "count_submit", args as never);
    if (e) return e;
  }
  return null;
}
