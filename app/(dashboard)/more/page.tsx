import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { logoutAction } from "@/lib/actions/auth";
import { getTranslator } from "@/lib/i18n/server";
import { getTheme } from "@/lib/theme";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { getTerminology } from "@/lib/businessType";
import { LanguageToggle } from "@/lib/i18n/LanguageToggle";
import { SubscriptionCard } from "@/app/components/SubscriptionCard";
import { InstallAppButton } from "@/app/components/InstallAppButton";

export default async function MorePage() {
  const session = await requireSession();
  const { lang, t } = await getTranslator();
  const theme = await getTheme();
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
      </MenuGroup>

      {session.businessType === "pharmacy" && (
        <MenuGroup title="Pharmacy">
          <MenuLink href="/pharmacy/expiry" label="Expiry alerts" sub="Medicines nearing or past expiry" icon={ExpiryIcon} />
          <MenuLink href="/pharmacy/doctors" label="Doctor-wise sales" sub="Prescriptions by doctor" icon={ClockIcon} />
          <MenuLink href="/pharmacy/schedule-x-register" label="Schedule X register" sub="Narcotic sales compliance record" icon={RegisterIcon} />
          <MenuLink href="/pharmacy/write-offs" label="Write-off history" sub="Stock lost to expiry or damage" icon={BellIcon} />
        </MenuGroup>
      )}

      {session.businessType === "restaurant" && (
        <MenuGroup title="Restaurant">
          <MenuLink href="/restaurant-kds" label="Kitchen display (TV)" sub="Big-screen view for the kitchen" icon={KitchenIcon} />
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
          <MenuLink href="/transport/vehicles" label="Vehicles" sub="Manage trucks & per-km rates" icon={TruckIcon} />
          <MenuLink href="/transport/reports" label="Vehicle-wise trips" sub="Rounds, km & earnings per vehicle" icon={ClockIcon} />
        </MenuGroup>
      )}

      {["hardware", "mart", "general"].includes(session.businessType) && (
        <MenuGroup title="Hardware">
          <MenuLink href="/warranty" label="Warranty lookup" sub="Check warranty status by phone or invoice" icon={WarrantyIcon} />
        </MenuGroup>
      )}

      {session.businessType === "salon" && (
        <MenuGroup title="Salon">
          <MenuLink href="/salon" label="Staff-wise revenue" sub="Who's bringing in how much" icon={SalonIcon} />
        </MenuGroup>
      )}

      {session.businessType === "jewellery" && (
        <MenuGroup title="Jewellery">
          <MenuLink href="/jewellery/rates" label="Today's rate" sub="Set gold/silver rate per gram" icon={JewelleryIcon} />
          <MenuLink href="/jewellery/exchanges" label="Exchange history" sub="Old gold/silver taken in" icon={ClockIcon} />
        </MenuGroup>
      )}

      <MenuGroup title="People">
        <MenuLink href="/customers" label={t("more.customers")} sub={t("more.customers.sub")} icon={PeopleIcon} />
        <MenuLink href="/vendors" label={t("more.vendors")} sub={t("more.vendors.sub")} icon={TruckIcon} />
        {session.role === "owner" && (
          <MenuLink href="/staff" label={t("more.staff")} sub={t("more.staff.sub")} icon={UsersIcon} />
        )}
      </MenuGroup>

      <MenuGroup title="Catalog">
        <MenuLink href="/products" label={terminology.productPlural} sub={terminology.productSub} icon={BoxIcon} />
        <MenuLink href="/stock-audit" label="Stock audit" sub="Count physical stock, reconcile mismatches" icon={AuditIcon} />
      </MenuGroup>

      <MenuGroup title="No internet?">
        <MenuLink href="/offline-bill" label="Offline billing" sub="Keep billing with no connection — syncs automatically once you're back online" icon={OfflineIcon} />
      </MenuGroup>

      <MenuGroup title="Grow your business">
        <MenuLink href="/requests" label={t("more.requests")} sub={t("more.requests.sub")} icon={BellIcon} />
        <MenuLink href="/reminders" label={t("more.reminders")} sub={t("more.reminders.sub")} icon={ClockIcon} />
        <MenuLink href="/offers" label={t("more.offers")} sub={t("more.offers.sub")} icon={MegaphoneIcon} />
        <MenuLink href="/festivals" label="Festival planner" sub="Upcoming festivals & stock-up reminders" icon={FestivalIcon} />
      </MenuGroup>

      <MenuGroup title="Shop setup">
        {session.role === "owner" && (
          <MenuLink href="/settings" label={t("more.settings")} sub={t("more.settings.sub")} icon={GearIcon} />
        )}
        <MenuLink href="/help" label="Help & guide" sub="How every screen and button works" icon={HelpIcon} />
      </MenuGroup>

      <div className="rounded-xl border border-border bg-surface px-4 py-3.5 text-sm text-muted shadow-sm">
        {t("more.loggedInAs")} {session.staffName} ({session.email})
      </div>

      <form action={logoutAction}>
        <button
          type="submit"
          className="w-full rounded-lg border border-border px-4 py-3 text-sm font-medium text-danger transition active:scale-[0.98]"
        >
          {t("more.logout")}
        </button>
      </form>
    </div>
  );
}

function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {children}
      </div>
    </section>
  );
}

function MenuLink({
  href,
  label,
  sub,
  icon: Icon,
}: {
  href: string;
  label: string;
  sub: string;
  icon: (props: { className?: string }) => React.ReactElement;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3.5 transition active:bg-background"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-dark">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{label}</p>
        <p className="truncate text-xs text-muted">{sub}</p>
      </div>
      <span className="shrink-0 text-muted">›</span>
    </Link>
  );
}

function iconProps(className?: string) {
  return {
    className,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

function PeopleIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M2 20c0-3.3 3-5.5 7-5.5s7 2.2 7 5.5" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M17 12.7c2.7.4 5 2.4 5 5.3" />
    </svg>
  );
}
function BellIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}
function TruckIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="1.5" y="7" width="13" height="9" rx="1" />
      <path d="M14.5 10h4l3 3v3h-7z" />
      <circle cx="6" cy="18" r="1.7" />
      <circle cx="17.5" cy="18" r="1.7" />
    </svg>
  );
}
function BoxIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M3.5 8 12 4l8.5 4-8.5 4-8.5-4Z" />
      <path d="M3.5 8v8L12 20l8.5-4V8" />
      <path d="M12 12v8" />
    </svg>
  );
}
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="8" cy="9" r="3" />
      <path d="M2 20c0-3 2.7-5 6-5s6 2 6 5" />
      <path d="M15 5.5a3 3 0 0 1 0 5.8" />
      <path d="M22 20c0-2.6-2-4.6-5-5" />
    </svg>
  );
}
function GearIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.3.9a7.5 7.5 0 0 0-1.7-1L15 3.5h-6l-.4 2.5a7.5 7.5 0 0 0-1.7 1l-2.3-.9-2 3.4L4.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.3-.9c.5.4 1 .8 1.7 1l.4 2.5h6l.4-2.5c.6-.2 1.2-.6 1.7-1l2.3.9 2-3.4-2-1.5Z" />
    </svg>
  );
}
function MegaphoneIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M3 11v2a2 2 0 0 0 2 2h1l2 5h2l-1.5-5H11l8 4V6l-8 4H8l-2-4H5a2 2 0 0 0-2 2Z" />
      <path d="M17 8.5v7" />
    </svg>
  );
}
function HelpIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5" />
      <path d="M12 17h.01" />
    </svg>
  );
}
function FestivalIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
function OfflineIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M2 8.5a17 17 0 0 1 20 0" />
      <path d="M5.5 12a11.5 11.5 0 0 1 13 0" />
      <path d="M9 15.5a6 6 0 0 1 6 0" />
      <path d="M12 19h.01" />
      <path d="M3 3l18 18" />
    </svg>
  );
}
function ExpiryIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M9 2h6M10 2v5.5L5 15a3 3 0 0 0 2.5 4.7h9a3 3 0 0 0 2.5-4.7L14 7.5V2" />
    </svg>
  );
}
function KitchenIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="2.5" y="4.5" width="19" height="13" rx="1.5" />
      <path d="M8 21h8M12 17.5V21" />
    </svg>
  );
}
function RegisterIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </svg>
  );
}
function AuditIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M9 12.5 11 14.5 15.5 10" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
function WarrantyIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
function SalonIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
    </svg>
  );
}
function JewelleryIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9 9.5a2.5 2.5 0 0 1 2.5-2.5h1a2.5 2.5 0 0 1 0 5h-1a2.5 2.5 0 0 0 0 5h1a2.5 2.5 0 0 0 2.5-2.5" />
    </svg>
  );
}
