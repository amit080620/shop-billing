import { requireSession } from "@/lib/auth";
import { BottomNav } from "./BottomNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="no-print sticky top-0 z-10 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {session.shopName}
            </p>
            <p className="text-xs text-muted">
              {session.staffName} · {session.role === "owner" ? "Owner" : "Staff"}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-4">{children}</main>

      <BottomNav />
    </div>
  );
}
