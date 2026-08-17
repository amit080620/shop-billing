import { requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PlansClient } from "./PlansClient";

export default async function GymPlansPage() {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const { data: plans } = await admin
    .from("membership_plans")
    .select("id, name, duration_days, price, pt_sessions_included, is_active")
    .eq("shop_id", session.shopId)
    .order("created_at");

  return (
    <PlansClient
      plans={(plans ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        durationDays: p.duration_days,
        price: Number(p.price),
        ptSessionsIncluded: p.pt_sessions_included,
        isActive: p.is_active,
      }))}
    />
  );
}
