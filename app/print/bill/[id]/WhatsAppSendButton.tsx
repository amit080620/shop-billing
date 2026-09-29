"use client";

import { formatMoney } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";
import { buildWhatsAppLink } from "@/lib/whatsapp";

type BillItem = { name: string; quantity: number; unitPrice: number; lineTotal: number; gstPercent?: number };

/** What a GST invoice has to say besides its lines: who issued it, who it is made out to, where the
 * supply is and how the tax splits. Every field is optional, so a plain cash sale stays a short text. */
export type WhatsAppInvoiceDetails = {
  shopGstin: string | null;
  isComposition: boolean;
  dateText: string;
  billTo: { name: string | null; gstin: string | null; address: string | null } | null;
  placeOfSupply: string | null;
  subtotal: number;
  discountLabel: string | null;
  discountAmount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  paymentLabel: string | null;
};

export function WhatsAppSendButton({
  customerName,
  customerPhone,
  shopName,
  invoiceNumber,
  items,
  total,
  paidAmount,
  exchange,
  creditAmount,
  upiLink,
  invoiceUrl,
  lang,
  details,
}: {
  customerName: string | null;
  customerPhone: string | null;
  shopName: string;
  invoiceNumber: string;
  items: BillItem[];
  total: number;
  /** Money actually paid — without old gold taken in exchange or a gold scheme used. */
  paidAmount: number;
  /** Old gold handed over and/or a gold scheme used: part of the payment, shown as its own line. */
  exchange?: { label: string; amount: number } | null;
  creditAmount: number;
  upiLink?: string | null;
  /** The customer's own copy of this invoice, to open or save as a PDF — no login needed. */
  invoiceUrl?: string | null;
  lang: Lang;
  details?: WhatsAppInvoiceDetails;
}) {
  const { t } = useTranslation(lang);

  if (!customerPhone) {
    return (
      <p className="rounded-lg bg-surface-2 px-3.5 py-2.5 text-xs text-muted">
        {t("No phone on file for this sale — attach a customer with a phone number to send invoices on WhatsApp.")}
      </p>
    );
  }

  const tax = details ? details.cgst + details.sgst + details.igst : 0;
  const isB2b = !!details?.billTo?.gstin;
  // A GST invoice (tax on it, or made out to a GSTIN) carries the full invoice in the text:
  // both GSTINs, place of supply and the tax split — what the buyer needs to claim the credit.
  const fullInvoice = !!details && (tax > 0 || isB2b || !!details.shopGstin);

  // WhatsApp text messages genuinely can't carry any color at all —
  // not for any sender, in any app, ever; it's a platform-wide
  // limitation with no code workaround. *Bold*, _italic_, and a
  // monospace block (```…```, which keeps the item columns from
  // WhatsApp's proportional font from turning ragged) are the actual
  // formatting WhatsApp supports, and are what make this look
  // deliberately put-together rather than a plain data dump.
  const itemLines = items.map((it) => {
    const rate = fullInvoice && !details?.isComposition && it.gstPercent != null ? ` @${it.gstPercent}%` : "";
    const namePart = (it.quantity === 1 ? it.name : `${it.name} x${it.quantity}`) + rate;
    const pricePart = it.quantity === 1 ? formatMoney(it.lineTotal) : `${formatMoney(it.unitPrice)} → ${formatMoney(it.lineTotal)}`;
    const dots = ".".repeat(Math.max(1, 28 - namePart.length - pricePart.length));
    return `${namePart}${dots}${pricePart}`;
  });

  const lines = [`*${shopName}*`];
  if (fullInvoice && details.shopGstin) lines.push(`GSTIN: ${details.shopGstin}`);
  lines.push(t("wa.billGreeting", { name: customerName ?? "there", shop: shopName }), "");

  if (fullInvoice) {
    const title = details.isComposition ? t("Bill of Supply") : t("Tax Invoice");
    lines.push(`*${title}* · ${invoiceNumber}`, `${t("Date")}: ${details.dateText}`);
    if (details.billTo?.name || details.billTo?.gstin) {
      lines.push("", `*${t("Bill to")}:* ${details.billTo.name ?? ""}`);
      if (details.billTo.gstin) lines.push(`GSTIN: ${details.billTo.gstin}`);
      if (details.billTo.address) lines.push(details.billTo.address);
    }
    if (details.placeOfSupply && !details.isComposition) lines.push(`${t("Place of supply")}: ${details.placeOfSupply}`);
  } else {
    lines.push(t("wa.billInvoiceNo", { number: invoiceNumber }));
  }

  lines.push("```", ...itemLines, "```");

  if (fullInvoice) {
    if (details.discountAmount > 0 || tax > 0) lines.push(`${t("Subtotal")}: ${formatMoney(details.subtotal)}`);
    if (details.discountAmount > 0) lines.push(`${details.discountLabel ?? t("Discount")}: −${formatMoney(details.discountAmount)}`);
    if (!details.isComposition) lines.push(`${t("Taxable value")}: ${formatMoney(details.taxableAmount)}`);
    if (details.cgst > 0) lines.push(`CGST: ${formatMoney(details.cgst)}`);
    if (details.sgst > 0) lines.push(`SGST: ${formatMoney(details.sgst)}`);
    if (details.igst > 0) lines.push(`IGST: ${formatMoney(details.igst)}`);
    if (Math.abs(details.roundOff) >= 0.01) lines.push(`${t("Round off")}: ${details.roundOff > 0 ? "+" : "−"}${formatMoney(Math.abs(details.roundOff))}`);
  }

  lines.push(`*${t("wa.billTotalLabel")}: ${formatMoney(total)}*`);
  if (exchange && exchange.amount > 0) lines.push(`${exchange.label}: −${formatMoney(exchange.amount)}`);
  // (Nothing more paid when the old gold or the scheme covered it all.)
  if (paidAmount > 0 || !exchange?.amount)
    lines.push(
      fullInvoice && details.paymentLabel && paidAmount > 0
        ? `${t("Paid")} (${details.paymentLabel}): ${formatMoney(paidAmount)}`
        : t("wa.billPaid", { amount: formatMoney(paidAmount) }),
    );
  if (creditAmount > 0) {
    lines.push(`*${t("wa.billBalanceDue", { amount: formatMoney(creditAmount) })}*`);
    if (upiLink) {
      // Plain-text URI — WhatsApp auto-links recognized schemes, so this
      // renders tappable on most phones and opens whichever UPI app the
      // customer has installed, pre-filled with the amount due.
      lines.push(t("wa.billPayNow", { link: upiLink }));
    }
  }
  if (fullInvoice && details.isComposition) lines.push("", `_${t("Composition taxable person, not eligible to collect tax on supplies.")}_`);
  // A text message can't carry a file, but a link can: it opens this invoice with a PDF button.
  if (invoiceUrl) lines.push("", `📄 ${t("Invoice PDF")}: ${invoiceUrl}`);
  lines.push("", `_${t("wa.billThanks")}_`);

  const href = buildWhatsAppLink(customerPhone, lines.join("\n"));

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3.5 text-center font-medium text-white shadow-sm active:opacity-90"
    >
      <WhatsAppIcon />
      {t("wa.billSendButton")}
    </a>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.3c1.4.8 3.1 1.3 4.8 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3C4 14.8 3.6 13.4 3.6 12c0-4.6 3.8-8.4 8.4-8.4s8.4 3.8 8.4 8.4-3.8 8.4-8.4 8.4zm4.6-6.3c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8.9-.2.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.2.2-.4.1-.1 0-.3 0-.4C10.4 9.4 10 8.4 9.8 8c-.2-.4-.3-.3-.5-.3h-.4c-.1 0-.4 0-.6.3-.2.2-.8.8-.8 2s.9 2.3 1 2.4c.1.2 1.7 2.6 4.1 3.6.6.2 1 .4 1.4.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.4-.3z" />
    </svg>
  );
}
