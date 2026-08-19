import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { SalesReportDateControls } from "./SalesReportDateControls";
import { BarChart3 } from "lucide-react";

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireSession();
  const { from: fromParam, to: toParam } = await searchParams;
  const fromDate = fromParam || isoDaysAgo(7);
  const toDate = toParam || todayIso();

  const admin = createSupabaseAdminClient();
  const startOfRange = new Date(`${fromDate}T00:00:00`);
  const endOfRange = new Date(`${toDate}T23:59:59.999`);

  const { data: bills } = await admin
    .from("bills")
    .select("id, invoice_number, total, paid_amount, credit_amount, payment_method, created_at, customers ( name )")
    .eq("shop_id", session.shopId)
    .eq("status", "active")
    .gte("created_at", startOfRange.toISOString())
    .lte("created_at", endOfRange.toISOString())
    .order("created_at", { ascending: false });

  const totalSales = (bills ?? []).reduce((s, b) => s + Number(b.total), 0);
  const totalCredit = (bills ?? []).reduce((s, b) => s + Number(b.credit_amount), 0);
  const billCount = bills?.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Sales report" subtitle="Every bill in the period, at a glance" icon={<BarChart3 size={18} strokeWidth={1.8} />} />

      <SalesReportDateControls from={fromDate} to={toDate} />

      <section className="grid grid-cols-2 gap-3">
        <div className="neu-card p-4">
          <p className="text-xs text-muted">Total sales</p>
          <p className="mt-1 text-2xl font-bold text-foreground neu-text">{formatMoney(totalSales)}</p>
        </div>
        <div className="neu-card p-4">
          <p className="text-xs text-muted">Bills</p>
          <p className="mt-1 text-2xl font-bold text-foreground neu-text">{billCount}</p>
        </div>
        {totalCredit > 0 && (
          <div className="neu-card col-span-2 p-4">
            <p className="text-xs text-muted">Given on credit (udhaar)</p>
            <p className="mt-1 text-xl font-bold text-credit neu-text">{formatMoney(totalCredit)}</p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        {!bills || bills.length === 0 ? (
          <EmptyState text="No bills in this period." />
        ) : (
          <ul className="flex flex-col gap-2">
            {bills.map((b) => {
              const customer = Array.isArray(b.customers) ? b.customers[0] : b.customers;
              return (
                <li key={b.id}>
                  <Link href={`/print/bill/${b.id}`} className="neu-card flex items-center justify-between px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {b.invoice_number}
                        {customer?.name ? ` · ${customer.name}` : ""}
                      </p>
                      <p className="text-xs text-muted">{formatDateTime(b.created_at)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-foreground">{formatMoney(Number(b.total))}</p>
                      {Number(b.credit_amount) > 0 && (
                        <p className="text-[11px] text-credit">{formatMoney(Number(b.credit_amount))} due</p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
