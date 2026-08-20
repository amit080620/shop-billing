"use client";

import Link from "next/link";

function buildWinBackLink(name: string, phone: string) {
  const digits = phone.replace(/\D/g, "");
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  const message = `Hi ${name}, it's been a while since we saw you! We've missed you — come by soon, we'd love to have you back.`;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}

export function WinBackRow({
  customerId,
  name,
  phone,
  lastOrderDays,
  avgGapDays,
  totalOrders,
}: {
  customerId: string;
  name: string;
  phone: string;
  lastOrderDays: number;
  avgGapDays: number;
  totalOrders: number;
}) {
  return (
    <li className="neu-card flex items-center gap-3 px-3.5 py-3">
      <Link href={`/customers/${customerId}`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        <p className="text-xs text-muted">
          Usually every {avgGapDays} days · {totalOrders} past orders · gone {lastOrderDays} days
        </p>
      </Link>
      <a
        href={buildWinBackLink(name, phone)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Send win-back message"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.3c1.4.8 3.1 1.3 4.8 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3C4 14.8 3.6 13.4 3.6 12c0-4.6 3.8-8.4 8.4-8.4s8.4 3.8 8.4 8.4-3.8 8.4-8.4 8.4zm4.6-6.3c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8.9-.2.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.2.2-.4.1-.1 0-.3 0-.4C10.4 9.4 10 8.4 9.8 8c-.2-.4-.3-.3-.5-.3h-.4c-.1 0-.4 0-.6.3-.2.2-.8.8-.8 2s.9 2.3 1 2.4c.1.2 1.7 2.6 4.1 3.6.6.2 1 .4 1.4.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.4-.3z" />
        </svg>
      </a>
    </li>
  );
}
