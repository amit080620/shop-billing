import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { requireSession, hasPermission } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { LangProvider } from "@/lib/i18n/LangContext";
import { messagesFor } from "@/lib/i18n/dictionary";
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
import { InfoTooltip } from "@/app/components/InfoTooltip";
import { ThermalRenderer, type ThermalReceiptData } from "@/lib/print/ThermalRenderer";
import { thermalFormatFor } from "@/lib/print/thermalFormat";
import { getThermalPrintSettingsAction } from "@/lib/actions/settings";
import { A4Renderer, type A4InvoiceData } from "@/lib/print/A4Renderer";

export default async function PrintBillPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string; new?: string }>;
}) {
  const { id } = await params;
  const { format: formatParam, new: isFreshBill } = await searchParams;

  const session = await requireSession();
  const { lang, t } = await getTranslator();
  const admin = createSupabaseAdminClient();

  // Genuinely fall back to the shop's own default print format only
  // when no explicit ?format= was given — tapping a format pill on
  // this very screen always overrides the default for that view.
  let format = formatParam;
  const { data: shopRow } = await admin
    .from("shops")
    .select("default_print_format, loyalty_points_per_100")
    .eq("id", session.shopId)
    .single();
  if (!format) {
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

  // A hotel stay invoice belongs to a booking: its lines come from the folio, so
  // quantity edits and returns are not offered (only asked when the shop is a hotel,
  // since the column exists only after the hotel migration).
  const hotelBookingId =
    session.businessType === "hotel"
      ? ((await admin.from("bills").select("hotel_booking_id").eq("id", id).eq("shop_id", session.shopId).maybeSingle()).data?.hotel_booking_id ?? null)
      : null;

  const { data: bill } = await admin
    .from("bills")
    .select(
      "id, invoice_number, subtotal, discount_type, discount_value, discount_amount, taxable_amount, supply_type, cgst_amount, sgst_amount, igst_amount, gst_amount, round_off_amount, payment_method, status, void_reason, voided_at, total, paid_amount, credit_amount, created_at, service_provider_name, edited_at, edit_reason, customer_id, customers ( name, phone, gstin, address )",
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

  const totalMrpSavings = (items ?? []).reduce(
    (s, item) => s + (item.mrp != null && item.mrp > item.unit_price ? (item.mrp - item.unit_price) * item.quantity : 0),
    0,
  );

  // Same fields the on-screen thermal preview (thermalData, below) shows —
  // a customer's physical Bluetooth-printed receipt must carry the same
  // GST breakdown the owner previewed, not a collapsed "Tax" line.
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
    subtotal: Number(bill.subtotal),
    discount: Number(bill.discount_amount) || undefined,
    taxableAmount: Number(bill.taxable_amount),
    isIntraState: isIntra,
    cgstAmount: Number(bill.cgst_amount) || undefined,
    sgstAmount: Number(bill.sgst_amount) || undefined,
    igstAmount: Number(bill.igst_amount) || undefined,
    roundOffAmount: Number(bill.round_off_amount) || undefined,
    savingsOffMrp: totalMrpSavings || undefined,
    total: Number(bill.total),
    paidAmount: Number(bill.paid_amount),
    creditAmount: Number(bill.credit_amount),
    footerText: null,
  };

  // The owner's shop-name / item / total styling (Settings → Thermal print settings).
  const thermalFormat = isThermal ? thermalFormatFor(await getThermalPrintSettingsAction(), is58mm ? 58 : 80) : undefined;

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

  // Same formula bills.ts used when it actually awarded the points —
  // recomputed here (not re-read from the customer's live balance,
  // which could include other bills/redemptions since) so this always
  // reflects exactly what THIS bill earned.
  const loyaltyRate = Number(shopRow?.loyalty_points_per_100 ?? 0);
  const pointsEarned =
    bill.customer_id && loyaltyRate > 0 ? Math.floor((Number(bill.paid_amount) / 100) * loyaltyRate) : 0;

  return (
    <LangProvider lang={lang} messages={messagesFor(lang)}>
      <BillSuccessSound />
      <Suspense fallback={null}>
        <BillCreatedConfirmation amount={formatMoney(bill.total)} pointsEarned={pointsEarned} />
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
      className={`relative mx-auto bg-background text-foreground ${isThermal ? "" : "max-w-2xl p-8"}`}
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
      <div className="no-print mb-6 flex flex-col gap-3">
        {/* Next step first: at the counter the very next thing is usually
            another sale. "/" routes to the right billing screen for this
            business type. */}
        <div className="flex items-center justify-between gap-3">
          <Link href="/bills/all" className="text-sm font-medium text-muted hover:text-foreground">
            {t("← All bills")}
          </Link>
          <Link href="/" className="btn-primary-sm">
            {t("common.newBillPlus")}
          </Link>
        </div>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-2 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{customer?.name ?? t("common.walkinCustomer")}</p>
            <p className="text-xs text-muted">
              {bill.invoice_number} · {formatDateTime(bill.created_at)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-bold leading-tight text-foreground">{formatMoney(bill.total)}</p>
            {Number(bill.credit_amount) > 0 ? (
              <p className="text-xs font-medium text-credit">{t("common.due", { amount: formatMoney(bill.credit_amount) })}</p>
            ) : (
              <p className="text-xs font-medium text-success">{t("common.paid")}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 [&>*:first-child]:flex-1">
          <WhatsAppSendButton
            lang={lang}
            customerName={customer?.name ?? null}
            customerPhone={customer?.phone ?? null}
            shopName={session.shopName}
            invoiceNumber={bill.invoice_number}
            items={(items ?? []).map((it) => ({ name: it.product_name, quantity: Number(it.quantity), unitPrice: Number(it.unit_price), lineTotal: Number(it.line_total) }))}
            total={Number(bill.total)}
            paidAmount={Number(bill.paid_amount)}
            creditAmount={Number(bill.credit_amount)}
            upiLink={upiLink}
          />
          <InfoTooltip message={t("WhatsApp text messages can't carry a file — download the PDF, then attach it yourself in the WhatsApp chat for a clean copy. If there's a balance due, the QR area in that PDF is also tappable in most PDF viewers, opening the customer's UPI app directly.")} />
        </div>

        <div className="grid grid-cols-2 items-start gap-2">
          {isThermal ? <BluetoothPrintButton receipt={receiptData} paperWidth={is58mm ? 32 : 48} /> : <PrintButton />}
          <DownloadImageButton invoiceNumber={bill.invoice_number} upiLink={upiLink} isThermal={isThermal} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted">{t("billPage.paperSize")}</span>
          <div role="group" aria-label={t("billPage.paperSize")} className="flex rounded-full border border-border bg-surface p-0.5">
            <FormatPill href={`/print/bill/${id}?format=full`} label="A4" active={!isThermal} />
            <FormatPill href={`/print/bill/${id}?format=thermal58`} label="58mm" active={is58mm} />
            <FormatPill href={`/print/bill/${id}?format=thermal`} label="80mm" active={isThermal && !is58mm} />
          </div>
        </div>
        </section>

        {bill.status === "active" && (
          <div className="flex flex-wrap gap-2">
            {hotelBookingId && (
              <Link
                href={`/hotel/bookings/${hotelBookingId}`}
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2"
              >
                {t("View booking")}
              </Link>
            )}
            {!hotelBookingId && hasPermission(session, "process_returns") && (
              <Link
                href={`/returns/new?billId=${bill.id}`}
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2"
              >
                {t("↩ Return")}
              </Link>
            )}
            {!hotelBookingId && hasPermission(session, "edit_bills") && (
              <EditBillButton
                billId={bill.id}
                invoiceNumber={bill.invoice_number}
                items={(items ?? []).map((i) => ({ id: i.id, productName: i.product_name, quantity: Number(i.quantity) }))}
              />
            )}
            {hasPermission(session, "void_bills") && <VoidBillButton billId={bill.id} invoiceNumber={bill.invoice_number} />}
          </div>
        )}
      </div>

      {bill.status === "voided" && (
        <div className="no-print mb-4 rounded-lg border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
          <p className="font-semibold">{t("This invoice has been voided.")}</p>
          <p className="mt-0.5">
            {t("Reason: {reason} · {date}", { reason: bill.void_reason ?? "", date: bill.voided_at ? formatDateTime(bill.voided_at) : "" })}
          </p>
          <p className="mt-1 text-xs">
            {t("It's excluded from all totals, balances, and GST reports. Kept here only for record-keeping — nothing prints on it below except as a reference copy.")}
          </p>
        </div>
      )}

      {bill.edited_at && (
        <div className="no-print mb-4 rounded-lg border border-credit bg-credit-soft px-4 py-3 text-sm text-credit">
          <p className="font-semibold">{t("This invoice was corrected after it was first created.")}</p>
          <p className="mt-0.5">
            {t("Reason: {reason} · {date}", { reason: bill.edit_reason ?? "", date: formatDateTime(bill.edited_at) })}
          </p>
        </div>
      )}

      <div id="invoice-capture-area" className={`${isFreshBill === "1" ? "animate-print-slip" : ""} bg-white text-black`}>
      {isThermal ? (
        <ThermalRenderer data={thermalData} paperWidth={is58mm ? 58 : 80} format={thermalFormat} />
      ) : (
        <A4Renderer data={a4Data} />
      )}
      </div>
    </div>
    </LangProvider>
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
      aria-current={active ? "true" : undefined}
      className={`rounded-full px-3 py-1 text-xs font-medium ${active ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
    >
      {label}
    </a>
  );
}
