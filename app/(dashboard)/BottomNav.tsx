"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

function tabsFor(businessType: string, t: (key: string) => string) {
  const RETAIL_TABS = [
    { href: "/", label: t("nav.home"), icon: HomeIcon },
    { href: "/bills/new", label: t("nav.sell"), icon: SellIcon },
    { href: "/purchases/new", label: t("nav.buy"), icon: BuyIcon },
    { href: "/reports", label: t("nav.reports"), icon: ReportIcon },
    { href: "/more", label: t("nav.more"), icon: MoreIcon },
  ];

  // A restaurant's whole day revolves around tables and the kitchen —
  // Sell/Buy (built for retail stock transactions) aren't what a restaurant
  // reaches for dozens of times a shift, so the primary tab becomes Tables,
  // with the kitchen display one tap away instead of buried in More.
  const RESTAURANT_TABS = [
    { href: "/", label: t("nav.home"), icon: HomeIcon },
    { href: "/restaurant", label: t("nav.tables"), icon: TableIcon },
    { href: "/restaurant-kds", label: t("nav.kitchen"), icon: KitchenIcon },
    { href: "/reports", label: t("nav.reports"), icon: ReportIcon },
    { href: "/more", label: t("nav.more"), icon: MoreIcon },
  ];

  const RENTAL_TABS = [
    { href: "/", label: t("nav.home"), icon: HomeIcon },
    { href: "/rentals/new", label: t("nav.newRental"), icon: BuyIcon },
    { href: "/rentals", label: t("nav.rentals"), icon: TableIcon },
    { href: "/reports", label: t("nav.reports"), icon: ReportIcon },
    { href: "/more", label: t("nav.more"), icon: MoreIcon },
  ];

  if (businessType === "restaurant") return RESTAURANT_TABS;
  if (businessType === "rental") return RENTAL_TABS;
  return RETAIL_TABS;
}

export function BottomNav({ lang, businessType }: { lang: Lang; businessType: string }) {
  const pathname = usePathname();
  const { t } = useTranslation(lang);
  const tabs = tabsFor(businessType, t);

  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
      style={{ boxShadow: "0 -4px 16px hsl(220 20% 40% / 0.06)" }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1">
        {tabs.map((tab) => {
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1 py-1.5">
              <Link
                href={tab.href}
                className={`mx-auto flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  active ? "bg-brand-soft text-brand-dark" : "text-muted"
                }`}
              >
                <Icon active={active} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function iconProps(active: boolean) {
  return {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: active ? 2.2 : 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}
function SellIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)}>
      <path d="M4 4h2l1.5 10.5A2 2 0 0 0 9.5 16h7a2 2 0 0 0 2-1.6L20 7H6.2" />
      <circle cx="10" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
    </svg>
  );
}
function BuyIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)}>
      <path d="M3.5 8 12 4l8.5 4-8.5 4-8.5-4Z" />
      <path d="M3.5 8v8L12 20l8.5-4V8" />
      <path d="M12 12v8" />
    </svg>
  );
}
function ReportIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)}>
      <rect x="4" y="3.5" width="16" height="17" rx="1.5" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}
function MoreIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)}>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}
function TableIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)}>
      <rect x="3" y="10" width="18" height="4" rx="1" />
      <path d="M6 14v5M18 14v5" />
    </svg>
  );
}
function KitchenIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)}>
      <rect x="2.5" y="4.5" width="19" height="13" rx="1.5" />
      <path d="M8 21h8M12 17.5V21" />
    </svg>
  );
}
