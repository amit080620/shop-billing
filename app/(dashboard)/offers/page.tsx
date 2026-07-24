import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { OffersClient } from "./OffersClient";

export default async function OffersPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: customers } = await admin
    .from("customers")
    .select("id, name, phone")
    .eq("shop_id", session.shopId)
    .order("name");

  return <OffersClient shopName={session.shopName} customers={customers ?? []} />;
}
