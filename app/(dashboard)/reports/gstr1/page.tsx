import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { round2 } from "@/lib/gst";
import { istMonthRange, istYearMonth, MONTHS } from "@/lib/dateHelpers";
import { PeriodPicker } from "../PeriodPicker";
import { Gstr1Client } from "./Gstr1Client";
import { getTranslator } from "@/lib/i18n/server";
import { BackLink } from "@/app/components/BackLink";

export default async function Gstr1Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { t } = await getTranslator();
  const { year: yearParam, month: monthParam } = await searchParams;
  const now = istYearMonth();
  const year = Number(yearParam) || now.year;
  const month = Number(monthParam) || now.month; // 1-12

  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  // Month boundaries at IST midnight, not the UTC server's.
  const { start, end } = istMonthRange(year, month);

  const [{ data: bills }, { data: restaurantOrders }, { data: rentals }, { data: returnsRaw }] = await Promise.all([
    admin
      .from("bills")
      .select(
        "id, invoice_number, created_at, taxable_amount, supply_type, cgst_amount, sgst_amount, igst_amount, total, customers ( name, gstin, state, state_code )",
      )
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("invoice_number"),
    // Restaurant sales never touch `bills` — without folding them in here,
    // a restaurant's entire outward-supply GST filing would silently miss
    // every table's revenue. Dine-in customers essentially never carry a
    // registered GSTIN, so these are added straight into B2C Small + the
    // HSN/SAC summary, same as any other unregistered walk-in sale.
    admin
      .from("restaurant_orders")
      .select("id, taxable_amount, cgst_amount, sgst_amount, igst_amount, total")
      .eq("shop_id", session.shopId)
      .eq("status", "settled")
      .gte("settled_at", start.toISOString())
      .lt("settled_at", end.toISOString()),
    // Same reasoning for rentals — their own table, never `bills`.
    admin
      .from("rentals")
      .select("id, rental_number, created_at, subtotal, supply_type, cgst_amount, sgst_amount, igst_amount, total, customers ( name, gstin, state, state_code )")
      .eq("shop_id", session.shopId)
      .neq("status", "cancelled")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString()),
    // Credit notes (returns) belong to the month they're issued in, whatever month the
    // original sale was — and are classified by who that original sale was to.
    admin
      .from("returns")
      .select("id, return_number, created_at, total, cgst_amount, sgst_amount, igst_amount, bills ( invoice_number, created_at, status, supply_type, total, customers ( name, gstin, state, state_code ) )")
      .eq("shop_id", session.shopId)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("return_number"),
  ]);

  type ReturnBill = { invoice_number: string; created_at: string; status: string; supply_type: "intra" | "inter"; total: number; customers: BillRow["customers"] };
  const creditNotes = (returnsRaw ?? [])
    .map((r) => {
      const bill = (Array.isArray(r.bills) ? r.bills[0] : r.bills) as unknown as ReturnBill | null;
      const customer = bill ? (Array.isArray(bill.customers) ? bill.customers[0] : bill.customers) : null;
      return { ...r, bill, customer: customer ?? null };
    })
    // A bill voided after being partly returned is already out of the report entirely;
    // its credit note must not reduce the tax a second time.
    .filter((r) => r.bill && r.bill.status === "active");
  const creditNoteIds = creditNotes.map((r) => r.id);
  const { data: creditNoteItems } = creditNoteIds.length
    ? await admin
        .from("return_items")
        .select("return_id, quantity, gst_percent, line_total, cgst_amount, sgst_amount, igst_amount, bill_items ( hsn_code )")
        .in("return_id", creditNoteIds)
    : { data: [] as never[] };
  const creditNoteLines = (creditNoteItems ?? []).map((i) => {
    const billItem = Array.isArray(i.bill_items) ? i.bill_items[0] : i.bill_items;
    const cgst = Number(i.cgst_amount), sgst = Number(i.sgst_amount), igst = Number(i.igst_amount);
    return { returnId: i.return_id, hsn: (billItem as { hsn_code: string | null } | null)?.hsn_code ?? "—", rate: Number(i.gst_percent), qty: Number(i.quantity), taxable: Number(i.line_total) - cgst - sgst - igst, cgst, sgst, igst };
  });

  const billIds = (bills ?? []).map((b) => b.id);
  const restaurantOrderIds = (restaurantOrders ?? []).map((o) => o.id);
  const rentalIds = (rentals ?? []).map((r) => r.id);

  // Each of these depends only on its own parent above, so they're
  // independent of each other and can run concurrently too.
  const [{ data: items }, { data: restaurantItems }, { data: rentalItems }] = await Promise.all([
    billIds.length
      ? admin
          .from("bill_items")
          .select("bill_id, hsn_code, quantity, unit_price, gst_percent, line_subtotal, cgst_amount, sgst_amount, igst_amount, line_total")
          .in("bill_id", billIds)
      : Promise.resolve({ data: [] as never[] }),
    restaurantOrderIds.length
      ? admin
          .from("restaurant_order_items")
          .select("order_id, quantity, gst_percent, line_subtotal, cgst_amount, sgst_amount, igst_amount")
          .in("order_id", restaurantOrderIds)
      : Promise.resolve({ data: [] as never[] }),
    rentalIds.length
      ? admin.from("rental_items").select("rental_id, product_id, quantity, gst_percent, line_subtotal, cgst_amount, sgst_amount, igst_amount").in("rental_id", rentalIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const normalizedRentals = (rentals ?? []).map((r) => {
    const customer = Array.isArray(r.customers) ? r.customers[0] : r.customers;
    return { ...r, customer: customer ?? null };
  });

  const rentalProductIds = [...new Set((rentalItems ?? []).map((i) => i.product_id).filter(Boolean))] as string[];
  const { data: rentalProducts } = rentalProductIds.length
    ? await admin.from("products").select("id, hsn_code").in("id", rentalProductIds)
    : { data: [] as never[] };
  const hsnByProduct = new Map((rentalProducts ?? []).map((p) => [p.id, p.hsn_code]));

  type BillRow = {
    id: string;
    invoice_number: string;
    created_at: string;
    taxable_amount: number;
    supply_type: "intra" | "inter";
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    total: number;
    customers: { name: string; gstin: string | null; state: string | null; state_code: string | null } | { name: string; gstin: string | null; state: string | null; state_code: string | null }[] | null;
  };

  const normalizedBills = (bills ?? []).map((b) => {
    const row = b as unknown as BillRow;
    const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    return { ...row, customer: customer ?? null };
  });

  // 0% items (nil-rated, exempt or non-GST) are reported only in Table 8 — never in Tables 4, 5
  // or 7. `nilByBill` is the 0% part of each bill, taken out of that bill's B2B/B2CL row.
  const nilByBill = new Map<string, number>();
  for (const item of items ?? []) {
    if (Number(item.gst_percent) === 0) nilByBill.set(item.bill_id, round2((nilByBill.get(item.bill_id) ?? 0) + Number(item.line_subtotal)));
  }
  const nilByRental = new Map<string, number>();
  for (const item of rentalItems ?? []) {
    if (Number(item.gst_percent) === 0) nilByRental.set(item.rental_id, round2((nilByRental.get(item.rental_id) ?? 0) + Number(item.line_subtotal)));
  }
  const table8 = new Map<string, number>();
  const addNil = (registered: boolean, inter: boolean, value: number) => {
    const key = `${inter ? "Inter" : "Intra"}-state supplies to ${registered ? "registered" : "unregistered"} persons`;
    table8.set(key, round2((table8.get(key) ?? 0) + value));
  };
  for (const b of normalizedBills) {
    const nil = nilByBill.get(b.id);
    if (nil) addNil(!!b.customer?.gstin, b.supply_type === "inter", nil);
  }
  for (const r of normalizedRentals) {
    const nil = nilByRental.get(r.id);
    if (nil) addNil(!!r.customer?.gstin, r.supply_type === "inter", nil);
  }
  for (const item of restaurantItems ?? []) {
    if (Number(item.gst_percent) === 0) addNil(false, false, Number(item.line_subtotal));
  }

  const b2b = normalizedBills.filter((b) => b.customer?.gstin);
  const b2cLarge = normalizedBills.filter(
    (b) => !b.customer?.gstin && b.supply_type === "inter" && Number(b.total) > 250000,
  );
  const b2cSmall = normalizedBills.filter((b) => !b2b.includes(b) && !b2cLarge.includes(b));

  const rentalB2b = normalizedRentals.filter((r) => r.customer?.gstin);
  const rentalB2cLarge = normalizedRentals.filter(
    (r) => !r.customer?.gstin && r.supply_type === "inter" && Number(r.total) > 250000,
  );
  const rentalB2cSmall = normalizedRentals.filter((r) => !rentalB2b.includes(r) && !rentalB2cLarge.includes(r));

  // Table 7 — B2C Small: consolidated by (place of supply state, rate)
  const b2cSmallGroups = new Map<
    string,
    { state: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number }
  >();
  for (const bill of b2cSmall) {
    const billItems = (items ?? []).filter((i) => i.bill_id === bill.id);
    for (const item of billItems) {
      if (Number(item.gst_percent) === 0) continue; // Table 8
      const state = bill.customer?.state ?? "Same state (walk-in)";
      const key = `${state}__${item.gst_percent}`;
      const g = b2cSmallGroups.get(key) ?? { state, rate: Number(item.gst_percent), taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      g.taxable += Number(item.line_subtotal);
      g.cgst += Number(item.cgst_amount);
      g.sgst += Number(item.sgst_amount);
      g.igst += Number(item.igst_amount);
      b2cSmallGroups.set(key, g);
    }
  }

  const rentalB2cSmallIds = new Set(rentalB2cSmall.map((r) => r.id));
  for (const item of rentalItems ?? []) {
    if (!rentalB2cSmallIds.has(item.rental_id) || Number(item.gst_percent) === 0) continue;
    const rental = rentalB2cSmall.find((r) => r.id === item.rental_id);
    const state = rental?.customer?.state ?? "Same state (walk-in)";
    const key = `${state}__${item.gst_percent}`;
    const g = b2cSmallGroups.get(key) ?? { state, rate: Number(item.gst_percent), taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    g.taxable += Number(item.line_subtotal);
    g.cgst += Number(item.cgst_amount);
    g.sgst += Number(item.sgst_amount);
    g.igst += Number(item.igst_amount);
    b2cSmallGroups.set(key, g);
  }

  for (const item of restaurantItems ?? []) {
    if (Number(item.gst_percent) === 0) continue; // Table 8
    const key = `Same state (walk-in)__${item.gst_percent}`;
    const g = b2cSmallGroups.get(key) ?? { state: "Same state (walk-in)", rate: Number(item.gst_percent), taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    g.taxable += Number(item.line_subtotal);
    g.cgst += Number(item.cgst_amount);
    g.sgst += Number(item.sgst_amount);
    g.igst += Number(item.igst_amount);
    b2cSmallGroups.set(key, g);
  }

  // Table 12 — HSN summary across ALL bills in the period
  const hsnGroups = new Map<
    string,
    { hsn: string; rate: number; qty: number; taxable: number; cgst: number; sgst: number; igst: number }
  >();
  for (const item of items ?? []) {
    const key = `${item.hsn_code ?? "—"}__${item.gst_percent}`;
    const g = hsnGroups.get(key) ?? {
      hsn: item.hsn_code ?? "—",
      rate: Number(item.gst_percent),
      qty: 0,
      taxable: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
    };
    g.qty += Number(item.quantity);
    g.taxable += Number(item.line_subtotal);
    g.cgst += Number(item.cgst_amount);
    g.sgst += Number(item.sgst_amount);
    g.igst += Number(item.igst_amount);
    hsnGroups.set(key, g);
  }
  for (const item of restaurantItems ?? []) {
    const key = `—__${item.gst_percent}`;
    const g = hsnGroups.get(key) ?? { hsn: "—", rate: Number(item.gst_percent), qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    g.qty += Number(item.quantity);
    g.taxable += Number(item.line_subtotal);
    g.cgst += Number(item.cgst_amount);
    g.sgst += Number(item.sgst_amount);
    g.igst += Number(item.igst_amount);
    hsnGroups.set(key, g);
  }
  for (const item of rentalItems ?? []) {
    const hsn = (item.product_id && hsnByProduct.get(item.product_id)) || "—";
    const key = `${hsn}__${item.gst_percent}`;
    const g = hsnGroups.get(key) ?? { hsn, rate: Number(item.gst_percent), qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    g.qty += Number(item.quantity);
    g.taxable += Number(item.line_subtotal);
    g.cgst += Number(item.cgst_amount);
    g.sgst += Number(item.sgst_amount);
    g.igst += Number(item.igst_amount);
    hsnGroups.set(key, g);
  }

  // Credit notes. Registered buyer → Table 9B CDNR; unregistered but the original sale was
  // B2C Large → Table 9B CDNUR; every other B2C return is netted out of Table 7, which is
  // reported net of credit notes. Table 12 (HSN) is reported net of all of them.
  const isCdnur = (cn: (typeof creditNotes)[number]) => !cn.customer?.gstin && cn.bill!.supply_type === "inter" && Number(cn.bill!.total) > 250000;
  const toNoteRow = (cn: (typeof creditNotes)[number]) => {
    const rates = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
    for (const l of creditNoteLines.filter((x) => x.returnId === cn.id)) {
      const g = rates.get(l.rate) ?? { rate: l.rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      g.taxable = round2(g.taxable + l.taxable);
      g.cgst = round2(g.cgst + l.cgst);
      g.sgst = round2(g.sgst + l.sgst);
      g.igst = round2(g.igst + l.igst);
      rates.set(l.rate, g);
    }
    return {
      gstin: cn.customer?.gstin ?? null,
      name: cn.customer?.name ?? "Unregistered",
      noteNumber: cn.return_number,
      date: cn.created_at,
      againstInvoice: cn.bill!.invoice_number,
      againstDate: cn.bill!.created_at,
      placeOfSupply: cn.customer?.state ?? "Same state",
      value: Number(cn.total),
      rates: [...rates.values()],
    };
  };
  const cdnr = creditNotes.filter((cn) => cn.customer?.gstin).map(toNoteRow);
  const cdnur = creditNotes.filter((cn) => isCdnur(cn)).map(toNoteRow);
  const nettedInB2cs = new Set(creditNotes.filter((cn) => !cn.customer?.gstin && !isCdnur(cn)).map((cn) => cn.id));
  for (const l of creditNoteLines) {
    if (nettedInB2cs.has(l.returnId) && l.rate === 0) {
      addNil(false, creditNotes.find((x) => x.id === l.returnId)!.bill!.supply_type === "inter", -l.taxable);
    } else if (nettedInB2cs.has(l.returnId)) {
      const cn = creditNotes.find((x) => x.id === l.returnId)!;
      const state = cn.customer?.state ?? "Same state (walk-in)";
      const key = `${state}__${l.rate}`;
      const g = b2cSmallGroups.get(key) ?? { state, rate: l.rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      g.taxable -= l.taxable;
      g.cgst -= l.cgst;
      g.sgst -= l.sgst;
      g.igst -= l.igst;
      b2cSmallGroups.set(key, g);
    }
    const key = `${l.hsn}__${l.rate}`;
    const h = hsnGroups.get(key) ?? { hsn: l.hsn, rate: l.rate, qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    h.qty -= l.qty;
    h.taxable -= l.taxable;
    h.cgst -= l.cgst;
    h.sgst -= l.sgst;
    h.igst -= l.igst;
    hsnGroups.set(key, h);
  }
  const roundGroup = <T extends { taxable: number; cgst: number; sgst: number; igst: number }>(g: T): T => ({ ...g, taxable: round2(g.taxable), cgst: round2(g.cgst), sgst: round2(g.sgst), igst: round2(g.igst) });
  const creditNoteTaxable = round2(creditNoteLines.reduce((s, l) => s + l.taxable, 0));
  const creditNoteTax = round2(creditNoteLines.reduce((s, l) => s + l.cgst + l.sgst + l.igst, 0));

  const invoiceNumbers = normalizedBills.map((b) => b.invoice_number).sort();
  const totalTaxable =
    normalizedBills.reduce((s, b) => s + Number(b.taxable_amount), 0) +
    (restaurantOrders ?? []).reduce((s, o) => s + Number(o.taxable_amount), 0) +
    normalizedRentals.reduce((s, r) => s + Number(r.subtotal), 0) -
    creditNoteTaxable;
  const totalTax =
    normalizedBills.reduce((s, b) => s + Number(b.cgst_amount) + Number(b.sgst_amount) + Number(b.igst_amount), 0) +
    (restaurantOrders ?? []).reduce((s, o) => s + Number(o.cgst_amount) + Number(o.sgst_amount) + Number(o.igst_amount), 0) +
    normalizedRentals.reduce((s, r) => s + Number(r.cgst_amount) + Number(r.sgst_amount) + Number(r.igst_amount), 0) -
    creditNoteTax;

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/reports" />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight text-foreground md:text-2xl">{t("GSTR-1")}</h1>
        <PeriodPicker year={year} month={month} />
      </div>
      <p className="text-sm text-muted">
        {MONTHS[month - 1]} {year} · {t("Outward supplies")}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label={t("Taxable value")} value={formatMoney(totalTaxable)} />
        <SummaryCard label={t("Total tax")} value={formatMoney(totalTax)} />
      </div>
      {creditNotes.length > 0 && (
        <p className="-mt-2 text-xs text-muted">
          {t("Net of credit notes issued this month")}: {creditNotes.length} · −{formatMoney(creditNoteTax)} {t("tax")}
        </p>
      )}

      {normalizedBills.length === 0 && (restaurantOrders ?? []).length === 0 && normalizedRentals.length === 0 && creditNotes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          No sales invoices in this period.
        </p>
      ) : (
        <Gstr1Client
          period={`${MONTHS[month - 1]}-${year}`}
          b2b={b2b
            .map((b) => ({
              gstin: b.customer!.gstin!,
              name: b.customer!.name,
              invoiceNumber: b.invoice_number,
              date: b.created_at,
              taxable: round2(Number(b.taxable_amount) - (nilByBill.get(b.id) ?? 0)),
              cgst: Number(b.cgst_amount),
              sgst: Number(b.sgst_amount),
              igst: Number(b.igst_amount),
              total: Number(b.total),
            }))
            .concat(
              rentalB2b.map((r) => ({
                gstin: r.customer!.gstin!,
                name: r.customer!.name,
                invoiceNumber: r.rental_number,
                date: r.created_at,
                taxable: round2(Number(r.subtotal) - (nilByRental.get(r.id) ?? 0)),
                cgst: Number(r.cgst_amount),
                sgst: Number(r.sgst_amount),
                igst: Number(r.igst_amount),
                total: Number(r.total),
              })),
            )
            // an invoice with nothing but 0% items belongs only in Table 8
            .filter((row) => row.taxable > 0)}
          b2cLarge={b2cLarge
            .map((b) => ({
              invoiceNumber: b.invoice_number,
              date: b.created_at,
              state: b.customer?.state ?? "—",
              taxable: round2(Number(b.taxable_amount) - (nilByBill.get(b.id) ?? 0)),
              igst: Number(b.igst_amount),
              total: Number(b.total),
            }))
            .concat(
              rentalB2cLarge.map((r) => ({
                invoiceNumber: r.rental_number,
                date: r.created_at,
                state: r.customer?.state ?? "—",
                taxable: round2(Number(r.subtotal) - (nilByRental.get(r.id) ?? 0)),
                igst: Number(r.igst_amount),
                total: Number(r.total),
              })),
            )
            .filter((row) => row.taxable > 0)}
          b2cSmall={[...b2cSmallGroups.values()].map(roundGroup)}
          nilRated={[...table8.entries()].map(([label, value]) => ({ label, value }))}
          hsnSummary={[...hsnGroups.values()].map((h) => ({ ...roundGroup(h), qty: Math.round(h.qty * 1000) / 1000 }))}
          creditNotesRegistered={cdnr}
          creditNotesUnregistered={cdnur}
          invoiceNumbers={invoiceNumbers}
          creditNoteNumbers={creditNotes.map((cn) => cn.return_number).sort()}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="neu-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
