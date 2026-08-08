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

  // A transport & materials shop lives in two screens all day: billing
  // (material + the vehicle's transport charge on the same bill) and
  // keeping the vehicle list current — so those replace Buy/Reports up
  // front, same treatment as Restaurant got for Tables/Kitchen.
  const TRANSPORT_TABS = [
    { href: "/", label: t("nav.home"), icon: HomeIcon },
    { href: "/bills/new", label: t("nav.sell"), icon: SellIcon },
    { href: "/transport/vehicles", label: "Vehicles", icon: TruckNavIcon },
    { href: "/transport/reports", label: t("nav.reports"), icon: ReportIcon },
    { href: "/more", label: t("nav.more"), icon: MoreIcon },
  ];

  const SERVICE_TABS = [
    { href: "/", label: t("nav.home"), icon: HomeIcon },
    { href: "/service/new", label: "New job", icon: BuyIcon },
    { href: "/service", label: "Jobs", icon: ServiceIcon },
    { href: "/reports", label: t("nav.reports"), icon: ReportIcon },
    { href: "/more", label: t("nav.more"), icon: MoreIcon },
  ];

  const SALON_TABS = [
    { href: "/", label: t("nav.home"), icon: HomeIcon },
    { href: "/bills/new", label: t("nav.sell"), icon: SellIcon },
    { href: "/salon/appointments", label: "Appointments", icon: SalonNavIcon },
    { href: "/reports", label: t("nav.reports"), icon: ReportIcon },
    { href: "/more", label: t("nav.more"), icon: MoreIcon },
  ];

  const JEWELLERY_TABS = [
    { href: "/", label: t("nav.home"), icon: HomeIcon },
    { href: "/bills/new", label: t("nav.sell"), icon: SellIcon },
    { href: "/jewellery/rates", label: "Rate", icon: JewelleryNavIcon },
    { href: "/reports", label: t("nav.reports"), icon: ReportIcon },
    { href: "/more", label: t("nav.more"), icon: MoreIcon },
  ];

  const CLINIC_TABS = [
    { href: "/", label: t("nav.home"), icon: HomeIcon },
    { href: "/clinic/prescriptions/new", label: "New Rx", icon: ClinicNavIcon },
    { href: "/clinic/appointments", label: "Appointments", icon: SalonNavIcon },
    { href: "/reports", label: t("nav.reports"), icon: ReportIcon },
    { href: "/more", label: t("nav.more"), icon: MoreIcon },
  ];

  if (businessType === "restaurant") return RESTAURANT_TABS;
  if (businessType === "rental") return RENTAL_TABS;
  if (businessType === "transport") return TRANSPORT_TABS;
  if (businessType === "service") return SERVICE_TABS;
  if (businessType === "salon") return SALON_TABS;
  if (businessType === "jewellery") return JEWELLERY_TABS;
  if (businessType === "clinic") return CLINIC_TABS;
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
function TruckNavIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)}>
      <path d="M2 16h11V6H2v10Z" />
      <path d="M13 9h4l3 3v4h-7V9Z" />
      <circle cx="6" cy="18" r="1.6" />
      <circle cx="16.5" cy="18" r="1.6" />
    </svg>
  );
}
function ServiceIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
    </svg>
  );
}
function SalonNavIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
    </svg>
  );
}
function JewelleryNavIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9 9.5a2.5 2.5 0 0 1 2.5-2.5h1a2.5 2.5 0 0 1 0 5h-1a2.5 2.5 0 0 0 0 5h1a2.5 2.5 0 0 0 2.5-2.5" />
    </svg>
  );
}
function ClinicNavIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}
