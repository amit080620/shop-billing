import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { PageIcon } from "@/app/components/PageIcon";

export default async function ReportsPage() {
  const session = await requireSession();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <PageIcon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="3.5" width="16" height="17" rx="1.5" />
            <path d="M8 8h8M8 12h8M8 16h5" />
          </svg>
        </PageIcon>
        <h1 className="text-lg font-semibold text-foreground">GST reports</h1>
      </div>

      {session.gstScheme === "composition" && (
        <p className="rounded-lg bg-credit-soft px-3 py-2 text-sm text-credit">
          Your shop is set to Composition scheme in Settings. GSTR-1 and GSTR-3B below are built
          for Regular scheme and won&apos;t match what a Composition dealer files (CMP-08).
        </p>
      )}

      <p className="rounded-lg border border-border bg-surface shadow-sm px-3.5 py-3 text-xs text-muted">
        These reports are laid out the same way the GST portal organizes them, built from your
        own sales and purchase entries — they don&apos;t file anything for you. Review the
        numbers (or have your CA review them) before entering them on the portal.
      </p>

      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
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
