import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { TrendingUp, Flame, TrendingDown } from "lucide-react";
import { InsightsDateControls } from "./InsightsDateControls";

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "advanced_reports")) return <ModuleBlocked moduleKey="advanced_reports" />;
  const admin = createSupabaseAdminClient();

  const { from: fromParam, to: toParam } = await searchParams;
  const fromDate = fromParam || isoDaysAgo(7);
  const toDate = toParam || todayIso();

  const rangeStart = new Date(`${fromDate}T00:00:00`);
  const rangeEnd = new Date(`${toDate}T23:59:59.999`);
  const rangeDays = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000));

  // Previous period of the same length, immediately before the selected
  // range — this is what makes "up 18% vs last period" possible below,
  // genuinely tracking movement rather than just a flat snapshot.
  const prevEnd = new Date(rangeStart.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - rangeDays * 86400000);

  // Dead stock is a distinct, fixed 30-day concept — it stays anchored
  // here regardless of the Fast Movers date range, since "no sale in
  // the last 30 days" genuinely loses its meaning if it shrank to
  // "today" just because that's what someone picked above.
  const last30 = new Date();
  last30.setDate(last30.getDate() - 30);

  const [
    { data: products },
    { data: currentBills },
    { data: prevBills },
    { data: deadStockBills },
    { data: currentOrders },
    { data: prevOrders },
    { data: deadStockOrders },
    { data: currentRentals },
    { data: prevRentals },
    { data: deadStockRentals },
  ] = await Promise.all([
    admin
      .from("products")
      .select("id, name, unit, price, track_inventory, stock_quantity")
      .eq("shop_id", session.shopId),
    admin
      .from("bills")
      .select("id")
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .gte("created_at", rangeStart.toISOString())
      .lte("created_at", rangeEnd.toISOString()),
    admin
      .from("bills")
      .select("id")
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .gte("created_at", prevStart.toISOString())
      .lte("created_at", prevEnd.toISOString()),
    admin.from("bills").select("id").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", last30.toISOString()),
    // Restaurant orders and rentals live in their own tables, never
    // `bills` — without these, a restaurant/rental shop's insights would
    // only ever show "nothing sells" and mark everything as dead stock.
    admin
      .from("restaurant_orders")
      .select("id")
      .eq("shop_id", session.shopId)
      .eq("status", "settled")
      .gte("settled_at", rangeStart.toISOString())
      .lte("settled_at", rangeEnd.toISOString()),
    admin
      .from("restaurant_orders")
      .select("id")
      .eq("shop_id", session.shopId)
      .eq("status", "settled")
      .gte("settled_at", prevStart.toISOString())
      .lte("settled_at", prevEnd.toISOString()),
    admin.from("restaurant_orders").select("id").eq("shop_id", session.shopId).eq("status", "settled").gte("settled_at", last30.toISOString()),
    admin
      .from("rentals")
      .select("id")
      .eq("shop_id", session.shopId)
      .neq("status", "cancelled")
      .gte("created_at", rangeStart.toISOString())
      .lte("created_at", rangeEnd.toISOString()),
    admin
      .from("rentals")
      .select("id")
      .eq("shop_id", session.shopId)
      .neq("status", "cancelled")
      .gte("created_at", prevStart.toISOString())
      .lte("created_at", prevEnd.toISOString()),
    admin.from("rentals").select("id").eq("shop_id", session.shopId).neq("status", "cancelled").gte("created_at", last30.toISOString()),
  ]);

  const currentOrderIds = (currentOrders ?? []).map((o) => o.id);
  const prevOrderIds = (prevOrders ?? []).map((o) => o.id);
  const deadStockOrderIds = (deadStockOrders ?? []).map((o) => o.id);
  const currentRentalIds = (currentRentals ?? []).map((r) => r.id);
  const prevRentalIds = (prevRentals ?? []).map((r) => r.id);
  const deadStockRentalIds = (deadStockRentals ?? []).map((r) => r.id);

  const currentBillIds = (currentBills ?? []).map((b) => b.id);
  const prevBillIds = (prevBills ?? []).map((b) => b.id);
  const deadStockBillIds = (deadStockBills ?? []).map((b) => b.id);

  type Item = { product_id: string | null; product_name: string; quantity: number; line_total: number };
  type IdOnly = { product_id: string | null };

  async function fetchItems(table: string, idCol: string, ids: string[]): Promise<Item[]> {
    if (ids.length === 0) return [];
    const { data } = await admin.from(table).select("product_id, product_name, quantity, line_total").in(idCol, ids);
    return (data as Item[]) ?? [];
  }
  async function fetchIdsOnly(table: string, idCol: string, ids: string[]): Promise<IdOnly[]> {
    if (ids.length === 0) return [];
    const { data } = await admin.from(table).select("product_id").in(idCol, ids);
    return (data as IdOnly[]) ?? [];
  }

  const [
    currentBillItems,
    currentOrderItems,
    currentRentalItems,
    prevBillItemsFull,
    prevOrderItemsFull,
    prevRentalItemsFull,
    deadStockBillItems,
    deadStockOrderItems,
    deadStockRentalItems,
  ] = await Promise.all([
    fetchItems("bill_items", "bill_id", currentBillIds),
    fetchItems("restaurant_order_items", "order_id", currentOrderIds),
    fetchItems("rental_items", "rental_id", currentRentalIds),
    fetchItems("bill_items", "bill_id", prevBillIds),
    fetchItems("restaurant_order_items", "order_id", prevOrderIds),
    fetchItems("rental_items", "rental_id", prevRentalIds),
    fetchIdsOnly("bill_items", "bill_id", deadStockBillIds),
    fetchIdsOnly("restaurant_order_items", "order_id", deadStockOrderIds),
    fetchIdsOnly("rental_items", "rental_id", deadStockRentalIds),
  ]);

  // Fast movers — top sellers by revenue in the selected period, with a
  // genuine vs-previous-period comparison so this actually shows
  // movement, not just a static snapshot.
  const salesByProduct = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const item of [...currentBillItems, ...currentOrderItems, ...currentRentalItems]) {
    if (!item.product_id) continue;
    const entry = salesByProduct.get(item.product_id) ?? { name: item.product_name, qty: 0, revenue: 0 };
    entry.qty += Number(item.quantity);
    entry.revenue += Number(item.line_total);
    salesByProduct.set(item.product_id, entry);
  }
  const currentTotalRevenue = [...salesByProduct.values()].reduce((s, v) => s + v.revenue, 0);

  const prevRevenueByProduct = new Map<string, number>();
  let prevTotalRevenue = 0;
  for (const item of [...prevBillItemsFull, ...prevOrderItemsFull, ...prevRentalItemsFull]) {
    if (!item.product_id) continue;
    prevRevenueByProduct.set(item.product_id, (prevRevenueByProduct.get(item.product_id) ?? 0) + Number(item.line_total));
    prevTotalRevenue += Number(item.line_total);
  }

  const overallChangePercent =
    prevTotalRevenue > 0 ? Math.round(((currentTotalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100) : null;

  const fastMovers = [...salesByProduct.entries()]
    .map(([id, v]) => {
      const prevRevenue = prevRevenueByProduct.get(id) ?? 0;
      const changePercent = prevRevenue > 0 ? Math.round(((v.revenue - prevRevenue) / prevRevenue) * 100) : null;
      return { id, ...v, changePercent };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Dead stock — tracked items sitting with stock but no sale in 30 days
  // (fixed window, independent of the Fast Movers date range above).
  const soldRecentlyIds = new Set(
    [...deadStockBillItems, ...deadStockOrderItems, ...deadStockRentalItems]
      .map((i) => i.product_id)
      .filter(Boolean),
  );
  const deadStock = (products ?? [])
    .filter((p) => p.track_inventory && Number(p.stock_quantity) > 0 && !soldRecentlyIds.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      stockQuantity: Number(p.stock_quantity),
      valueTiedUp: Number(p.stock_quantity) * Number(p.price),
    }))
    .sort((a, b) => b.valueTiedUp - a.valueTiedUp);

  const totalDeadValue = deadStock.reduce((s, p) => s + p.valueTiedUp, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Inventory insights"
        subtitle="Based on your own sales data — no external AI involved."
        icon={<TrendingUp size={18} strokeWidth={1.8} />}
      />

      <p className="neu-card px-3.5 py-3 text-xs text-muted">
        These are statistics from your actual bills — fast/slow movers and stock sitting idle.
        Deeper forecasting (festival demand, seasonal trends) would need an external AI service
        with its own API key and running cost, which isn&apos;t wired up here.
      </p>

      <InsightsDateControls from={fromDate} to={toDate} />

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Flame size={14} /> Fast movers</h2>
          {overallChangePercent !== null && (
            <span className={`text-xs font-medium ${overallChangePercent >= 0 ? "text-success" : "text-danger"}`}>
              {overallChangePercent >= 0 ? "▲" : "▼"} {Math.abs(overallChangePercent)}% vs previous period
            </span>
          )}
        </div>
        {fastMovers.length === 0 ? (
          <EmptyState text="No sales in this period yet — try a wider date range." />
        ) : (
          <ul className="flex flex-col gap-2">
            {fastMovers.map((p, i) => (
              <li
                key={p.id}
                className="neu-card flex items-center justify-between gap-3 px-3.5 py-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-text">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted">{p.qty} sold</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-brand">{formatMoney(p.revenue)}</p>
                  {p.changePercent !== null && (
                    <p className={`text-[11px] ${p.changePercent >= 0 ? "text-success" : "text-danger"}`}>
                      {p.changePercent >= 0 ? "▲" : "▼"} {Math.abs(p.changePercent)}%
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><TrendingDown size={14} /> Dead stock (no sale in 30+ days)</h2>
          {totalDeadValue > 0 && (
            <span className="text-xs text-credit">{formatMoney(totalDeadValue)} tied up</span>
          )}
        </div>
        {deadStock.length === 0 ? (
          <EmptyState text="Nothing gathering dust — your stock is moving well." />
        ) : (
          <ul className="flex flex-col gap-2">
            {deadStock.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-credit-soft shadow-sm px-3.5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                  <p className="text-xs text-credit">
                    {p.stockQuantity} {p.unit} sitting unsold
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-credit">
                  {formatMoney(p.valueTiedUp)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
