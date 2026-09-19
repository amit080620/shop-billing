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
  CalendarPlus,
  House,
  Users,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { activeTabHref } from "@/lib/activeTab";
import { mobileTabs } from "@/lib/mobileTabs";
import type { Lang } from "@/lib/i18n/dictionary";

export function tabsFor(businessType: string, t: (key: string) => string, permissions: string[] = [], fastBillingEnabled = false) {
  if (permissions.includes("kitchen_only")) {
    return [{ href: "/restaurant-kds", label: t("nav.kitchen"), icon: KitchenIcon }];
  }

  const fastBillingTab = fastBillingEnabled ? [{ href: "/fast-billing", label: t("Fast Bill"), icon: FastBillIcon }] : [];
  const reportsTab = { href: "/reports", label: t("nav.reports"), icon: ReportIcon };

  // Home and More genuinely move to the top header now (next to the
  // shop name) — they're destinations you visit occasionally, not
  // dozens of times a shift, so they no longer need to occupy one of
  // the precious 5 thumb-reach bottom slots. Every business type below
  // keeps its own core actions, plus Reports (now universal) and Fast
  // Billing (only when the shop has genuinely turned it on).
  const RETAIL_TABS = [
    { href: "/bills/new", label: t("nav.sell"), icon: SellIcon },
    { href: "/purchases", label: t("nav.buy"), icon: BuyIcon },
    reportsTab,
    ...fastBillingTab,
  ];

  const RESTAURANT_TABS = [
    { href: "/restaurant", label: t("nav.tables"), icon: TableIcon },
    { href: "/restaurant-kds", label: t("nav.kitchen"), icon: KitchenIcon },
    { href: "/purchases", label: t("nav.buy"), icon: BuyIcon },
    reportsTab,
    ...fastBillingTab,
  ];

  const RENTAL_TABS = [
    { href: "/bills/new", label: t("nav.sell"), icon: SellIcon },
    { href: "/rentals/new", label: t("nav.newRental"), icon: RentalIcon },
    { href: "/purchases", label: t("nav.buy"), icon: BuyIcon },
    reportsTab,
    ...fastBillingTab,
  ];

  const TRANSPORT_TABS = [
    { href: "/bills/new", label: t("nav.sell"), icon: SellIcon },
    { href: "/transport/vehicles", label: t("Vehicles"), icon: TruckNavIcon },
    { href: "/purchases", label: t("nav.buy"), icon: BuyIcon },
    reportsTab,
    ...fastBillingTab,
  ];

  const SERVICE_TABS = [
    { href: "/bills/new", label: t("nav.sell"), icon: SellIcon },
    { href: "/purchases", label: t("nav.buy"), icon: BuyIcon },
    { href: "/service", label: t("Jobs"), icon: ServiceIcon },
    reportsTab,
    ...fastBillingTab,
  ];

  const SALON_TABS = [
    { href: "/bills/new", label: t("nav.sell"), icon: SellIcon },
    { href: "/salon/appointments", label: t("Appointments"), icon: SalonNavIcon },
    { href: "/purchases", label: t("nav.buy"), icon: BuyIcon },
    reportsTab,
    ...fastBillingTab,
  ];

  const JEWELLERY_TABS = [
    { href: "/bills/new", label: t("nav.sell"), icon: SellIcon },
    { href: "/jewellery/rates", label: t("Rate"), icon: JewelleryNavIcon },
    { href: "/purchases", label: t("nav.buy"), icon: BuyIcon },
    reportsTab,
    ...fastBillingTab,
  ];

  const CLINIC_TABS = [
    { href: "/clinic/prescriptions/new", label: t("New Rx"), icon: ClinicNavIcon },
    { href: "/clinic/appointments", label: t("Appointments"), icon: ClinicAppointmentIcon },
    { href: "/purchases", label: t("nav.buy"), icon: BuyIcon },
    reportsTab,
    ...fastBillingTab,
  ];

  const GYM_TABS = [
    { href: "/gym/members/new", label: t("nav.sell"), icon: SellIcon },
    { href: "/gym/members", label: t("Members"), icon: TableIcon },
    { href: "/purchases", label: t("nav.buy"), icon: BuyIcon },
    reportsTab,
    ...fastBillingTab,
  ];

  const LAB_TABS = [
    { href: "/lab/orders/new", label: t("New order"), icon: SellIcon },
    { href: "/lab/orders", label: t("Orders"), icon: TableIcon },
    { href: "/purchases", label: t("nav.buy"), icon: BuyIcon },
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
  const tabs = mobileTabs(tabsFor(businessType, t, permissions, fastBillingEnabled), {
    home: { href: "/dashboard", label: t("nav.home"), icon: HomeIcon },
    customers: { href: "/customers", label: t("nav.customers"), icon: CustomersIcon },
  });
  const activeHref = activeTabHref(pathname, tabs.map((tab) => tab.href));

  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2">
        {tabs.map((tab) => {
          const active = tab.href === activeHref;
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-[var(--bottom-nav-h)] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${
                  active ? "text-brand-text" : "text-muted"
                }`}
              >
                <span
                  className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                    active ? "bg-brand-soft" : ""
                  }`}
                >
                  <Icon active={active} />
                </span>
                <span className="max-w-full truncate px-1">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return <House size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
function CustomersIcon({ active }: { active: boolean }) {
  return <Users size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
function SellIcon({ active }: { active: boolean }) {
  return <Receipt size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
function RentalIcon({ active }: { active: boolean }) {
  return <CalendarPlus size={22} strokeWidth={active ? 2.3 : 1.8} />;
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

