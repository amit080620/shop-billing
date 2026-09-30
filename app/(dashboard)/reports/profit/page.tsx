import { requireSession } from "@/lib/auth";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { isModuleEnabled } from "@/lib/modules";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { TrendingUp } from "lucide-react";
import { DateRangeControls } from "@/app/components/DateRangeControls";
import { todayIso, isoDaysAgo } from "@/lib/dateHelpers";
import { getTranslator } from "@/lib/i18n/server";
import { BackLink } from "@/app/components/BackLink";
import { ingredientCosts, latestCosts, loadRecipeMap, recipesReady } from "@/lib/recipeData";
import { plateCost } from "@/lib/recipes";

export default async function ProfitPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { t } = await getTranslator();
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "advanced_reports")) return <ModuleBlocked moduleKey="advanced_reports" />;
  const admin = createSupabaseAdminClient();

  const { from: fromParam, to: toParam } = await searchParams;
  const fromDate = fromParam || isoDaysAgo(29);
  const toDate = toParam || todayIso();

  const { data: bills } = await admin
    .from("bills")
    .select("id")
    .eq("shop_id", session.shopId)
    .eq("status", "active")
    .gte("created_at", `${fromDate}T00:00:00+05:30`)
    .lte("created_at", `${toDate}T23:59:59.999+05:30`);

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
      .gte("settled_at", `${fromDate}T00:00:00+05:30`)
      .lte("settled_at", `${toDate}T23:59:59.999+05:30`),
    admin
      .from("rentals")
      .select("id")
      .eq("shop_id", session.shopId)
      .neq("status", "cancelled")
      .gte("created_at", `${fromDate}T00:00:00+05:30`)
      .lte("created_at", `${toDate}T23:59:59.999+05:30`),
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

  // (Newest purchase by its date — sorting the joined purchase alone left the row order as it came.)
  const costByProduct = await latestCosts(admin, session.shopId, productIds);
  // A dish costs what its recipe's raw materials cost (Recipes & kitchen stock).
  if (isModuleEnabled(session.enabledModules, "recipe_stock") && (await recipesReady(admin))) {
    const recipes = await loadRecipeMap(admin, session.shopId, productIds.filter((id) => !costByProduct.has(id)));
    if (recipes.size) {
      const rawCosts = await ingredientCosts(admin, session.shopId, [...new Set([...recipes.values()].flat().map((r) => r.ingredientId))]);
      for (const [dishId, recipe] of recipes) {
        const { cost, missing } = plateCost(recipe, rawCosts);
        if (!missing.length) costByProduct.set(dishId, cost);
      }
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
      <BackLink fallback="/reports" />
      <PageHeader
        title={t("Profit")}
        subtitle="What you actually earned — sales minus what the stock cost you"
        icon={<TrendingUp size={18} strokeWidth={1.8} />}
      />

      <DateRangeControls from={fromDate} to={toDate} basePath="/reports/profit" />

      <section className="grid grid-cols-2 gap-3">
        <div className="neu-card p-4">
          <p className="text-xs text-muted">{t("Sales")}</p>
          <p className="mt-1 text-2xl font-bold text-foreground neu-text">{formatMoney(totalRevenue)}</p>
        </div>
        <div className="neu-card p-4">
          <p className="text-xs text-muted">{t("Stock cost")}</p>
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
          {t("profit.uncosted", { count: unknown.length })}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("Most profitable items")}</h2>
        {known.length === 0 ? (
          <EmptyState text={t("No costed sales in this period yet — record purchases so profit can be worked out.")} />
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
