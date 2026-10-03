import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Suspense } from "react";
import Link from "@/lib/link";
import { homePathFor } from "@/lib/businessType";
import { requireSession, hasPermission } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { LangProvider } from "@/lib/i18n/LangContext";
import { messagesFor } from "@/lib/i18n/dictionary";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime } from "@/lib/format";
import { isPastGstPeriod } from "@/lib/gst";
import { buyerSchemaReady } from "@/lib/gstBuyer";
import { PrintButton } from "./PrintButton";
import { WhatsAppSendButton } from "./WhatsAppSendButton";
import { BillCreatedConfirmation } from "./BillCreatedConfirmation";
import { VoidBillButton } from "./VoidBillButton";
import { EditBillButton } from "./EditBillButton";
import { DownloadImageButton } from "./DownloadImageButton";
import { SharePdfButton } from "./SharePdfButton";
import { BluetoothPrintButton } from "./BluetoothPrintButton";
import { BillSuccessSound } from "./BillSuccessSound";
import { InfoTooltip } from "@/app/components/InfoTooltip";
import { ThermalRenderer, type ThermalReceiptData } from "@/lib/print/ThermalRenderer";
import { thermalFormatFor } from "@/lib/print/thermalFormat";
import { getThermalPrintSettingsAction } from "@/lib/actions/settings";
import { A4Renderer } from "@/lib/print/A4Renderer";
import { loadBillInvoice } from "@/lib/print/billInvoice";

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

  const invoice = await loadBillInvoice(admin, id, session.shopId);
  if (!invoice) notFound();
  const { bill, shop, invoiceSettings, items, customer, party, isIntra, placeOfSupply, paymentLabel, discountLabel, exchangeLabel, exchangeAmount, cashPaid, upiLink, totalMrpSavings, warrantyText, hotelBookingId, a4Data } = invoice;

  // Genuinely fall back to the shop's own default print format only
  // when no explicit ?format= was given — tapping a format pill on
  // this very screen always overrides the default for that view.
  let format = formatParam;
  if (!format) {
    const defaultFormat = shop.default_print_format ?? "full";
    format = defaultFormat === "thermal58" ? "thermal58" : defaultFormat === "thermal" ? "thermal" : "full";
  }
  const isThermal = format === "thermal" || format === "thermal58";
  const is58mm = format === "thermal58";

  // Same rule the Edit/Void actions enforce server-side; checked here too so those buttons
  // aren't offered at all on a bill they would refuse.
  const periodClosed = isPastGstPeriod(bill.created_at);
  const debitNotesReady = bill.status === "active" && (await buyerSchemaReady(admin));

  // The customer's own copy: a link that opens this invoice (with a PDF button) without a login.
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "bill.theray.in";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const customerInvoiceUrl = `${protocol}://${host}/invoice/${bill.id}`;

  // Same fields the on-screen thermal preview (thermalData, below) shows —
  // a customer's physical Bluetooth-printed receipt must carry the same
  // GST breakdown the owner previewed, not a collapsed "Tax" line.
  const receiptData = {
    shopName: shop.name,
    gstin: shop.gstin,
    invoiceNumber: bill.invoice_number,
    dateText: formatDateTime(bill.created_at),
    customerName: party?.name ?? null,
    items: items.map((it) => ({
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
    exchangeLabel,
    exchangeAmount,
    paidAmount: cashPaid,
    creditAmount: Number(bill.credit_amount),
    footerText: null,
  };

  // The owner's shop-name / item / total styling (Settings → Thermal print settings).
  const thermalFormat = isThermal ? thermalFormatFor(await getThermalPrintSettingsAction(), is58mm ? 58 : 80) : undefined;

  const thermalData: ThermalReceiptData = {
    shopName: shop.name,
    gstin: shop.gstin,
    isComposition: invoice.isComposition,
    invoiceNumber: bill.invoice_number,
    dateText: formatDateTime(bill.created_at),
    customerName: party?.name ?? null,
    customerPhone: customer?.phone ?? null,
    customerGstin: party?.gstin ?? null,
    serviceProviderName: bill.service_provider_name,
    placeOfSupplyText: `Place: ${placeOfSupply}`,
    items: items.map((it) => ({
      name: it.product_name,
      qty: Number(it.quantity),
      rate: Number(it.unit_price),
      amount: Number(it.line_total),
      mrp: it.mrp != null ? Number(it.mrp) : null,
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
    tagline: invoiceSettings?.tagline ?? null,
    bankDetails: invoiceSettings?.bank_details ?? null,
    termsAndConditions: invoiceSettings?.terms_and_conditions ?? null,
    footerText: invoiceSettings?.footer_text ?? null,
    voidedBanner: bill.status === "voided" ? "VOIDED" : null,
  };

  // Same formula bills.ts used when it actually awarded the points —
  // recomputed here (not re-read from the customer's live balance,
  // which could include other bills/redemptions since) so this always
  // reflects exactly what THIS bill earned.
  const loyaltyRate = Number(shop.loyalty_points_per_100 ?? 0);
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
          {/* Straight to this shop's billing screen (no hop through "/"), loaded ahead in full so the
              next sale opens at once — with fresh stock, since making this bill cleared the cache. */}
          <Link href={homePathFor(session.businessType, session.fastBillingEnabled)} prefetch className="btn-primary-sm">
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
            shopName={shop.name}
            invoiceNumber={bill.invoice_number}
            items={(items ?? []).map((it) => ({ name: it.product_name, quantity: Number(it.quantity), unitPrice: Number(it.unit_price), lineTotal: Number(it.line_total), gstPercent: Number(it.gst_percent) }))}
            total={Number(bill.total)}
            paidAmount={cashPaid}
            exchange={exchangeLabel && exchangeAmount > 0 ? { label: exchangeLabel, amount: exchangeAmount } : null}
            creditAmount={Number(bill.credit_amount)}
            upiLink={upiLink}
            invoiceUrl={bill.status === "active" ? customerInvoiceUrl : null}
            details={{
              shopGstin: shop.gstin,
              isComposition: invoice.isComposition,
              dateText: formatDateTime(bill.created_at),
              billTo: party ? { name: party.name, gstin: party.gstin, address: party.address } : null,
              placeOfSupply,
              subtotal: Number(bill.subtotal),
              discountLabel,
              discountAmount: Number(bill.discount_amount),
              taxableAmount: Number(bill.taxable_amount),
              cgst: Number(bill.cgst_amount),
              sgst: Number(bill.sgst_amount),
              igst: Number(bill.igst_amount),
              roundOff: Number(bill.round_off_amount),
              paymentLabel,
            }}
          />
          <InfoTooltip message={t("The WhatsApp message goes straight to the customer's number, with a link to open or download this invoice as a PDF. Share PDF sends the PDF file itself — pick WhatsApp, then the customer.")} />
        </div>

        <div className="grid grid-cols-3 items-start gap-2">
          {isThermal ? <BluetoothPrintButton receipt={receiptData} paperWidth={is58mm ? 32 : 48} /> : <PrintButton />}
          <DownloadImageButton invoiceNumber={bill.invoice_number} upiLink={upiLink} isThermal={isThermal} />
          <SharePdfButton invoiceNumber={bill.invoice_number} shopName={shop.name} upiLink={upiLink} isThermal={isThermal} />
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
            {debitNotesReady && hasPermission(session, "edit_bills") && (
              <Link
                href={`/debit-notes/new?billId=${bill.id}`}
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2"
              >
                {t("+ Debit note")}
              </Link>
            )}
            {!periodClosed && !hotelBookingId && hasPermission(session, "edit_bills") && (
              <EditBillButton
                billId={bill.id}
                invoiceNumber={bill.invoice_number}
                items={(items ?? []).map((i) => ({ id: i.id, productName: i.product_name, quantity: Number(i.quantity) }))}
              />
            )}
            {!periodClosed && hasPermission(session, "void_bills") && <VoidBillButton billId={bill.id} invoiceNumber={bill.invoice_number} />}
          </div>
        )}
        {bill.status === "active" && periodClosed && (hasPermission(session, "edit_bills") || hasPermission(session, "void_bills")) && (
          <p className="mt-2 text-xs text-muted">
            {t("This bill is from an earlier month, so it can't be edited or voided — that month may already be filed. Use Return (value down) or Debit note (value up) for any correction.")}
          </p>
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


function FormatPill({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <a
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-full px-3 py-1 text-xs font-medium ${active ? "bg-brand text-white shadow-sm" : "text-muted hover:text-foreground"}`}
    >
      {label}
    </a>
  );
}
