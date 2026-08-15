import { requireSuperAdmin } from "@/lib/admin-auth";
import { Settings } from "lucide-react";
import { adminLogoutAction } from "@/lib/actions/admin-auth";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireSuperAdmin();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-gray-900">
            <Settings size={16} />
          </span>
          <span className="text-sm font-semibold">Platform Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{admin.name}</span>
          <form action={adminLogoutAction}>
            <button type="submit" className="text-xs font-medium text-gray-400 underline">
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-2xl p-4">{children}</main>
    </div>
  );
}
