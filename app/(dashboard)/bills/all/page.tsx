import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { formatMoney, formatDateTime } from "@/lib/format";
import { Receipt } from "lucide-react";
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
  const query = admin
    .from("bills")
    .select("id, invoice_number, total, status, created_at, customers ( name )")
    .eq("shop_id", session.shopId)
    .gte("created_at", `${from}T00:00:00`)
    .lte("created_at", `${to}T23:59:59.999`)
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: bills } = await query;
  const filtered = customerFilter
    ? (bills ?? []).filter((b) => {
        const c = Array.isArray(b.customers) ? b.customers[0] : b.customers;
        return c?.name?.toLowerCase().includes(customerFilter.toLowerCase());
      })
    : bills ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={<Receipt size={20} />} title="All bills" subtitle="Browse and reprint any past bill" />

      <form className="neu-card flex flex-col gap-3 p-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">From</span>
            <input type="date" name="from" defaultValue={from} className="rounded-lg px-3 py-2 text-sm outline-none" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">To</span>
            <input type="date" name="to" defaultValue={to} className="rounded-lg px-3 py-2 text-sm outline-none" />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Customer name (optional)</span>
          <input type="text" name="customer" defaultValue={customerFilter ?? ""} placeholder="e.g. Amit" className="rounded-lg px-3 py-2 text-sm outline-none" />
        </label>
        <button type="submit" className="btn-primary-sm">
          Search
        </button>
      </form>

      {filtered.length === 0 ? (
        <EmptyState text="No bills found for this range. Try a wider date range." />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((b) => {
            const c = Array.isArray(b.customers) ? b.customers[0] : b.customers;
            return (
              <li key={b.id}>
                <Link href={`/print/bill/${b.id}`} className="neu-card flex items-center justify-between px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {b.invoice_number} {c?.name ? `· ${c.name}` : ""}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDateTime(b.created_at)} {b.status === "voided" ? "· Voided" : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-foreground">{formatMoney(b.total)}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
