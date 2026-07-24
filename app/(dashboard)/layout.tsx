import Image from "next/image";
import { requireSession } from "@/lib/auth";
import { getLang } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/dictionary";
import { BottomNav } from "./BottomNav";
import { WelcomeTour } from "./WelcomeTour";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const lang = await getLang();

  return (
    <div className="min-h-screen bg-background pb-24">
      <header
        className="no-print sticky top-0 z-10 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur-md"
        style={{ boxShadow: "0 1px 12px hsl(220 20% 40% / 0.05)" }}
      >
        <div className="mx-auto flex max-w-lg items-center gap-3">
          {session.shopLogoUrl ? (
            <Image
              src={session.shopLogoUrl}
              alt=""
              width={36}
              height={36}
              unoptimized
              className="h-9 w-9 shrink-0 rounded-full object-contain ring-2 ring-brand-soft"
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
              {session.shopName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {session.shopName}
            </p>
            <p className="text-xs text-muted">
              {session.staffName} · {session.role === "owner" ? translate(lang, "role.owner") : translate(lang, "role.staff")}
            </p>
          </div>
        </div>
      </header>

      <main className="page-enter mx-auto max-w-lg px-4 py-4">{children}</main>

      <BottomNav lang={lang} />
      <WelcomeTour storageKey={`tour-seen-${session.shopId}`} />
    </div>
  );
}
