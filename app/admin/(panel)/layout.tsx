import { requireSuperAdmin } from "@/lib/admin-auth";
import { Settings } from "lucide-react";
import { adminLogoutAction } from "@/lib/actions/admin-auth";
import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SUPPORT_PREFIX } from "@/lib/support";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireSuperAdmin();
  // What's waiting for the team: new support requests and new sales enquiries (from migration 0040).
  const db = createSupabaseAdminClient();
  const [{ count: newSupport }, { count: newEnquiries }] = await Promise.all([
    db.from("sales_enquiries").select("id", { count: "exact", head: true }).eq("status", "new").eq("kind", "custom").like("item", `${SUPPORT_PREFIX}%`),
    db.from("sales_enquiries").select("id", { count: "exact", head: true }).eq("status", "new").neq("kind", "upcoming").not("item", "like", `${SUPPORT_PREFIX}%`),
  ]).catch(() => [{ count: 0 }, { count: 0 }]);
  const badge = (n: number | null) => (n ? <span className="ml-1 rounded-full bg-red-600 px-1.5 py-px text-[10px] font-bold text-white">{n}</span> : null);

  return (
    <div className="admin-shell min-h-screen bg-gray-950 text-gray-100">
      <header className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-gray-900">
            <Settings size={16} />
          </span>
          <span className="text-sm font-semibold">Platform Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-300">{admin.name}</span>
          <form action={adminLogoutAction}>
            <button type="submit" className="text-xs font-medium text-gray-300 underline">
              Log out
            </button>
          </form>
        </div>
      </header>
      <nav className="flex gap-1 overflow-x-auto border-b border-gray-800 px-4 py-2 text-xs font-medium">
        <Link href="/admin" className="rounded-lg px-2.5 py-1.5 text-gray-300 hover:bg-gray-800">
          Shops
        </Link>
        <Link href="/admin/support" className="flex items-center rounded-lg px-2.5 py-1.5 text-gray-300 hover:bg-gray-800">
          Support {badge(newSupport)}
        </Link>
        <Link href="/admin/enquiries" className="flex items-center rounded-lg px-2.5 py-1.5 text-gray-300 hover:bg-gray-800">
          Enquiries {badge(newEnquiries)}
        </Link>
      </nav>
      <main className="mx-auto max-w-2xl p-4">{children}</main>
    </div>
  );
}
