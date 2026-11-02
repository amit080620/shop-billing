import Link from "@/lib/link";
import { CalendarCheck } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { formatMoney, formatDateTime } from "@/lib/format";
import { addDaysIso, todayIso } from "@/lib/dateHelpers";
import { allRows } from "@/lib/supabase/allRows";
import { latestUnitCosts, loadStockGrid } from "@/lib/garment/data";
import { BUCKET_LABEL, financialYearBounds, financialYearOf } from "@/lib/garment/rules";
import { garmentGate } from "../gate";
import { CsvButton, StatusChip } from "../ui";
import { CarryForward, CloseYear } from "./YearEndClient";

/** The year's closing stock: a snapshot of every godown's saleable and damaged stock, stock on
 * the way and unsettled transit shortages, valued at the latest purchase price — taken once per
 * year, then carried into the next year as its opening balance (no stock is created). */
export default async function YearEndPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const gate = await garmentGate("garment_godowns");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const { c: openId } = await searchParams;
  const today = todayIso();
  const current = financialYearOf(today);
  const previous = financialYearOf(addDaysIso(`${current.slice(0, 4)}-04-01`, -1));

  const [{ data: closings }, grid] = await Promise.all([
    admin.from("fy_stock_closings").select("*").eq("shop_id", session.shopId).order("financial_year", { ascending: false }),
    loadStockGrid(admin, session.shopId),
  ]);
  const costs = await latestUnitCosts(admin, session.shopId, grid.rows.map((r) => r.id));
  let qty = 0;
  let value = 0;
  let negative = 0;
  for (const r of grid.rows) {
    const cost = costs.get(r.id) ?? 0;
    const all = Object.values(r.cells).reduce((s, c) => s + c.saleable + c.damaged, 0) + r.transit + r.pending;
    qty += all;
    value += all * cost;
    if (Object.values(r.cells).some((c) => c.saleable < 0)) negative += 1;
  }
  const closed = new Set((closings ?? []).map((c) => c.financial_year));
  const candidates = [
    ...(!closed.has(previous) ? [{ fy: previous, closingDate: financialYearBounds(previous).closing, daysLate: Math.round((Date.parse(today) - Date.parse(financialYearBounds(previous).closing)) / 86400000) }] : []),
    ...(!closed.has(current) && today === financialYearBounds(current).closing ? [{ fy: current, closingDate: today, daysLate: 0 }] : []),
  ];

  const open = openId ? (closings ?? []).find((c) => c.id === openId) : null;
  const lines = open
    ? (await allRows((a, b) => admin.from("fy_stock_closing_lines").select("product_name, sku, barcode, godown_name, bucket, quantity, unit_cost, value").eq("closing_id", open.id).order("godown_name").order("product_name").range(a, b))).data
    : [];
  const groups = new Map<string, { qty: number; value: number }>();
  for (const l of lines) {
    const k = `${l.godown_name ?? "—"} · ${t(BUCKET_LABEL[l.bucket] ?? l.bucket)}`;
    const g = groups.get(k) ?? { qty: 0, value: 0 };
    g.qty += Number(l.quantity);
    g.value += Number(l.value);
    groups.set(k, g);
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment" />
      <PageHeader title={t("Year-end stock")} subtitle={t("Closing stock for the financial year, carried forward once")} icon={<CalendarCheck size={18} strokeWidth={1.8} />} />

      <section className="neu-card grid grid-cols-3 gap-2 p-4 text-center">
        <div>
          <p className="text-xs text-muted">{t("Stock now")}</p>
          <p className="text-lg font-bold text-foreground">{Math.round(qty * 1000) / 1000}</p>
        </div>
        <div>
          <p className="text-xs text-muted">{t("Value at latest cost")}</p>
          <p className="text-lg font-bold text-foreground">{formatMoney(Math.round(value * 100) / 100)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">{t("Below zero")}</p>
          <p className={`text-lg font-bold ${negative ? "text-danger" : "text-foreground"}`}>{negative}</p>
        </div>
      </section>
      {negative > 0 && <p className="text-xs text-warning">{t("Some items show below zero on the shop floor. Record the moves from the godown before closing, so the closing stock is right.")}</p>}

      {session.role === "owner" ? (
        <CloseYear candidates={candidates} />
      ) : (
        <p className="text-xs text-muted">{t("Only the owner can close a year and carry stock forward.")}</p>
      )}

      {(closings ?? []).length > 0 && (
        <ul className="flex flex-col gap-2">
          {(closings ?? []).map((c) => (
            <li key={c.id} className="neu-card flex flex-col gap-2 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">
                    {t("FY {fy}", { fy: c.financial_year })} <span className="text-xs font-normal text-muted">· {t("closed on {d}", { d: c.closing_date })}</span>
                  </span>
                  <span className="block text-xs text-muted">
                    {Number(c.total_quantity)} · {formatMoney(Number(c.total_value))}
                    {c.negative_lines > 0 && ` · ${t("{n} below zero", { n: c.negative_lines })}`}
                    {c.opening_financial_year && ` · ${t("opened FY {fy} on {d}", { fy: c.opening_financial_year, d: c.opening_date ?? "" })}`}
                  </span>
                  <span className="block text-xs text-muted">{formatDateTime(c.created_at)}</span>
                </span>
                <StatusChip status={c.status} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={c.id === openId ? "/garment/year-end" : `/garment/year-end?c=${c.id}`} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground">
                  {c.id === openId ? t("Hide lines") : t("See lines")}
                </Link>
                {c.status === "closed" && session.role === "owner" && <CarryForward id={c.id} fy={c.financial_year} openingDate={financialYearBounds(c.financial_year).opening} />}
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <section className="neu-card flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-foreground">{t("Closing stock FY {fy}", { fy: open.financial_year })}</p>
            <CsvButton
              filename={`closing-stock-${open.financial_year}.csv`}
              headers={["Godown", "Stock", "Item", "SKU", "Barcode", "Quantity", "Unit cost", "Value"]}
              rows={lines.map((l) => [l.godown_name ?? "", l.bucket, l.product_name, l.sku ?? "", l.barcode ?? "", Number(l.quantity), Number(l.unit_cost), Number(l.value)])}
            />
          </div>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {[...groups.entries()].map(([k, g]) => (
              <li key={k} className="flex justify-between gap-2 py-1.5">
                <span className="text-foreground">{k}</span>
                <span className="text-muted">
                  {Math.round(g.qty * 1000) / 1000} · {formatMoney(Math.round(g.value * 100) / 100)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
