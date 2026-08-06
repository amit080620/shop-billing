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
    .eq("status", "active")
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

  // Restaurant sales never touch `bills` — without folding them in here,
  // a restaurant's entire outward-supply GST filing would silently miss
  // every table's revenue. Dine-in customers essentially never carry a
  // registered GSTIN, so these are added straight into B2C Small + the
  // HSN/SAC summary, same as any other unregistered walk-in sale.
  const { data: restaurantOrders } = await admin
    .from("restaurant_orders")
    .select("id, taxable_amount, cgst_amount, sgst_amount, igst_amount, total")
    .eq("shop_id", session.shopId)
    .eq("status", "settled")
    .gte("settled_at", start.toISOString())
    .lt("settled_at", end.toISOString());
  const restaurantOrderIds = (restaurantOrders ?? []).map((o) => o.id);
  const { data: restaurantItems } = restaurantOrderIds.length
    ? await admin
        .from("restaurant_order_items")
        .select("order_id, quantity, gst_percent, line_subtotal, cgst_amount, sgst_amount, igst_amount")
        .in("order_id", restaurantOrderIds)
    : { data: [] as never[] };

  // Same reasoning for rentals — their own table, never `bills`.
  const { data: rentals } = await admin
    .from("rentals")
    .select("id, rental_number, created_at, subtotal, supply_type, cgst_amount, sgst_amount, igst_amount, total, customers ( name, gstin, state, state_code )")
    .eq("shop_id", session.shopId)
    .neq("status", "cancelled")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());
  const normalizedRentals = (rentals ?? []).map((r) => {
    const customer = Array.isArray(r.customers) ? r.customers[0] : r.customers;
    return { ...r, customer: customer ?? null };
  });

  const rentalIds = (rentals ?? []).map((r) => r.id);
  const { data: rentalItems } = rentalIds.length
    ? await admin.from("rental_items").select("rental_id, product_id, quantity, gst_percent, line_subtotal, cgst_amount, sgst_amount, igst_amount").in("rental_id", rentalIds)
    : { data: [] as never[] };
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
    if (!rentalB2cSmallIds.has(item.rental_id)) continue;
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

  const invoiceNumbers = normalizedBills.map((b) => b.invoice_number).sort();
  const totalTaxable =
    normalizedBills.reduce((s, b) => s + Number(b.taxable_amount), 0) +
    (restaurantOrders ?? []).reduce((s, o) => s + Number(o.taxable_amount), 0) +
    normalizedRentals.reduce((s, r) => s + Number(r.subtotal), 0);
  const totalTax =
    normalizedBills.reduce((s, b) => s + Number(b.cgst_amount) + Number(b.sgst_amount) + Number(b.igst_amount), 0) +
    (restaurantOrders ?? []).reduce((s, o) => s + Number(o.cgst_amount) + Number(o.sgst_amount) + Number(o.igst_amount), 0) +
    normalizedRentals.reduce((s, r) => s + Number(r.cgst_amount) + Number(r.sgst_amount) + Number(r.igst_amount), 0);

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

      {normalizedBills.length === 0 && (restaurantOrders ?? []).length === 0 && normalizedRentals.length === 0 ? (
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
              taxable: Number(b.taxable_amount),
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
                taxable: Number(r.subtotal),
                cgst: Number(r.cgst_amount),
                sgst: Number(r.sgst_amount),
                igst: Number(r.igst_amount),
                total: Number(r.total),
              })),
            )}
          b2cLarge={b2cLarge
            .map((b) => ({
              invoiceNumber: b.invoice_number,
              date: b.created_at,
              state: b.customer?.state ?? "—",
              taxable: Number(b.taxable_amount),
              igst: Number(b.igst_amount),
              total: Number(b.total),
            }))
            .concat(
              rentalB2cLarge.map((r) => ({
                invoiceNumber: r.rental_number,
                date: r.created_at,
                state: r.customer?.state ?? "—",
                taxable: Number(r.subtotal),
                igst: Number(r.igst_amount),
                total: Number(r.total),
              })),
            )}
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
    <div className="rounded-xl border border-border bg-surface shadow-sm p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
