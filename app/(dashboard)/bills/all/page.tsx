import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { DateRangeControls } from "@/app/components/DateRangeControls";
import { formatMoney, formatDateTime } from "@/lib/format";
import { Receipt, Search } from "lucide-react";
import Link from "next/link";
import { todayIso } from "@/lib/dateHelpers";

export default async function AllBillsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; customer?: string }>;
}) {
  const session = await requireSession();
  const { from: fromParam, to: toParam, customer: customerFilter } = await searchParams;
  const today = todayIso();
  const from = fromParam || today;
  const to = toParam || today;

  const admin = createSupabaseAdminClient();
  const { data: bills } = await admin
    .from("bills")
    .select("id, invoice_number, total, credit_amount, status, created_at, customers ( name )")
    .eq("shop_id", session.shopId)
    .gte("created_at", `${from}T00:00:00+05:30`)
    .lte("created_at", `${to}T23:59:59.999+05:30`)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (bills ?? []).map((b) => ({ ...b, customerName: (Array.isArray(b.customers) ? b.customers[0] : b.customers)?.name ?? null }));
  const filtered = customerFilter
    ? rows.filter((b) => b.customerName?.toLowerCase().includes(customerFilter.toLowerCase()))
    : rows;
  const active = filtered.filter((b) => b.status !== "voided");
  const total = active.reduce((s, b) => s + Number(b.total), 0);
  const due = active.reduce((s, b) => s + Number(b.credit_amount), 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={<Receipt size={20} />} title="All bills" subtitle="Browse and reprint any past bill" />

      <DateRangeControls from={from} to={to} basePath="/bills/all" />

      <form className="flex items-center gap-2">
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="to" value={to} />
        <label className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            name="customer"
            defaultValue={customerFilter ?? ""}
            placeholder="Search by customer name"
            className="w-full rounded-lg py-2.5 pl-9 pr-3 text-sm outline-none"
          />
        </label>
        <button type="submit" className="btn-primary-sm shrink-0">
          Search
        </button>
      </form>

      {active.length > 0 && (
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface p-3 text-center">
          <div>
            <p className="text-[11px] text-muted">Bills</p>
            <p className="text-sm font-semibold text-foreground">{active.length}</p>
          </div>
          <div className="border-x border-border">
            <p className="text-[11px] text-muted">Total</p>
            <p className="text-sm font-semibold text-foreground">{formatMoney(total)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">On udhaar</p>
            <p className={`text-sm font-semibold ${due > 0 ? "text-credit" : "text-foreground"}`}>{formatMoney(due)}</p>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No bills here"
          text="Nothing was billed in this range. Try Last 7 days or Last 30 days."
          action={
            <Link href="/bills/new" className="btn-primary-sm">
              + New bill
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((b) => {
            const voided = b.status === "voided";
            const credit = Number(b.credit_amount);
            return (
              <li key={b.id}>
                <Link href={`/print/bill/${b.id}`} className={`neu-card flex items-center justify-between gap-3 px-3.5 py-3 ${voided ? "opacity-60" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{b.customerName ?? "Walk-in customer"}</p>
                    <p className="truncate text-xs text-muted">
                      {b.invoice_number} · {formatDateTime(b.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-semibold text-foreground ${voided ? "line-through" : ""}`}>{formatMoney(b.total)}</p>
                    {voided ? (
                      <span className="text-[11px] font-medium text-danger">Voided</span>
                    ) : credit > 0 ? (
                      <span className="text-[11px] font-medium text-credit">{formatMoney(credit)} due</span>
                    ) : (
                      <span className="text-[11px] font-medium text-success">Paid</span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
