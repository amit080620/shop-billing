import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { LeadsClient } from "./LeadsClient";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";

export default async function GymLeadsPage() {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "leads_crm")) return <ModuleBlocked moduleKey="leads_crm" />;
  const admin = createSupabaseAdminClient();

  const { data: leads } = await admin
    .from("leads")
    .select("id, name, phone, source, interested_plan, status, notes, created_at")
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <LeadsClient
      leads={(leads ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        source: l.source,
        interestedPlan: l.interested_plan,
        status: l.status,
        notes: l.notes,
        createdAt: l.created_at,
      }))}
    />
  );
}
