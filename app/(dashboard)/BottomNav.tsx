"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Receipt,
  PackagePlus,
  BarChart3,
  Menu,
  LayoutGrid,
  ChefHat,
  Truck,
  Wrench,
  Scissors,
  CalendarClock,
  Gem,
  Stethoscope,
  Dumbbell,
  FlaskConical,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

export function tabsFor(businessType: string, t: (key: string) => string, permissions: string[] = []) {
  if (permissions.includes("kitchen_only")) {
    return [{ href: "/restaurant-kds", label: t("nav.kitchen"), icon: KitchenIcon }];
  }
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
    { href: "/bills/new", label: t("nav.sell"), icon: SellIcon },
    { href: "/rentals/new", label: t("nav.newRental"), icon: BuyIcon },
    { href: "/rentals", label: t("nav.rentals"), icon: TableIcon },
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
    { href: "/clinic/appointments", label: "Appointments", icon: ClinicAppointmentIcon },
    { href: "/reports", label: t("nav.reports"), icon: ReportIcon },
    { href: "/more", label: t("nav.more"), icon: MoreIcon },
  ];

  const GYM_TABS = [
    { href: "/", label: t("nav.home"), icon: HomeIcon },
    { href: "/gym/members/new", label: "Sell", icon: SellIcon },
    { href: "/gym/attendance", label: "Attendance", icon: GymNavIcon },
    { href: "/gym/members", label: "Members", icon: TableIcon },
    { href: "/more", label: t("nav.more"), icon: MoreIcon },
  ];

  const LAB_TABS = [
    { href: "/", label: t("nav.home"), icon: HomeIcon },
    { href: "/lab/orders/new", label: "New order", icon: SellIcon },
    { href: "/lab/orders", label: "Orders", icon: TableIcon },
    { href: "/lab/tests", label: "Tests", icon: LabNavIcon },
    { href: "/more", label: t("nav.more"), icon: MoreIcon },
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

export function BottomNav({ lang, businessType, permissions = [] }: { lang: Lang; businessType: string; permissions?: string[] }) {
  const pathname = usePathname();
  const { t } = useTranslation(lang);
  const tabs = tabsFor(businessType, t, permissions);

  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-20 bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      style={{ boxShadow: "0 -6px 16px var(--neu-dark), 0 -1px 0 var(--neu-light)" }}
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

function HomeIcon({ active }: { active: boolean }) {
  return <Home size={22} strokeWidth={active ? 2.3 : 1.8} />;
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
function MoreIcon({ active }: { active: boolean }) {
  return <Menu size={22} strokeWidth={active ? 2.3 : 1.8} />;
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
function GymNavIcon({ active }: { active: boolean }) {
  return <Dumbbell size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
function LabNavIcon({ active }: { active: boolean }) {
  return <FlaskConical size={22} strokeWidth={active ? 2.3 : 1.8} />;
}
