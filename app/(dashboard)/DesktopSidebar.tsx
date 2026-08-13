"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { tabsFor } from "./BottomNav";
import type { Lang } from "@/lib/i18n/dictionary";

export function DesktopSidebar({
  lang,
  businessType,
  shopName,
  staffName,
  roleLabel,
  shopLogoUrl,
}: {
  lang: Lang;
  businessType: string;
  shopName: string;
  staffName: string;
  roleLabel: string;
  shopLogoUrl: string | null;
}) {
  const pathname = usePathname();
  const { t } = useTranslation(lang);
  const tabs = tabsFor(businessType, t);

  return (
    <aside className="no-print fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-border bg-surface md:flex">
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        {shopLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- shop logo, small
          <img src={shopLogoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-contain ring-2 ring-brand-soft" />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-base font-semibold text-white">
            {shopName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{shopName}</p>
          <p className="truncate text-xs text-muted">
            {staffName} · {roleLabel}
          </p>
        </div>
      </div>

      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {tabs.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-brand-soft text-brand-dark" : "text-muted hover:bg-background hover:text-foreground"
                }`}
              >
                <Icon active={active} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
