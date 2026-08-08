import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { NewClinicAppointmentClient } from "./NewClinicAppointmentClient";

export default async function NewClinicAppointmentPage() {
  const session = await requireSession();
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const { data: patients } = await admin
    .from("customers")
    .select("id, name, phone")
    .eq("shop_id", session.shopId)
    .order("name");

  return <NewClinicAppointmentClient patients={patients ?? []} lang={lang} />;
}
