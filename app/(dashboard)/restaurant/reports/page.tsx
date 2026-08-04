import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { DateRangeControls } from "./DateRangeControls";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function RestaurantReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireSession();
  const { from, to } = await searchParams;
  const fromDate = from || todayIso();
  const toDate = to || todayIso();

  const admin = createSupabaseAdminClient();
  const startOfRange = new Date(`${fromDate}T00:00:00`);
  const endOfRange = new Date(`${toDate}T23:59:59.999`);

  const { data: orders } = await admin
    .from("restaurant_orders")
    .select("id, order_number, total, settled_at, restaurant_tables ( name )")
    .eq("shop_id", session.shopId)
    .eq("status", "settled")
    .gte("settled_at", startOfRange.toISOString())
    .lte("settled_at", endOfRange.toISOString())
    .order("settled_at", { ascending: false });

  const totalSales = (orders ?? []).reduce((s, o) => s + Number(o.total), 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Restaurant sales"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19V5M4 19h16M8 15l3-4 3 3 4-6" />
          </svg>
        }
      />

      <DateRangeControls from={fromDate} to={toDate} />

      <div className="rounded-xl border border-border bg-surface shadow-sm p-4 text-center">
        <p className="text-xs text-muted">
          {fromDate === toDate ? "That day" : `${fromDate} → ${toDate}`}
        </p>
        <p className="mt-1 text-xl font-semibold text-foreground">{formatMoney(totalSales)}</p>
        <p className="text-xs text-muted">{(orders ?? []).length} bill(s)</p>
      </div>

      {(!orders || orders.length === 0) ? (
        <EmptyState text="No settled bills in this range." />
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((o) => {
            const table = Array.isArray(o.restaurant_tables) ? o.restaurant_tables[0] : o.restaurant_tables;
            return (
              <li key={o.id}>
                <a
                  href={`/restaurant/reports/${o.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface shadow-sm px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {table?.name ?? "Table"} · #{o.order_number}
                    </p>
                    <p className="text-xs text-muted">
                      {o.settled_at && new Date(o.settled_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-foreground">{formatMoney(o.total)}</p>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
