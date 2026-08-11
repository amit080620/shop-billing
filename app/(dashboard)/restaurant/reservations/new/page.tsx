import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { NewReservationClient } from "./NewReservationClient";

export default async function NewReservationPage() {
  const session = await requireSession();
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const [{ data: customers }, { data: tables }] = await Promise.all([
    admin.from("customers").select("id, name, phone").eq("shop_id", session.shopId).order("name"),
    admin.from("restaurant_tables").select("id, name").eq("shop_id", session.shopId).order("name"),
  ]);

  return <NewReservationClient customers={customers ?? []} tables={tables ?? []} lang={lang} />;
}
