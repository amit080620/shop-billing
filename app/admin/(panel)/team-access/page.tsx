import { requireSuperAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { TeamAccessClient } from "./TeamAccessClient";

export default async function TeamAccessPage() {
  await requireSuperAdmin();
  const admin = createSupabaseAdminClient();

  const { data: viewers } = await admin.from("team_viewers").select("user_id, name, created_at").order("created_at", { ascending: false });

  const viewersWithEmail = await Promise.all(
    (viewers ?? []).map(async (v) => {
      const { data: authUser } = await admin.auth.admin.getUserById(v.user_id);
      return { ...v, email: authUser?.user?.email ?? null };
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-white">Leads Dashboard access</h1>
        <p className="mt-1 text-sm text-gray-300">
          Everyone listed here can view new signups, read-only. Nobody outside this list — and only you, from
          here — can create, reset, or remove that access.
        </p>
      </div>
      <TeamAccessClient viewers={viewersWithEmail.map((v) => ({ userId: v.user_id, name: v.name, email: v.email, createdAt: v.created_at }))} />
    </div>
  );
}
