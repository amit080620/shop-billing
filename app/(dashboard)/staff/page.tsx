import { requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { StaffClient } from "./StaffClient";

export default async function StaffPage() {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const { data: staff } = await admin
    .from("staff")
    .select("id, name, role, created_at")
    .eq("shop_id", session.shopId)
    .order("created_at");

  return (
    <StaffClient
      currentUserId={session.userId}
      initialStaff={(staff ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
      }))}
    />
  );
}
