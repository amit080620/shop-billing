import { FileCode2 } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { addDaysIso, todayIso } from "@/lib/dateHelpers";
import { stateNameForCode } from "@/lib/constants/states";
import { buildEinvoice, buildEwayBill, einvoiceProblems, needsEwayBill, pinFrom, type Invoice } from "@/lib/einvoice";
import { EinvoiceClient } from "./EinvoiceClient";

/** B2B bills of a period as the government's JSON: the e-invoice (IRN) and the e-way bill, to
 * upload on the portals' bulk tools. What would be refused is shown first. */
export default async function EinvoicePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { t } = await getTranslator();
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const sp = await searchParams;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : todayIso();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : addDaysIso(to, -6);

  const [{ data: shop }, { data: bills }] = await Promise.all([
    admin.from("shops").select("name, legal_name, gstin, address_line1, address_line2, city, pincode, state_code, owner_phone").eq("id", session.shopId).single(),
    admin
      .from("bills")
      .select("id, invoice_number, created_at, total, customer_id, buyer_name, buyer_gstin, buyer_address, buyer_state_code")
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .gte("created_at", `${from}T00:00:00+05:30`)
      .lte("created_at", `${to}T23:59:59.999+05:30`)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  const customerIds = [...new Set((bills ?? []).map((b) => b.customer_id).filter((x): x is string => !!x))];
  const { data: customers } = customerIds.length ? await admin.from("customers").select("id, name, gstin, address, state_code, phone").in("id", customerIds) : { data: [] };
  const byCustomer = new Map((customers ?? []).map((c) => [c.id, c]));
  // B2B: a buyer GSTIN on the bill, or on the customer.
  const b2b = (bills ?? []).filter((b) => b.buyer_gstin || (b.customer_id && byCustomer.get(b.customer_id)?.gstin));
  const { data: items } = b2b.length ? await admin.from("bill_items").select("bill_id, product_id, product_name, hsn_code, quantity, gst_percent, line_subtotal, cgst_amount, sgst_amount, igst_amount").in("bill_id", b2b.map((b) => b.id)) : { data: [] };
  const productIds = [...new Set((items ?? []).map((i) => i.product_id).filter((x): x is string => !!x))];
  const { data: units } = productIds.length ? await admin.from("products").select("id, unit").in("id", productIds) : { data: [] };
  const unitOf = new Map((units ?? []).map((u) => [u.id, u.unit]));

  const sellerAddress = [shop?.address_line1, shop?.address_line2].filter(Boolean).join(", ");
  const seller = {
    gstin: shop?.gstin ?? "",
    name: shop?.legal_name || shop?.name || session.shopName,
    address: sellerAddress || shop?.city || "",
    place: shop?.city || stateNameForCode(shop?.state_code) || "",
    pin: Number(shop?.pincode) || pinFrom(sellerAddress),
    stateCode: shop?.state_code ?? "",
    phone: shop?.owner_phone ?? null,
  };
  const rows = b2b.map((b) => {
    const c = b.customer_id ? byCustomer.get(b.customer_id) : undefined;
    const address = (b.buyer_address || c?.address || "").trim();
    const stateCode = b.buyer_state_code || c?.state_code || (b.buyer_gstin || c?.gstin || "").slice(0, 2);
    const inv: Invoice = {
      number: b.invoice_number,
      date: new Date(b.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
      seller,
      buyer: {
        gstin: (b.buyer_gstin || c?.gstin || "").toUpperCase(),
        name: b.buyer_name || c?.name || "",
        address,
        place: address.split(",").map((x) => x.trim()).filter(Boolean).slice(-2, -1)[0] || stateNameForCode(stateCode) || "",
        pin: pinFrom(address),
        stateCode,
        phone: c?.phone ?? null,
      },
      lines: (items ?? [])
        .filter((i) => i.bill_id === b.id)
        .map((i) => ({ name: i.product_name, hsn: i.hsn_code, qty: Number(i.quantity), unit: i.product_id ? (unitOf.get(i.product_id) ?? "NOS") : "NOS", gstPercent: Number(i.gst_percent), taxable: Number(i.line_subtotal), cgst: Number(i.cgst_amount), sgst: Number(i.sgst_amount), igst: Number(i.igst_amount) })),
      total: Number(b.total),
    };
    return { id: b.id, number: b.invoice_number, date: inv.date, buyer: inv.buyer.name, total: inv.total, problems: einvoiceProblems(inv), eway: needsEwayBill(inv), einvoice: buildEinvoice(inv), ewayBill: buildEwayBill(inv) };
  });

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/reports" />
      <PageHeader title={t("E-invoice & e-way bill")} subtitle={t("Government JSON for your B2B bills — upload it on the portal to get the IRN or the e-way bill")} icon={<FileCode2 size={18} strokeWidth={1.8} />} />
      <EinvoiceClient from={from} to={to} rows={rows} />
    </div>
  );
}
