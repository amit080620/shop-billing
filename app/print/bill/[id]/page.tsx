import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { requireSession, hasPermission } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime } from "@/lib/format";
import { buildUpiLink, generateQrDataUrl } from "@/lib/qr";
import { PrintButton } from "./PrintButton";
import { WhatsAppSendButton } from "./WhatsAppSendButton";
import { BillCreatedConfirmation } from "./BillCreatedConfirmation";
import { VoidBillButton } from "./VoidBillButton";
import { EditBillButton } from "./EditBillButton";
import { DownloadImageButton } from "./DownloadImageButton";
import { BluetoothPrintButton } from "./BluetoothPrintButton";
import { BillSuccessSound } from "./BillSuccessSound";
import { InfoTooltip } from "./InfoTooltip";
import { ThermalRenderer, type ThermalReceiptData } from "@/lib/print/ThermalRenderer";
import { A4Renderer, type A4InvoiceData } from "@/lib/print/A4Renderer";

export default async function PrintBillPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const { id } = await params;
  const { format: formatParam } = await searchParams;

  const session = await requireSession();
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  // Genuinely fall back to the shop's own default print format only
  // when no explicit ?format= was given — tapping a format pill on
  // this very screen always overrides the default for that view.
  let format = formatParam;
  if (!format) {
    const { data: shopRow } = await admin.from("shops").select("default_print_format").eq("id", session.shopId).single();
    const defaultFormat = shopRow?.default_print_format ?? "full";
    format = defaultFormat === "thermal58" ? "thermal58" : defaultFormat === "thermal" ? "thermal" : "full";
  }
  const isThermal = format === "thermal" || format === "thermal58";
  const is58mm = format === "thermal58";

  const { data: invoiceSettings } = await admin
    .from("invoice_settings")
    .select("tagline, footer_text, terms_and_conditions, bank_details, accent_color, header_image_url, footer_image_url")
    .eq("shop_id", session.shopId)
    .maybeSingle();

  const { data: shopAddressRow } = await admin
    .from("shops")
    .select("address_line1, address_line2, city, state, pincode")
    .eq("id", session.shopId)
    .maybeSingle();
  const shopAddressText = [shopAddressRow?.address_line1, shopAddressRow?.address_line2, shopAddressRow?.city, shopAddressRow?.state, shopAddressRow?.pincode]
    .filter(Boolean)
    .join(", ") || null;

  const { data: bill } = await admin
    .from("bills")
    .select(
      "id, invoice_number, subtotal, discount_type, discount_value, discount_amount, taxable_amount, supply_type, cgst_amount, sgst_amount, igst_amount, gst_amount, round_off_amount, payment_method, status, void_reason, voided_at, total, paid_amount, credit_amount, created_at, service_provider_name, edited_at, edit_reason, customers ( name, phone, gstin, address )",
    )
    .eq("id", id)
    .eq("shop_id", session.shopId) // ownership check
    .single();

  if (!bill) notFound();

  const { data: items } = await admin
    .from("bill_items")
    .select("id, product_name, hsn_code, quantity, unit_price, gst_percent, cgst_amount, sgst_amount, igst_amount, line_total, warranty_months, warranty_expires_on, mrp")
    .eq("bill_id", id)
    .order("product_name");

  const customer = Array.isArray(bill.customers)
    ? bill.customers[0]
    : (bill.customers as { name: string; phone: string; gstin: string | null; address: string | null } | null);

  const isIntra = bill.supply_type === "intra";
  const paymentLabel = paymentMethodLabel(bill.payment_method);

  let upiLink: string | null = null;
  let upiQrDataUrl: string | null = null;
  if (session.shopUpiId && Number(bill.credit_amount) > 0 && bill.status === "active") {
    upiLink = buildUpiLink(
      session.shopUpiId,
      session.shopName,
      Number(bill.credit_amount),
      `Invoice ${bill.invoice_number}`,
    );
    upiQrDataUrl = await generateQrDataUrl(upiLink);
  }

  const receiptData = {
    shopName: session.shopName,
    gstin: session.shopGstin,
    invoiceNumber: bill.invoice_number,
    dateText: formatDateTime(bill.created_at),
    customerName: customer?.name ?? null,
    items: (items ?? []).map((it) => ({
      name: it.product_name,
      qty: Number(it.quantity),
      price: Number(it.unit_price),
      lineTotal: Number(it.line_total),
    })),
    subtotal: (items ?? []).reduce((s, it) => s + Number(it.line_total), 0),
    taxTotal: (items ?? []).reduce((s, it) => s + Number(it.cgst_amount) + Number(it.sgst_amount) + Number(it.igst_amount), 0),
    total: Number(bill.total),
    paidAmount: Number(bill.paid_amount),
    creditAmount: Number(bill.credit_amount),
    footerText: null,
  };

  const totalMrpSavings = (items ?? []).reduce(
    (s, item) => s + (item.mrp != null && item.mrp > item.unit_price ? (item.mrp - item.unit_price) * item.quantity : 0),
    0,
  );

  const thermalData: ThermalReceiptData = {
    shopName: session.shopName,
    gstin: session.shopGstin,
    invoiceNumber: bill.invoice_number,
    dateText: formatDateTime(bill.created_at),
    customerName: customer?.name ?? null,
    customerPhone: customer?.phone ?? null,
    customerGstin: customer?.gstin ?? null,
    serviceProviderName: bill.service_provider_name,
    placeOfSupplyText: isIntra ? "Place: Same state (CGST+SGST)" : "Place: Different state (IGST)",
    items: (items ?? []).map((it) => ({
      name: it.product_name,
      qty: Number(it.quantity),
      rate: Number(it.unit_price),
      amount: Number(it.line_total),
      mrp: it.mrp != null ? Number(it.mrp) : null,
      warrantyText: it.warranty_expires_on
        ? `Warranty till ${new Date(it.warranty_expires_on).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}`
        : null,
    })),
    savingsOffMrp: totalMrpSavings,
    subtotal: Number(bill.subtotal),
    discountLabel: bill.discount_amount > 0 ? `Discount (${bill.discount_type === "percent" ? `${bill.discount_value}%` : "flat"})` : null,
    discountAmount: Number(bill.discount_amount),
    taxableAmount: Number(bill.taxable_amount),
    isIntraState: isIntra,
    cgstAmount: Number(bill.cgst_amount),
    sgstAmount: Number(bill.sgst_amount),
    igstAmount: Number(bill.igst_amount),
    roundOffAmount: Number(bill.round_off_amount),
    total: Number(bill.total),
    paidAmount: Number(bill.paid_amount),
    paymentLabel,
    creditAmount: Number(bill.credit_amount),
    tagline: invoiceSettings?.tagline ?? null,
    bankDetails: invoiceSettings?.bank_details ?? null,
    termsAndConditions: invoiceSettings?.terms_and_conditions ?? null,
    footerText: invoiceSettings?.footer_text ?? null,
    voidedBanner: bill.status === "voided" ? "VOIDED" : null,
  };

  const a4Data: A4InvoiceData = {
    shopName: session.shopName,
    shopLogoUrl: session.shopLogoUrl,
    shopAddress: shopAddressText,
    gstin: session.shopGstin,
    tagline: invoiceSettings?.tagline ?? null,
    accentColor: invoiceSettings?.accent_color ?? null,
    invoiceNumber: bill.invoice_number,
    dateText: formatDateTime(bill.created_at),
    customerName: customer?.name ?? null,
    customerAddress: customer?.address ?? null,
    customerPhone: customer?.phone ?? null,
    customerGstin: customer?.gstin ?? null,
    serviceProviderName: bill.service_provider_name,
    placeOfSupplyText: isIntra ? "Same state (CGST + SGST)" : "Different state (IGST)",
    items: (items ?? []).map((it) => ({
      name: it.product_name,
      hsnCode: it.hsn_code,
      qty: Number(it.quantity),
      rate: Number(it.unit_price),
      mrp: it.mrp != null ? Number(it.mrp) : null,
      taxPercent: Number(it.gst_percent),
      amount: Number(it.line_total),
      warrantyText: it.warranty_expires_on
        ? `Warranty till ${new Date(it.warranty_expires_on).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}`
        : null,
    })),
    savingsOffMrp: totalMrpSavings,
    subtotal: Number(bill.subtotal),
    discountLabel: bill.discount_amount > 0 ? `Discount (${bill.discount_type === "percent" ? `${bill.discount_value}%` : "flat"})` : null,
    discountAmount: Number(bill.discount_amount),
    taxableAmount: Number(bill.taxable_amount),
    isIntraState: isIntra,
    cgstAmount: Number(bill.cgst_amount),
    sgstAmount: Number(bill.sgst_amount),
    igstAmount: Number(bill.igst_amount),
    roundOffAmount: Number(bill.round_off_amount),
    total: Number(bill.total),
    paidAmount: Number(bill.paid_amount),
    paymentLabel,
    creditAmount: Number(bill.credit_amount),
    bankDetails: invoiceSettings?.bank_details ?? null,
    termsAndConditions: invoiceSettings?.terms_and_conditions ?? null,
    footerText: invoiceSettings?.footer_text ?? null,
    voidedReason: bill.status === "voided" ? bill.void_reason : null,
    editedNote: bill.edited_at ? `Corrected on ${formatDateTime(bill.edited_at)} — ${bill.edit_reason}` : null,
    upiQrDataUrl,
    upiId: session.shopUpiId,
  };

  return (
    <>
      <BillSuccessSound />
      <Suspense fallback={null}>
        <BillCreatedConfirmation amount={formatMoney(bill.total)} />
      </Suspense>
      <style>{`
        @media print {
          @page {
            size: ${isThermal ? (is58mm ? "58mm auto" : "80mm auto") : "A4"};
            margin: ${isThermal ? "2mm" : "15mm"};
          }
        }
      `}</style>
    <div
      className={`relative mx-auto bg-white text-black ${isThermal ? "" : "max-w-2xl p-8"}`}
    >
      {bill.status === "voided" && !isThermal && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden"
          aria-hidden="true"
        >
          <span
            className="select-none whitespace-nowrap font-black text-red-600/25"
            style={{
              fontSize: "72px",
              transform: "rotate(-25deg)",
            }}
          >
            VOIDED
          </span>
        </div>
      )}
      <div className="no-print mb-4 flex flex-col gap-2.5">
        {/* Row 1: WhatsApp */}
        <div className="flex items-center gap-1.5">
          <WhatsAppSendButton
            lang={lang}
            customerName={customer?.name ?? null}
            customerPhone={customer?.phone ?? null}
            shopName={session.shopName}
            invoiceNumber={bill.invoice_number}
            total={Number(bill.total)}
            paidAmount={Number(bill.paid_amount)}
            creditAmount={Number(bill.credit_amount)}
            upiLink={upiLink}
          />
          <InfoTooltip message="WhatsApp text messages can't carry a file — download the PDF above, then attach it yourself in the WhatsApp chat for a clean copy. If there's a balance due, the QR area in that PDF is also tappable in most PDF viewers, opening the customer's UPI app directly." />
        </div>

        {/* Row 2: All remaining actions as compact pills in a single flex-wrap row */}
        <div className="flex flex-wrap gap-1.5">
          <FormatPill href={`/print/bill/${id}?format=full`} label="A4" active={!isThermal} />
          <FormatPill href={`/print/bill/${id}?format=thermal58`} label="58mm" active={is58mm} />
          <FormatPill href={`/print/bill/${id}?format=thermal`} label="80mm" active={isThermal && !is58mm} />
          <DownloadImageButton invoiceNumber={bill.invoice_number} upiLink={upiLink} isThermal={isThermal} />
          <PrintButton />
          <BluetoothPrintButton receipt={receiptData} paperWidth={is58mm ? 32 : 48} />
          {bill.status === "active" && hasPermission(session, "process_returns") && (
            <Link
              href={`/returns/new?billId=${bill.id}`}
              className="no-print inline-flex items-center gap-1 rounded-full border border-brand px-3 py-1.5 text-xs font-medium text-brand-text"
            >
              ↩ Return
            </Link>
          )}
          {hasPermission(session, "edit_bills") && bill.status === "active" && (
            <EditBillButton
              billId={bill.id}
              invoiceNumber={bill.invoice_number}
              items={(items ?? []).map((i) => ({ id: i.id, productName: i.product_name, quantity: Number(i.quantity) }))}
            />
          )}
          {hasPermission(session, "void_bills") && bill.status === "active" && (
            <VoidBillButton billId={bill.id} invoiceNumber={bill.invoice_number} />
          )}
        </div>
      </div>

      {bill.status === "voided" && (
        <div className="no-print mb-4 rounded-lg border border-danger bg-red-50 px-4 py-3 text-sm text-danger">
          <p className="font-semibold">This invoice has been voided.</p>
          <p className="mt-0.5">
            Reason: {bill.void_reason} · {bill.voided_at ? formatDateTime(bill.voided_at) : ""}
          </p>
          <p className="mt-1 text-xs">
            It&apos;s excluded from all totals, balances, and GST reports. Kept here only for
            record-keeping — nothing prints on it below except as a reference copy.
          </p>
        </div>
      )}

      {bill.edited_at && (
        <div className="no-print mb-4 rounded-lg border border-credit bg-credit-soft px-4 py-3 text-sm text-credit">
          <p className="font-semibold">This invoice was corrected after it was first created.</p>
          <p className="mt-0.5">
            Reason: {bill.edit_reason} · {formatDateTime(bill.edited_at)}
          </p>
        </div>
      )}

      <div id="invoice-capture-area" className="animate-print-slip bg-white">
      {isThermal ? (
        <ThermalRenderer data={thermalData} paperWidth={is58mm ? 58 : 80} />
      ) : (
        <A4Renderer data={a4Data} />
      )}
      </div>
    </div>
    </>
  );
}

function paymentMethodLabel(method: string) {
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

function FormatPill({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <a
      href={href}
      className={`rounded-full px-3 py-1.5 text-xs font-medium ${active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
      style={
        active
          ? undefined
          : { boxShadow: "-2px -2px 4px rgba(255,255,255,0.9), 2px 2px 4px rgba(0,0,0,0.1)" }
      }
    >
      {label}
    </a>
  );
}
