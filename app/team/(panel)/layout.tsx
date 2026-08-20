import { requireTeamViewer, teamLogoutAction } from "@/lib/actions/team-auth";
import { Eye } from "lucide-react";

export default async function TeamPanelLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireTeamViewer();

  return (
    <div className="admin-shell min-h-screen bg-gray-950 text-gray-100">
      <header className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-gray-900">
            <Eye size={16} />
          </span>
          <span className="text-sm font-semibold">Leads Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-300">{viewer.name}</span>
          <form action={teamLogoutAction}>
            <button type="submit" className="text-xs font-medium text-gray-300 underline">
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-2xl p-4">{children}</main>
    </div>
  );
}
