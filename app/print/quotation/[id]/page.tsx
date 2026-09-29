import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { LangProvider } from "@/lib/i18n/LangContext";
import { messagesFor } from "@/lib/i18n/dictionary";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime } from "@/lib/format";
import { formatIsoDate, todayIso } from "@/lib/dateHelpers";
import { calculateTransactionTotals } from "@/lib/validation/schemas";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { A4Renderer, type A4InvoiceData } from "@/lib/print/A4Renderer";
import { PrintButton } from "@/app/print/bill/[id]/PrintButton";
import { DownloadImageButton } from "@/app/print/bill/[id]/DownloadImageButton";
import { CancelQuotationButton } from "./CancelQuotationButton";
import { quotationsReady } from "@/lib/quotationsData";

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const { lang, t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (!(await quotationsReady(admin))) notFound();

  const { data: q } = await admin.from("quotations").select("*").eq("id", id).eq("shop_id", session.shopId).maybeSingle();
  if (!q) notFound();

  const [{ data: shop }, { data: invoiceSettings }, { data: customer }] = await Promise.all([
    admin.from("shops").select("name, gstin, logo_url, gst_scheme, address_line1, address_line2, city, state, pincode").eq("id", session.shopId).single(),
    admin.from("invoice_settings").select("tagline, footer_text, terms_and_conditions, bank_details, accent_color").eq("shop_id", session.shopId).maybeSingle(),
    q.customer_id ? admin.from("customers").select("name, phone, gstin, address, state").eq("id", q.customer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  // Line amounts, worked out the way the quotation was (its own discount and place of supply).
  const lines = calculateTransactionTotals({
    items: q.items.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, gstPercent: l.gstPercent })),
    discountType: q.discount_type,
    discountValue: Number(q.discount_value),
    paidAmount: 0,
    supplyType: q.supply_type,
    priceMode: session.priceIncludesGst ? "inclusive" : "exclusive",
  }).lines;
  const isIntra = q.supply_type === "intra";
  const shopAddress = [shop?.address_line1, shop?.address_line2, shop?.city, shop?.state, shop?.pincode].filter(Boolean).join(", ") || null;

  const a4Data: A4InvoiceData = {
    shopName: shop?.name ?? session.shopName,
    shopLogoUrl: shop?.logo_url,
    shopAddress,
    gstin: shop?.gstin,
    isComposition: shop?.gst_scheme === "composition",
    tagline: invoiceSettings?.tagline ?? null,
    accentColor: invoiceSettings?.accent_color ?? null,
    invoiceNumber: q.quote_number,
    dateText: formatDateTime(q.created_at),
    customerName: customer?.name ?? q.customer_name,
    customerAddress: customer?.address ?? null,
    customerPhone: customer?.phone ?? q.customer_phone,
    customerGstin: customer?.gstin ?? null,
    placeOfSupplyText: isIntra ? `${shop?.state ?? "Same state"} (CGST + SGST)` : `${customer?.state ?? "Different state"} (IGST)`,
    items: q.items.map((l, i) => ({
      name: l.description,
      hsnCode: l.hsnCode,
      qty: l.quantity,
      rate: l.unitPrice,
      taxPercent: l.gstPercent,
      amount: Math.round(((lines[i]?.lineSubtotal ?? 0) + (lines[i]?.lineGst ?? 0)) * 100) / 100,
    })),
    subtotal: Number(q.subtotal),
    discountLabel: Number(q.discount_amount) > 0 ? `Discount (${q.discount_type === "percent" ? `${Number(q.discount_value)}%` : "flat"})` : null,
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
  const phone = customer?.phone ?? q.customer_phone;
  const itemLines = q.items.map((l) => `${l.description} x${l.quantity} — ${formatMoney(l.unitPrice * l.quantity)}`);
  const whatsapp = phone
    ? buildWhatsAppLink(
        phone,
        [
          `*${a4Data.shopName}*`,
          `${t("Quotation")} ${q.quote_number}`,
          customer?.name || q.customer_name ? `${t("For")}: ${customer?.name ?? q.customer_name}` : "",
          "",
          "```",
          ...itemLines,
          "```",
          `*${t("Total")}: ${formatMoney(Number(q.total))}*`,
          q.valid_until ? `${t("Valid until")} ${formatIsoDate(q.valid_until)}` : "",
          q.notes ?? "",
        ]
          .filter((x, i, a) => x !== "" || (i > 0 && a[i - 1] !== ""))
          .join("\n"),
      )
    : null;

  return (
    <LangProvider lang={lang} messages={messagesFor(lang)}>
      <div className="mx-auto max-w-2xl bg-background p-4 text-foreground md:p-8">
        <div className="no-print mb-6 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Link href="/quotations" className="text-sm font-medium text-muted hover:text-foreground">
              {t("← Quotations")}
            </Link>
            {q.status === "open" && (
              <Link href={`/bills/new?quote=${q.id}`} className="btn-primary-sm">
                {t("Make bill →")}
              </Link>
            )}
          </div>

          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-2 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{a4Data.customerName ?? t("common.walkinCustomer")}</p>
                <p className="text-xs text-muted">{q.quote_number}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-bold leading-tight text-foreground">{formatMoney(Number(q.total))}</p>
                <p className={`text-xs font-medium ${q.status === "converted" ? "text-success" : q.status === "cancelled" || expired ? "text-danger" : "text-brand-text"}`}>
                  {q.status === "converted" ? t("Billed") : q.status === "cancelled" ? t("Cancelled") : expired ? t("Expired") : t("Open")}
                </p>
              </div>
            </div>
            {whatsapp ? (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-center font-medium text-white">
                {t("Send quotation on WhatsApp")}
              </a>
            ) : (
              <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">{t("No phone on this quotation — pick a customer on New Bill to send it on WhatsApp.")}</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <PrintButton />
              <DownloadImageButton invoiceNumber={q.quote_number} isThermal={false} />
            </div>
            <div className="flex flex-wrap gap-2">
              {q.status === "converted" && q.bill_id && (
                <Link href={`/print/bill/${q.bill_id}`} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted">
                  {t("View the bill")}
                </Link>
              )}
              {q.status === "open" && <CancelQuotationButton quotationId={q.id} />}
            </div>
            {q.status === "open" &&
              (expired ? (
                <p className="text-xs text-danger">{t("This quotation's validity date has passed — Make bill uses today's prices.")}</p>
              ) : (
                <p className="text-xs text-muted">{t("Make bill keeps these quoted prices while the quotation is valid.")}</p>
              ))}
          </section>
        </div>

        <div id="invoice-capture-area" className="bg-white text-black">
          <A4Renderer data={a4Data} />
        </div>
      </div>
    </LangProvider>
  );
}
