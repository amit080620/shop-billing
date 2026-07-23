import Image from "next/image";
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
        <div className="mx-auto flex max-w-lg items-center gap-3">
          {session.shopLogoUrl && (
            <Image
              src={session.shopLogoUrl}
              alt=""
              width={32}
              height={32}
              unoptimized
              className="h-8 w-8 shrink-0 rounded-md object-contain"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
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
