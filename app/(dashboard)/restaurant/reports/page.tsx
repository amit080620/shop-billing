import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { DateRangeControls } from "./DateRangeControls";
import { BarChart3 } from "lucide-react";
import { todayIso } from "@/lib/dateHelpers";

export default async function RestaurantReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireSession();
  const { t, lang } = await getTranslator();
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

  const orderIds = (orders ?? []).map((o) => o.id);
  const { data: payments } = orderIds.length
    ? await admin.from("restaurant_order_payments").select("payment_method, amount").in("order_id", orderIds)
    : { data: [] };
  const byMethod = new Map<string, number>();
  for (const p of payments ?? []) {
    byMethod.set(p.payment_method, (byMethod.get(p.payment_method) ?? 0) + Number(p.amount));
  }
  const methodRows = [...byMethod.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title={t("rreports.title")}
        icon={<BarChart3 size={18} strokeWidth={1.8} />}
      />

      <DateRangeControls from={fromDate} to={toDate} lang={lang} />

      <Link href="/restaurant/reports/items" className="rounded-lg border border-dashed border-brand bg-brand-soft px-3.5 py-3 text-sm font-medium text-brand-text">
        {t("rreports.itemWiseLink")}
      </Link>

      <div className="neu-card p-4 text-center">
        <p className="text-xs text-muted">
          {fromDate === toDate ? t("rreports.thatDay") : `${fromDate} → ${toDate}`}
        </p>
        <p className="mt-1 text-xl font-semibold text-foreground neu-text">{formatMoney(totalSales)}</p>
        <p className="text-xs text-muted">{t("rreports.billCount", { count: (orders ?? []).length })}</p>
      </div>

      {methodRows.length > 0 && (
        <div className="neu-card p-4">
          <p className="mb-2 text-xs font-medium text-muted">{t("rreports.paymentMix")}</p>
          <div className="flex flex-col gap-1.5">
            {methodRows.map(([method, amount]) => (
              <div key={method} className="flex items-center justify-between text-sm">
                <span className="capitalize text-foreground">{method}</span>
                <span className="font-medium text-foreground">{formatMoney(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(!orders || orders.length === 0) ? (
        <EmptyState text={t("rreports.empty")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((o) => {
            const table = Array.isArray(o.restaurant_tables) ? o.restaurant_tables[0] : o.restaurant_tables;
            return (
              <li key={o.id}>
                <Link
                  href={`/restaurant/reports/${o.id}`}
                  className="neu-card flex items-center justify-between gap-3 px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {table?.name ?? "Table"} · #{o.order_number}
                    </p>
                    <p className="text-xs text-muted">
                      {o.settled_at && new Date(o.settled_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-foreground">{formatMoney(o.total)}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
