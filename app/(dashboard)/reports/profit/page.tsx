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
import { computeProfit } from "@/lib/profit";

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

  const { known, unknown, totalRevenue, totalCost, totalProfit, margin } = await computeProfit(admin, session, fromDate, toDate);

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
