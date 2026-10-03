import Link from "@/lib/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { Scissors } from "lucide-react";
import { todayIso } from "@/lib/dateHelpers";
import { getTranslator } from "@/lib/i18n/server";
import { BackLink } from "@/app/components/BackLink";
import { loadCommissionRates, loadWorkLines, stylistTotals } from "@/lib/commission";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";

/** Each stylist's work in a period — services, products sold, package sessions — and the
 * commission it earns (the same figure the salary sheet adds for the month). */
export default async function StylistReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { t } = await getTranslator();
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "stylist_commission")) return <ModuleBlocked moduleKey="stylist_commission" />;
  const { from, to } = await searchParams;
  const today = todayIso();
  const fromDate = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : `${today.slice(0, 7)}-01`;
  const toDate = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : today;

  const admin = createSupabaseAdminClient();
  const [lines, rates] = await Promise.all([
    loadWorkLines(admin, session.shopId, new Date(`${fromDate}T00:00:00+05:30`), new Date(`${toDate}T23:59:59.999+05:30`)),
    loadCommissionRates(admin, session.shopId),
  ]);
  const { rows, unassigned } = stylistTotals(lines, rates);
  const totalWork = rows.reduce((s, r) => s + r.services + r.products, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);
  const noRates = rates.every((r) => r.servicePercent === 0 && r.productPercent === 0);

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/dashboard" />
      <PageHeader title={t("Stylist report")} subtitle={t("Who did how much, and their commission — before GST, after discounts")} icon={<Scissors size={18} strokeWidth={1.8} />} />

      <form className="flex items-center gap-2" action="/salon">
        <input type="date" name="from" defaultValue={fromDate} className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        <span className="text-xs text-muted">{t("to")}</span>
        <input type="date" name="to" defaultValue={toDate} className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        <button type="submit" className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground">
          {t("Go")}
        </button>
      </form>

      <div className="grid grid-cols-2 gap-2">
        <div className="neu-card p-3.5 text-center">
          <p className="text-xs text-muted">{t("Work done")}</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{formatMoney(totalWork)}</p>
        </div>
        <div className="neu-card p-3.5 text-center">
          <p className="text-xs text-muted">{t("Commission")}</p>
          <p className="mt-1 text-lg font-semibold text-brand-text">{formatMoney(totalCommission)}</p>
        </div>
      </div>

      {noRates && (
        <Link href="/staff-attendance/people" className="rounded-lg border border-dashed border-brand px-3.5 py-2.5 text-xs text-brand-text">
          {t("Set each stylist's commission % in Staff attendance → People (names must match the stylist picked on bills). →")}
        </Link>
      )}

      {rows.length === 0 ? (
        <EmptyState text={t("No bills with a stylist in this period — pick the stylist on New Bill.")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.name} className="neu-card flex flex-col gap-1.5 px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{r.name}</p>
                <p className="text-sm font-bold text-brand-text">{formatMoney(r.commission)}</p>
              </div>
              <div className="grid grid-cols-4 gap-1 text-center text-[11px]">
                <div>
                  <p className="text-muted">{t("Services")}</p>
                  <p className="font-semibold text-foreground">{formatMoney(r.services)}</p>
                </div>
                <div>
                  <p className="text-muted">{t("Products")}</p>
                  <p className="font-semibold text-foreground">{formatMoney(r.products)}</p>
                </div>
                <div>
                  <p className="text-muted">{t("Package visits")}</p>
                  <p className="font-semibold text-foreground">{r.sessions}</p>
                </div>
                <div>
                  <p className="text-muted">{t("Bills")}</p>
                  <p className="font-semibold text-foreground">{r.bills}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {unassigned.services + unassigned.products > 0 && (
        <p className="text-xs text-muted">{t("{amount} of work had no stylist picked.", { amount: formatMoney(unassigned.services + unassigned.products) })}</p>
      )}
    </div>
  );
}
