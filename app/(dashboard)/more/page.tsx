import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { logoutAction } from "@/lib/actions/auth";

export default async function MorePage() {
  const session = await requireSession();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-foreground">More</h1>

      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <MenuLink href="/customers" label="Customers" sub="Sales ledger & credit" icon={PeopleIcon} />
        <MenuLink href="/requests" label="Item requests" sub="Customer asked, notify when it arrives" icon={BellIcon} />
        <MenuLink href="/reminders" label="Udhaar reminders" sub="One-tap WhatsApp follow-ups" icon={ClockIcon} />
        <MenuLink href="/vendors" label="Vendors" sub="Purchases & payables" icon={TruckIcon} />
        <MenuLink href="/products" label="Products" sub="Catalog, HSN codes, GST%, stock" icon={BoxIcon} />
        {session.role === "owner" && (
          <MenuLink href="/staff" label="Staff" sub="Add or remove staff logins" icon={UsersIcon} />
        )}
        {session.role === "owner" && (
          <MenuLink href="/settings" label="GST & shop profile" sub="GSTIN, state, logo, invoice numbering" icon={GearIcon} />
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface px-4 py-3.5 text-sm text-muted shadow-sm">
        Logged in as {session.staffName} ({session.email})
      </div>

      <form action={logoutAction}>
        <button
          type="submit"
          className="w-full rounded-lg border border-border px-4 py-3 text-sm font-medium text-danger transition active:scale-[0.98]"
        >
          Log out
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
