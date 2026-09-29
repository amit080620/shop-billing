import { formatDateTime } from "../format";
import { buyerOf } from "../gstBuyer";
import { buildUpiLink, generateQrDataUrl } from "../qr";
import { goldSchemesReady, loadSchemes } from "../goldSchemeData";
import type { createSupabaseAdminClient } from "../supabase/admin";
import type { A4InvoiceData } from "./A4Renderer";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export function paymentMethodLabel(method: string) {
  switch (method) {
    case "cash":
      return "Cash";
    case "card":
      return "Card";
    case "upi":
      return "UPI";
    case "online":
      return "Online";
    default:
      return "Other";
  }
}

/** Everything an issued bill's invoice shows, read once for both the shop's own bill screen and the
 * customer's link (/invoice/[id]), so the two can never tell a different story. `shopId` limits the
 * read to that shop (the staff screen); without it the bill's own shop is used (the customer link,
 * where the unguessable bill id is the only key). */
export async function loadBillInvoice(admin: Admin, billId: string, shopId?: string) {
  let billQuery = admin
    .from("bills")
    .select(
      "id, shop_id, invoice_number, subtotal, discount_type, discount_value, discount_amount, taxable_amount, supply_type, cgst_amount, sgst_amount, igst_amount, gst_amount, round_off_amount, payment_method, status, void_reason, voided_at, total, paid_amount, credit_amount, created_at, service_provider_name, edited_at, edit_reason, customer_id, buyer_name, buyer_gstin, buyer_address, buyer_state, buyer_state_code, customers ( name, phone, gstin, address )",
    )
    .eq("id", billId);
  if (shopId) billQuery = billQuery.eq("shop_id", shopId); // ownership check
  const { data: bill } = await billQuery.maybeSingle();
  if (!bill) return null;

  const [{ data: shop }, { data: invoiceSettings }, { data: items }, { data: exchangeRow }] = await Promise.all([
    admin
      .from("shops")
      .select("name, gstin, logo_url, upi_id, gst_scheme, business_type, address_line1, address_line2, city, state, pincode, default_print_format, loyalty_points_per_100")
      .eq("id", bill.shop_id)
      .single(),
    admin
      .from("invoice_settings")
      .select("tagline, footer_text, terms_and_conditions, bank_details, accent_color, header_image_url, footer_image_url")
      .eq("shop_id", bill.shop_id)
      .maybeSingle(),
    admin
      .from("bill_items")
      .select("id, product_name, hsn_code, quantity, unit_price, gst_percent, cgst_amount, sgst_amount, igst_amount, line_total, warranty_months, warranty_expires_on, mrp")
      .eq("bill_id", bill.id)
      .order("product_name"),
    // Old gold or silver taken in exchange pays part of the bill, and is stored inside paid_amount:
    // the invoice shows it as its own line and prints only the rest as the money that was paid.
    admin
      .from("jewellery_exchanges")
      .select("metal_type, gross_weight, purity_percent, exchange_value")
      .eq("bill_id", bill.id)
      .eq("shop_id", bill.shop_id)
      .limit(1)
      .maybeSingle(),
  ]);
  if (!shop) return null;

  // A hotel stay invoice belongs to a booking: its lines come from the folio, so quantity edits
  // and returns are not offered (only asked when the shop is a hotel, since the column exists
  // only after the hotel migration).
  const hotelBookingId =
    shop.business_type === "hotel"
      ? ((await admin.from("bills").select("hotel_booking_id").eq("id", bill.id).maybeSingle()).data?.hotel_booking_id ?? null)
      : null;

  const shopAddress = [shop.address_line1, shop.address_line2, shop.city, shop.state, shop.pincode].filter(Boolean).join(", ") || null;
  const customer = (Array.isArray(bill.customers) ? bill.customers[0] : bill.customers) as { name: string; phone: string; gstin: string | null; address: string | null } | null;
  // The "Bill to" frozen on the bill when it was issued (a B2B bill can name a different business
  // than the customer); a bill from before that existed shows the customer as before.
  const party = buyerOf(bill, customer ? { ...customer, state: null, state_code: null } : null);
  const isComposition = shop.gst_scheme === "composition";

  const isIntra = bill.supply_type === "intra";
  const paymentLabel = paymentMethodLabel(bill.payment_method);
  // Within the state the place of supply is the shop's own state; across states, the buyer's.
  const placeOfSupply = isIntra ? `${shop.state ?? "Same state"} (CGST + SGST)` : `${party?.state ?? "Different state"} (IGST)`;

  // A gold saving scheme used for this jewellery pays part of it, like old gold handed over:
  // shown as its own line, and only the rest printed as money paid.
  let schemeLine: { label: string; amount: number } | null = null;
  if (shop.business_type === "jewellery" && (await goldSchemesReady(admin))) {
    const { data: used } = await admin.from("gold_schemes").select("id").eq("redeemed_bill_id", bill.id).eq("shop_id", bill.shop_id).maybeSingle();
    if (used) {
      const [view] = await loadSchemes(admin, bill.shop_id, { id: used.id });
      if (view) schemeLine = { label: `Gold scheme ${view.scheme.scheme_number}`, amount: view.figures.value };
    }
  }
  const oldGold = exchangeRow ? Number(exchangeRow.exchange_value) : 0;
  const exchangeAmount = oldGold + (schemeLine?.amount ?? 0);
  const exchangeLabel = exchangeRow
    ? `Old ${exchangeRow.metal_type} exchange (${Number(exchangeRow.gross_weight)} g @ ${Number(exchangeRow.purity_percent)}%)${schemeLine ? ` + ${schemeLine.label}` : ""}`
    : (schemeLine?.label ?? null);
  const cashPaid = Math.max(0, Number(bill.paid_amount) - exchangeAmount);

  let upiLink: string | null = null;
  let upiQrDataUrl: string | null = null;
  if (shop.upi_id && Number(bill.credit_amount) > 0 && bill.status === "active") {
    upiLink = buildUpiLink(shop.upi_id, shop.name, Number(bill.credit_amount), `Invoice ${bill.invoice_number}`);
    upiQrDataUrl = await generateQrDataUrl(upiLink);
  }

  const totalMrpSavings = (items ?? []).reduce(
    (s, item) => s + (item.mrp != null && item.mrp > item.unit_price ? (item.mrp - item.unit_price) * item.quantity : 0),
    0,
  );
  const discountLabel = bill.discount_amount > 0 ? `Discount (${bill.discount_type === "percent" ? `${bill.discount_value}%` : "flat"})` : null;
  const warrantyText = (expiresOn: string | null) =>
    expiresOn
      ? `Warranty till ${new Date(expiresOn).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}`
      : null;

  const a4Data: A4InvoiceData = {
    shopName: shop.name,
    shopLogoUrl: shop.logo_url,
    shopAddress,
    gstin: shop.gstin,
    isComposition,
    tagline: invoiceSettings?.tagline ?? null,
    accentColor: invoiceSettings?.accent_color ?? null,
    invoiceNumber: bill.invoice_number,
    dateText: formatDateTime(bill.created_at),
    customerName: party?.name ?? null,
    customerAddress: party?.address ?? null,
    customerPhone: customer?.phone ?? null,
    customerGstin: party?.gstin ?? null,
    serviceProviderName: bill.service_provider_name,
    placeOfSupplyText: placeOfSupply,
    items: (items ?? []).map((it) => ({
      name: it.product_name,
      hsnCode: it.hsn_code,
      qty: Number(it.quantity),
      rate: Number(it.unit_price),
      mrp: it.mrp != null ? Number(it.mrp) : null,
      taxPercent: Number(it.gst_percent),
      amount: Number(it.line_total),
      warrantyText: warrantyText(it.warranty_expires_on),
    })),
    savingsOffMrp: totalMrpSavings,
    subtotal: Number(bill.subtotal),
    discountLabel,
    discountAmount: Number(bill.discount_amount),
    taxableAmount: Number(bill.taxable_amount),
    isIntraState: isIntra,
    cgstAmount: Number(bill.cgst_amount),
    sgstAmount: Number(bill.sgst_amount),
    igstAmount: Number(bill.igst_amount),
    roundOffAmount: Number(bill.round_off_amount),
    total: Number(bill.total),
    exchangeLabel,
    exchangeAmount,
    paidAmount: cashPaid,
    paymentLabel,
    creditAmount: Number(bill.credit_amount),
    bankDetails: invoiceSettings?.bank_details ?? null,
    termsAndConditions: invoiceSettings?.terms_and_conditions ?? null,
    footerText: invoiceSettings?.footer_text ?? null,
    voidedReason: bill.status === "voided" ? bill.void_reason : null,
    editedNote: bill.edited_at ? `Corrected on ${formatDateTime(bill.edited_at)} — ${bill.edit_reason}` : null,
    upiQrDataUrl,
    upiId: shop.upi_id,
  };

  return {
    bill,
    shop,
    invoiceSettings,
    items: items ?? [],
    customer,
    party,
    isComposition,
    isIntra,
    placeOfSupply,
    paymentLabel,
    discountLabel,
    exchangeLabel,
    exchangeAmount,
    cashPaid,
    upiLink,
    totalMrpSavings,
    warrantyText,
    hotelBookingId,
    a4Data,
  };
}
