import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { RequestsClient } from "./RequestsClient";

export default async function RequestsPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const [{ data: requests }, { data: customers }] = await Promise.all([
    admin
      .from("item_requests")
      .select(
        "id, customer_name, customer_phone, item_description, advance_amount, expected_date, status, notes, created_at",
      )
      .eq("shop_id", session.shopId)
      .order("created_at", { ascending: false }),
    admin.from("customers").select("id, name, phone").eq("shop_id", session.shopId).order("name"),
  ]);

  return (
    <RequestsClient
      shopName={session.shopName}
      customers={customers ?? []}
      requests={(requests ?? []).map((r) => ({
        id: r.id,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        itemDescription: r.item_description,
        advanceAmount: Number(r.advance_amount),
        expectedDate: r.expected_date,
        status: r.status,
        notes: r.notes,
        createdAt: r.created_at,
      }))}
    />
  );
}
