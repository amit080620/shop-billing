"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { HelpCircle, LayoutDashboard, Users } from "lucide-react";
import Link from "@/lib/link";
import { canOpen } from "@/lib/staffAccess";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { activeTabHref } from "@/lib/activeTab";
import { sidebarTabs } from "@/lib/newNav";
import type { Lang } from "@/lib/i18n/dictionary";
import type { PlanKey } from "@/lib/plans";
import { PlanBadge } from "@/app/components/PlanBadge";
import { tabsFor } from "../BottomNav";
import { HamburgerToggle } from "../HamburgerToggle";
import { RayBrand } from "./RayBrand";

/** The New look's sidebar on a computer (lib/uiVersion). Same destinations as the Classic sidebar
 * (DesktopSidebar), plus Customers where the phone bar has it (lib/newNav), all through staff access. */
export function NewDesktopSidebar({
  lang,
  businessType,
  shopName,
  staffName,
  roleLabel,
  shopLogoUrl,
  shopGstin,
  permissions = [],
  fastBillingEnabled = false,
  plan,
  onTrial = false,
  van = false,
}: {
  /** A wholesale shop that runs vans: the Van desk gets its own link. */
  van?: boolean;
  lang: Lang;
  businessType: string;
  shopName: string;
  staffName: string;
  roleLabel: string;
  shopLogoUrl: string | null;
  shopGstin: string | null;
  permissions?: string[];
  plan?: PlanKey;
  fastBillingEnabled?: boolean;
  onTrial?: boolean;
}) {
  const pathname = usePathname();
  const { t } = useTranslation(lang);
  const tabs = sidebarTabs(
    tabsFor(businessType, t, permissions, fastBillingEnabled, van),
    {
      home: { href: "/dashboard", label: t("nav.home"), icon: HomeIcon },
      customers: { href: "/customers", label: t("nav.customers"), icon: CustomersIcon },
    },
    (href) => canOpen({ role: "staff", businessType, permissions }, href),
  );
  const activeHref = activeTabHref(pathname, tabs.map((tab) => tab.href));

  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-border bg-surface shadow-[0_1px_8px_rgba(15,23,42,0.04)] md:flex">
      <div className="flex h-16 shrink-0 items-center px-5">
        <RayBrand />
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-1" aria-label="Main">
        <ul className="flex flex-col gap-1">
          {tabs.map((tab) => {
            const active = tab.href === activeHref;
            const Icon = tab.icon;
            return (
              <li key={tab.href}>
                <SidebarLink href={tab.href} active={active} icon={<Icon active={active} />}>
                  {tab.label}
                </SidebarLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-col gap-1 border-t border-border p-3">
        <HamburgerToggle
          label={t("All features")}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        />
        <SidebarLink href="/help" active={pathname.startsWith("/help")} icon={<HelpCircle size={20} strokeWidth={1.8} />}>
          {t("Help & support")}
        </SidebarLink>
        <Link
          href="/profile"
          aria-label="Profile & settings"
          className="mt-1.5 flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-2.5 transition-colors hover:border-border-strong"
        >
          {shopLogoUrl ? (
            <Image src={shopLogoUrl} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg border border-border bg-surface object-contain" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-bold text-white" style={{ background: "var(--ray-gradient)" }}>
              {shopName.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-snug text-foreground">{shopName}</span>
            {plan && (
              <span className="mt-0.5 flex items-center gap-1">
                <PlanBadge plan={plan} size="xs" />
                {onTrial && <span className="rounded-full bg-brand-soft px-1.5 py-px text-[10px] font-semibold text-brand-text">{t("Trial")}</span>}
              </span>
            )}
            <span className="mt-0.5 block truncate text-xs text-muted">
              {staffName} · {roleLabel}
            </span>
            {shopGstin && <span className="block truncate text-xs tracking-wide text-muted">GSTIN {shopGstin}</span>}
          </span>
        </Link>
      </div>
    </aside>
  );
}

/** The open screen's row is filled with the brand colour and white text, so it can't be missed. */
function SidebarLink({ href, active, icon, children }: { href: string; active: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
        active ? "bg-[var(--nav-active)] font-semibold text-white shadow-sm" : "font-medium text-muted hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      {children}
    </Link>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return <LayoutDashboard size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
function CustomersIcon({ active }: { active: boolean }) {
  return <Users size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
