"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/app/components/EmptyState";
import { PageIcon } from "@/app/components/PageIcon";

type Customer = { id: string; name: string; phone: string; balance: number; daysPending: number };

export function RemindersClient({
  shopName,
  customers,
  totalOutstanding,
}: {
  shopName: string;
  customers: Customer[];
  totalOutstanding: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  const allSelected = customers.length > 0 && selected.size === customers.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(customers.map((c) => c.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedCustomers = useMemo(
    () => customers.filter((c) => selected.has(c.id) && !sentIds.has(c.id)),
    [customers, selected, sentIds],
  );

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
            Select customers (or Select all), then work through the list — you still hit Send
            in WhatsApp yourself for each one.
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
        <>
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-border"
            />
            Select all ({customers.length})
          </label>

          {selectedCustomers.length > 0 && (
            <section className="flex flex-col gap-2 rounded-xl border border-dashed border-brand bg-brand-soft p-3">
              <p className="text-xs font-semibold text-brand-dark">
                Ready to send ({selectedCustomers.length})
              </p>
              <ul className="flex flex-col gap-1.5">
                {selectedCustomers.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{c.name}</span>
                    <a
                      href={buildWhatsAppLink(c, shopName)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setSentIds((prev) => new Set(prev).add(c.id))}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#25D366] px-2.5 py-1.5 text-xs font-medium text-white"
                    >
                      <WhatsAppIcon />
                      Send
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ul className="flex flex-col gap-2">
            {customers.map((c) => {
              const sent = sentIds.has(c.id);
              return (
                <li
                  key={c.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border border-border shadow-sm px-3.5 py-3 ${
                    sent ? "bg-background opacity-60" : "bg-surface"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleOne(c.id)}
                    className="h-4 w-4 shrink-0 rounded border-border"
                  />
                  <Link href={`/customers/${c.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs text-credit">{formatMoney(c.balance)} due</p>
                      <AgingBadge days={c.daysPending} />
                    </div>
                  </Link>
                  <a
                    href={buildWhatsAppLink(c, shopName)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setSentIds((prev) => new Set(prev).add(c.id))}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white ${
                      sent ? "bg-gray-400" : "bg-[#25D366]"
                    }`}
                  >
                    <WhatsAppIcon />
                    {sent ? "Sent" : "Remind"}
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="text-center text-xs text-muted">
        True automatic sending (no tap needed) requires WhatsApp&apos;s paid Business API —
        select who you need and work through them monthly, one tap each.
      </p>
    </div>
  );
}

function AgingBadge({ days }: { days: number }) {
  const label = days === 0 ? "Today" : `${days}d pending`;
  const tone = days >= 30 ? "red" : days >= 10 ? "orange" : "green";
  const styles: Record<string, { className: string; style?: React.CSSProperties }> = {
    green: { className: "text-white", style: { backgroundColor: "#16a34a" } },
    orange: { className: "text-white", style: { backgroundColor: "#c2760f" } },
    red: { className: "bg-danger/15 text-danger" },
  };
  const { className, style } = styles[tone];
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${className}`} style={style}>
      {label}
    </span>
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
