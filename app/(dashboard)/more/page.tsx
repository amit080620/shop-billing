import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { logoutAction } from "@/lib/actions/auth";
import { getTranslator } from "@/lib/i18n/server";
import { LanguageToggle } from "@/lib/i18n/LanguageToggle";

export default async function MorePage() {
  const session = await requireSession();
  const { lang, t } = await getTranslator();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">{t("more.title")}</h1>
        <LanguageToggle lang={lang} />
      </div>

      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <MenuLink href="/customers" label={t("more.customers")} sub={t("more.customers.sub")} icon={PeopleIcon} />
        <MenuLink href="/requests" label={t("more.requests")} sub={t("more.requests.sub")} icon={BellIcon} />
        <MenuLink href="/reminders" label={t("more.reminders")} sub={t("more.reminders.sub")} icon={ClockIcon} />
        <MenuLink href="/offers" label={t("more.offers")} sub={t("more.offers.sub")} icon={MegaphoneIcon} />
        <MenuLink href="/vendors" label={t("more.vendors")} sub={t("more.vendors.sub")} icon={TruckIcon} />
        <MenuLink href="/products" label={t("more.products")} sub={t("more.products.sub")} icon={BoxIcon} />
        <MenuLink href="/daily-summary" label="Daily summary" sub="End-of-day cash reconciliation" icon={CashIcon} />
        <MenuLink href="/help" label="Help & guide" sub="How every screen and button works" icon={HelpIcon} />
        <MenuLink href="/insights" label="Insights" sub="Fast movers & dead stock, from your own sales" icon={ChartIcon} />
        <MenuLink href="/festivals" label="Festival planner" sub="Upcoming festivals & stock-up reminders" icon={FestivalIcon} />
        {session.role === "owner" && (
          <MenuLink href="/staff" label={t("more.staff")} sub={t("more.staff.sub")} icon={UsersIcon} />
        )}
        {session.role === "owner" && (
          <MenuLink href="/settings" label={t("more.settings")} sub={t("more.settings.sub")} icon={GearIcon} />
        )}
      </div>

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
function ChartIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M4 19V5M4 19h16M8 15l3-4 3 3 4-6" />
    </svg>
  );
}
function CashIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M8 14h.01M12 14h4" />
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
