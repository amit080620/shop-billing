import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/app/components/PageHeader";
import { isModuleEnabled } from "@/lib/modules";

export default async function ReportsPage() {
  const session = await requireSession();

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Reports"
         
        icon={<BarChart3 size={17} strokeWidth={1.8} />}
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
            href="/reports/credit-aging"
            label="Udhaar aging"
            sub="Who's owed the longest — chase the oldest first"
          />
          <ReportLink
            href="/reports/win-back"
            label="Win them back"
            sub="Regulars who've gone quiet — worth a nudge"
          />
          <ReportLink
            href="/reports/staff-performance"
            label="Staff performance"
            sub="Who's selling, who's collecting"
          />
          <ReportLink
            href="/reports/vendor-comparison"
            label="Vendor price comparison"
            sub="Same item, different vendors — who's cheapest"
          />
          <ReportLink
            href="/reports/ca-export"
            label="CA export pack"
            sub="Full-year sales & purchases, ready to send"
          />
          <ReportLink
            href="/reports/export"
            label="Export data"
            sub="Bills, petty cash, orders, customers & vendors — as Excel"
          />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
          {session.businessType === "restaurant"
            ? "Restaurant"
            : session.businessType === "transport"
              ? "Transport"
              : session.businessType === "service"
                ? "Service & repairs"
                : session.businessType === "pharmacy"
                  ? "Pharmacy"
                  : session.businessType === "rental"
                    ? "Rentals"
                    : session.businessType === "lab"
                      ? "Lab"
                      : session.businessType === "clinic"
                        ? "Clinic"
                        : session.businessType === "gym"
                          ? "Gym"
                          : session.businessType === "jewellery"
                            ? "Jewellery"
                            : session.businessType === "salon"
                              ? "Salon"
                              : "Sales"}
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
          {session.businessType === "pharmacy" && (
            <>
              <ReportLink href="/reports/sales" label="Sales report" sub="Every bill by date range" />
              <ReportLink href="/pharmacy/expiry" label="Expiry alerts" sub="Batches expiring soon — act before it's stock loss" />
              <ReportLink href="/pharmacy/write-offs" label="Write-off history" sub="Stock lost to expiry or damage" />
              <ReportLink href="/pharmacy/schedule-x-register" label="Schedule X register" sub="Controlled-substance sale log, as required" />
            </>
          )}
          {session.businessType === "rental" && (
            <>
              <ReportLink href="/reports/sales" label="Sales report" sub="Every bill by date range" />
              <ReportLink href="/rentals/history" label="Rental history" sub="Past rentals — returned, overdue, damaged" />
            </>
          )}
          {session.businessType === "lab" && (
            <>
              <ReportLink href="/reports/sales" label="Sales report" sub="Every bill by date range" />
              <ReportLink href="/lab/orders" label="All orders" sub="Test orders, by status" />
            </>
          )}
          {session.businessType === "clinic" && (
            <>
              <ReportLink href="/reports/sales" label="Sales report" sub="Every bill by date range" />
              <ReportLink href="/clinic/appointments" label="Appointments" sub="Booked, completed, no-shows" />
            </>
          )}
          {session.businessType === "gym" && (
            <>
              <ReportLink href="/reports/sales" label="Sales report" sub="Membership sales by date range" />
              <ReportLink href="/gym/attendance" label="Attendance" sub="Check-ins by date" />
            </>
          )}
          {session.businessType === "jewellery" && (
            <>
              <ReportLink href="/reports/sales" label="Sales report" sub="Every bill by date range" />
              <ReportLink href="/jewellery/exchanges" label="Old-gold exchanges" sub="Exchange history" />
            </>
          )}
          {session.businessType === "salon" && (
            <>
              <ReportLink href="/reports/sales" label="Sales report" sub="Every bill by date range" />
              <ReportLink href="/salon/appointments" label="Appointments" sub="Booked, completed, no-shows" />
            </>
          )}
          {(session.businessType === "grocery" ||
            session.businessType === "mart" ||
            session.businessType === "hardware" ||
            session.businessType === "general") && (
            <ReportLink href="/reports/sales" label="Sales report" sub="Every bill by date range" />
          )}
          {/* Genuinely generic — any shop that ticks "Track with batch
              & expiry date" on a product (available to every business
              type) has real use for these, not just pharmacies. The
              pharmacy block above already has its own copy alongside
              its pharmacy-specific reports, so this is skipped there
              to avoid listing it twice. */}
          {!["restaurant", "transport", "rental", "pharmacy"].includes(session.businessType) && (
            <>
              <ReportLink href="/pharmacy/expiry" label="Expiry alerts" sub="Batches expiring soon — act before it's stock loss" />
              <ReportLink href="/pharmacy/write-offs" label="Write-off history" sub="Stock lost to expiry or damage" />
            </>
          )}
        </div>
      </section>

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
