import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { istMonthRange, istYearMonth, MONTHS } from "@/lib/dateHelpers";
import { PeriodPicker } from "../PeriodPicker";
import { ExportCsvButton } from "@/app/components/ExportCsvButton";
import { getTranslator } from "@/lib/i18n/server";
import { BackLink } from "@/app/components/BackLink";
import { buyerSchemaReady } from "@/lib/gstBuyer";

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

  const [{ data: bills }, { data: purchases }, { data: restaurantOrders }, { data: rentals }, { data: returnsRaw }] = await Promise.all([
    admin
      .from("bills")
      .select("taxable_amount, cgst_amount, sgst_amount, igst_amount")
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
      .select("taxable_amount, cgst_amount, sgst_amount, igst_amount")
      .eq("shop_id", session.shopId)
      .eq("status", "settled")
      .gte("settled_at", start.toISOString())
      .lt("settled_at", end.toISOString()),
    // Same reasoning for rentals — their own table, never `bills`.
    admin
      .from("rentals")
      .select("subtotal, cgst_amount, sgst_amount, igst_amount")
      .eq("shop_id", session.shopId)
      .neq("status", "cancelled")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString()),
    // Credit notes issued this month reduce this month's output tax, whatever month the
    // original sale was in (same rule GSTR-1 Table 9B follows).
    admin
      .from("returns")
      .select("total, cgst_amount, sgst_amount, igst_amount, bills ( status )")
      .eq("shop_id", session.shopId)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString()),
  ]);

  const creditNotes = sumFields(
    (returnsRaw ?? [])
      .filter((r) => (Array.isArray(r.bills) ? r.bills[0] : r.bills)?.status === "active")
      .map((r) => ({ taxable_amount: Number(r.total) - Number(r.cgst_amount) - Number(r.sgst_amount) - Number(r.igst_amount), cgst_amount: r.cgst_amount, sgst_amount: r.sgst_amount, igst_amount: r.igst_amount })),
  );
  // Debit notes issued this month raise it again (the other half of the same rule).
  const { data: debitRaw } = (await buyerSchemaReady(admin))
    ? await admin
        .from("debit_notes")
        .select("taxable_amount, cgst_amount, sgst_amount, igst_amount, bills ( status )")
        .eq("shop_id", session.shopId)
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString())
    : { data: [] as never[] };
  const debitNotes = sumFields((debitRaw ?? []).filter((d) => (Array.isArray(d.bills) ? d.bills[0] : d.bills)?.status === "active"));
  const sales = sumFields([
    ...(bills ?? []),
    ...(restaurantOrders ?? []),
    ...(rentals ?? []).map((r) => ({ taxable_amount: r.subtotal, cgst_amount: r.cgst_amount, sgst_amount: r.sgst_amount, igst_amount: r.igst_amount })),
  ]);
  const outward = {
    taxable: round2(sales.taxable - creditNotes.taxable + debitNotes.taxable),
    cgst: round2(sales.cgst - creditNotes.cgst + debitNotes.cgst),
    sgst: round2(sales.sgst - creditNotes.sgst + debitNotes.sgst),
    igst: round2(sales.igst - creditNotes.igst + debitNotes.igst),
  };
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
              ["3.1(d) Inward supplies (RCM)", rcm.taxable.toFixed(2), rcm.cgst.toFixed(2), rcm.sgst.toFixed(2), rcm.igst.toFixed(2)],
              ["4 ITC available", itc.taxable.toFixed(2), itc.cgst.toFixed(2), itc.sgst.toFixed(2), itc.igst.toFixed(2)],
              ["Net payable (same-head, simplified)", "", netCgst.toFixed(2), netSgst.toFixed(2), netIgst.toFixed(2)],
            ]}
          />
        </div>
        <TotalsGrid taxable={outward.taxable} cgst={outward.cgst} sgst={outward.sgst} igst={outward.igst} />
        {creditNotes.cgst + creditNotes.sgst + creditNotes.igst + creditNotes.taxable > 0 && (
          <p className="mt-2 text-xs text-muted">
            {t("Net of credit notes (returns) issued this month")}: −{formatMoney(creditNotes.taxable)} {t("taxable")}, −{formatMoney(round2(creditNotes.cgst + creditNotes.sgst + creditNotes.igst))} {t("tax")}
          </p>
        )}
        {debitNotes.taxable > 0 && (
          <p className="mt-1 text-xs text-muted">
            {t("Includes debit notes issued this month")}: +{formatMoney(debitNotes.taxable)} {t("taxable")}, +{formatMoney(round2(debitNotes.cgst + debitNotes.sgst + debitNotes.igst))} {t("tax")}
          </p>
        )}
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
    <div className="rounded-lg bg-background p-2">
      <p className="text-muted">{label}</p>
      <p className="mt-0.5 font-semibold text-foreground">{value}</p>
    </div>
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
