import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { NewTreatmentPlanClient } from "./NewTreatmentPlanClient";

export default async function NewTreatmentPlanPage() {
  const session = await requireSession();
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const { data: patients } = await admin
    .from("customers")
    .select("id, name, phone")
    .eq("shop_id", session.shopId)
    .order("name");

  return (
    <NewTreatmentPlanClient
      lang={lang}
      patients={(patients ?? []).map((p) => ({ id: p.id, name: p.name, phone: p.phone }))}
    />
  );
}
