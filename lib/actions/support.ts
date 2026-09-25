"use server";

import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SupportCategory = "billing" | "technical" | "feature" | "other";

/** Reuses the existing sales_enquiries table (kind: "custom") rather than
 * a new one — a support ticket and a "build me a custom plan" enquiry are
 * different things, but the underlying record (who, what, when, a status
 * to work it) is identical, and the admin already has a working inbox for
 * this table at /admin/enquiries. The [Support/category] prefix on `item`
 * is what tells the two apart there, without needing a schema change (the
 * `kind` column is constrained to a fixed set of values a migration would
 * be needed to extend). The row's own id becomes a short reference number
 * the shop can quote — no separate ticket-numbering sequence needed. */
export async function submitSupportRequestAction(
  category: SupportCategory,
  message: string,
): Promise<{ ok: boolean; ticketId?: string; error?: string }> {
  const session = await requireSession();
  const trimmed = message.trim();
  if (!trimmed) return { ok: false, error: "Please describe the issue first." };

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("sales_enquiries")
    .insert({ shop_id: session.shopId, kind: "custom", item: `[Support/${category}] ${trimmed.slice(0, 500)}` })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "Could not send — please try again, or WhatsApp us directly." };
  return { ok: true, ticketId: `SR-${data.id.slice(0, 8).toUpperCase()}` };
}
