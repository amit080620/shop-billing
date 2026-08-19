import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/app/components/PageHeader";
import { isModuleEnabled } from "@/lib/modules";

export default async function ReportsPage() {
  const session = await requireSession();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reports"
        // eslint-disable-next-line @next/next/no-img-element -- small branded SVG icon
        icon={<img src="/assets/ray-icons/report.svg" alt="" className="h-9 w-9 md:h-11 md:w-11" />}
        bareIcon
      />

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Daily tools</h2>
        <div className="neu-card flex flex-col divide-y divide-border overflow-hidden">
          <ReportLink
            href="/daily-summary"
            label="Daily summary"
            sub="End-of-day cash reconciliation, by payment method"
          />
          {isModuleEnabled(session.enabledModules, "advanced_reports") && (
            <ReportLink
              href="/insights"
              label="Insights"
              sub="Fast movers & dead stock, from your own sales"
            />
          )}
          <ReportLink
            href="/reports/profit"
            label="Profit"
            sub="What you actually earned — sales minus stock cost"
          />
          <ReportLink
            href="/reports/export"
            label="Export data"
            sub="Bills, petty cash, orders, customers & vendors — as Excel"
          />
        </div>
      </section>

      {(session.businessType === "restaurant" ||
        session.businessType === "transport" ||
        session.businessType === "service") && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            {session.businessType === "restaurant"
              ? "Restaurant"
              : session.businessType === "transport"
                ? "Transport"
                : "Service & repairs"}
          </h2>
          <div className="neu-card flex flex-col divide-y divide-border overflow-hidden">
            {session.businessType === "restaurant" && (
              <>
                <ReportLink
                  href="/restaurant/reports"
                  label="Sales report"
                  sub="Settled orders by date range, with totals"
                />
                <ReportLink
                  href="/restaurant/reports/items"
                  label="Item-wise sales"
                  sub="Which dishes actually sell, by quantity and revenue"
                />
              </>
            )}
            {session.businessType === "transport" && (
              <ReportLink
                href="/transport/reports"
                label="Trip report"
                sub="Trips, distance and earnings by vehicle"
              />
            )}
            {session.businessType === "service" && (
              <ReportLink
                href="/service/reports"
                label="Job report"
                sub="Jobs taken in, delivered, earnings and technician-wise split"
              />
            )}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- small branded SVG icon */}
          <img src="/assets/ray-icons/gst.svg" alt="" className="h-3.5 w-3.5" /> GST filing
        </h2>
        <p className="text-xs text-muted">Always available regardless of plan — required for tax compliance.</p>

        {session.gstScheme === "composition" && (
          <p className="rounded-lg bg-credit-soft px-3 py-2 text-sm text-credit">
            Your shop is set to Composition scheme in Settings. GSTR-1 and GSTR-3B below are built
            for Regular scheme and won&apos;t match what a Composition dealer files (CMP-08).
          </p>
        )}

        <p className="neu-card px-3.5 py-3 text-xs text-muted">
          Laid out the same way the GST portal organizes them, built from your own sales and
          purchase entries — they don&apos;t file anything for you. Review the numbers (or have
          your CA review them) before entering them on the portal.
        </p>

        <div className="neu-card flex flex-col divide-y divide-border overflow-hidden">
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
      </section>
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
