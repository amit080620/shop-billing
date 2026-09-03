"use client";

import { formatMoney } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";
import { buildWhatsAppLink } from "@/lib/whatsapp";

type BillItem = { name: string; quantity: number; unitPrice: number; lineTotal: number };

export function WhatsAppSendButton({
  customerName,
  customerPhone,
  shopName,
  invoiceNumber,
  items,
  total,
  paidAmount,
  creditAmount,
  upiLink,
  lang,
}: {
  customerName: string | null;
  customerPhone: string | null;
  shopName: string;
  invoiceNumber: string;
  items: BillItem[];
  total: number;
  paidAmount: number;
  creditAmount: number;
  upiLink?: string | null;
  lang: Lang;
}) {
  const { t } = useTranslation(lang);

  if (!customerPhone) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 px-3.5 py-2.5 text-center text-xs text-gray-500">
        No phone on file for this sale — attach a customer with a phone number to send invoices on WhatsApp.
      </p>
    );
  }

  // WhatsApp text messages genuinely can't carry any color at all —
  // not for any sender, in any app, ever; it's a platform-wide
  // limitation with no code workaround. *Bold*, _italic_, and a
  // monospace block (```…```, which keeps the item columns from
  // WhatsApp's proportional font from turning ragged) are the actual
  // formatting WhatsApp supports, and are what make this look
  // deliberately put-together rather than a plain data dump.
  const itemLines = items.map((it) => {
    const namePart = it.quantity === 1 ? it.name : `${it.name} x${it.quantity}`;
    const pricePart = it.quantity === 1 ? formatMoney(it.lineTotal) : `${formatMoney(it.unitPrice)} → ${formatMoney(it.lineTotal)}`;
    const dots = ".".repeat(Math.max(1, 28 - namePart.length - pricePart.length));
    return `${namePart}${dots}${pricePart}`;
  });

  const lines = [
    `*${shopName}*`,
    t("wa.billGreeting", { name: customerName ?? "there", shop: shopName }),
    "",
    t("wa.billInvoiceNo", { number: invoiceNumber }),
    "```",
    ...itemLines,
    "```",
    `*${t("wa.billTotalLabel")}: ${formatMoney(total)}*`,
    t("wa.billPaid", { amount: formatMoney(paidAmount) }),
  ];
  if (creditAmount > 0) {
    lines.push(`*${t("wa.billBalanceDue", { amount: formatMoney(creditAmount) })}*`);
    if (upiLink) {
      // Plain-text URI — WhatsApp auto-links recognized schemes, so this
      // renders tappable on most phones and opens whichever UPI app the
      // customer has installed, pre-filled with the amount due.
      lines.push(t("wa.billPayNow", { link: upiLink }));
    }
  }
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
      Send invoice on WhatsApp
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
