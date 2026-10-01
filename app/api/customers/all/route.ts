import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";

/** The shop's customers in a compact form — [id, name, phone, points] — fetched once by the
 * counter, which then searches them on the phone itself as a number or name is typed: no request
 * per keystroke, so suggestions are instant even on a weak connection. One page of the most
 * recent customers; when a shop has more, `complete` is false and the counter asks the server. */
export async function GET() {
  const session = await requireSession();
  const { data, count } = await createSupabaseAdminClient()
    .from("customers")
    .select("id, name, phone, loyalty_points", { count: "exact" })
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false })
    .limit(1000);
  const rows = (data ?? []).map((c) => [c.id, c.name, normalizePhone(c.phone ?? ""), Number(c.loyalty_points ?? 0)]);
  return Response.json({ shop: session.shopId, complete: (count ?? rows.length) <= rows.length, rows }, { headers: { "Cache-Control": "private, no-store" } });
}
