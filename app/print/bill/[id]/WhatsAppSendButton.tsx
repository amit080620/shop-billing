"use client";

import { formatMoney } from "@/lib/format";

export function WhatsAppSendButton({
  customerName,
  customerPhone,
  shopName,
  invoiceNumber,
  total,
  paidAmount,
  creditAmount,
}: {
  customerName: string | null;
  customerPhone: string | null;
  shopName: string;
  invoiceNumber: string;
  total: number;
  paidAmount: number;
  creditAmount: number;
}) {
  if (!customerPhone) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 px-3.5 py-2.5 text-center text-xs text-gray-500">
        No phone on file for this sale — attach a customer with a phone number to send invoices on WhatsApp.
      </p>
    );
  }

  const digits = customerPhone.replace(/\D/g, "");
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;

  const lines = [
    `Hi ${customerName ?? "there"}, here's your invoice from ${shopName}.`,
    `Invoice #${invoiceNumber}`,
    `Total: ${formatMoney(total)}`,
    `Paid: ${formatMoney(paidAmount)}`,
  ];
  if (creditAmount > 0) {
    lines.push(`Balance due: ${formatMoney(creditAmount)}`);
  }
  lines.push("Thank you for your business!");

  const href = `https://wa.me/${withCountryCode}?text=${encodeURIComponent(lines.join("\n"))}`;

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
