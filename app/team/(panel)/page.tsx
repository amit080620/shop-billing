import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/format";
import { Users } from "lucide-react";

export default async function TeamLeadsPage() {
  const admin = createSupabaseAdminClient();

  const { data: shops } = await admin
    .from("shops")
    .select("id, name, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: owners } = await admin.from("staff").select("id, shop_id, name").eq("role", "owner");
  const ownerByShop = new Map((owners ?? []).map((o) => [o.shop_id, o]));

  // Email lives in Supabase Auth, not a regular table — one lookup per
  // owner via the admin API, same pattern the Super Admin panel already
  // uses for this. Genuinely read-only: getUserById never mutates anything.
  const shopsWithContact = await Promise.all(
    (shops ?? []).map(async (shop) => {
      const owner = ownerByShop.get(shop.id);
      let email: string | null = null;
      if (owner) {
        const { data: authUser } = await admin.auth.admin.getUserById(owner.id);
        email = authUser?.user?.email ?? null;
      }
      return { ...shop, ownerName: owner?.name ?? "—", email };
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Users size={18} />
        <h1 className="text-lg font-bold text-white">New signups</h1>
      </div>
      <p className="text-xs text-gray-400">
        View-only. For follow-up, contact the owner directly using the details below.
      </p>

      <div className="flex flex-col gap-2">
        {shopsWithContact.map((shop) => (
          <div key={shop.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p className="text-sm font-semibold text-white">{shop.name}</p>
            <p className="mt-1 text-xs text-gray-300">Owner: {shop.ownerName}</p>
            {shop.email && <p className="text-xs text-gray-300">{shop.email}</p>}
            <p className="mt-1 text-[11px] text-gray-500">Signed up {formatDateTime(shop.created_at)}</p>
          </div>
        ))}
        {shopsWithContact.length === 0 && <p className="text-sm text-gray-400">No signups yet.</p>}
      </div>
    </div>
  );
}
