import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { NewTreatmentPlanClient } from "./NewTreatmentPlanClient";

export default async function NewTreatmentPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; patientName?: string; patientPhone?: string; doctorName?: string }>;
}) {
  const session = await requireSession();
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();
  const { patientId, patientName, patientPhone, doctorName } = await searchParams;

  const { data: patients } = await admin
    .from("customers")
    .select("id, name, phone")
    .eq("shop_id", session.shopId)
    .order("name");

  return (
    <NewTreatmentPlanClient
      lang={lang}
      patients={(patients ?? []).map((p) => ({ id: p.id, name: p.name, phone: p.phone }))}
      prefillPatientId={patientId}
      prefillPatientName={patientName}
      prefillPatientPhone={patientPhone}
      prefillDoctorName={doctorName}
    />
  );
}
