import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { LogoutButton } from "./LogoutButton";
import { getTranslator } from "@/lib/i18n/server";
import { getTerminology } from "@/lib/businessType";
import { isModuleEnabled } from "@/lib/modules";
import { MoreDrawerShell } from "./MoreDrawerShell";
import {
  Users,
  Bell,
  Clock,
  Truck,
  Package,
  UserCog,
  Megaphone,
  PartyPopper,
  WifiOff,
  CalendarClock,
  ChefHat,
  BookOpen,
  ClipboardCheck,
  ShieldCheck,
  Scissors,
  Gem,
  Store,
  Stethoscope,
  Palette,
  Wallet,
  Building2,
  Dumbbell,
  FlaskConical,
  AlertTriangle,
  Cake,
  PackagePlus,
  Wrench,
  Gift,
  Zap,
  Pill,
  Receipt,
} from "lucide-react";

export default async function MorePage() {
  const session = await requireSession();
  const { t } = await getTranslator();
  const terminology = getTerminology(session.businessType);

  return (
    <MoreDrawerShell>
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold text-foreground">{t("more.title")}</h1>

      {/* "Expiry alerts" and "Write-off history" are genuinely
          generic — any shop that tracks batch/expiry on a product
          (the "Track with batch & expiry date" checkbox on the
          product form, available to every business type) benefits
          from these, not just pharmacies. Doctor-wise sales and the
          Schedule X register genuinely are pharmacy-only concepts
          (prescriptions, narcotic compliance), so those stay gated. */}
      {!["restaurant", "transport", "rental"].includes(session.businessType) && (
        <MenuGroup title={session.businessType === "pharmacy" || session.businessType === "clinic" ? "Medicine stock" : "Batch & expiry stock"}>
          <MenuLink href="/pharmacy/expiry" label="Expiry alerts" sub="Batches nearing or past expiry" icon={ExpiryIcon} tone="warning" />
          <MenuLink href="/pharmacy/write-offs" label="Write-off history" sub="Stock lost to expiry or damage" icon={ClockIcon} />
          {session.businessType === "pharmacy" && (
            <>
              <MenuLink href="/pharmacy/doctors" label="Doctor-wise sales" sub="Prescriptions by doctor" icon={ClockIcon} />
              <MenuLink href="/pharmacy/schedule-x-register" label="Schedule X register" sub="Narcotic sales compliance record" icon={RegisterIcon} />
            </>
          )}
        </MenuGroup>
      )}

      {session.businessType === "restaurant" && (
        <MenuGroup title="Restaurant">
          <MenuLink href="/restaurant-kds" label="Kitchen display (TV)" sub="Big-screen view for the kitchen" icon={KitchenIcon} tone="secondary" />
          <MenuLink href="/restaurant/kds-settings" label="Kitchen display settings" sub="Cards per row, text size" icon={KitchenIcon} tone="secondary" />
          <MenuLink href="/restaurant/combos" label="Combo deals" sub="Bundle menu items at a set price" icon={BoxIcon} />
          <MenuLink href="/restaurant/reports" label="Restaurant sales" sub="Day-wise & month-wise reports" icon={ClockIcon} />
        </MenuGroup>
      )}

      {session.businessType === "service" && (
        <MenuGroup title="Service & repairs">
          <MenuLink href="/service" label="All jobs" sub="Every repair, by status" icon={WrenchIcon} tone="secondary" />
          <MenuLink href="/service/new" label="New job" sub="Take in an item for repair" icon={WrenchIcon} tone="secondary" />
          <MenuLink href="/service/reports" label="Job report" sub="Earnings, technician split, item types" icon={ClockIcon} />
        </MenuGroup>
      )}

      {session.businessType === "rental" && (
        <MenuGroup title="Rentals">
          <MenuLink href="/rentals/history" label="Rental history" sub="Past returns & cancellations" icon={ClockIcon} />
        </MenuGroup>
      )}

      {session.businessType === "transport" && (
        <MenuGroup title="Transport">
          <MenuLink href="/transport/vehicles" label="Vehicles" sub="Manage trucks & per-km rates" icon={TruckIcon} tone="secondary" />
          <MenuLink href="/transport/reports" label="Vehicle-wise trips" sub="Rounds, km & earnings per vehicle" icon={ClockIcon} />
        </MenuGroup>
      )}

      {["hardware", "mart", "general"].includes(session.businessType) && (
        <MenuGroup title="Hardware">
          <MenuLink href="/warranty" label="Warranty lookup" sub="Check warranty status by phone or invoice" icon={WarrantyIcon} tone="success" />
        </MenuGroup>
      )}

      {session.businessType === "salon" && (
        <MenuGroup title="Salon">
          <MenuLink href="/salon/appointments" label="Appointments" sub="Book & manage customer visits" icon={SalonIcon} tone="secondary" />
          <MenuLink href="/salon/settings/booking" label="Online booking" sub="Working hours & shareable booking link" icon={SalonIcon} tone="secondary" />
          <MenuLink href="/salon" label="Staff-wise revenue" sub="Who's bringing in how much" icon={SalonIcon} tone="secondary" />
        </MenuGroup>
      )}

      {session.businessType === "jewellery" && (
        <MenuGroup title="Jewellery">
          <MenuLink href="/jewellery/rates" label="Today's rate" sub="Set gold/silver rate per gram" icon={JewelleryIcon} tone="warning" />
          <MenuLink href="/jewellery/exchanges" label="Exchange history" sub="Old gold/silver taken in" icon={ClockIcon} />
        </MenuGroup>
      )}

      {session.businessType === "clinic" && (
        <MenuGroup title="Clinic">
          <MenuLink href="/clinic/appointments" label="Appointments" sub="Book & manage patient visits" icon={ClinicIcon} tone="info" />
          <MenuLink href="/clinic/prescriptions/new" label="New prescription" sub="Write an Rx for a patient" icon={ClinicIcon} tone="info" />
          <MenuLink href="/clinic/settings" label="Prescription pad settings" sub="Letterhead, header/footer, Rx fields" icon={ClinicIcon} tone="info" />
          <MenuLink href="/clinic/settings/booking" label="Online booking" sub="Working hours & shareable booking link" icon={ClinicIcon} tone="info" />
          <MenuLink href="/clinic/medicine-library" label="Medicine library" sub="Saved medicines — no need to retype names" icon={MedicineLibraryIcon} tone="info" />
          <MenuLink href="/clinic/treatment-plans" label="Treatment plans" sub="Plan → quotation → bill, all linked" icon={ClinicIcon} tone="info" />
        </MenuGroup>
      )}

      {session.businessType === "gym" && (
        <MenuGroup title="Gym">
          <MenuLink href="/gym/members" label="Members" sub="View members, expiry status, PT sessions" icon={GymIcon} tone="success" />
          <MenuLink href="/gym/members/new" label="Sell membership" sub="New sign-up or renewal" icon={GymIcon} tone="success" />
          {isModuleEnabled(session.enabledModules, "leads_crm") && (
            <MenuLink href="/gym/leads" label="Leads" sub="Trial enquiries and walk-ins" icon={GymIcon} tone="success" />
          )}
          {isModuleEnabled(session.enabledModules, "class_schedule") && (
            <MenuLink href="/gym/classes" label="Classes" sub="Yoga, Zumba — weekly schedule & bookings" icon={GymIcon} tone="success" />
          )}
          <MenuLink href="/gym/plans" label="Membership plans" sub="Set up Monthly, Quarterly, Yearly plans" icon={GymIcon} tone="success" />
          <MenuLink href="/gym/attendance" label="Attendance" sub="Check-in / check-out log" icon={GymIcon} tone="success" />
          {isModuleEnabled(session.enabledModules, "self_checkin_kiosk") && (
            <MenuLink href="/gym/kiosk-settings" label="Self check-in kiosk" sub="Members check themselves in — no staff needed" icon={GymIcon} tone="success" />
          )}
        </MenuGroup>
      )}

      {session.businessType === "lab" && (
        <MenuGroup title="Lab">
          <MenuLink href="/lab/orders" label="Orders" sub="Booked, in-progress, and completed orders" icon={LabIcon} tone="info" />
          <MenuLink href="/lab/orders/new" label="New order" sub="Book tests for a patient" icon={LabIcon} tone="info" />
          <MenuLink href="/lab/tests" label="Test catalog & packages" sub="Set up tests, prices, reference ranges" icon={LabIcon} tone="info" />
        </MenuGroup>
      )}

      <MenuGroup title="Sell online">
        {isModuleEnabled(session.enabledModules, "public_catalog") && (
          <MenuLink href="/catalog-settings" label="Catalog link" sub="Share a link customers can browse & order from" icon={CatalogIcon} tone="secondary" />
        )}
        <MenuLink href="/catalog-orders" label="Catalog orders" sub="Review orders that came in" icon={CatalogIcon} tone="secondary" />
      </MenuGroup>

      <MenuGroup title="Money">
        <MenuLink href="/bills/all" label="All bills" sub="Browse & reprint any past bill" icon={({ className }) => <Receipt className={className} />} tone="brand" />
        {isModuleEnabled(session.enabledModules, "petty_cash") && (
          <MenuLink href="/petty-cash" label="Petty cash" sub="Small day-to-day cash expenses" icon={PettyCashIcon} tone="warning" />
        )}
      </MenuGroup>

      {session.role === "owner" && isModuleEnabled(session.enabledModules, "multi_branch") && (
        <MenuGroup title="Locations">
          <MenuLink href="/branches" label="Branches" sub="Multiple locations, one account" icon={BranchIcon} tone="success" />
        </MenuGroup>
      )}

      <MenuGroup title="People">
        <MenuLink href="/parties" label="Parties" sub={session.businessType === "clinic" ? "Patients & suppliers" : session.businessType === "gym" ? "Members & suppliers" : "Customers & suppliers, one place"} icon={PeopleIcon} />
        <MenuLink href="/import-khata" label="Import old khata" sub="Photograph your paper ledger, AI digitizes it" icon={PeopleIcon} tone="secondary" />
        <MenuLink href="/import-sales-history" label="Import old sales register" sub="Photograph past sales, AI reads every row" icon={PeopleIcon} tone="secondary" />
        <MenuLink href="/bulk-sale-entry" label="Bulk sale entry" sub="Fast table entry for several sales at once" icon={PeopleIcon} tone="secondary" />
        {session.role === "owner" && (
          <>
            <MenuLink href="/staff" label={t("more.staff")} sub={t("more.staff.sub")} icon={UsersIcon} tone="success" />
            {isModuleEnabled(session.enabledModules, "audit_log") && (
              <>
                <MenuLink href="/audit-log" label="Audit log" sub="Who did what, and when" icon={UsersIcon} tone="info" />
                <MenuLink href="/error-log" label="Error log" sub="Unexpected failures caught automatically" icon={ErrorLogIcon} tone="danger" />
              </>
            )}
          </>
        )}
      </MenuGroup>

      <MenuGroup title="Catalog">
        <MenuLink href="/products" label={terminology.productPlural} sub={terminology.productSub} icon={BoxIcon} />
        {isModuleEnabled(session.enabledModules, "stock_audit") && (
          <MenuLink href="/stock-audit" label="Stock audit" sub="Count physical stock, reconcile mismatches" icon={AuditIcon} tone="warning" />
        )}
      </MenuGroup>

      <MenuGroup title="No internet?">
        <MenuLink href="/offline-bill" label="Offline billing" sub="Keep billing with no connection — syncs automatically once you're back online" icon={OfflineIcon} tone="info" />
      </MenuGroup>

      <MenuGroup title="Grow your business">
        <MenuLink href="/birthdays" label="Birthdays" sub="Wish customers, bring them back" icon={CakeIcon} tone="secondary" />
        <MenuLink href="/reorder" label="Reorder stock" sub="Send low-stock items to a vendor" icon={ReorderIcon} tone="warning" />
        <MenuLink href="/requests" label={t("more.requests")} sub={t("more.requests.sub")} icon={BellIcon} tone="warning" />
        {isModuleEnabled(session.enabledModules, "whatsapp_reminders") && (
          <MenuLink href="/reminders" label={t("more.reminders")} sub={t("more.reminders.sub")} icon={ClockIcon} tone="warning" />
        )}
        {isModuleEnabled(session.enabledModules, "offers") && (
          <MenuLink href="/offers" label={t("more.offers")} sub={t("more.offers.sub")} icon={MegaphoneIcon} tone="secondary" />
        )}
        <MenuLink href="/festivals" label="Festival planner" sub="Upcoming festivals & stock-up reminders" icon={FestivalIcon} tone="secondary" />
        <MenuLink href="/festival-poster" label="Festival poster" sub="AI writes the offer, get a ready-to-share design" icon={FestivalIcon} tone="secondary" />
        <MenuLink href="/profit-leak" label="Profit Leak Detector" sub="Aapka paisa kahan phansa hai — ek nazar mein" icon={FestivalIcon} tone="danger" />
        <MenuLink href="/shelf-watch" label="Ankhon se Inventory" sub="Shelf ki photo se stock-kami turant pata chale" icon={FestivalIcon} tone="secondary" />
        <MenuLink href="/loyalty-settings" label="Loyalty program" sub="Reward regulars for coming back" icon={GiftIcon} tone="secondary" />
        <MenuLink href="/fast-billing-settings" label="Fast billing" sub="Tap-to-add counter for busy hours" icon={ZapIcon} tone="secondary" />
      </MenuGroup>


      <div className="neu-card px-4 py-3.5 text-sm text-muted">
        {t("more.loggedInAs")} {session.staffName} ({session.email})
      </div>

      <LogoutButton logoutLabel={t("more.logout")} thisDeviceLabel="Log out of this device" allDevicesLabel="Log out of all devices" />
    </div>
    </MoreDrawerShell>
  );
}

function MenuGroup({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group flex flex-col gap-2" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 transition-transform duration-200 group-open:rotate-180"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className="neu-tray mt-2 flex flex-col gap-2 p-2">{children}</div>
    </details>
  );
}

const TONE_CLASSES: Record<string, string> = {
  brand: "bg-brand-soft text-brand-text",
  secondary: "bg-brand-soft text-brand-text",
  success: "bg-brand-soft text-brand-text",
  warning: "bg-brand-soft text-brand-text",
  info: "bg-brand-soft text-brand-text",
  danger: "bg-brand-soft text-brand-text",
};

function MenuLink({
  href,
  label,
  sub,
  icon: Icon,
  tone = "brand",
}: {
  href: string;
  label: string;
  sub: string;
  icon: (props: { className?: string }) => React.ReactElement;
  tone?: keyof typeof TONE_CLASSES;
}) {
  return (
    <Link
      href={href}
      className="neu-card flex items-center gap-3 px-4 py-3.5 transition active:scale-[0.98]"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}
        style={{ boxShadow: "-3px -3px 7px var(--neu-light), 3px 3px 7px var(--neu-dark)" }}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground neu-text">{label}</p>
        <p className="truncate text-xs text-muted">{sub}</p>
      </div>
      <span className="shrink-0 text-muted">›</span>
    </Link>
  );
}

function PeopleIcon({ className }: { className?: string }) {
  return <Users className={className} size={18} strokeWidth={1.8} />;
}
function BellIcon({ className }: { className?: string }) {
  return <Bell className={className} size={18} strokeWidth={1.8} />;
}
function ClockIcon({ className }: { className?: string }) {
  return <Clock className={className} size={18} strokeWidth={1.8} />;
}
function TruckIcon({ className }: { className?: string }) {
  return <Truck className={className} size={18} strokeWidth={1.8} />;
}
function BoxIcon({ className }: { className?: string }) {
  return <Package className={className} size={18} strokeWidth={1.8} />;
}
function UsersIcon({ className }: { className?: string }) {
  return <UserCog className={className} size={18} strokeWidth={1.8} />;
}
function ErrorLogIcon({ className }: { className?: string }) {
  return <AlertTriangle className={className} size={18} strokeWidth={1.8} />;
}
function CakeIcon({ className }: { className?: string }) {
  return <Cake className={className} size={18} strokeWidth={1.8} />;
}
function ReorderIcon({ className }: { className?: string }) {
  return <PackagePlus className={className} size={18} strokeWidth={1.8} />;
}
function WrenchIcon({ className }: { className?: string }) {
  return <Wrench className={className} size={18} strokeWidth={1.8} />;
}
function MegaphoneIcon({ className }: { className?: string }) {
  return <Megaphone className={className} size={18} strokeWidth={1.8} />;
}
function FestivalIcon({ className }: { className?: string }) {
  return <PartyPopper className={className} size={18} strokeWidth={1.8} />;
}
function GiftIcon({ className }: { className?: string }) {
  return <Gift className={className} size={18} strokeWidth={1.8} />;
}
function ZapIcon({ className }: { className?: string }) {
  return <Zap className={className} size={18} strokeWidth={1.8} />;
}
function OfflineIcon({ className }: { className?: string }) {
  return <WifiOff className={className} size={18} strokeWidth={1.8} />;
}
function ExpiryIcon({ className }: { className?: string }) {
  return <CalendarClock className={className} size={18} strokeWidth={1.8} />;
}
function KitchenIcon({ className }: { className?: string }) {
  return <ChefHat className={className} size={18} strokeWidth={1.8} />;
}
function RegisterIcon({ className }: { className?: string }) {
  return <BookOpen className={className} size={18} strokeWidth={1.8} />;
}
function AuditIcon({ className }: { className?: string }) {
  return <ClipboardCheck className={className} size={18} strokeWidth={1.8} />;
}
function WarrantyIcon({ className }: { className?: string }) {
  return <ShieldCheck className={className} size={18} strokeWidth={1.8} />;
}
function SalonIcon({ className }: { className?: string }) {
  return <Scissors className={className} size={18} strokeWidth={1.8} />;
}
function JewelleryIcon({ className }: { className?: string }) {
  return <Gem className={className} size={18} strokeWidth={1.8} />;
}
function CatalogIcon({ className }: { className?: string }) {
  return <Store className={className} size={18} strokeWidth={1.8} />;
}
function ClinicIcon({ className }: { className?: string }) {
  return <Stethoscope className={className} size={18} strokeWidth={1.8} />;
}
function MedicineLibraryIcon({ className }: { className?: string }) {
  return <Pill className={className} size={18} strokeWidth={1.8} />;
}
function InvoiceDesignIcon({ className }: { className?: string }) {
  return <Palette className={className} size={18} strokeWidth={1.8} />;
}
function PettyCashIcon({ className }: { className?: string }) {
  return <Wallet className={className} size={18} strokeWidth={1.8} />;
}
function BranchIcon({ className }: { className?: string }) {
  return <Building2 className={className} size={18} strokeWidth={1.8} />;
}
function GymIcon({ className }: { className?: string }) {
  return <Dumbbell className={className} size={18} strokeWidth={1.8} />;
}
function LabIcon({ className }: { className?: string }) {
  return <FlaskConical className={className} size={18} strokeWidth={1.8} />;
}
