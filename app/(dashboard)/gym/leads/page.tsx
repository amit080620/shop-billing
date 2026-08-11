import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { LeadsClient } from "./LeadsClient";

export default async function GymLeadsPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: leads } = await admin
    .from("leads")
    .select("id, name, phone, source, interested_plan, status, notes, created_at")
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false });

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
