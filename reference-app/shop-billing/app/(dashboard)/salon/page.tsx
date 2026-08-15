import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { Scissors } from "lucide-react";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfMonthIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function SalonStaffReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireSession();
  const { from, to } = await searchParams;
  const fromDate = from || startOfMonthIso();
  const toDate = to || todayIso();

  const admin = createSupabaseAdminClient();
  const startOfRange = new Date(`${fromDate}T00:00:00`);
  const endOfRange = new Date(`${toDate}T23:59:59.999`);

  const { data: bills } = await admin
    .from("bills")
    .select("service_provider_name, total")
    .eq("shop_id", session.shopId)
    .eq("status", "active")
    .gte("created_at", startOfRange.toISOString())
    .lte("created_at", endOfRange.toISOString());

  const byStaff = new Map<string, { name: string; bills: number; revenue: number }>();
  let unassigned = 0;
  for (const b of bills ?? []) {
    const name = b.service_provider_name?.trim();
    if (!name) {
      unassigned += 1;
      continue;
    }
    const existing = byStaff.get(name) ?? { name, bills: 0, revenue: 0 };
    existing.bills += 1;
    existing.revenue += Number(b.total);
    byStaff.set(name, existing);
  }
  const rows = [...byStaff.values()].sort((a, b) => b.revenue - a.revenue);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Staff-wise revenue"
        subtitle="Who's bringing in how much — handy for commission."
        icon={<Scissors size={18} strokeWidth={1.8} />}
      />
      <Link href="/" className="text-sm text-muted">
        ← Home
      </Link>

      <form className="flex items-center gap-2" action="/salon">
        <input type="date" name="from" defaultValue={fromDate} className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        <span className="text-xs text-muted">to</span>
        <input type="date" name="to" defaultValue={toDate} className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        <button type="submit" className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground">
          Go
        </button>
      </form>

      <div className="rounded-xl border border-border bg-surface shadow-sm p-4 text-center">
        <p className="text-xs text-muted">{fromDate} → {toDate}</p>
        <p className="mt-1 text-xl font-semibold text-foreground">{formatMoney(totalRevenue)}</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState text="No bills with a stylist tagged in this range yet — enter a name in the Stylist field on New Bill." />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center justify-between rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5">
              <div>
                <p className="text-sm font-medium text-foreground">{r.name}</p>
                <p className="text-xs text-muted">{r.bills} bill(s)</p>
              </div>
              <p className="text-sm font-semibold text-foreground">{formatMoney(r.revenue)}</p>
            </li>
          ))}
        </ul>
      )}
      {unassigned > 0 && (
        <p className="text-xs text-muted">{unassigned} bill(s) had no stylist tagged.</p>
      )}
    </div>
  );
}
