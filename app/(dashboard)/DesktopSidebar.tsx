"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { tabsFor } from "./BottomNav";
import { activeTabHref } from "@/lib/activeTab";
import type { Lang } from "@/lib/i18n/dictionary";
import { HelpCircle, LayoutDashboard } from "lucide-react";
import { HamburgerToggle } from "./HamburgerToggle";

export function DesktopSidebar({
  lang,
  businessType,
  shopName,
  staffName,
  roleLabel,
  shopLogoUrl,
  permissions = [],
  fastBillingEnabled = false,
}: {
  lang: Lang;
  businessType: string;
  shopName: string;
  staffName: string;
  roleLabel: string;
  shopLogoUrl: string | null;
  permissions?: string[];
  fastBillingEnabled?: boolean;
}) {
  const pathname = usePathname();
  const { t } = useTranslation(lang);
  const tabs = tabsFor(businessType, t, permissions, fastBillingEnabled);
  const activeHref = activeTabHref(pathname, tabs.map((tab) => tab.href));

  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-border bg-surface md:flex">
      <div className="flex items-center gap-3 px-4 pb-4 pt-5">
        <Link href="/profile" aria-label="Profile & settings" className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 -m-1.5 hover:bg-surface-2">
          {shopLogoUrl ? (
            <Image src={shopLogoUrl} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl border border-border bg-surface object-contain" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-base font-bold text-white">
              {shopName.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 block text-sm font-semibold leading-snug text-foreground">{shopName}</span>
            <span className="block truncate text-xs text-muted">
              {staffName} · {roleLabel}
            </span>
          </span>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto px-3" aria-label="Main">
        <ul className="flex flex-col gap-0.5">
          <li>
            <SidebarLink href="/dashboard" active={pathname === "/dashboard"} icon={<LayoutDashboard size={18} strokeWidth={pathname === "/dashboard" ? 2.2 : 1.8} />}>
              {t("nav.home")}
            </SidebarLink>
          </li>
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

      <div className="flex flex-col gap-0.5 border-t border-border p-3">
        <HamburgerToggle
          label={t("All features")}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        />
        <SidebarLink href="/help" active={pathname.startsWith("/help")} icon={<HelpCircle size={18} strokeWidth={1.8} />}>
          {t("Help & support")}
        </SidebarLink>
      </div>
    </aside>
  );
}

function SidebarLink({ href, active, icon, children }: { href: string; active: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-brand-soft font-semibold text-brand-text" : "text-muted hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>
      {children}
    </Link>
  );
}
