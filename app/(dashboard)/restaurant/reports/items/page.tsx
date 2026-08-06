import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { DateRangeControls } from "../DateRangeControls";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfMonthIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function ItemWiseReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireSession();
  const { t, lang } = await getTranslator();
  const { from, to } = await searchParams;
  const fromDate = from || startOfMonthIso();
  const toDate = to || todayIso();

  const admin = createSupabaseAdminClient();
  const startOfRange = new Date(`${fromDate}T00:00:00`);
  const endOfRange = new Date(`${toDate}T23:59:59.999`);

  // Settled orders in range, then their items — two queries because
  // filtering items by their parent order's settled_at can't be done in
  // one Supabase call without a view.
  const { data: orders } = await admin
    .from("restaurant_orders")
    .select("id, waiter_name, total")
    .eq("shop_id", session.shopId)
    .eq("status", "settled")
    .gte("settled_at", startOfRange.toISOString())
    .lte("settled_at", endOfRange.toISOString());

  const orderIds = (orders ?? []).map((o) => o.id);

  const unassignedLabel = t("rreports.unassigned");
  const byWaiter = new Map<string, { name: string; orders: number; revenue: number }>();
  for (const o of orders ?? []) {
    const name = o.waiter_name?.trim() || unassignedLabel;
    const existing = byWaiter.get(name) ?? { name, orders: 0, revenue: 0 };
    existing.orders += 1;
    existing.revenue += Number(o.total);
    byWaiter.set(name, existing);
  }
  const waiterRows = [...byWaiter.values()].sort((a, b) => b.revenue - a.revenue);

  const { data: items } = orderIds.length
    ? await admin
        .from("restaurant_order_items")
        .select("product_id, product_name, quantity, line_total")
        .in("order_id", orderIds)
    : { data: [] };

  const productIds = [...new Set((items ?? []).map((i) => i.product_id).filter(Boolean))] as string[];
  const { data: products } = productIds.length
    ? await admin.from("products").select("id, category_id, categories ( name )").in("id", productIds)
    : { data: [] };
  const categoryByProduct = new Map(
    (products ?? []).map((p) => [
      p.id,
      Array.isArray(p.categories) ? p.categories[0]?.name : (p.categories as { name: string } | null)?.name,
    ]),
  );

  // Aggregate by item name
  const uncategorizedLabel = t("rreports.uncategorized");
  const byItem = new Map<string, { name: string; qty: number; revenue: number; category: string }>();
  for (const item of items ?? []) {
    const key = item.product_name;
    const category = (item.product_id && categoryByProduct.get(item.product_id)) || uncategorizedLabel;
    const existing = byItem.get(key) ?? { name: item.product_name, qty: 0, revenue: 0, category };
    existing.qty += Number(item.quantity);
    existing.revenue += Number(item.line_total);
    byItem.set(key, existing);
  }
  const itemRows = [...byItem.values()].sort((a, b) => b.revenue - a.revenue);

  // Aggregate by category
  const byCategory = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const row of itemRows) {
    const existing = byCategory.get(row.category) ?? { name: row.category, qty: 0, revenue: 0 };
    existing.qty += row.qty;
    existing.revenue += row.revenue;
    byCategory.set(row.category, existing);
  }
  const categoryRows = [...byCategory.values()].sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = itemRows.reduce((s, r) => s + r.revenue, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("rreports.itemsTitle")}
        subtitle={t("rreports.itemsSubtitle")}
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19V5M4 19h16M8 15l3-4 3 3 4-6" />
          </svg>
        }
      />
      <Link href="/restaurant/reports" className="text-sm text-muted">
        {t("rreports.backToDayWise")}
      </Link>

      <DateRangeControls from={fromDate} to={toDate} basePath="/restaurant/reports/items" lang={lang} />

      {itemRows.length === 0 ? (
        <EmptyState text={t("rreports.itemsEmpty")} />
      ) : (
        <>
          {waiterRows.length > 1 && (
            <section className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">{t("rreports.byWaiter")}</p>
              <ul className="flex flex-col gap-1.5">
                {waiterRows.map((w) => (
                  <li key={w.name} className="flex items-center justify-between rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-foreground">{w.name}</p>
                      <p className="text-xs text-muted">{t("rreports.billCount", { count: w.orders })}</p>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{formatMoney(w.revenue)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">{t("rreports.byCategory")}</p>
            <ul className="flex flex-col gap-1.5">
              {categoryRows.map((c) => (
                <li key={c.name} className="rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{c.name}</span>
                    <span className="font-semibold text-foreground">{formatMoney(c.revenue)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">{t("rreports.byItem")}</p>
            <ul className="flex flex-col gap-1.5">
              {itemRows.map((r, i) => (
                <li key={r.name} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="w-5 shrink-0 text-xs font-semibold text-muted">#{i + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                      <p className="text-xs text-muted">{r.category} · {r.qty} {t("rreports.sold")}</p>
                    </div>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-foreground">{formatMoney(r.revenue)}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
