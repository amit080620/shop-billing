import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PeriodPicker, MONTHS } from "../PeriodPicker";
import { Gstr1Client } from "./Gstr1Client";

export default async function Gstr1Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { year: yearParam, month: monthParam } = await searchParams;
  const now = new Date();
  const year = Number(yearParam) || now.getFullYear();
  const month = Number(monthParam) || now.getMonth() + 1; // 1-12

  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const { data: bills } = await admin
    .from("bills")
    .select(
      "id, invoice_number, created_at, taxable_amount, supply_type, cgst_amount, sgst_amount, igst_amount, total, customers ( name, gstin, state, state_code )",
    )
    .eq("shop_id", session.shopId)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("invoice_number");

  const billIds = (bills ?? []).map((b) => b.id);
  const { data: items } = billIds.length
    ? await admin
        .from("bill_items")
        .select("bill_id, hsn_code, quantity, unit_price, gst_percent, line_subtotal, cgst_amount, sgst_amount, igst_amount, line_total")
        .in("bill_id", billIds)
    : { data: [] as never[] };

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

  const b2b = normalizedBills.filter((b) => b.customer?.gstin);
  const b2cLarge = normalizedBills.filter(
    (b) => !b.customer?.gstin && b.supply_type === "inter" && Number(b.total) > 250000,
  );
  const b2cSmall = normalizedBills.filter((b) => !b2b.includes(b) && !b2cLarge.includes(b));

  // Table 7 — B2C Small: consolidated by (place of supply state, rate)
  const b2cSmallGroups = new Map<
    string,
    { state: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number }
  >();
  for (const bill of b2cSmall) {
    const billItems = (items ?? []).filter((i) => i.bill_id === bill.id);
    for (const item of billItems) {
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

  const invoiceNumbers = normalizedBills.map((b) => b.invoice_number).sort();
  const totalTaxable = normalizedBills.reduce((s, b) => s + Number(b.taxable_amount), 0);
  const totalTax = normalizedBills.reduce(
    (s, b) => s + Number(b.cgst_amount) + Number(b.sgst_amount) + Number(b.igst_amount),
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <Link href="/reports" className="text-sm text-muted">
        ← Reports
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">GSTR-1</h1>
        <PeriodPicker year={year} month={month} />
      </div>
      <p className="text-sm text-muted">
        {MONTHS[month - 1]} {year} · Outward supplies
      </p>

      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Taxable value" value={formatMoney(totalTaxable)} />
        <SummaryCard label="Total tax" value={formatMoney(totalTax)} />
      </div>

      {normalizedBills.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          No sales invoices in this period.
        </p>
      ) : (
        <Gstr1Client
          period={`${MONTHS[month - 1]}-${year}`}
          b2b={b2b.map((b) => ({
            gstin: b.customer!.gstin!,
            name: b.customer!.name,
            invoiceNumber: b.invoice_number,
            date: b.created_at,
            taxable: Number(b.taxable_amount),
            cgst: Number(b.cgst_amount),
            sgst: Number(b.sgst_amount),
            igst: Number(b.igst_amount),
            total: Number(b.total),
          }))}
          b2cLarge={b2cLarge.map((b) => ({
            invoiceNumber: b.invoice_number,
            date: b.created_at,
            state: b.customer?.state ?? "—",
            taxable: Number(b.taxable_amount),
            igst: Number(b.igst_amount),
            total: Number(b.total),
          }))}
          b2cSmall={[...b2cSmallGroups.values()]}
          hsnSummary={[...hsnGroups.values()]}
          invoiceNumbers={invoiceNumbers}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
