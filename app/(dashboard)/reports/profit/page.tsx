import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { TrendingUp } from "lucide-react";
import { ProfitDateControls } from "./ProfitDateControls";

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default async function ProfitPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { from: fromParam, to: toParam } = await searchParams;
  const fromDate = fromParam || isoDaysAgo(30);
  const toDate = toParam || todayIso();

  const { data: bills } = await admin
    .from("bills")
    .select("id")
    .eq("shop_id", session.shopId)
    .eq("status", "active")
    .gte("created_at", `${fromDate}T00:00:00`)
    .lte("created_at", `${toDate}T23:59:59.999`);

  const billIds = (bills ?? []).map((b) => b.id);

  // Restaurant orders and rentals never create a bills row — their
  // revenue lives in their own tables. Reporting only on bill_items
  // would show a restaurant or rental shop zero profit no matter how
  // much they sold, so both are pulled in alongside.
  const [{ data: restaurantOrders }, { data: rentals }] = await Promise.all([
    admin
      .from("restaurant_orders")
      .select("id")
      .eq("shop_id", session.shopId)
      .eq("status", "settled")
      .gte("settled_at", `${fromDate}T00:00:00`)
      .lte("settled_at", `${toDate}T23:59:59.999`),
    admin
      .from("rentals")
      .select("id")
      .eq("shop_id", session.shopId)
      .neq("status", "cancelled")
      .gte("created_at", `${fromDate}T00:00:00`)
      .lte("created_at", `${toDate}T23:59:59.999`),
  ]);

  const orderIds = (restaurantOrders ?? []).map((o) => o.id);
  const rentalIds = (rentals ?? []).map((r) => r.id);

  type SoldItem = { product_id: string | null; product_name: string; quantity: number; line_total: number };
  async function fetchSold(table: string, idCol: string, ids: string[]): Promise<SoldItem[]> {
    if (ids.length === 0) return [];
    const { data } = await admin
      .from(table)
      .select("product_id, product_name, quantity, line_total")
      .in(idCol, ids);
    return (data as SoldItem[]) ?? [];
  }

  const [billItems, orderItems, rentalItems] = await Promise.all([
    fetchSold("bill_items", "bill_id", billIds),
    fetchSold("restaurant_order_items", "order_id", orderIds),
    fetchSold("rental_items", "rental_id", rentalIds),
  ]);
  const soldItems = [...billItems, ...orderItems, ...rentalItems];

  // Cost basis: the most recent purchase price recorded for each
  // product. Deliberately not a weighted average across all purchases —
  // for a small shop, "what it costs me to restock this today" is the
  // number that actually informs pricing decisions, and it stays
  // understandable when they check it against a recent vendor bill.
  const productIds = [...new Set((soldItems ?? []).map((i) => i.product_id).filter((id): id is string => !!id))];

  const { data: purchaseItems } = productIds.length
    ? await admin
        .from("purchase_items")
        .select("product_id, unit_price, purchases!inner(shop_id, created_at)")
        .in("product_id", productIds)
        .eq("purchases.shop_id", session.shopId)
        .order("created_at", { referencedTable: "purchases", ascending: false })
    : { data: [] as { product_id: string | null; unit_price: number }[] };

  const costByProduct = new Map<string, number>();
  for (const pi of purchaseItems ?? []) {
    if (pi.product_id && !costByProduct.has(pi.product_id)) {
      costByProduct.set(pi.product_id, Number(pi.unit_price));
    }
  }

  type Row = { name: string; qty: number; revenue: number; cost: number; profit: number; known: boolean };
  const byProduct = new Map<string, Row>();

  for (const item of soldItems ?? []) {
    const key = item.product_id ?? `~${item.product_name}`;
    const cost = item.product_id ? costByProduct.get(item.product_id) : undefined;
    const row = byProduct.get(key) ?? {
      name: item.product_name,
      qty: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      known: cost !== undefined,
    };
    const qty = Number(item.quantity);
    const revenue = Number(item.line_total);
    row.qty += qty;
    row.revenue += revenue;
    if (cost !== undefined) row.cost += cost * qty;
    row.profit = row.revenue - row.cost;
    byProduct.set(key, row);
  }

  const rows = [...byProduct.values()].sort((a, b) => b.profit - a.profit);
  const known = rows.filter((r) => r.known);
  const unknown = rows.filter((r) => !r.known);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCost = known.reduce((s, r) => s + r.cost, 0);
  const totalProfit = known.reduce((s, r) => s + r.profit, 0);
  const margin = known.reduce((s, r) => s + r.revenue, 0) > 0
    ? Math.round((totalProfit / known.reduce((s, r) => s + r.revenue, 0)) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Profit"
        subtitle="What you actually earned — sales minus what the stock cost you"
        icon={<TrendingUp size={18} strokeWidth={1.8} />}
      />

      <ProfitDateControls from={fromDate} to={toDate} />

      <section className="grid grid-cols-2 gap-3">
        <div className="neu-card p-4">
          <p className="text-xs text-muted">Sales</p>
          <p className="mt-1 text-2xl font-bold text-foreground neu-text">{formatMoney(totalRevenue)}</p>
        </div>
        <div className="neu-card p-4">
          <p className="text-xs text-muted">Stock cost</p>
          <p className="mt-1 text-2xl font-bold text-foreground neu-text">{formatMoney(totalCost)}</p>
        </div>
        <div className="neu-card col-span-2 p-4">
          <p className="text-xs text-muted">Profit {margin > 0 ? `· ${margin}% margin` : ""}</p>
          <p className={`mt-1 text-3xl font-bold neu-text ${totalProfit >= 0 ? "text-success" : "text-danger"}`}>
            {formatMoney(totalProfit)}
          </p>
        </div>
      </section>

      {unknown.length > 0 && (
        <p className="neu-card px-3.5 py-3 text-xs text-muted">
          {unknown.length} item{unknown.length === 1 ? "" : "s"} sold in this period have no purchase entry yet, so
          their cost isn&apos;t counted above — record those purchases to see the full picture.
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Most profitable items</h2>
        {known.length === 0 ? (
          <EmptyState text="No costed sales in this period yet — record purchases so profit can be worked out." />
        ) : (
          <ul className="flex flex-col gap-2">
            {known.slice(0, 20).map((r, i) => (
              <li key={i} className="neu-card flex items-center justify-between gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                  <p className="text-xs text-muted">
                    {r.qty} sold · {formatMoney(r.revenue)} in, {formatMoney(r.cost)} cost
                  </p>
                </div>
                <p className={`shrink-0 text-sm font-semibold ${r.profit >= 0 ? "text-success" : "text-danger"}`}>
                  {formatMoney(r.profit)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
