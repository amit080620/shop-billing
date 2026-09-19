import Image from "next/image";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getLang } from "@/lib/i18n/server";
import { LangProvider } from "@/lib/i18n/LangContext";
import { translate } from "@/lib/i18n/dictionary";
import { BottomNav } from "./BottomNav";
import { DesktopSidebar } from "./DesktopSidebar";
import { WelcomeTour } from "./WelcomeTour";
import { UniversalSearch } from "@/app/components/UniversalSearch";
import { CatalogOrderAlert } from "@/app/components/CatalogOrderAlert";
import { isModuleEnabled } from "@/lib/modules";
import { HamburgerToggle } from "./HamburgerToggle";
import { LazyFloatingWidgets } from "@/app/components/LazyFloatingWidgets";
import { getCalculatorEnabled, getAssistantEnabled } from "@/lib/theme";
import { HeaderTools } from "@/app/components/HeaderTools";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  // Comes with the (cached) session — no extra query on every page.
  const fastBillingEnabled = session.fastBillingEnabled;
  const lang = await getLang();
  const calculatorEnabled = await getCalculatorEnabled();
  const assistantEnabled = await getAssistantEnabled();
  const roleLabel = session.role === "owner" ? translate(lang, "role.owner") : translate(lang, "role.staff");

  return (
    <LangProvider lang={lang}>
    <div className="min-h-screen bg-background pb-24 md:pb-0 md:pl-72">
      <DesktopSidebar
        lang={lang}
        businessType={session.businessType}
        shopName={session.shopName}
        staffName={session.staffName}
        roleLabel={roleLabel}
        shopLogoUrl={session.shopLogoUrl}
        permissions={session.permissions}
        fastBillingEnabled={fastBillingEnabled}
      />

      {/* One sticky top bar for both breakpoints. On mobile it carries the
          shop identity row plus search; on desktop the identity lives in
          the sidebar, so the bar is just search. Keeping both rows in a
          single sticky element stops them stacking on top of each other
          while scrolling. There's exactly one UniversalSearch instance,
          so one Ctrl+K listener. */}
      <header className="no-print sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center gap-2.5 px-4 pb-2 pt-3 md:hidden">
          <HamburgerToggle className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-surface-2" />
          <Link href="/profile" aria-label="Profile & settings" className="flex min-w-0 flex-1 items-center gap-2.5">
            {session.shopLogoUrl ? (
              <Image
                src={session.shopLogoUrl}
                alt=""
                width={32}
                height={32}
                unoptimized
                className="h-8 w-8 shrink-0 rounded-lg border border-border bg-surface object-contain"
              />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
                {session.shopName.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-tight text-foreground">{session.shopName}</span>
              <span className="block truncate text-xs leading-tight text-muted">
                {session.staffName} · {roleLabel}
              </span>
            </span>
          </Link>
          <HeaderTools calculator={calculatorEnabled} assistant={assistantEnabled} />
          <Link
            href="/dashboard"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-surface-2"
            aria-label="Dashboard"
          >
            <LayoutDashboard size={19} />
          </Link>
        </div>
        <div className="mx-auto max-w-lg px-4 pb-2.5 md:flex md:max-w-5xl md:items-center md:justify-end md:gap-1 md:px-8 md:py-3 xl:max-w-6xl">
          <UniversalSearch />
          <div className="hidden md:ml-2 md:flex md:gap-1">
            <HeaderTools calculator={calculatorEnabled} assistant={assistantEnabled} />
          </div>
        </div>
      </header>

      <main className="page-enter mx-auto max-w-lg px-4 py-4 pb-24 md:max-w-5xl md:px-8 md:py-8 md:pb-8 xl:max-w-6xl">
        {children}
      </main>

      <BottomNav lang={lang} businessType={session.businessType} permissions={session.permissions} fastBillingEnabled={fastBillingEnabled} />
      <WelcomeTour storageKey={`tour-seen-${session.shopId}`} businessType={session.businessType} />
      {isModuleEnabled(session.enabledModules, "public_catalog") && <CatalogOrderAlert />}
      {/* Shop-owner tools only — never on login, public storefront,
          booking or print pages, which live outside this layout. */}
      <LazyFloatingWidgets calculatorEnabled={calculatorEnabled} assistantEnabled={assistantEnabled} />
    </div>
    </LangProvider>
  );
}
