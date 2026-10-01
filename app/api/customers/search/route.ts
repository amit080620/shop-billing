import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";

/** Customers matching what is being typed at the counter: digits match the
 * mobile number from its start, letters match the name. A plain GET, not a
 * server action, so typing never waits behind a bill being saved. Older
 * customers saved as "+91…" are found too. */
export async function GET(request: Request) {
  const session = await requireSession();
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 40);
  const digits = q.replace(/\D/g, "");
  const isPhone = digits.length > 0 && /^[\d\s+-]+$/.test(q);
  if ((isPhone && digits.length < 3) || (!isPhone && q.length < 2)) return Response.json([], { headers: { "Cache-Control": "no-store" } });

  let query = createSupabaseAdminClient().from("customers").select("id, name, phone, loyalty_points").eq("shop_id", session.shopId).limit(8);
  if (isPhone) {
    const n = normalizePhone(digits);
    query = query.or(`phone.like.${n}%,phone.like.+91${n}%`).order("name");
  } else {
    query = query.ilike("name", `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`).order("name");
  }
  const { data } = await query;
  const customers = (data ?? []).map((c) => ({ id: c.id, name: c.name, phone: normalizePhone(c.phone ?? ""), loyaltyPoints: Number(c.loyalty_points ?? 0) }));
  return Response.json(customers, { headers: { "Cache-Control": "no-store" } });
}
