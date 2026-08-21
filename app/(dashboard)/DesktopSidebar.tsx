"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { tabsFor } from "./BottomNav";
import type { Lang } from "@/lib/i18n/dictionary";
import { HelpCircle, LayoutDashboard, Menu } from "lucide-react";

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

  return (
    <aside className="no-print fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-border bg-surface md:flex">
      <div className="flex items-center gap-3 border-b border-border px-4 py-5">
        {shopLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- shop logo, small
          <img src={shopLogoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-contain ring-2 ring-brand-soft" />
        ) : (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white shadow-sm"
            style={{ background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))" }}
          >
            {shopName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{shopName}</p>
          <p className="truncate text-xs text-muted">
            {staffName} · {roleLabel}
          </p>
        </div>
        <Link href="/dashboard" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background" aria-label="Dashboard">
          <LayoutDashboard size={16} />
        </Link>
        <Link href="/more" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background" aria-label="More">
          <Menu size={16} />
        </Link>
      </div>
      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {tabs.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="relative">
              {active && (
                <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand" aria-hidden="true" />
              )}
              <Link
                href={tab.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                  active ? "bg-brand-soft text-brand-text" : "text-muted hover:bg-background hover:text-foreground"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${active ? "text-brand" : ""}`}
                  style={{
                    boxShadow: active
                      ? "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)"
                      : "-1px -1px 3px var(--neu-light), 1px 1px 3px var(--neu-dark)",
                  }}
                >
                  <Icon active={active} />
                </span>
                <span className={active ? "neu-text" : ""}>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border p-3">
        <Link
          href="/help"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-background hover:text-foreground"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center">
            <HelpCircle size={18} strokeWidth={1.8} />
          </span>
          Help & support
        </Link>
      </div>
    </aside>
  );
}
