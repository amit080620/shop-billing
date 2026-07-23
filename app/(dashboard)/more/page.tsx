import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { logoutAction } from "@/lib/actions/auth";

export default async function MorePage() {
  const session = await requireSession();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-foreground">More</h1>

      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        <MenuLink href="/customers" label="Customers" sub="Sales ledger & credit" />
        <MenuLink href="/requests" label="Item requests" sub="Customer asked, notify when it arrives" />
        <MenuLink href="/reminders" label="Udhaar reminders" sub="One-tap WhatsApp follow-ups" />
        <MenuLink href="/vendors" label="Vendors" sub="Purchases & payables" />
        <MenuLink href="/products" label="Products" sub="Catalog, HSN codes, GST%" />
        {session.role === "owner" && (
          <MenuLink href="/staff" label="Staff" sub="Add or remove staff logins" />
        )}
        {session.role === "owner" && (
          <MenuLink href="/settings" label="GST & shop profile" sub="GSTIN, state, invoice numbering" />
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface px-4 py-3.5 text-sm text-muted">
        Logged in as {session.staffName} ({session.email})
      </div>

      <form action={logoutAction}>
        <button
          type="submit"
          className="w-full rounded-lg border border-border px-4 py-3 text-sm font-medium text-danger"
        >
          Log out
        </button>
      </form>
    </div>
  );
}

function MenuLink({ href, label, sub }: { href: string; label: string; sub: string }) {
  return (
    <Link href={href} className="flex items-center justify-between px-4 py-3.5">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted">{sub}</p>
      </div>
      <span className="text-muted">›</span>
    </Link>
  );
}
