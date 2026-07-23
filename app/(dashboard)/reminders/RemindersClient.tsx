"use client";

import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/app/components/EmptyState";
import { PageIcon } from "@/app/components/PageIcon";

type Customer = { id: string; name: string; phone: string; balance: number };

export function RemindersClient({
  shopName,
  customers,
  totalOutstanding,
}: {
  shopName: string;
  customers: Customer[];
  totalOutstanding: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <PageIcon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
        </PageIcon>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Udhaar reminders</h1>
          <p className="text-sm text-muted">
            Tap each customer to open WhatsApp — you still hit Send yourself.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-credit-soft p-4">
        <p className="text-xs text-credit">Total outstanding</p>
        <p className="mt-1 text-xl font-semibold text-credit">{formatMoney(totalOutstanding)}</p>
      </div>

      {customers.length === 0 ? (
        <EmptyState text="No outstanding udhaar right now — everyone's settled up." />
      ) : (
        <ul className="flex flex-col gap-2">
          {customers.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface shadow-sm px-3.5 py-3"
            >
              <Link href={`/customers/${c.id}`} className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                <p className="text-xs text-credit">{formatMoney(c.balance)} due</p>
              </Link>
              <a
                href={buildWhatsAppLink(c, shopName)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-medium text-white"
              >
                <WhatsAppIcon />
                Remind
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="text-center text-xs text-muted">
        True automatic sending (no tap needed) requires WhatsApp&apos;s paid Business API —
        this list is the practical middle ground: go through it monthly, one tap each.
      </p>
    </div>
  );
}

function buildWhatsAppLink(customer: Customer, shopName: string) {
  const digits = customer.phone.replace(/\D/g, "");
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  const message =
    `Hi ${customer.name}, this is a reminder from ${shopName} that you have an outstanding ` +
    `balance of ${formatMoney(customer.balance)}. Please pay at your earliest convenience. Thank you!`;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}

function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.3c1.4.8 3.1 1.3 4.8 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3C4 14.8 3.6 13.4 3.6 12c0-4.6 3.8-8.4 8.4-8.4s8.4 3.8 8.4 8.4-3.8 8.4-8.4 8.4zm4.6-6.3c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8.9-.2.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.2.2-.4.1-.1 0-.3 0-.4C10.4 9.4 10 8.4 9.8 8c-.2-.4-.3-.3-.5-.3h-.4c-.1 0-.4 0-.6.3-.2.2-.8.8-.8 2s.9 2.3 1 2.4c.1.2 1.7 2.6 4.1 3.6.6.2 1 .4 1.4.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.4-.3z" />
    </svg>
  );
}
