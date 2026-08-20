"use client";

import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { buildWhatsAppLink } from "@/lib/whatsapp";

function buildReminderLink(name: string, phone: string, amount: number) {
  const message = `Hi ${name}, a gentle reminder — ${formatMoney(amount)} is pending on your account. Please clear it when convenient. Thank you!`;
  return buildWhatsAppLink(phone, message);
}

export function AgingRow({
  customerId,
  name,
  phone,
  amount,
  days,
}: {
  customerId: string;
  name: string;
  phone: string;
  amount: number;
  days: number;
}) {
  return (
    <li className="neu-card flex items-center gap-3 px-3.5 py-3">
      <Link href={`/customers/${customerId}`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        <p className="text-xs text-muted">
          {days} day{days === 1 ? "" : "s"} since oldest unpaid bill
        </p>
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        <p className="text-sm font-semibold text-credit">{formatMoney(amount)}</p>
        <a
          href={buildReminderLink(name, phone, amount)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Send WhatsApp reminder"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366] text-white"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.3c1.4.8 3.1 1.3 4.8 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3C4 14.8 3.6 13.4 3.6 12c0-4.6 3.8-8.4 8.4-8.4s8.4 3.8 8.4 8.4-3.8 8.4-8.4 8.4zm4.6-6.3c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8.9-.2.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.2.2-.4.1-.1 0-.3 0-.4C10.4 9.4 10 8.4 9.8 8c-.2-.4-.3-.3-.5-.3h-.4c-.1 0-.4 0-.6.3-.2.2-.8.8-.8 2s.9 2.3 1 2.4c.1.2 1.7 2.6 4.1 3.6.6.2 1 .4 1.4.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.4-.3z" />
          </svg>
        </a>
      </div>
    </li>
  );
}
