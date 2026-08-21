import Image from "next/image";
import Link from "next/link";
import { LayoutDashboard, Menu } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getLang } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/dictionary";
import { BottomNav } from "./BottomNav";
import { DesktopSidebar } from "./DesktopSidebar";
import { WelcomeTour } from "./WelcomeTour";
import { UniversalSearch } from "@/app/components/UniversalSearch";
import { CatalogOrderAlert } from "@/app/components/CatalogOrderAlert";
import { isModuleEnabled } from "@/lib/modules";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { data: shop } = await admin.from("shops").select("fast_billing_enabled").eq("id", session.shopId).single();
  const lang = await getLang();
  const roleLabel = session.role === "owner" ? translate(lang, "role.owner") : translate(lang, "role.staff");

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0 md:pl-60">
      <DesktopSidebar
        lang={lang}
        businessType={session.businessType}
        shopName={session.shopName}
        staffName={session.staffName}
        roleLabel={roleLabel}
        shopLogoUrl={session.shopLogoUrl}
        permissions={session.permissions}
        fastBillingEnabled={shop?.fast_billing_enabled ?? false}
      />

      <header
        className="no-print sticky top-0 z-10 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur-md md:hidden"
        style={{ boxShadow: "var(--shadow-sm)" }}
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
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm"
              style={{ background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))" }}
            >
              {session.shopName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {session.shopName}
            </p>
            <p className="text-xs text-muted">
              {session.staffName} · {roleLabel}
            </p>
          </div>
          <Link
            href="/dashboard"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted"
            style={{ boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }}
            aria-label="Dashboard"
          >
            <LayoutDashboard size={17} />
          </Link>
          <Link
            href="/more"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted"
            style={{ boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }}
            aria-label="More"
          >
            <Menu size={17} />
          </Link>
        </div>
      </header>

      {/* Single UniversalSearch instance — deliberately outside both the
          mobile-only header (md:hidden) and the desktop sidebar, so there's
          exactly one mounted instance, one Ctrl+K listener, and the modal
          is never rendered inside a CSS-hidden parent at either breakpoint. */}
      <div className="no-print sticky top-0 z-10 border-b border-border bg-surface/90 px-4 py-2.5 backdrop-blur-md md:left-60 md:px-8">
        <div className="mx-auto max-w-lg md:max-w-none">
          <UniversalSearch />
        </div>
      </div>

      <main className="page-enter mx-auto max-w-lg px-4 py-4 pb-24 md:max-w-5xl md:px-8 md:py-8 md:pb-8 xl:max-w-6xl">{children}</main>

      <BottomNav lang={lang} businessType={session.businessType} permissions={session.permissions} fastBillingEnabled={shop?.fast_billing_enabled ?? false} />
      <WelcomeTour storageKey={`tour-seen-${session.shopId}`} businessType={session.businessType} />
      {isModuleEnabled(session.enabledModules, "public_catalog") && <CatalogOrderAlert />}
    </div>
  );
}
