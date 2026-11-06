import Link from "@/lib/link";
import { BarChart3, FileUp } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { DateRangeControls } from "@/app/components/DateRangeControls";
import { isoDaysAgo, todayIso } from "@/lib/dateHelpers";
import { formatMoney } from "@/lib/format";
import { loadTrips, tripSummaries, type TripSummary } from "@/lib/van/data";
import { STATUS_LABEL } from "@/lib/van/rules";
import { vanGate } from "../gate";

const iso = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** Van-wise sales for a period: each van's totals (sold, cash, UPI, udhaar, collections, expenses,
 * cash short and missing stock), then every trip. */
export default async function VanReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const gate = await vanGate(true);
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const sp = await searchParams;
  const to = iso(sp.to) ?? todayIso();
  const from = iso(sp.from) && iso(sp.from)! <= to ? iso(sp.from)! : isoDaysAgo(6);
  const trips = (await tripSummaries(admin, session.shopId, await loadTrips(admin, session, { from, to }))).filter((x) => x.status !== "cancelled");

  const byVan = new Map<string, { name: string; rows: TripSummary[] }>();
  for (const x of trips) byVan.set(x.vehicleId, { name: x.vehicleName, rows: [...(byVan.get(x.vehicleId)?.rows ?? []), x] });
  const sum = (rows: TripSummary[], f: (x: TripSummary) => number) => rows.reduce((s, x) => s + f(x), 0);
  const short = (x: TripSummary) => (x.cashExpected !== null && x.cashHanded !== null ? Math.max(0, x.cashExpected - x.cashHanded) : 0);

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/van" />
      <PageHeader title={t("Van reports")} subtitle={t("Van-wise sales, money and shortages")} icon={<BarChart3 size={18} strokeWidth={1.8} />} />
      <DateRangeControls from={from} to={to} basePath="/van/reports" />
      <a href={`/api/van/export?report=trips&from=${from}&to=${to}`} download className="flex items-center gap-1.5 self-start rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground">
        <FileUp size={14} /> {t("Download Excel")}
      </a>

      {trips.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("No trips in these dates.")}</p>}

      <ul className="flex flex-col gap-2 md:grid md:grid-cols-2">
        {[...byVan.entries()].map(([id, v]) => (
          <li key={id} className="neu-card flex flex-col gap-1 p-3 text-sm">
            <p className="font-semibold text-foreground">
              {v.name} <span className="text-xs font-normal text-muted">· {v.rows.length} {t("trips")}</span>
            </p>
            <Line label={t("Sold")} value={formatMoney(sum(v.rows, (x) => x.sold))} />
            <Line label={t("Cash / UPI / Udhaar")} value={`${formatMoney(sum(v.rows, (x) => x.cash))} / ${formatMoney(sum(v.rows, (x) => x.upi))} / ${formatMoney(sum(v.rows, (x) => x.credit))}`} />
            <Line label={t("Old dues collected")} value={formatMoney(sum(v.rows, (x) => x.collections))} />
            <Line label={t("Expenses")} value={formatMoney(sum(v.rows, (x) => x.expenses))} />
            <Line label={t("Cash short")} value={formatMoney(sum(v.rows, short))} bad={sum(v.rows, short) > 0} />
            <Line label={t("Missing stock")} value={formatMoney(sum(v.rows, (x) => x.shortageValue ?? 0))} bad={sum(v.rows, (x) => x.shortageValue ?? 0) > 0} />
            <Line label={t("Broken pieces")} value={String(sum(v.rows, (x) => x.damaged))} />
          </li>
        ))}
      </ul>

      {trips.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">{t("Trip")}</th>
                <th className="px-2 py-2 font-medium">{t("Salesman")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("Bills")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("Sold")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("Cash")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("UPI")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("Udhaar")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("Expenses")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("Short")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {trips.map((x) => (
                <tr key={x.id}>
                  <td className="px-3 py-1.5">
                    <Link href={`/van/trips/${x.id}`} className="font-medium text-brand-text underline">
                      {x.number}
                    </Link>
                    <span className="block text-[11px] text-muted">
                      {x.vehicleName} · {t(STATUS_LABEL[x.status])}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-muted">{x.salesmanName ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right text-muted">{x.bills}</td>
                  <td className="px-2 py-1.5 text-right text-foreground">{formatMoney(x.sold)}</td>
                  <td className="px-2 py-1.5 text-right text-muted">{formatMoney(x.cash)}</td>
                  <td className="px-2 py-1.5 text-right text-muted">{formatMoney(x.upi)}</td>
                  <td className="px-2 py-1.5 text-right text-muted">{formatMoney(x.credit)}</td>
                  <td className="px-2 py-1.5 text-right text-muted">{formatMoney(x.expenses)}</td>
                  <td className={`px-3 py-1.5 text-right ${short(x) + (x.shortageValue ?? 0) > 0 ? "font-semibold text-danger" : "text-muted"}`}>{formatMoney(short(x) + (x.shortageValue ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">{t("Short = cash short at settlement + missing stock at selling price. Bills from the counter aren't counted here.")}</p>
    </div>
  );
}

function Line({ label, value, bad = false }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={bad ? "font-semibold text-danger" : "text-foreground"}>{value}</span>
    </div>
  );
}
