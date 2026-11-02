import Link from "@/lib/link";
import { FileBarChart } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { formatMoney, formatDateTime } from "@/lib/format";
import { isoDaysAgo, todayIso } from "@/lib/dateHelpers";
import { latestUnitCosts, loadGodowns, loadStockGrid } from "@/lib/garment/data";
import { BUCKET_LABEL, DAMAGE_REASON_LABEL, DISCREPANCY_KIND_LABEL, MOVEMENT_LABEL, STATUS_LABEL, pendingOf, type DamageReason, type DiscrepancyKind } from "@/lib/garment/rules";
import { garmentGate } from "../gate";
import { CsvButton } from "../ui";

const TABS = [
  { key: "movements", label: "Movements" },
  { key: "transit", label: "On the way" },
  { key: "damage", label: "Damage" },
  { key: "missing", label: "Missing stock" },
  { key: "valuation", label: "Valuation" },
  { key: "supplier", label: "Supplier returns" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const KIND_LABEL = MOVEMENT_LABEL;

type Search = { r?: string; from?: string; to?: string; g?: string; k?: string };

/** Godown registers and movements over a period, each with a CSV for the accountant. */
export default async function GarmentReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const gate = await garmentGate("garment_godowns");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const sp = await searchParams;
  const tab: Tab = (TABS.find((x) => x.key === sp.r)?.key ?? "movements") as Tab;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : isoDaysAgo(30);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : todayIso();
  const godowns = await loadGodowns(admin, session.shopId);
  const godownId = godowns.some((g) => g.id === sp.g) ? sp.g! : "";
  const gname = new Map(godowns.map((g) => [g.id, g.name]));
  // IST day bounds for timestamp columns.
  const startTs = `${from}T00:00:00+05:30`;
  const endTs = `${to}T23:59:59.999+05:30`;

  let body: React.ReactNode = null;

  if (tab === "movements") {
    let q = admin.from("inventory_ledger").select("created_at, product_name, godown_name, bucket, quantity, kind, ref_number, note").eq("shop_id", session.shopId).gte("created_at", startTs).lte("created_at", endTs);
    if (godownId) q = q.eq("godown_id", godownId);
    if (sp.k && KIND_LABEL[sp.k]) q = q.eq("kind", sp.k);
    const { data } = await q.order("created_at", { ascending: false }).limit(1000);
    const rows = data ?? [];
    body = (
      <>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted">{rows.length >= 1000 ? t("Showing the latest 1,000 — narrow the dates for more.") : t("{n} entries", { n: rows.length })}</p>
          <CsvButton filename={`godown-movements-${from}-${to}.csv`} headers={["Time", "Item", "Godown", "Stock", "Quantity", "Movement", "Document", "Note"]} rows={rows.map((r) => [r.created_at, r.product_name, r.godown_name ?? "", r.bucket, Number(r.quantity), r.kind, r.ref_number ?? "", r.note ?? ""])} />
        </div>
        <Table
          head={[t("When"), t("Item"), t("Godown"), t("Quantity"), t("Movement"), t("Document")]}
          rows={rows.map((r) => [
            formatDateTime(r.created_at),
            r.product_name,
            `${r.godown_name ?? "—"}${r.bucket !== "saleable" ? ` · ${t(BUCKET_LABEL[r.bucket] ?? r.bucket)}` : ""}`,
            <span key="q" className={Number(r.quantity) < 0 ? "text-danger" : "text-success"}>{Number(r.quantity) > 0 ? `+${Number(r.quantity)}` : Number(r.quantity)}</span>,
            t(KIND_LABEL[r.kind] ?? r.kind),
            r.ref_number ?? "—",
          ])}
        />
        <p className="text-[11px] text-muted">{t("Sales and purchases change the shop floor through bills and purchases; this register shows godown movements.")}</p>
      </>
    );
  } else if (tab === "transit") {
    const { data } = await admin
      .from("stock_transfers")
      .select("id, number, dispatched_at, from_godown_id, to_godown_id, stock_transfer_items ( product_name, dispatched, received, damaged, shortage )")
      .eq("shop_id", session.shopId)
      .in("status", ["dispatched", "partially_received"])
      .order("dispatched_at", { ascending: true });
    type It = { product_name: string; dispatched: number; received: number; damaged: number; shortage: number };
    const rows = (data ?? []).flatMap((tr) =>
      ((tr.stock_transfer_items ?? []) as unknown as It[])
        .map((i) => ({ tr, name: i.product_name, pending: pendingOf({ dispatched: Number(i.dispatched), received: Number(i.received), damaged: Number(i.damaged), shortage: Number(i.shortage) }) }))
        .filter((x) => x.pending > 0),
    );
    const now = Date.now();
    body = (
      <>
        <div className="flex justify-end">
          <CsvButton filename="stock-in-transit.csv" headers={["Transfer", "From", "To", "Item", "On the way", "Dispatched", "Days"]} rows={rows.map((x) => [x.tr.number, gname.get(x.tr.from_godown_id) ?? "", gname.get(x.tr.to_godown_id) ?? "", x.name, x.pending, x.tr.dispatched_at ?? "", x.tr.dispatched_at ? Math.floor((now - Date.parse(x.tr.dispatched_at)) / 86400000) : ""])} />
        </div>
        <Table
          head={[t("Transfer"), t("Route"), t("Item"), t("On the way"), t("Days")]}
          rows={rows.map((x) => {
            const days = x.tr.dispatched_at ? Math.floor((now - Date.parse(x.tr.dispatched_at)) / 86400000) : 0;
            return [
              <Link key="l" href={`/garment/transfers/${x.tr.id}`} className="font-semibold text-brand-text">{x.tr.number}</Link>,
              `${gname.get(x.tr.from_godown_id) ?? "—"} → ${gname.get(x.tr.to_godown_id) ?? "—"}`,
              x.name,
              x.pending,
              <span key="d" className={days > 3 ? "font-semibold text-warning" : ""}>{days}</span>,
            ];
          })}
        />
      </>
    );
  } else if (tab === "damage") {
    let q = admin.from("damage_reports").select("number, report_date, godown_id, product_name, quantity, reason, estimated_value, status, disposition").eq("shop_id", session.shopId).gte("report_date", from).lte("report_date", to);
    if (godownId) q = q.eq("godown_id", godownId);
    const { data } = await q.order("report_date", { ascending: false }).limit(1000);
    const rows = data ?? [];
    const byReason = new Map<string, { n: number; qty: number; value: number }>();
    for (const r of rows.filter((x) => x.status !== "rejected")) {
      const s = byReason.get(r.reason) ?? { n: 0, qty: 0, value: 0 };
      s.n += 1;
      s.qty += Number(r.quantity);
      s.value += Number(r.estimated_value);
      byReason.set(r.reason, s);
    }
    body = (
      <>
        <Table head={[t("Cause"), t("Reports"), t("Quantity"), t("Est. loss")]} rows={[...byReason.entries()].map(([k, s]) => [t(DAMAGE_REASON_LABEL[k as DamageReason] ?? k), s.n, Math.round(s.qty * 1000) / 1000, formatMoney(Math.round(s.value * 100) / 100)])} />
        <div className="flex justify-end">
          <CsvButton filename={`damage-register-${from}-${to}.csv`} headers={["Number", "Date", "Godown", "Item", "Quantity", "Reason", "Estimated value", "Status", "Disposition"]} rows={rows.map((r) => [r.number, r.report_date, gname.get(r.godown_id) ?? "", r.product_name, Number(r.quantity), r.reason, Number(r.estimated_value), r.status, r.disposition ?? ""])} />
        </div>
        <Table head={[t("No."), t("Date"), t("Item"), t("Quantity"), t("Status")]} rows={rows.map((r) => [r.number, r.report_date, `${r.product_name} · ${gname.get(r.godown_id) ?? ""}`, Number(r.quantity), t(STATUS_LABEL[r.status] ?? r.status)])} />
      </>
    );
  } else if (tab === "missing") {
    let q = admin.from("stock_discrepancies").select("number, report_date, godown_id, product_name, kind, system_qty, physical_qty, difference, estimated_value, status, resolution").eq("shop_id", session.shopId).gte("report_date", from).lte("report_date", to);
    if (godownId) q = q.eq("godown_id", godownId);
    const { data } = await q.order("report_date", { ascending: false }).limit(1000);
    const rows = data ?? [];
    const byKind = new Map<string, { n: number; diff: number; value: number }>();
    for (const r of rows.filter((x) => x.status !== "rejected")) {
      const s = byKind.get(r.kind) ?? { n: 0, diff: 0, value: 0 };
      s.n += 1;
      s.diff += Number(r.difference);
      s.value += Number(r.estimated_value);
      byKind.set(r.kind, s);
    }
    body = (
      <>
        <Table head={[t("Kind"), t("Records"), t("Net difference"), t("Value")]} rows={[...byKind.entries()].map(([k, s]) => [t(DISCREPANCY_KIND_LABEL[k as DiscrepancyKind] ?? k), s.n, Math.round(s.diff * 1000) / 1000, formatMoney(Math.round(s.value * 100) / 100)])} />
        <div className="flex justify-end">
          <CsvButton filename={`missing-stock-${from}-${to}.csv`} headers={["Number", "Date", "Godown", "Item", "Kind", "System", "Found", "Difference", "Value", "Status", "Resolution"]} rows={rows.map((r) => [r.number, r.report_date, gname.get(r.godown_id) ?? "", r.product_name, r.kind, Number(r.system_qty), Number(r.physical_qty), Number(r.difference), Number(r.estimated_value), r.status, r.resolution ?? ""])} />
        </div>
        <Table head={[t("No."), t("Date"), t("Item"), t("Difference"), t("Status")]} rows={rows.map((r) => [r.number, r.report_date, `${r.product_name} · ${gname.get(r.godown_id) ?? ""}`, Number(r.difference), t(STATUS_LABEL[r.status] ?? r.status)])} />
      </>
    );
  } else if (tab === "valuation") {
    const grid = await loadStockGrid(admin, session.shopId, { godownId: godownId || undefined });
    const costs = await latestUnitCosts(admin, session.shopId, grid.rows.map((r) => r.id));
    const out = grid.rows.flatMap((r) =>
      grid.godowns.flatMap((g) => {
        const c = r.cells[g.id] ?? { saleable: 0, damaged: 0 };
        const cost = costs.get(r.id) ?? 0;
        return [
          ...(c.saleable !== 0 ? [{ godown: g.name, item: r.name, sku: r.sku ?? "", bucket: "saleable", qty: c.saleable, cost }] : []),
          ...(c.damaged !== 0 ? [{ godown: g.name, item: r.name, sku: r.sku ?? "", bucket: "damaged", qty: c.damaged, cost }] : []),
        ];
      }),
    );
    const byGodown = new Map<string, { saleable: number; damaged: number; value: number }>();
    for (const x of out) {
      const s = byGodown.get(x.godown) ?? { saleable: 0, damaged: 0, value: 0 };
      if (x.bucket === "saleable") s.saleable += x.qty;
      else s.damaged += x.qty;
      s.value += x.qty * x.cost;
      byGodown.set(x.godown, s);
    }
    body = (
      <>
        <Table head={[t("Godown"), t("Saleable"), t("Damaged"), t("Value at latest cost")]} rows={[...byGodown.entries()].map(([k, s]) => [k, Math.round(s.saleable * 1000) / 1000, Math.round(s.damaged * 1000) / 1000, formatMoney(Math.round(s.value * 100) / 100)])} />
        <div className="flex justify-end">
          <CsvButton filename={`stock-valuation-${todayIso()}.csv`} headers={["Godown", "Item", "SKU", "Stock", "Quantity", "Unit cost", "Value"]} rows={out.map((x) => [x.godown, x.item, x.sku, x.bucket, x.qty, x.cost, Math.round(x.qty * x.cost * 100) / 100])} />
        </div>
        <p className="text-[11px] text-muted">{t("Valued at each item's latest purchase price; items never purchased count at zero.")}</p>
      </>
    );
  } else {
    const { data } = await admin.from("purchase_returns").select("number, return_date, vendor_id, status, taxable_value, gst_amount, total").eq("shop_id", session.shopId).eq("status", "posted").gte("return_date", from).lte("return_date", to).order("return_date", { ascending: false }).limit(1000);
    const rows = data ?? [];
    const ids = [...new Set(rows.map((r) => r.vendor_id))];
    const { data: vendors } = ids.length ? await admin.from("vendors").select("id, name, gstin").in("id", ids) : { data: [] };
    const vendor = new Map((vendors ?? []).map((v) => [v.id, v]));
    body = (
      <>
        <div className="flex justify-end">
          <CsvButton filename={`supplier-returns-${from}-${to}.csv`} headers={["Number", "Date", "Vendor", "Vendor GSTIN", "Taxable", "GST", "Total"]} rows={rows.map((r) => [r.number, r.return_date, vendor.get(r.vendor_id)?.name ?? "", vendor.get(r.vendor_id)?.gstin ?? "", Number(r.taxable_value), Number(r.gst_amount), Number(r.total)])} />
        </div>
        <Table head={[t("No."), t("Date"), t("Supplier"), t("Taxable value"), t("GST"), t("Total")]} rows={rows.map((r) => [r.number, r.return_date, vendor.get(r.vendor_id)?.name ?? "—", formatMoney(Number(r.taxable_value)), formatMoney(Number(r.gst_amount)), formatMoney(Number(r.total))])} />
      </>
    );
  }

  const dated = tab !== "transit" && tab !== "valuation";
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment" />
      <PageHeader title={t("Godown reports")} subtitle={t("Registers, movements and valuation")} icon={<FileBarChart size={18} strokeWidth={1.8} />} />
      <nav className="flex flex-wrap gap-1.5" aria-label={t("Reports")}>
        {TABS.map((x) => (
          <Link key={x.key} href={`/garment/reports?r=${x.key}`} aria-current={x.key === tab ? "page" : undefined} className={`rounded-full px-3 py-1 text-xs font-semibold ${x.key === tab ? "bg-brand text-white" : "border border-border text-foreground"}`}>
            {t(x.label)}
          </Link>
        ))}
      </nav>
      {tab !== "transit" && tab !== "supplier" && (
        <form method="get" className="neu-card flex flex-wrap items-end gap-2 p-3">
          <input type="hidden" name="r" value={tab} />
          {dated && (
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
          <label className="text-xs text-muted">
            {t("Godown")}
            <select name="g" defaultValue={godownId} className="w-full rounded-lg px-2 py-1.5 text-sm">
              <option value="">{t("All")}</option>
              {godowns.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          {tab === "movements" && (
            <label className="text-xs text-muted">
              {t("Movement")}
              <select name="k" defaultValue={sp.k ?? ""} className="w-full rounded-lg px-2 py-1.5 text-sm">
                <option value="">{t("All")}</option>
                {Object.entries(KIND_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {t(v)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className="btn-primary-sm">
            {t("Show")}
          </button>
        </form>
      )}
      {tab === "supplier" && (
        <form method="get" className="neu-card flex flex-wrap items-end gap-2 p-3">
          <input type="hidden" name="r" value={tab} />
          <label className="text-xs text-muted">
            {t("From")}
            <input type="date" name="from" defaultValue={from} className="w-full rounded-lg px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-muted">
            {t("To")}
            <input type="date" name="to" defaultValue={to} className="w-full rounded-lg px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="btn-primary-sm">
            {t("Show")}
          </button>
        </form>
      )}
      {body}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (!rows.length) return <p className="neu-card p-4 text-sm text-muted">—</p>;
  return (
    <section className="neu-card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-2 text-left text-xs text-muted">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
