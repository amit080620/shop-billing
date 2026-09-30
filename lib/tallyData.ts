import type { createSupabaseAdminClient } from "./supabase/admin";
import { buildTallyXml, type TallyInvoice, type TallyMoney, type TallyParty } from "./tally";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const istDate = (ts: string) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

async function inChunks<T>(ids: string[], load: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 200) out.push(...(await load(ids.slice(i, i + 200))));
  return out;
}

/** Names as Tally ledgers: one per party; two different parties with one name get their phone's last digits. */
function ledgerNames(rows: { id: string; name: string; phone: string | null }[]): Map<string, string> {
  const count = new Map<string, number>();
  for (const r of rows) count.set(r.name.trim().toLowerCase(), (count.get(r.name.trim().toLowerCase()) ?? 0) + 1);
  return new Map(rows.map((r) => [r.id, (count.get(r.name.trim().toLowerCase()) ?? 0) > 1 && r.phone ? `${r.name.trim()} (${r.phone.slice(-4)})` : r.name.trim()]));
}

/** The shop's sales, receipts, purchases and payments between two dates, as Tally's two import files. */
export async function loadTallyExport(admin: Admin, shopId: string, from: string, to: string) {
  const fromTs = `${from}T00:00:00+05:30`;
  const toTs = `${to}T23:59:59.999+05:30`;

  const [{ data: bills }, { data: pays }, { data: purchases }, { data: vendorPays }] = await Promise.all([
    admin.from("bills").select("id, invoice_number, created_at, customer_id, buyer_name, buyer_gstin, buyer_state, taxable_amount, cgst_amount, sgst_amount, igst_amount, total, paid_amount, payment_method").eq("shop_id", shopId).eq("status", "active").gte("created_at", fromTs).lte("created_at", toTs).order("created_at").limit(20000),
    admin.from("payments").select("id, customer_id, amount, payment_method, created_at").eq("shop_id", shopId).gte("created_at", fromTs).lte("created_at", toTs).order("created_at").limit(20000),
    admin.from("purchases").select("id, vendor_id, vendor_invoice_number, purchase_date, taxable_amount, cgst_amount, sgst_amount, igst_amount, total, paid_amount, payment_method").eq("shop_id", shopId).gte("purchase_date", from).lte("purchase_date", to).order("purchase_date").limit(20000),
    admin.from("purchase_payments").select("id, vendor_id, amount, payment_method, created_at").eq("shop_id", shopId).gte("created_at", fromTs).lte("created_at", toTs).order("created_at").limit(20000),
  ]);

  const billItems = await inChunks((bills ?? []).map((b) => b.id), async (ids) => (await admin.from("bill_items").select("bill_id, gst_percent, line_subtotal").in("bill_id", ids)).data ?? []);
  const purchaseItems = await inChunks((purchases ?? []).map((p) => p.id), async (ids) => (await admin.from("purchase_items").select("purchase_id, gst_percent, line_subtotal").in("purchase_id", ids)).data ?? []);
  const customerIds = [...new Set([...(bills ?? []).map((b) => b.customer_id), ...(pays ?? []).map((p) => p.customer_id)].filter((x): x is string => !!x))];
  const vendorIds = [...new Set([...(purchases ?? []).map((p) => p.vendor_id), ...(vendorPays ?? []).map((p) => p.vendor_id)])];
  const customers = await inChunks(customerIds, async (ids) => (await admin.from("customers").select("id, name, phone, gstin, state").in("id", ids)).data ?? []);
  const vendors = await inChunks(vendorIds, async (ids) => (await admin.from("vendors").select("id, name, phone, gstin, state").in("id", ids)).data ?? []);

  const customerLedger = ledgerNames(customers);
  const vendorLedger = ledgerNames(vendors);
  const parties: TallyParty[] = [
    ...customers.map((c) => ({ name: customerLedger.get(c.id)!, group: "Sundry Debtors" as const, gstin: c.gstin, state: c.state })),
    ...vendors.map((v) => ({ name: vendorLedger.get(v.id)!, group: "Sundry Creditors" as const, gstin: v.gstin, state: v.state })),
  ];

  const itemsByBill = new Map<string, { rate: number; taxable: number }[]>();
  for (const i of billItems) itemsByBill.set(i.bill_id, [...(itemsByBill.get(i.bill_id) ?? []), { rate: Number(i.gst_percent), taxable: Number(i.line_subtotal) }]);
  const sales: TallyInvoice[] = (bills ?? []).map((b) => {
    // A B2B buyer typed on the bill (no saved customer) is still a party in the books.
    let party = b.customer_id ? (customerLedger.get(b.customer_id) ?? null) : null;
    if (!party && b.buyer_name) {
      party = b.buyer_name.trim();
      if (!parties.some((p) => p.name === party)) parties.push({ name: party, group: "Sundry Debtors", gstin: b.buyer_gstin, state: b.buyer_state });
    }
    return {
      number: b.invoice_number,
      date: istDate(b.created_at),
      party,
      method: b.payment_method,
      byRate: itemsByBill.get(b.id) ?? [],
      taxable: Number(b.taxable_amount),
      cgst: Number(b.cgst_amount),
      sgst: Number(b.sgst_amount),
      igst: Number(b.igst_amount),
      total: Number(b.total),
      paid: Number(b.paid_amount),
    };
  });
  const receipts: TallyMoney[] = (pays ?? [])
    .filter((p) => p.payment_method !== "adjustment" && customerLedger.has(p.customer_id))
    .map((p) => ({ date: istDate(p.created_at), party: customerLedger.get(p.customer_id)!, amount: Number(p.amount), method: p.payment_method }));

  const itemsByPurchase = new Map<string, { rate: number; taxable: number }[]>();
  for (const i of purchaseItems) itemsByPurchase.set(i.purchase_id, [...(itemsByPurchase.get(i.purchase_id) ?? []), { rate: Number(i.gst_percent), taxable: Number(i.line_subtotal) }]);
  const buys = (purchases ?? [])
    .filter((p) => vendorLedger.has(p.vendor_id))
    .map((p) => ({
      number: p.vendor_invoice_number,
      date: p.purchase_date,
      party: vendorLedger.get(p.vendor_id)!,
      method: p.payment_method,
      byRate: itemsByPurchase.get(p.id) ?? [],
      taxable: Number(p.taxable_amount),
      cgst: Number(p.cgst_amount),
      sgst: Number(p.sgst_amount),
      igst: Number(p.igst_amount),
      total: Number(p.total),
      paid: Number(p.paid_amount),
    }));
  const payments: TallyMoney[] = (vendorPays ?? [])
    .filter((p) => vendorLedger.has(p.vendor_id))
    .map((p) => ({ date: istDate(p.created_at), party: vendorLedger.get(p.vendor_id)!, amount: Number(p.amount), method: p.payment_method }));

  return { ...buildTallyXml({ parties, sales, receipts, purchases: buys, payments }), counts: { sales: sales.length, receipts: receipts.length, purchases: buys.length, payments: payments.length } };
}
