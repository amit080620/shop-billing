import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NewReservationClient } from "./NewReservationClient";

export default async function NewReservationPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: customers } = await admin
    .from("customers")
    .select("id, name, phone")
    .eq("shop_id", session.shopId)
    .order("name");

  return <NewReservationClient customers={customers ?? []} />;
}
