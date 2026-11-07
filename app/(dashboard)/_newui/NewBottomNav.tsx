"use client";

import { usePathname } from "next/navigation";
import { LayoutDashboard, Users } from "lucide-react";
import Link from "@/lib/link";
import { canOpen } from "@/lib/staffAccess";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { activeTabHref } from "@/lib/activeTab";
import { mobileTabs } from "@/lib/mobileTabs";
import { useKeepReady } from "@/lib/useKeepReady";
import type { Lang } from "@/lib/i18n/dictionary";
import { tabsFor, READY_AHEAD } from "../BottomNav";

/** The New look's bottom bar on a phone (lib/uiVersion): exactly the Classic bar's tabs (BottomNav),
 * kept ready ahead the same way, with the open tab in the brand colour over the design's ray line. */
export function NewBottomNav({ lang, businessType, permissions = [], fastBillingEnabled = false, van = false }: { lang: Lang; businessType: string; permissions?: string[]; fastBillingEnabled?: boolean; van?: boolean }) {
  const pathname = usePathname();
  const { t } = useTranslation(lang);
  const tabs = mobileTabs(tabsFor(businessType, t, permissions, fastBillingEnabled, van), {
    home: { href: "/dashboard", label: t("nav.home"), icon: HomeIcon },
    customers: { href: "/customers", label: t("nav.customers"), icon: CustomersIcon },
  }).filter((tab) => canOpen({ role: "staff", businessType, permissions }, tab.href));
  const activeHref = activeTabHref(pathname, tabs.map((tab) => tab.href));
  useKeepReady(tabs.map((tab) => tab.href).filter((href) => READY_AHEAD.has(href)), pathname);

  return (
    <nav aria-label="Main" className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(15,23,42,0.06)] md:hidden">
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1">
        {tabs.map((tab) => {
          const active = tab.href === activeHref;
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-[var(--bottom-nav-h)] flex-col items-center justify-center gap-1 text-xs transition-colors ${
                  active ? "font-bold text-brand" : "font-medium text-muted"
                }`}
              >
                <Icon active={active} />
                <span className="max-w-full truncate px-1 leading-tight">{tab.label}</span>
                {active && <span aria-hidden="true" className="absolute bottom-1 h-[3px] w-6 rounded-full" style={{ background: "var(--ray-gradient)" }} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return <LayoutDashboard size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
function CustomersIcon({ active }: { active: boolean }) {
  return <Users size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
