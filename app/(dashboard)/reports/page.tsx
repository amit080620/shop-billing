import Link from "next/link";
import { requireSession } from "@/lib/auth";

export default async function ReportsPage() {
  const session = await requireSession();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-foreground">GST reports</h1>

      {session.gstScheme === "composition" && (
        <p className="rounded-lg bg-credit-soft px-3 py-2 text-sm text-credit">
          Your shop is set to Composition scheme in Settings. GSTR-1 and GSTR-3B below are built
          for Regular scheme and won&apos;t match what a Composition dealer files (CMP-08).
        </p>
      )}

      <p className="rounded-lg border border-border bg-surface px-3.5 py-3 text-xs text-muted">
        These reports are laid out the same way the GST portal organizes them, built from your
        own sales and purchase entries — they don&apos;t file anything for you. Review the
        numbers (or have your CA review them) before entering them on the portal.
      </p>

      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        <ReportLink
          href="/reports/gstr1"
          label="GSTR-1"
          sub="Outward supplies — B2B, B2C, HSN summary, docs issued"
        />
        <ReportLink
          href="/reports/gstr3b"
          label="GSTR-3B"
          sub="Monthly summary — output tax, ITC, net payable"
        />
        <ReportLink
          href="/reports/purchase-register"
          label="Purchase register (ITC)"
          sub="Vendor-wise input tax credit — your GSTR-2B equivalent"
        />
      </div>
    </div>
  );
}

function ReportLink({ href, label, sub }: { href: string; label: string; sub: string }) {
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
