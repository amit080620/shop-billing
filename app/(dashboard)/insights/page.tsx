import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageIcon } from "@/app/components/PageIcon";
import { EmptyState } from "@/app/components/EmptyState";

export default async function InsightsPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const now = new Date();
  const last30 = new Date(now);
  last30.setDate(last30.getDate() - 30);
  const last60 = new Date(now);
  last60.setDate(last60.getDate() - 60);

  const [{ data: products }, { data: recentBills }, { data: olderBills }] = await Promise.all([
    admin
      .from("products")
      .select("id, name, unit, price, track_inventory, stock_quantity")
      .eq("shop_id", session.shopId),
    admin
      .from("bills")
      .select("id")
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .gte("created_at", last30.toISOString()),
    // Wider 60-day window, used only to decide what counts as "still selling"
    // for the dead-stock check below.
    admin
      .from("bills")
      .select("id")
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .gte("created_at", last60.toISOString()),
  ]);

  const recentBillIds = (recentBills ?? []).map((b) => b.id);
  const olderBillIds = (olderBills ?? []).map((b) => b.id);

  const [{ data: recentItems }, { data: soldWithin60 }] = await Promise.all([
    recentBillIds.length
      ? admin
          .from("bill_items")
          .select("product_id, product_name, quantity, line_total")
          .in("bill_id", recentBillIds)
      : Promise.resolve({ data: [] as { product_id: string | null; product_name: string; quantity: number; line_total: number }[] }),
    olderBillIds.length
      ? admin.from("bill_items").select("product_id").in("bill_id", olderBillIds)
      : Promise.resolve({ data: [] as { product_id: string | null }[] }),
  ]);

  // Fast movers — top sellers by revenue in the last 30 days.
  const salesByProduct = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const item of recentItems ?? []) {
    if (!item.product_id) continue;
    const entry = salesByProduct.get(item.product_id) ?? { name: item.product_name, qty: 0, revenue: 0 };
    entry.qty += Number(item.quantity);
    entry.revenue += Number(item.line_total);
    salesByProduct.set(item.product_id, entry);
  }
  const fastMovers = [...salesByProduct.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Dead stock — tracked items sitting with stock but no sale in 60 days.
  const soldRecentlyIds = new Set((soldWithin60 ?? []).map((i) => i.product_id).filter(Boolean));
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
      <div className="flex items-center gap-3">
        <PageIcon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19V5M4 19h16M8 15l3-4 3 3 4-6" />
          </svg>
        </PageIcon>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Inventory insights</h1>
          <p className="text-sm text-muted">Based on your own sales data — no external AI involved.</p>
        </div>
      </div>

      <p className="rounded-lg border border-border bg-surface shadow-sm px-3.5 py-3 text-xs text-muted">
        These are statistics from your actual bills — fast/slow movers and stock sitting idle.
        Deeper forecasting (festival demand, seasonal trends) would need an external AI service
        with its own API key and running cost, which isn&apos;t wired up here.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">🔥 Fast movers (last 30 days)</h2>
        {fastMovers.length === 0 ? (
          <EmptyState text="Not enough recent sales yet to show trends." />
        ) : (
          <ul className="flex flex-col gap-2">
            {fastMovers.map((p, i) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface shadow-sm px-3.5 py-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-dark">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted">{p.qty} sold</p>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-semibold text-brand">{formatMoney(p.revenue)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">🐌 Dead stock (no sale in 60+ days)</h2>
          {totalDeadValue > 0 && (
            <span className="text-xs text-credit">{formatMoney(totalDeadValue)} tied up</span>
          )}
        </div>
        {deadStock.length === 0 ? (
          <EmptyState text="No tracked items sitting idle — good sign." />
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
