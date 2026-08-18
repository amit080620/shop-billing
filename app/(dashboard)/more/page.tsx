import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { LogoutButton } from "./LogoutButton";
import { getTranslator } from "@/lib/i18n/server";
import { getTheme, getAccent, getTextColor } from "@/lib/theme";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { AccentToggle } from "@/app/components/AccentToggle";
import { TextColorToggle } from "@/app/components/TextColorToggle";
import { getTerminology } from "@/lib/businessType";
import { LanguageToggle } from "@/lib/i18n/LanguageToggle";
import { SubscriptionCard } from "@/app/components/SubscriptionCard";
import { InstallAppButton } from "@/app/components/InstallAppButton";
import { isModuleEnabled } from "@/lib/modules";
import { Users, Bell, Clock, Truck, Package, UserCog, Settings, Megaphone, HelpCircle, PartyPopper, WifiOff, CalendarClock, ChefHat, BookOpen, ClipboardCheck, ShieldCheck, Scissors, Gem, Store, Stethoscope, Palette, Wallet, Building2, Dumbbell, FlaskConical, Receipt as ReceiptIcon, AlertTriangle } from "lucide-react";

export default async function MorePage() {
  const session = await requireSession();
  const { lang, t } = await getTranslator();
  const theme = await getTheme();
  const accent = await getAccent();
  const textColor = await getTextColor();
  const terminology = getTerminology(session.businessType);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold text-foreground">{t("more.title")}</h1>

      <SubscriptionCard />
      <InstallAppButton />

      <MenuGroup title="Preferences">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-foreground">{t("more.language")}</p>
            <p className="text-xs text-muted">Applies to this device only</p>
          </div>
          <LanguageToggle lang={lang} compact />
        </div>
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-foreground">Theme</p>
            <p className="text-xs text-muted">Applies to this device only</p>
          </div>
          <ThemeToggle theme={theme} compact />
        </div>
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-foreground">Accent color</p>
            <p className="text-xs text-muted">Applies to this device only</p>
          </div>
          <AccentToggle accent={accent} />
        </div>
        <div className="flex flex-col gap-2 px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-foreground">Text color</p>
            <p className="text-xs text-muted">Applies to this device only</p>
          </div>
          <TextColorToggle textColor={textColor} />
        </div>
      </MenuGroup>

      {(session.businessType === "pharmacy" || session.businessType === "clinic") && (
        <MenuGroup title="Medicine stock">
          <MenuLink href="/pharmacy/expiry" label="Expiry alerts" sub="Medicines nearing or past expiry" icon={ExpiryIcon} tone="warning" />
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

      <MenuGroup title="Branding">
        <MenuLink href="/invoice-settings" label="Invoice design" sub="Tagline, footer, terms, accent colour" icon={InvoiceDesignIcon} tone="secondary" />
      </MenuGroup>

      <MenuGroup title="Money">
        <MenuLink href="/bills/all" label="All bills" sub="Browse & reprint any past bill" icon={({ className }) => <ReceiptIcon className={className} />} tone="brand" />
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
        <MenuLink
          href="/customers"
          label={session.businessType === "clinic" ? "Patients" : session.businessType === "gym" ? "Members" : t("more.customers")}
          sub={session.businessType === "clinic" ? "Patient records and history" : session.businessType === "gym" ? "Member records and history" : t("more.customers.sub")}
          icon={PeopleIcon}
        />
        <MenuLink href="/vendors" label={t("more.vendors")} sub={t("more.vendors.sub")} icon={TruckIcon} tone="secondary" />
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
        <MenuLink href="/requests" label={t("more.requests")} sub={t("more.requests.sub")} icon={BellIcon} tone="warning" />
        {isModuleEnabled(session.enabledModules, "whatsapp_reminders") && (
          <MenuLink href="/reminders" label={t("more.reminders")} sub={t("more.reminders.sub")} icon={ClockIcon} tone="warning" />
        )}
        {isModuleEnabled(session.enabledModules, "offers") && (
          <MenuLink href="/offers" label={t("more.offers")} sub={t("more.offers.sub")} icon={MegaphoneIcon} tone="secondary" />
        )}
        <MenuLink href="/festivals" label="Festival planner" sub="Upcoming festivals & stock-up reminders" icon={FestivalIcon} tone="secondary" />
      </MenuGroup>

      <MenuGroup title="Shop setup">
        {session.role === "owner" && (
          <MenuLink href="/settings" label={t("more.settings")} sub={t("more.settings.sub")} icon={GearIcon} />
        )}
        <MenuLink href="/help" label="Help & guide" sub="How every screen and button works" icon={HelpIcon} tone="info" />
      </MenuGroup>

      <div className="neu-card px-4 py-3.5 text-sm text-muted">
        {t("more.loggedInAs")} {session.staffName} ({session.email})
      </div>

      <LogoutButton logoutLabel={t("more.logout")} thisDeviceLabel="Log out of this device" allDevicesLabel="Log out of all devices" />
    </div>
  );
}

function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
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
function GearIcon({ className }: { className?: string }) {
  return <Settings className={className} size={18} strokeWidth={1.8} />;
}
function MegaphoneIcon({ className }: { className?: string }) {
  return <Megaphone className={className} size={18} strokeWidth={1.8} />;
}
function HelpIcon({ className }: { className?: string }) {
  return <HelpCircle className={className} size={18} strokeWidth={1.8} />;
}
function FestivalIcon({ className }: { className?: string }) {
  return <PartyPopper className={className} size={18} strokeWidth={1.8} />;
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
