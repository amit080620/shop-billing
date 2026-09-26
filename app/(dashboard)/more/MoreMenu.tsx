import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { LogoutButton } from "./LogoutButton";
import { getTranslator } from "@/lib/i18n/server";
import { getTerminology } from "@/lib/businessType";
import { isModuleEnabled } from "@/lib/modules";
import { PlanBadge } from "@/app/components/PlanBadge";
import { planFor } from "@/lib/plans";
import {
  AlertTriangle,
  BarChart3,
  BedDouble,
  Bell,
  BookOpen,
  Building2,
  Cake,
  CalendarClock,
  CalendarDays,
  ChefHat,
  ConciergeBell,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Dumbbell,
  FileClock,
  FileUp,
  FlaskConical,
  Gem,
  Gift,
  History,
  Megaphone,
  MonitorPlay,
  Package,
  PackagePlus,
  PartyPopper,
  Pill,
  Printer,
  Receipt,
  Repeat,
  ScanEye,
  Scissors,
  Settings,
  ShieldCheck,
  Stethoscope,
  Store,
  Table2,
  TrendingDown,
  Trash2,
  Truck,
  UserCog,
  Users,
  Wallet,
  WifiOff,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** Everything in the More menu. Rendered once in the dashboard layout
 * (inside MenuDrawer, opened by the menu button) and by /more for direct
 * visits. */
export async function MoreMenu() {
  const session = await requireSession();
  const { t } = await getTranslator();
  const terminology = getTerminology(session.businessType);
  const type = session.businessType;
  const isOwner = session.role === "owner";
  const mod = (key: Parameters<typeof isModuleEnabled>[1]) => isModuleEnabled(session.enabledModules, key);

  const daysLeft = session.paidUntil ? Math.ceil((new Date(session.paidUntil).getTime() - Date.now()) / 86_400_000) : null;
  const trialLeft = session.onTrial && session.trialEndsAt ? Math.ceil((new Date(session.trialEndsAt).getTime() - Date.now()) / 86_400_000) : null;
  const planLine = session.onTrial && trialLeft !== null
    ? t("Free trial · {n} days left", { n: Math.max(0, trialLeft) })
    : session.planExpired
      ? t("Plan ended — renew to get everything back")
      : session.plan === "free"
        ? t("See what upgrading adds")
        : daysLeft !== null
          ? t("{n} days left", { n: Math.max(0, daysLeft) })
          : t(planFor(session.plan).tagline);

  return (
      <div className="flex flex-col gap-5">
        {session.plansReady && (
          <Link
            href="/plans"
            className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 transition-colors hover:bg-surface-2"
          >
            <PlanBadge plan={session.plan} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{t("Plan & billing")}</span>
              <span className="block truncate text-xs text-muted">{planLine}</span>
            </span>
            <span className="text-muted" aria-hidden="true">›</span>
          </Link>
        )}
        {type === "restaurant" && (
          <MenuGroup title="Restaurant">
            <MenuLink href="/restaurant-kds" label="Kitchen display (TV)" sub="Big-screen view for the kitchen" icon={MonitorPlay} />
            <MenuLink href="/restaurant/kds-settings" label="Kitchen display settings" sub="Cards per row, text size" icon={ChefHat} />
            <MenuLink href="/restaurant/combos" label="Combo deals" sub="Bundle menu items at a set price" icon={Package} />
            <MenuLink href="/restaurant/reports" label="Restaurant sales" sub="Day-wise & month-wise reports" icon={BarChart3} />
          </MenuGroup>
        )}

        {type === "hotel" && (
          <MenuGroup title="Hotel">
            <MenuLink href="/hotel" label="Front desk" sub="Arrivals, departures and who is in-house" icon={ConciergeBell} />
            <MenuLink href="/hotel/bookings/new" label="New booking" sub="Walk-in, phone, MakeMyTrip, Booking.com..." icon={CalendarClock} />
            <MenuLink href="/hotel/bookings" label="All bookings" sub="Search and filter every reservation" icon={ClipboardList} />
            <MenuLink href="/hotel/calendar" label="Room calendar" sub="14-day chart of every room and guest" icon={CalendarDays} />
            <MenuLink href="/hotel/rooms" label="Room board" sub="Vacant, occupied, needs cleaning" icon={BedDouble} />
            <MenuLink href="/hotel/reports" label="Hotel reports" sub="Occupancy, ADR, commissions, guest register" icon={BarChart3} />
            <MenuLink href="/hotel/setup" label="Rooms & rates set-up" sub="Room types, room numbers, tariffs, GST" icon={Settings} />
            <MenuLink href="/restaurant" label="Restaurant & room service" sub="Tables, kitchen and orders charged to rooms" icon={ChefHat} />
          </MenuGroup>
        )}

        {type === "service" && (
          <MenuGroup title="Service & repairs">
            <MenuLink href="/service" label="All jobs" sub="Every repair, by status" icon={ClipboardList} />
            <MenuLink href="/service/new" label="New job" sub="Take in an item for repair" icon={Wrench} />
            <MenuLink href="/service/reports" label="Job report" sub="Earnings, technician split, item types" icon={BarChart3} />
          </MenuGroup>
        )}

        {type === "rental" && (
          <MenuGroup title="Rentals">
            <MenuLink href="/rentals/history" label="Rental history" sub="Past returns & cancellations" icon={History} />
          </MenuGroup>
        )}

        {type === "transport" && (
          <MenuGroup title="Transport">
            <MenuLink href="/transport/vehicles" label="Vehicles" sub="Manage trucks & per-km rates" icon={Truck} />
            <MenuLink href="/transport/reports" label="Vehicle-wise trips" sub="Rounds, km & earnings per vehicle" icon={BarChart3} />
          </MenuGroup>
        )}

        {type === "salon" && (
          <MenuGroup title="Salon">
            <MenuLink href="/salon/appointments" label="Appointments" sub="Book & manage customer visits" icon={CalendarDays} />
            <MenuLink href="/salon/settings/booking" label="Online booking" sub="Working hours & shareable booking link" icon={Scissors} />
            <MenuLink href="/salon" label="Staff-wise revenue" sub="Who's bringing in how much" icon={BarChart3} />
          </MenuGroup>
        )}

        {type === "jewellery" && (
          <MenuGroup title="Jewellery">
            <MenuLink href="/jewellery/rates" label="Today's rate" sub="Set gold/silver rate per gram" icon={Gem} />
            <MenuLink href="/jewellery/exchanges" label="Exchange history" sub="Old gold/silver taken in" icon={Repeat} />
          </MenuGroup>
        )}

        {type === "clinic" && (
          <MenuGroup title="Clinic">
            <MenuLink href="/clinic/appointments" label="Appointments" sub="Book & manage patient visits" icon={CalendarDays} />
            <MenuLink href="/clinic/prescriptions/new" label="New prescription" sub="Write an Rx for a patient" icon={Stethoscope} />
            <MenuLink href="/clinic/treatment-plans" label="Treatment plans" sub="Plan → quotation → bill, all linked" icon={ClipboardList} />
            <MenuLink href="/clinic/medicine-library" label="Medicine library" sub="Saved medicines — no need to retype names" icon={Pill} />
            <MenuLink href="/clinic/settings" label="Prescription pad settings" sub="Letterhead, header/footer, Rx fields" icon={Settings} />
            <MenuLink href="/clinic/settings/booking" label="Online booking" sub="Working hours & shareable booking link" icon={CalendarClock} />
          </MenuGroup>
        )}

        {type === "gym" && (
          <MenuGroup title="Gym">
            <MenuLink href="/gym/members" label="Members" sub="View members, expiry status, PT sessions" icon={Users} />
            <MenuLink href="/gym/members/new" label="Sell membership" sub="New sign-up or renewal" icon={Dumbbell} />
            {mod("leads_crm") && <MenuLink href="/gym/leads" label="Leads" sub="Trial enquiries and walk-ins" icon={UserCog} />}
            {mod("class_schedule") && <MenuLink href="/gym/classes" label="Classes" sub="Yoga, Zumba — weekly schedule & bookings" icon={CalendarDays} />}
            <MenuLink href="/gym/plans" label="Membership plans" sub="Set up Monthly, Quarterly, Yearly plans" icon={ClipboardList} />
            <MenuLink href="/gym/attendance" label="Attendance" sub="Check-in / check-out log" icon={ClipboardCheck} />
            {mod("self_checkin_kiosk") && (
              <MenuLink href="/gym/kiosk-settings" label="Self check-in kiosk" sub="Members check themselves in — no staff needed" icon={MonitorPlay} />
            )}
          </MenuGroup>
        )}

        {type === "lab" && (
          <MenuGroup title="Lab">
            <MenuLink href="/lab/orders" label="Orders" sub="Booked, in-progress, and completed orders" icon={ClipboardList} />
            <MenuLink href="/lab/orders/new" label="New order" sub="Book tests for a patient" icon={FlaskConical} />
            <MenuLink href="/lab/tests" label="Test catalog & packages" sub="Set up tests, prices, reference ranges" icon={BookOpen} />
          </MenuGroup>
        )}

        <MenuGroup title="Sales & money">
          <MenuLink href="/bills/all" label="All bills" sub="Browse & reprint any past bill" icon={Receipt} />
          {mod("petty_cash") && <MenuLink href="/petty-cash" label="Petty cash" sub="Small day-to-day cash expenses" icon={Wallet} />}
          <MenuLink href="/catalog-orders" label="Catalog orders" sub="Orders from your online catalog" icon={Store} />
          {mod("public_catalog") && (
            <MenuLink href="/catalog-settings" label="Catalog link" sub="Share a link customers can browse & order from" icon={Store} />
          )}
        </MenuGroup>

        <MenuGroup title="Stock">
          <MenuLink href="/products" label={terminology.productPlural} sub={terminology.productSub} icon={Package} />
          {mod("stock_audit") && <MenuLink href="/stock-audit" label="Stock audit" sub="Count physical stock, reconcile mismatches" icon={ClipboardCheck} />}
          <MenuLink href="/reorder" label="Reorder stock" sub="Send low-stock items to a vendor" icon={PackagePlus} />
          {/* Batch/expiry tracking is a per-product option any shop can use;
              doctor-wise sales and Schedule X are pharmacy-only. */}
          {!["restaurant", "hotel", "transport", "rental"].includes(type) && (
            <>
              <MenuLink href="/pharmacy/expiry" label="Expiry alerts" sub="Batches nearing or past expiry" icon={CalendarClock} />
              <MenuLink href="/pharmacy/write-offs" label="Write-off history" sub="Stock lost to expiry or damage" icon={Trash2} />
            </>
          )}
          {type === "pharmacy" && (
            <>
              <MenuLink href="/pharmacy/doctors" label="Doctor-wise sales" sub="Prescriptions by doctor" icon={Stethoscope} />
              <MenuLink href="/pharmacy/schedule-x-register" label="Schedule H1 & X register" sub="Controlled drug sales compliance record" icon={BookOpen} />
            </>
          )}
          {["hardware", "mart", "general"].includes(type) && (
            <MenuLink href="/warranty" label="Warranty lookup" sub="Check warranty status by phone or invoice" icon={ShieldCheck} />
          )}
        </MenuGroup>

        <MenuGroup title="People">
          <MenuLink
            href="/parties"
            label="Parties"
            sub={type === "clinic" ? "Patients & suppliers" : type === "gym" ? "Members & suppliers" : "Customers & suppliers, one place"}
            icon={Users}
          />
          {isOwner && <MenuLink href="/staff" label={t("more.staff")} sub={t("more.staff.sub")} icon={UserCog} />}
          {isOwner && mod("multi_branch") && <MenuLink href="/branches" label="Branches" sub="Multiple locations, one account" icon={Building2} />}
        </MenuGroup>

        <MenuGroup title="Grow your business">
          {mod("whatsapp_reminders") && <MenuLink href="/reminders" label={t("more.reminders")} sub={t("more.reminders.sub")} icon={Bell} />}
          {mod("offers") && <MenuLink href="/offers" label={t("more.offers")} sub={t("more.offers.sub")} icon={Megaphone} />}
          <MenuLink href="/loyalty-settings" label="Loyalty program" sub="Reward regulars for coming back" icon={Gift} />
          <MenuLink href="/birthdays" label="Birthdays" sub="Wish customers, bring them back" icon={Cake} />
          <MenuLink href="/festivals" label="Festival planner" sub="Upcoming festivals, stock-up hints & posters" icon={PartyPopper} />
          <MenuLink href="/profit-leak" label="Profit leak detector" sub="Where your money is stuck, at a glance" icon={TrendingDown} />
          <MenuLink href="/shelf-watch" label="Shelf watch" sub="Photo a shelf; AI spots what's running low" icon={ScanEye} />
          <MenuLink href="/requests" label={t("more.requests")} sub={t("more.requests.sub")} icon={Bell} />
        </MenuGroup>

        <MenuGroup title="Import & quick entry">
          <MenuLink href="/import-khata" label="Import old khata" sub="Photograph your paper ledger, AI digitizes it" icon={FileUp} />
          <MenuLink href="/import-sales-history" label="Import old sales register" sub="Photograph past sales, AI reads every row" icon={FileUp} />
          <MenuLink href="/bulk-sale-entry" label="Bulk sale entry" sub="Fast table entry for several sales at once" icon={Table2} />
          <MenuLink href="/fast-billing-settings" label="Fast billing" sub="Tap-to-add counter for busy hours" icon={Zap} />
        </MenuGroup>

        <MenuGroup title="Settings & help">
          <MenuLink href="/profile" label="Shop settings" sub="GST profile, invoice, printer, preferences" icon={Settings} />
          <MenuLink href="/fast-print-setup" label="One-click print setup" sub="Print from a laptop without the dialog" icon={Printer} />
          <MenuLink href="/plans#hardware" label="Printers & counter hardware" sub="Bluetooth printers, scanners and starter kits" icon={Printer} />
          <MenuLink href="/offline-bill" label="Offline billing" sub="Keep billing with no connection — syncs when you're back" icon={WifiOff} />
          {isOwner && mod("audit_log") && (
            <>
              <MenuLink href="/audit-log" label="Audit log" sub="Who did what, and when" icon={FileClock} />
              <MenuLink href="/error-log" label="Error log" sub="Unexpected failures caught automatically" icon={AlertTriangle} />
            </>
          )}
        </MenuGroup>

        <div className="flex flex-col gap-3">
          <p className="px-1 text-xs text-muted">
            {t("more.loggedInAs")} {session.staffName} ({session.email})
          </p>
          <LogoutButton logoutLabel={t("more.logout")} thisDeviceLabel="Log out of this device" allDevicesLabel="Log out of all devices" />
        </div>
      </div>
  );
}

/** A labelled group rendered as one card of divided rows — every option
 * is visible at a glance instead of hidden behind collapsed sections. */
async function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = await getTranslator();
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="px-1 text-xs font-semibold text-muted">{t(title)}</h2>
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">{children}</div>
    </section>
  );
}

async function MenuLink({ href, label, sub, icon: Icon }: { href: string; label: string; sub: string; icon: LucideIcon }) {
  const { t } = await getTranslator();
  return (
    <Link href={href} className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-surface-2 active:bg-surface-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
        <Icon size={17} strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{t(label)}</span>
        <span className="block truncate text-xs text-muted">{t(sub)}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-muted" />
    </Link>
  );
}
