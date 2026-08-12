import { requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { StaffClient } from "./StaffClient";

export default async function StaffPage() {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const { data: staff } = await admin
    .from("staff")
    .select("id, name, role, permissions, created_at")
    .eq("shop_id", session.shopId)
    .order("created_at");

  // staff.id is the same id as the Supabase Auth user (1:1) — email
  // lives in Auth, not the staff table, so it's fetched per-row here.
  const emails = await Promise.all(
    (staff ?? []).map(async (s) => {
      const { data } = await admin.auth.admin.getUserById(s.id);
      return [s.id, data.user?.email ?? null] as const;
    }),
  );
  const emailById = new Map(emails);

  return (
    <StaffClient
      currentUserId={session.userId}
      initialStaff={(staff ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        permissions: (s.permissions as string[] | null) ?? [],
        email: emailById.get(s.id) ?? null,
      }))}
    />
  );
}
