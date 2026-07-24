import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageIcon } from "@/app/components/PageIcon";
import { FESTIVALS } from "@/lib/festivals";
import { AddToCalendarButton } from "./AddToCalendarButton";

const TRENDABLE_WINDOW_DAYS = 45; // only bother checking last-year sales for festivals coming up reasonably soon

export default async function FestivalsPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: products } = await admin
    .from("products")
    .select("id, name, price, unit, stock_quantity, low_stock_threshold, track_inventory, categories ( name )")
    .eq("shop_id", session.shopId);

  const catalog = (products ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    price: Number(p.price),
    unit: p.unit,
    stockQuantity: Number(p.stock_quantity),
    lowStockThreshold: Number(p.low_stock_threshold),
    trackInventory: p.track_inventory,
    categoryName: Array.isArray(p.categories) ? p.categories[0]?.name : (p.categories as { name: string } | null)?.name,
  }));

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const upcoming = FESTIVALS.map((f) => {
    const date = new Date(`${f.date}T00:00:00`);
    const daysUntil = Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return { ...f, dateObj: date, daysUntil };
  })
    .filter((f) => f.daysUntil >= -1)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 12);

  // For near-term festivals, check whether the same window last year shows
  // a real sales pattern — turns generic hints into "this actually sold for
  // you" data once the shop has at least a year of history.
  const trendByFestival = new Map<string, { name: string; qty: number; unit: string }[]>();
  for (const f of upcoming) {
    if (f.daysUntil > TRENDABLE_WINDOW_DAYS || f.daysUntil < -1) continue;

    const lastYear = new Date(f.dateObj);
    lastYear.setFullYear(lastYear.getFullYear() - 1);
    const windowStart = new Date(lastYear);
    windowStart.setDate(windowStart.getDate() - 15);
    const windowEnd = new Date(lastYear);
    windowEnd.setDate(windowEnd.getDate() + 5);

    const { data: bills } = await admin
      .from("bills")
      .select("id")
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .gte("created_at", windowStart.toISOString())
      .lte("created_at", windowEnd.toISOString());

    const billIds = (bills ?? []).map((b) => b.id);
    if (billIds.length === 0) continue;

    const { data: items } = await admin
      .from("bill_items")
      .select("product_name, quantity")
      .in("bill_id", billIds);

    const byProduct = new Map<string, number>();
    for (const item of items ?? []) {
      byProduct.set(item.product_name, (byProduct.get(item.product_name) ?? 0) + Number(item.quantity));
    }
    const top = [...byProduct.entries()]
      .map(([name, qty]) => ({ name, qty, unit: catalog.find((p) => p.name === name)?.unit ?? "" }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
    if (top.length > 0) trendByFestival.set(f.name + f.date, top);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <PageIcon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
        </PageIcon>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Festival planner</h1>
          <p className="text-sm text-muted">Plan stock 15–20 days ahead of India&apos;s major festivals.</p>
        </div>
      </div>

      <p className="rounded-lg border border-border bg-surface shadow-sm px-3.5 py-3 text-xs text-muted">
        &quot;Sold well last year&quot; only appears once you have a year of sales history for that
        window — until then, you&apos;ll see catalog matches based on the festival&apos;s usual
        categories. Lunar-calendar festivals (marked ~) can shift by a day or two closer to the date.
      </p>

      <ul className="flex flex-col gap-3">
        {upcoming.map((f) => {
          const matched = catalog.filter((p) =>
            f.keywords.some(
              (k) => p.name.toLowerCase().includes(k) || (p.categoryName ?? "").toLowerCase().includes(k),
            ),
          );
          const trend = trendByFestival.get(f.name + f.date);

          return (
            <li key={f.name + f.date} className="rounded-xl border border-border bg-surface shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {f.approximate ? "~ " : ""}
                    {f.name}
                  </p>
                  <p className="text-xs text-muted">
                    {f.dateObj.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    f.daysUntil <= 20 ? "bg-credit-soft text-credit" : "bg-brand-soft text-brand-dark"
                  }`}
                >
                  {f.daysUntil <= 0 ? "Today/passed" : `${f.daysUntil}d away`}
                </span>
              </div>

              {trend && trend.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-brand-dark">📈 Sold well around this time last year</p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {trend.map((t) => (
                      <li key={t.name} className="flex justify-between text-xs">
                        <span className="text-foreground">{t.name}</span>
                        <span className="text-muted">{t.qty} {t.unit} sold</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-3">
                <p className="text-xs font-medium text-muted">
                  {matched.length > 0 ? "Your products that usually fit this festival" : "Suggested categories (none in your catalog yet)"}
                </p>
                {matched.length > 0 ? (
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {matched.slice(0, 8).map((p) => {
                      const low = p.trackInventory && p.stockQuantity <= p.lowStockThreshold;
                      const near = p.trackInventory && !low && p.stockQuantity <= p.lowStockThreshold + 3;
                      return (
                        <li key={p.id} className="flex items-center justify-between text-xs">
                          <span className="text-foreground">{p.name}</span>
                          {p.trackInventory ? (
                            <span
                              className={
                                low ? "font-medium text-danger" : near ? "font-medium" : "text-muted"
                              }
                              style={near ? { color: "#c2760f" } : undefined}
                            >
                              {p.stockQuantity} {p.unit} in stock{low ? " · Low!" : ""}
                            </span>
                          ) : (
                            <span className="text-muted">{formatMoney(p.price)}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {f.prepHints.map((hint) => (
                      <span key={hint} className="rounded-full bg-background px-2.5 py-1 text-xs text-muted">
                        {hint}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <AddToCalendarButton festivalName={f.name} festivalDateIso={f.date} prepHints={f.prepHints} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
