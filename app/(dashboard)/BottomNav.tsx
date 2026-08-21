"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Receipt,
  PackagePlus,
  BarChart3,
  LayoutGrid,
  ChefHat,
  Truck,
  Wrench,
  Scissors,
  CalendarClock,
  Gem,
  Stethoscope,
  Zap,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

export function tabsFor(businessType: string, t: (key: string) => string, permissions: string[] = [], fastBillingEnabled = false) {
  if (permissions.includes("kitchen_only")) {
    return [{ href: "/restaurant-kds", label: t("nav.kitchen"), icon: KitchenIcon }];
  }

  const fastBillingTab = fastBillingEnabled ? [{ href: "/fast-billing", label: "Fast Bill", icon: FastBillIcon }] : [];
  const reportsTab = { href: "/reports", label: t("nav.reports"), icon: ReportIcon };

  // Home and More genuinely move to the top header now (next to the
  // shop name) — they're destinations you visit occasionally, not
  // dozens of times a shift, so they no longer need to occupy one of
  // the precious 5 thumb-reach bottom slots. Every business type below
  // keeps its own core actions, plus Reports (now universal) and Fast
  // Billing (only when the shop has genuinely turned it on).
  const RETAIL_TABS = [
    { href: "/bills/new", label: t("nav.sell"), icon: SellIcon },
    { href: "/purchases/new", label: t("nav.buy"), icon: BuyIcon },
    reportsTab,
    ...fastBillingTab,
  ];

  const RESTAURANT_TABS = [
    { href: "/restaurant", label: t("nav.tables"), icon: TableIcon },
    { href: "/restaurant-kds", label: t("nav.kitchen"), icon: KitchenIcon },
    { href: "/purchases/new", label: t("nav.buy"), icon: BuyIcon },
    reportsTab,
    ...fastBillingTab,
  ];

  const RENTAL_TABS = [
    { href: "/bills/new", label: t("nav.sell"), icon: SellIcon },
    { href: "/rentals/new", label: t("nav.newRental"), icon: BuyIcon },
    { href: "/purchases/new", label: t("nav.buy"), icon: BuyIcon },
    reportsTab,
    ...fastBillingTab,
  ];

  const TRANSPORT_TABS = [
    { href: "/bills/new", label: t("nav.sell"), icon: SellIcon },
    { href: "/transport/vehicles", label: "Vehicles", icon: TruckNavIcon },
    { href: "/purchases/new", label: t("nav.buy"), icon: BuyIcon },
    reportsTab,
    ...fastBillingTab,
  ];

  const SERVICE_TABS = [
    { href: "/bills/new", label: "Sell", icon: SellIcon },
    { href: "/purchases/new", label: t("nav.buy"), icon: BuyIcon },
    { href: "/service", label: "Jobs", icon: ServiceIcon },
    reportsTab,
    ...fastBillingTab,
  ];

  const SALON_TABS = [
    { href: "/bills/new", label: t("nav.sell"), icon: SellIcon },
    { href: "/salon/appointments", label: "Appointments", icon: SalonNavIcon },
    { href: "/purchases/new", label: t("nav.buy"), icon: BuyIcon },
    reportsTab,
    ...fastBillingTab,
  ];

  const JEWELLERY_TABS = [
    { href: "/bills/new", label: t("nav.sell"), icon: SellIcon },
    { href: "/jewellery/rates", label: "Rate", icon: JewelleryNavIcon },
    { href: "/purchases/new", label: t("nav.buy"), icon: BuyIcon },
    reportsTab,
    ...fastBillingTab,
  ];

  const CLINIC_TABS = [
    { href: "/clinic/prescriptions/new", label: "New Rx", icon: ClinicNavIcon },
    { href: "/clinic/appointments", label: "Appointments", icon: ClinicAppointmentIcon },
    { href: "/purchases/new", label: t("nav.buy"), icon: BuyIcon },
    reportsTab,
    ...fastBillingTab,
  ];

  const GYM_TABS = [
    { href: "/gym/members/new", label: "Sell", icon: SellIcon },
    { href: "/gym/members", label: "Members", icon: TableIcon },
    { href: "/purchases/new", label: t("nav.buy"), icon: BuyIcon },
    reportsTab,
    ...fastBillingTab,
  ];

  const LAB_TABS = [
    { href: "/lab/orders/new", label: "New order", icon: SellIcon },
    { href: "/lab/orders", label: "Orders", icon: TableIcon },
    { href: "/purchases/new", label: t("nav.buy"), icon: BuyIcon },
    reportsTab,
    ...fastBillingTab,
  ];

  if (businessType === "restaurant") return RESTAURANT_TABS;
  if (businessType === "rental") return RENTAL_TABS;
  if (businessType === "transport") return TRANSPORT_TABS;
  if (businessType === "service") return SERVICE_TABS;
  if (businessType === "salon") return SALON_TABS;
  if (businessType === "jewellery") return JEWELLERY_TABS;
  if (businessType === "clinic") return CLINIC_TABS;
  if (businessType === "gym") return GYM_TABS;
  if (businessType === "lab") return LAB_TABS;
  return RETAIL_TABS;
}

export function BottomNav({ lang, businessType, permissions = [], fastBillingEnabled = false }: { lang: Lang; businessType: string; permissions?: string[]; fastBillingEnabled?: boolean }) {
  const pathname = usePathname();
  const { t } = useTranslation(lang);
  const tabs = tabsFor(businessType, t, permissions, fastBillingEnabled);

  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-20 bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      style={{ boxShadow: "0 -6px 16px var(--neu-dark), 0 -1px 0 var(--neu-light)" }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1">
        {tabs.map((tab) => {
          const active =
            pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1 py-1.5">
              <Link
                href={tab.href}
                className={`mx-auto flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  active ? "bg-brand-soft text-brand-text" : "text-muted"
                }`}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{
                    boxShadow: active
                      ? "-3px -3px 7px var(--neu-light), 3px 3px 7px var(--neu-dark)"
                      : "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)",
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
    </nav>
  );
}

function SellIcon({ active }: { active: boolean }) {
  return <Receipt size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
function BuyIcon({ active }: { active: boolean }) {
  return <PackagePlus size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
function ReportIcon({ active }: { active: boolean }) {
  return <BarChart3 size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
function FastBillIcon({ active }: { active: boolean }) {
  return <Zap size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
function TableIcon({ active }: { active: boolean }) {
  return <LayoutGrid size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
function KitchenIcon({ active }: { active: boolean }) {
  return <ChefHat size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
function TruckNavIcon({ active }: { active: boolean }) {
  return <Truck size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
function ServiceIcon({ active }: { active: boolean }) {
  return <Wrench size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
function SalonNavIcon({ active }: { active: boolean }) {
  return <Scissors size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
function ClinicAppointmentIcon({ active }: { active: boolean }) {
  return <CalendarClock size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
function JewelleryNavIcon({ active }: { active: boolean }) {
  return <Gem size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
function ClinicNavIcon({ active }: { active: boolean }) {
  return <Stethoscope size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
