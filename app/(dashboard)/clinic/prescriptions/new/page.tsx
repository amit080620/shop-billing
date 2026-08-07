import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NewPrescriptionClient } from "./NewPrescriptionClient";

export default async function NewPrescriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ appointmentId?: string; patientName?: string; patientPhone?: string }>;
}) {
  const session = await requireSession();
  const { appointmentId, patientName, patientPhone } = await searchParams;
  const admin = createSupabaseAdminClient();

  const [{ data: patients }, { data: settings }] = await Promise.all([
    admin.from("customers").select("id, name, phone, date_of_birth, gender").eq("shop_id", session.shopId).order("name"),
    admin.from("prescription_settings").select("custom_field_labels").eq("shop_id", session.shopId).maybeSingle(),
  ]);

  return (
    <NewPrescriptionClient
      patients={(patients ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        dateOfBirth: p.date_of_birth,
        gender: p.gender,
      }))}
      fieldLabels={settings?.custom_field_labels ?? ["Chief Complaint", "Diagnosis", "Advice"]}
      appointmentId={appointmentId ?? null}
      prefillPatientName={patientName ?? ""}
      prefillPatientPhone={patientPhone ?? ""}
    />
  );
}
