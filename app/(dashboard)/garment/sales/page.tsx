import Link from "@/lib/link";
import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { formatMoney } from "@/lib/format";
import { isoDaysAgo, todayIso } from "@/lib/dateHelpers";
import { lastPurchases } from "@/lib/purchaseData";
import { loadSalesItems, loadSalesLines } from "@/lib/garment/salesData";
import { salesByColour, salesBySize, salesByStyle, slowStock, styleSalesGrid, type SalesRow } from "@/lib/garment/sales";
import { garmentGate } from "../gate";
import { CsvButton } from "../ui";
import { ReportTable } from "../ReportTable";

const TABS = [
  { key: "style", label: "By style" },
  { key: "size", label: "Sizes and colours" },
  { key: "slow", label: "Slow stock" },
] as const;
const SLOW_DAYS = [30, 60, 90, 180];

type Search = { r?: string; from?: string; to?: string; s?: string; d?: string };

/** What a garment shop sold by style, size and colour, and the stock that isn't moving: what to buy
 * again, in which sizes, and what to clear. Counts bills less returns. */
export default async function GarmentSalesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const gate = await garmentGate("advanced_reports");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const sp = await searchParams;
  const tab = TABS.find((x) => x.key === sp.r)?.key ?? "style";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : isoDaysAgo(29);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : todayIso();
  const days = SLOW_DAYS.includes(Number(sp.d)) ? Number(sp.d) : 60;

  const items = await loadSalesItems(admin, session.shopId);
  const styles = [...new Map(items.filter((i) => i.styleId).map((i) => [i.styleId as string, i.styleName ?? i.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const styleId = styles.some(([id]) => id === sp.s) ? sp.s! : "";

  const rowCells = (r: SalesRow) => [r.label, r.quantity, formatMoney(r.sales), r.margin === null ? "—" : formatMoney(r.margin), r.stock, r.sellThrough === null ? "—" : `${r.sellThrough}%`];
  const rowCsv = (r: SalesRow) => [r.label, r.quantity, r.sales, r.margin ?? "", r.stock, r.sellThrough ?? ""];
  const head = (first: string) => [first, t("Pieces sold"), t("Sales"), t("Margin"), t("In stock"), t("Sold of total")];
  const csvHead = (first: string) => [first, "Pieces sold", "Sales", "Margin", "In stock", "Sold of total %"];

  let body: React.ReactNode;
  if (tab === "slow") {
    const lines = await loadSalesLines(admin, session.shopId, isoDaysAgo(days - 1), todayIso());
    const soldNet = new Map<string, number>();
    for (const l of lines) if (l.productId) soldNet.set(l.productId, (soldNet.get(l.productId) ?? 0) + l.quantity);
    const slow = slowStock(items, new Set([...soldNet].filter(([, q]) => q > 0).map(([id]) => id)));
    const bought = await lastPurchases(admin, session.shopId);
    const value = slow.reduce((s, i) => s + (i.value ?? 0), 0);
    const pieces = slow.reduce((s, i) => s + i.stock, 0);
    body = (
      <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-foreground">{t("{n} pieces worth {amount} at cost haven't sold in {d} days.", { n: Math.round(pieces * 1000) / 1000, amount: formatMoney(Math.round(value * 100) / 100), d: days })}</p>
          <CsvButton filename={`slow-stock-${days}-days.csv`} headers={["Item", "In stock", "Value at cost", "Last bought"]} rows={slow.map((i) => [i.name, i.stock, i.value ?? "", bought.get(i.id)?.date ?? ""])} />
        </div>
        <ReportTable head={[t("Item"), t("In stock"), t("Value at cost"), t("Last bought")]} rows={slow.slice(0, 300).map((i) => [i.name, i.stock, i.value === null ? "—" : formatMoney(i.value), bought.get(i.id)?.date ?? "—"])} />
        {slow.length > 300 && <p className="text-xs text-muted">{t("Showing the first 300 — the CSV has them all.")}</p>}
      </>
    );
  } else {
    const lines = await loadSalesLines(admin, session.shopId, from, to);
    if (tab === "style") {
      const rows = salesByStyle(items, lines, t("Other items"));
      body = (
        <>
          <div className="flex justify-end">
            <CsvButton filename={`sales-by-style-${from}-${to}.csv`} headers={csvHead("Style")} rows={rows.map(rowCsv)} />
          </div>
          <ReportTable head={head(t("Style"))} rows={rows.map(rowCells)} />
        </>
      );
    } else {
      const own = styleId ? items.filter((i) => i.styleId === styleId) : items;
      const sizes = salesBySize(own, lines, t("One size"));
      const colours = salesByColour(own, lines, t("One colour"));
      const grid = styleId ? styleSalesGrid(items, lines, styleId) : null;
      body = (
        <>
          {grid && (
            <section className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-muted">{t("Sold / in stock")}</p>
              <ReportTable
                head={[`${t("Colour")} \\ ${t("Size")}`, ...grid.sizes.map((s) => s || t("One size"))]}
                rows={grid.colours.map((c) => [
                  c || t("One colour"),
                  ...grid.sizes.map((s) => {
                    const v = grid.cell(c, s);
                    return v ? `${v.sold} / ${v.stock}` : "—";
                  }),
                ])}
              />
            </section>
          )}
          <div className="flex justify-end">
            <CsvButton filename={`sales-by-size-and-colour-${from}-${to}.csv`} headers={csvHead("Size or colour")} rows={[...sizes, ...colours].map(rowCsv)} />
          </div>
          <ReportTable head={head(t("Size"))} rows={sizes.map(rowCells)} />
          <ReportTable head={head(t("Colour"))} rows={colours.map(rowCells)} />
        </>
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment" />
      <PageHeader title={t("Sales by style")} subtitle={t("Which styles, sizes and colours sell, and what isn't moving")} icon={<TrendingUp size={18} strokeWidth={1.8} />} />
      <nav className="flex flex-wrap gap-1.5" aria-label={t("Reports")}>
        {TABS.map((x) => (
          <Link key={x.key} href={`/garment/sales?r=${x.key}`} aria-current={x.key === tab ? "page" : undefined} className={`rounded-full px-3 py-1 text-xs font-semibold ${x.key === tab ? "bg-brand text-white" : "border border-border text-foreground"}`}>
            {t(x.label)}
          </Link>
        ))}
      </nav>
      <form method="get" className="neu-card flex flex-wrap items-end gap-2 p-3">
        <input type="hidden" name="r" value={tab} />
        {tab === "slow" ? (
          <label className="text-xs text-muted">
            {t("Not sold in")}
            <select name="d" defaultValue={days} className="w-full rounded-lg px-2 py-1.5 text-sm">
              {SLOW_DAYS.map((d) => (
                <option key={d} value={d}>
                  {t("{d} days", { d })}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="text-xs text-muted">
              {t("From")}
              <input type="date" name="from" defaultValue={from} className="w-full rounded-lg px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-muted">
              {t("To")}
              <input type="date" name="to" defaultValue={to} className="w-full rounded-lg px-2 py-1.5 text-sm" />
            </label>
          </>
        )}
        {tab === "size" && (
          <label className="text-xs text-muted">
            {t("Style")}
            <select name="s" defaultValue={styleId} className="w-full rounded-lg px-2 py-1.5 text-sm">
              <option value="">{t("All")}</option>
              {styles.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className="btn-primary-sm">
          {t("Show")}
        </button>
      </form>
      {body}
      {tab !== "slow" && <p className="text-[11px] text-muted">{t("Bills less returns in these dates. Margin is before GST, at each item's latest purchase price; — means an item has no purchase yet. Sold of total: of what was sold plus what is left, the share sold.")}</p>}
    </div>
  );
}
