import { formatDateTime, formatMoney } from "../format";
import { formatIsoDate, todayIso } from "../dateHelpers";
import { calculateTransactionTotals } from "../validation/schemas";
import type { createSupabaseAdminClient } from "../supabase/admin";
import type { A4InvoiceData } from "./A4Renderer";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** A quotation as it is printed — read once for both the shop's own quotation screen and the
 * customer's link (/quote/[id]), so the two never differ. `shopId` limits the read to that shop
 * (the staff screen); without it the quotation's own shop is used (the unguessable id is the key). */
export async function loadQuotationDoc(admin: Admin, quotationId: string, shopId?: string) {
  let query = admin.from("quotations").select("*").eq("id", quotationId);
  if (shopId) query = query.eq("shop_id", shopId);
  const { data: q } = await query.maybeSingle();
  if (!q) return null;

  const [{ data: shop }, { data: invoiceSettings }, { data: customer }] = await Promise.all([
    admin.from("shops").select("name, gstin, logo_url, gst_scheme, price_includes_gst, address_line1, address_line2, city, state, pincode").eq("id", q.shop_id).single(),
    admin.from("invoice_settings").select("tagline, footer_text, terms_and_conditions, bank_details, accent_color").eq("shop_id", q.shop_id).maybeSingle(),
    q.customer_id ? admin.from("customers").select("name, phone, gstin, address, state").eq("id", q.customer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!shop) return null;

  // Line amounts, worked out the way the quotation was (its own discount and place of supply).
  const lines = calculateTransactionTotals({
    items: q.items.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, gstPercent: l.gstPercent })),
    discountType: q.discount_type,
    discountValue: Number(q.discount_value),
    paidAmount: 0,
    supplyType: q.supply_type,
    priceMode: shop.price_includes_gst ? "inclusive" : "exclusive",
  }).lines;
  const isIntra = q.supply_type === "intra";
  const placeOfSupply = isIntra ? `${shop.state ?? "Same state"} (CGST + SGST)` : `${customer?.state ?? "Different state"} (IGST)`;
  const discountLabel = Number(q.discount_amount) > 0 ? `Discount (${q.discount_type === "percent" ? `${Number(q.discount_value)}%` : "flat"})` : null;

  const a4Data: A4InvoiceData = {
    shopName: shop.name,
    shopLogoUrl: shop.logo_url,
    shopAddress: [shop.address_line1, shop.address_line2, shop.city, shop.state, shop.pincode].filter(Boolean).join(", ") || null,
    gstin: shop.gstin,
    isComposition: shop.gst_scheme === "composition",
    tagline: invoiceSettings?.tagline ?? null,
    accentColor: invoiceSettings?.accent_color ?? null,
    invoiceNumber: q.quote_number,
    dateText: formatDateTime(q.created_at),
    customerName: customer?.name ?? q.customer_name,
    customerAddress: customer?.address ?? null,
    customerPhone: customer?.phone ?? q.customer_phone,
    customerGstin: customer?.gstin ?? null,
    placeOfSupplyText: placeOfSupply,
    items: q.items.map((l, i) => ({
      name: l.description,
      hsnCode: l.hsnCode,
      qty: l.quantity,
      rate: l.unitPrice,
      taxPercent: l.gstPercent,
      amount: Math.round(((lines[i]?.lineSubtotal ?? 0) + (lines[i]?.lineGst ?? 0)) * 100) / 100,
    })),
    subtotal: Number(q.subtotal),
    discountLabel,
    discountAmount: Number(q.discount_amount),
    taxableAmount: Number(q.taxable_amount),
    isIntraState: isIntra,
    cgstAmount: Number(q.cgst_amount),
    sgstAmount: Number(q.sgst_amount),
    igstAmount: Number(q.igst_amount),
    roundOffAmount: Number(q.round_off_amount),
    total: Number(q.total),
    paidAmount: 0,
    paymentLabel: "",
    bankDetails: invoiceSettings?.bank_details ?? null,
    termsAndConditions: invoiceSettings?.terms_and_conditions ?? null,
    footerText: invoiceSettings?.footer_text ?? null,
    quotation: { validUntilText: q.valid_until ? formatIsoDate(q.valid_until) : null, notes: q.notes },
  };

  const expired = q.status === "open" && !!q.valid_until && q.valid_until < todayIso();
  return { q, shop, customer, a4Data, placeOfSupply, discountLabel, expired };
}

/** The WhatsApp text of a quotation — laid out like the invoice message: both GSTINs, who it is
 * for, place of supply, GST % per item, the tax split, the total, the date it is valid until, and
 * a link to open or save it as a PDF. */
export function quotationWhatsAppText(doc: NonNullable<Awaited<ReturnType<typeof loadQuotationDoc>>>, pdfUrl: string | null) {
  const { q, a4Data: d, placeOfSupply, discountLabel } = doc;
  const isComposition = !!d.isComposition;
  const itemLines = q.items.map((l, i) => {
    const rate = isComposition ? "" : ` @${l.gstPercent}%`;
    const namePart = (l.quantity === 1 ? l.description : `${l.description} x${l.quantity}`) + rate;
    const amount = d.items[i]?.amount ?? l.unitPrice * l.quantity;
    const pricePart = formatMoney(amount);
    return `${namePart}${".".repeat(Math.max(1, 28 - namePart.length - pricePart.length))}${pricePart}`;
  });
  const lines = [`*${d.shopName}*`];
  if (d.gstin) lines.push(`GSTIN: ${d.gstin}`);
  lines.push(`Hi ${d.customerName ?? "there"}, here's your quotation from ${d.shopName}.`, "");
  lines.push(`*Quotation* · ${q.quote_number}`, `Date: ${d.dateText}`);
  if (d.quotation?.validUntilText) lines.push(`*Valid until: ${d.quotation.validUntilText}*`);
  if (d.customerName || d.customerGstin) {
    lines.push("", `*For:* ${d.customerName ?? ""}`);
    if (d.customerGstin) lines.push(`GSTIN: ${d.customerGstin}`);
    if (d.customerAddress) lines.push(d.customerAddress);
  }
  if (!isComposition) lines.push(`Place of supply: ${placeOfSupply}`);
  lines.push("```", ...itemLines, "```");
  if (Number(q.discount_amount) > 0 || Number(q.cgst_amount) + Number(q.sgst_amount) + Number(q.igst_amount) > 0) lines.push(`Subtotal: ${formatMoney(Number(q.subtotal))}`);
  if (Number(q.discount_amount) > 0) lines.push(`${discountLabel ?? "Discount"}: −${formatMoney(Number(q.discount_amount))}`);
  if (!isComposition) lines.push(`Taxable value: ${formatMoney(Number(q.taxable_amount))}`);
  if (Number(q.cgst_amount) > 0) lines.push(`CGST: ${formatMoney(Number(q.cgst_amount))}`);
  if (Number(q.sgst_amount) > 0) lines.push(`SGST: ${formatMoney(Number(q.sgst_amount))}`);
  if (Number(q.igst_amount) > 0) lines.push(`IGST: ${formatMoney(Number(q.igst_amount))}`);
  if (Math.abs(Number(q.round_off_amount)) >= 0.01) lines.push(`Round off: ${Number(q.round_off_amount) > 0 ? "+" : "−"}${formatMoney(Math.abs(Number(q.round_off_amount)))}`);
  lines.push(`*Total: ${formatMoney(Number(q.total))}*`);
  if (q.notes) lines.push("", q.notes);
  if (pdfUrl) lines.push("", `📄 Quotation PDF: ${pdfUrl}`);
  lines.push("", "_Thank you — reply here to confirm the order._");
  return lines.join("\n");
}
