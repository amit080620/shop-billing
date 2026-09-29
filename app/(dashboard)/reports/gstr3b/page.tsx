import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { istMonthRange, istYearMonth, MONTHS } from "@/lib/dateHelpers";
import { PeriodPicker } from "../PeriodPicker";
import { ExportCsvButton } from "@/app/components/ExportCsvButton";
import { getTranslator } from "@/lib/i18n/server";
import { BackLink } from "@/app/components/BackLink";
import { buyerOf } from "@/lib/gstBuyer";

export default async function Gstr3bPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { t } = await getTranslator();
  const { year: yearParam, month: monthParam } = await searchParams;
  const now = istYearMonth();
  const year = Number(yearParam) || now.year;
  const month = Number(monthParam) || now.month;

  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  // Month boundaries at IST midnight, not the UTC server's.
  const { start, end, startDate, endDate } = istMonthRange(year, month);

  const partyCols = "buyer_name, buyer_gstin, buyer_state, buyer_state_code, customers ( name, gstin, state, state_code )";
  const [{ data: bills }, { data: purchases }, { data: restaurantOrders }, { data: rentals }, { data: returnsRaw }, { data: debitRaw }] = await Promise.all([
    admin
      .from("bills")
      .select(`id, taxable_amount, cgst_amount, sgst_amount, igst_amount, supply_type, ${partyCols}`)
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString()),
    admin
      .from("purchases")
      .select("taxable_amount, cgst_amount, sgst_amount, igst_amount, itc_eligible, reverse_charge")
      .eq("shop_id", session.shopId)
      .gte("purchase_date", startDate)
      .lt("purchase_date", endDate),
    // Restaurant sales never touch `bills` — merged in here so a
    // restaurant's outward-supply liability isn't silently understated.
    admin
      .from("restaurant_orders")
      .select("id, taxable_amount, cgst_amount, sgst_amount, igst_amount, buyer_gstin")
      .eq("shop_id", session.shopId)
      .eq("status", "settled")
      .gte("settled_at", start.toISOString())
      .lt("settled_at", end.toISOString()),
    // Same reasoning for rentals — their own table, never `bills`.
    admin
      .from("rentals")
      .select("id, subtotal, cgst_amount, sgst_amount, igst_amount, supply_type, customers ( name, gstin, state, state_code )")
      .eq("shop_id", session.shopId)
      .neq("status", "cancelled")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString()),
    // Credit notes issued this month reduce this month's output tax, whatever month the
    // original sale was in (same rule GSTR-1 Table 9B follows).
    admin
      .from("returns")
      .select(`id, bills ( status, supply_type, ${partyCols} )`)
      .eq("shop_id", session.shopId)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString()),
    // Debit notes issued this month raise it again (the other half of the same rule).
    admin
      .from("debit_notes")
      .select(`taxable_amount, gst_percent, cgst_amount, sgst_amount, igst_amount, bills ( status, supply_type, ${partyCols} )`)
      .eq("shop_id", session.shopId)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString()),
  ]);

  // Line items, to keep 0% (nil-rated / exempt) value out of 3.1(a) and in 3.1(c).
  const billIds = (bills ?? []).map((b) => b.id);
  const orderIds = (restaurantOrders ?? []).map((o) => o.id);
  const rentalIds = (rentals ?? []).map((r) => r.id);
  const returnIds = (returnsRaw ?? []).map((r) => r.id);
  const [{ data: billItems }, { data: orderItems }, { data: rentalItems }, { data: returnItems }] = await Promise.all([
    billIds.length ? admin.from("bill_items").select("bill_id, gst_percent, line_subtotal").in("bill_id", billIds) : Promise.resolve({ data: [] as never[] }),
    orderIds.length ? admin.from("restaurant_order_items").select("order_id, gst_percent, line_subtotal").in("order_id", orderIds) : Promise.resolve({ data: [] as never[] }),
    rentalIds.length ? admin.from("rental_items").select("rental_id, gst_percent, line_subtotal").in("rental_id", rentalIds) : Promise.resolve({ data: [] as never[] }),
    returnIds.length ? admin.from("return_items").select("return_id, gst_percent, line_total, cgst_amount, sgst_amount, igst_amount").in("return_id", returnIds) : Promise.resolve({ data: [] as never[] }),
  ]);
  const nilTotals = (lines: { id: string; gst_percent: number; line_subtotal: number }[]) => {
    const m = new Map<string, number>();
    for (const l of lines) if (Number(l.gst_percent) === 0) m.set(l.id, (m.get(l.id) ?? 0) + Number(l.line_subtotal));
    return m;
  };
  const nilByBill = nilTotals((billItems ?? []).map((i) => ({ ...i, id: i.bill_id })));
  const nilByOrder = nilTotals((orderItems ?? []).map((i) => ({ ...i, id: i.order_id })));
  const nilByRental = nilTotals((rentalItems ?? []).map((i) => ({ ...i, id: i.rental_id })));

  // Every supply of the month (and every note against one) as a signed row, classified the way
  // GSTR-1 does it: B2B when the invoice was made out to a GSTIN — the buyer frozen on the bill.
  type Party = { name: string; gstin: string | null; state: string | null; state_code: string | null };
  type PartyRow = { buyer_name: string | null; buyer_gstin: string | null; buyer_state: string | null; buyer_state_code: string | null; customers: unknown };
  type NoteBill = PartyRow & { status: string; supply_type: string };
  const one = <T,>(x: unknown) => (Array.isArray(x) ? (x[0] as T | undefined) ?? null : (x as T | null));
  const partyOf = (r: PartyRow) => buyerOf(r, one<Party>(r.customers));
  type Row = { kind: "sale" | "cn" | "dn"; b2b: boolean; inter: boolean; state: string | null; taxable: number; nil: number; cgst: number; sgst: number; igst: number };
  const rows: Row[] = [];
  for (const b of bills ?? []) {
    const p = partyOf(b);
    const nil = nilByBill.get(b.id) ?? 0;
    rows.push({ kind: "sale", b2b: !!p?.gstin, inter: b.supply_type === "inter", state: p?.state ?? null, taxable: Number(b.taxable_amount) - nil, nil, cgst: Number(b.cgst_amount), sgst: Number(b.sgst_amount), igst: Number(b.igst_amount) });
  }
  // Restaurant service is always within the state.
  for (const o of restaurantOrders ?? []) {
    const nil = nilByOrder.get(o.id) ?? 0;
    rows.push({ kind: "sale", b2b: !!o.buyer_gstin, inter: false, state: null, taxable: Number(o.taxable_amount) - nil, nil, cgst: Number(o.cgst_amount), sgst: Number(o.sgst_amount), igst: Number(o.igst_amount) });
  }
  for (const r of rentals ?? []) {
    const c = one<Party>(r.customers);
    const nil = nilByRental.get(r.id) ?? 0;
    rows.push({ kind: "sale", b2b: !!c?.gstin, inter: r.supply_type === "inter", state: c?.state ?? null, taxable: Number(r.subtotal) - nil, nil, cgst: Number(r.cgst_amount), sgst: Number(r.sgst_amount), igst: Number(r.igst_amount) });
  }
  for (const ret of returnsRaw ?? []) {
    const bill = one<NoteBill>(ret.bills);
    // A bill voided after being partly returned is already out of the report entirely; its
    // credit note must not reduce the tax a second time.
    if (!bill || bill.status !== "active") continue;
    const p = partyOf(bill);
    for (const i of (returnItems ?? []).filter((x) => x.return_id === ret.id)) {
      const cgst = Number(i.cgst_amount), sgst = Number(i.sgst_amount), igst = Number(i.igst_amount);
      const value = Number(i.line_total) - cgst - sgst - igst;
      const isNil = Number(i.gst_percent) === 0;
      rows.push({ kind: "cn", b2b: !!p?.gstin, inter: bill.supply_type === "inter", state: p?.state ?? null, taxable: isNil ? 0 : -value, nil: isNil ? -value : 0, cgst: -cgst, sgst: -sgst, igst: -igst });
    }
  }
  for (const d of debitRaw ?? []) {
    const bill = one<NoteBill>(d.bills);
    if (!bill || bill.status !== "active") continue;
    const p = partyOf(bill);
    const value = Number(d.taxable_amount);
    const isNil = Number(d.gst_percent) === 0;
    rows.push({ kind: "dn", b2b: !!p?.gstin, inter: bill.supply_type === "inter", state: p?.state ?? null, taxable: isNil ? 0 : value, nil: isNil ? value : 0, cgst: Number(d.cgst_amount), sgst: Number(d.sgst_amount), igst: Number(d.igst_amount) });
  }

  const totalOf = (list: Row[]) => ({
    taxable: round2(list.reduce((s, r) => s + r.taxable, 0)),
    nil: round2(list.reduce((s, r) => s + r.nil, 0)),
    cgst: round2(list.reduce((s, r) => s + r.cgst, 0)),
    sgst: round2(list.reduce((s, r) => s + r.sgst, 0)),
    igst: round2(list.reduce((s, r) => s + r.igst, 0)),
  });
  // 3.1(a) is taxable supplies only; the 0% part goes to 3.1(c).
  const outward = totalOf(rows);
  const creditNotes = totalOf(rows.filter((r) => r.kind === "cn"));
  const debitNotes = totalOf(rows.filter((r) => r.kind === "dn"));
  const b2bPart = totalOf(rows.filter((r) => r.b2b));
  const b2cPart = totalOf(rows.filter((r) => !r.b2b));
  // 3.2: the part of 3.1(a) sold inter-state to unregistered buyers, by place of supply.
  const byState = new Map<string, { state: string; taxable: number; igst: number }>();
  for (const r of rows) {
    if (!r.inter || r.b2b) continue;
    const state = r.state ?? t("State not recorded");
    const g = byState.get(state) ?? { state, taxable: 0, igst: 0 };
    g.taxable = round2(g.taxable + r.taxable);
    g.igst = round2(g.igst + r.igst);
    byState.set(state, g);
  }
  const table32 = [...byState.values()].filter((g) => Math.abs(g.taxable) >= 0.01).sort((x, y) => x.state.localeCompare(y.state));
  const rcmPurchases = (purchases ?? []).filter((p) => p.reverse_charge);
  const rcm = sumFields(rcmPurchases);
  const itcPurchases = (purchases ?? []).filter((p) => p.itc_eligible);
  const itc = sumFields(itcPurchases);

  const netCgst = round2(outward.cgst - itc.cgst);
  const netSgst = round2(outward.sgst - itc.sgst);
  const netIgst = round2(outward.igst - itc.igst);
  const netPayable = round2(Math.max(0, netCgst) + Math.max(0, netSgst) + Math.max(0, netIgst));

  const period = `${MONTHS[month - 1]}-${year}`;

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/reports" />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight text-foreground md:text-2xl">{t("GSTR-3B")}</h1>
        <PeriodPicker year={year} month={month} />
      </div>
      <p className="text-sm text-muted">{MONTHS[month - 1]} {year} · {t("Summary return")}</p>

      <p className="rounded-lg bg-credit-soft px-3 py-2 text-xs text-credit">
        {t("Simplified same-head calculation shown below (Output − Input per head). GST law allows cross-utilisation between heads (e.g. IGST credit can offset CGST/SGST liability) in a specific order — for the exact cash payable, verify with your CA or let the GST portal auto-compute it from your filed GSTR-1 + ITC ledger.")}
      </p>

      <section className="neu-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">
            3.1(a) Outward taxable supplies
          </p>
          <ExportCsvButton
            filename={`gstr3b-${period}.csv`}
            headers={["Section", "Taxable Value", "CGST", "SGST", "IGST"]}
            rows={[
              ["3.1(a) Outward taxable supplies", outward.taxable.toFixed(2), outward.cgst.toFixed(2), outward.sgst.toFixed(2), outward.igst.toFixed(2)],
              ["  of which B2B (to GSTINs) - info", b2bPart.taxable.toFixed(2), b2bPart.cgst.toFixed(2), b2bPart.sgst.toFixed(2), b2bPart.igst.toFixed(2)],
              ["  of which B2C (unregistered) - info", b2cPart.taxable.toFixed(2), b2cPart.cgst.toFixed(2), b2cPart.sgst.toFixed(2), b2cPart.igst.toFixed(2)],
              ["3.1(c) Nil rated / exempted", outward.nil.toFixed(2), "", "", ""],
              ["3.1(d) Inward supplies (RCM)", rcm.taxable.toFixed(2), rcm.cgst.toFixed(2), rcm.sgst.toFixed(2), rcm.igst.toFixed(2)],
              ...table32.map((g) => [`3.2 Unregistered persons - ${g.state}`, g.taxable.toFixed(2), "", "", g.igst.toFixed(2)]),
              ["4 ITC available", itc.taxable.toFixed(2), itc.cgst.toFixed(2), itc.sgst.toFixed(2), itc.igst.toFixed(2)],
              ["Net payable (same-head, simplified)", "", netCgst.toFixed(2), netSgst.toFixed(2), netIgst.toFixed(2)],
            ]}
          />
        </div>
        <TotalsGrid taxable={outward.taxable} cgst={outward.cgst} sgst={outward.sgst} igst={outward.igst} />
        {creditNotes.taxable + creditNotes.nil + creditNotes.cgst + creditNotes.sgst + creditNotes.igst < 0 && (
          <p className="mt-2 text-xs text-muted">
            {t("Net of credit notes (returns) issued this month")}: −{formatMoney(-round2(creditNotes.taxable + creditNotes.nil))} {t("value")}, −{formatMoney(-round2(creditNotes.cgst + creditNotes.sgst + creditNotes.igst))} {t("tax")}
          </p>
        )}
        {debitNotes.taxable + debitNotes.nil > 0 && (
          <p className="mt-1 text-xs text-muted">
            {t("Includes debit notes issued this month")}: +{formatMoney(round2(debitNotes.taxable + debitNotes.nil))} {t("value")}, +{formatMoney(round2(debitNotes.cgst + debitNotes.sgst + debitNotes.igst))} {t("tax")}
          </p>
        )}

        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold text-foreground">{t("Of which — B2B and B2C")}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1 pr-2 font-medium" />
                  <th className="py-1 pr-2 text-right font-medium">{t("Taxable")}</th>
                  <th className="py-1 text-right font-medium">{t("Tax")}</th>
                </tr>
              </thead>
              <tbody>
                <SplitRow label={t("B2B — to GSTINs")} href={`/reports/gstr1?year=${year}&month=${month}&view=b2b`} part={b2bPart} />
                <SplitRow label={t("B2C — consumers")} href={`/reports/gstr1?year=${year}&month=${month}&view=b2c`} part={b2cPart} />
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">
            {t("GSTR-3B is filed as one total — this split is only for checking. Each row equals that part of your GSTR-1 (tap it): the invoices, plus this month's debit notes, minus credit notes.")}
          </p>
        </div>
      </section>

      <section className="neu-card p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">3.1(c) {t("Nil rated and exempted supplies")}</p>
        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          <Cell label={t("Value")} value={formatMoney(outward.nil)} />
          <Cell label={t("Tax")} value={formatMoney(0)} />
        </div>
        <p className="mt-2 text-xs text-muted">
          {t("Items sold at 0% GST this month. Kept out of 3.1(a), same as Table 8 of GSTR-1.")}
        </p>
      </section>

      <section className="neu-card p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">3.2 {t("Inter-state supplies to unregistered persons")}</p>
        {table32.length === 0 ? (
          <p className="text-xs text-muted">{t("None this month — every sale to a buyer in another state was to a GSTIN, or there were none.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1 pr-2 font-medium">{t("Place of supply")}</th>
                  <th className="py-1 pr-2 text-right font-medium">{t("Taxable")}</th>
                  <th className="py-1 text-right font-medium">IGST</th>
                </tr>
              </thead>
              <tbody>
                {table32.map((g) => (
                  <tr key={g.state} className="border-t border-border">
                    <td className="py-1.5 pr-2 text-foreground">{g.state}</td>
                    <td className="py-1.5 pr-2 text-right text-foreground">{formatMoney(g.taxable)}</td>
                    <td className="py-1.5 text-right text-foreground">{formatMoney(g.igst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">
          {t("Already counted inside 3.1(a) — the portal asks for this state-wise split separately.")}
        </p>
      </section>

      <section className="neu-card p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">
          3.1(d) Inward supplies liable to reverse charge
        </p>
        <TotalsGrid taxable={rcm.taxable} cgst={rcm.cgst} sgst={rcm.sgst} igst={rcm.igst} />
        <p className="mt-2 text-xs text-muted">
          {t("You remit this tax directly to the government rather than paying it to the vendor.")}
        </p>
      </section>

      <section className="neu-card p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">4. ITC available</p>
        <TotalsGrid taxable={itc.taxable} cgst={itc.cgst} sgst={itc.sgst} igst={itc.igst} />
        <p className="mt-2 text-xs text-muted">
          {t("From purchases marked \"ITC eligible\" this period — this app's own purchase register, not a GSTN-verified GSTR-2B match.")}
        </p>
      </section>

      <section className="rounded-xl border border-border bg-brand-soft p-4">
        <p className="mb-3 text-sm font-semibold text-brand-text">{t("Net tax payable (estimate)")}</p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <NetCell label="CGST" value={netCgst} />
          <NetCell label="SGST" value={netSgst} />
          <NetCell label="IGST" value={netIgst} />
        </div>
        <p className="mt-3 text-center text-lg font-semibold text-brand-text">
          {formatMoney(netPayable)} estimated cash payable
        </p>
      </section>
    </div>
  );
}

function sumFields(rows: { taxable_amount?: number; cgst_amount: number; sgst_amount: number; igst_amount: number }[]) {
  return rows.reduce(
    (acc, r) => ({
      taxable: acc.taxable + Number(r.taxable_amount ?? 0),
      cgst: acc.cgst + Number(r.cgst_amount),
      sgst: acc.sgst + Number(r.sgst_amount),
      igst: acc.igst + Number(r.igst_amount),
    }),
    { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
  );
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function TotalsGrid({ taxable, cgst, sgst, igst }: { taxable: number; cgst: number; sgst: number; igst: number }) {
  return (
    <div className="grid grid-cols-4 gap-2 text-center text-xs">
      <Cell label="Taxable" value={formatMoney(taxable)} />
      <Cell label="CGST" value={formatMoney(cgst)} />
      <Cell label="SGST" value={formatMoney(sgst)} />
      <Cell label="IGST" value={formatMoney(igst)} />
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background px-1 py-2">
      <p className="text-muted">{label}</p>
      {/* Lakh amounts ("₹1,26,813.86") must fit a quarter of a phone screen. */}
      <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-foreground sm:text-xs">{value}</p>
    </div>
  );
}

function SplitRow({ label, href, part }: { label: string; href: string; part: { taxable: number; cgst: number; sgst: number; igst: number } }) {
  return (
    <tr className="border-t border-border">
      <td className="py-1.5 pr-2">
        <Link href={href} className="font-medium text-brand-text underline-offset-2 hover:underline">{label}</Link>
      </td>
      <td className="py-1.5 pr-2 text-right text-foreground">{formatMoney(part.taxable)}</td>
      <td className="py-1.5 text-right text-foreground">{formatMoney(round2(part.cgst + part.sgst + part.igst))}</td>
    </tr>
  );
}

function NetCell({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-brand-text/70">{label}</p>
      <p className="text-sm font-semibold text-brand-text">{formatMoney(Math.max(0, value))}</p>
    </div>
  );
}
