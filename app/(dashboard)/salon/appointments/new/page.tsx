import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NewAppointmentClient } from "./NewAppointmentClient";

export default async function NewAppointmentPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const [{ data: customers }, { data: products }] = await Promise.all([
    admin.from("customers").select("id, name, phone").eq("shop_id", session.shopId).order("name"),
    admin.from("products").select("id, name").eq("shop_id", session.shopId).order("name"),
  ]);

  return <NewAppointmentClient customers={customers ?? []} services={products ?? []} />;
}
