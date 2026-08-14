"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { tabsFor } from "./BottomNav";
import type { Lang } from "@/lib/i18n/dictionary";
import { HelpCircle } from "lucide-react";

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
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{shopName}</p>
          <p className="truncate text-xs text-muted">
            {staffName} · {roleLabel}
          </p>
        </div>
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
                  active ? "bg-brand-soft text-brand-dark" : "text-muted hover:bg-background hover:text-foreground"
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center ${active ? "text-brand" : ""}`}>
                  <Icon active={active} />
                </span>
                {tab.label}
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
