"use client";

import { useMemo, useState } from "react";
import { PageIcon } from "@/app/components/PageIcon";
import { EmptyState } from "@/app/components/EmptyState";

type Customer = { id: string; name: string; phone: string };

export function OffersClient({
  shopName,
  customers,
}: {
  shopName: string;
  customers: Customer[];
}) {
  const [message, setMessage] = useState(
    `🎉 Special offer at ${shopName}! Visit us this week for great deals. See you soon!`,
  );
  const [search, setSearch] = useState("");
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () =>
      customers.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search),
      ),
    [customers, search],
  );

  const sentCount = customers.filter((c) => sentIds.has(c.id)).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <PageIcon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16v12H7l-3 3V4Z" />
            <path d="M8 9h8M8 12h5" />
          </svg>
        </PageIcon>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Send an offer</h1>
          <p className="text-sm text-muted">
            Write it once, then tap each customer to send — WhatsApp only lets a real person hit
            Send, so this can&apos;t be fully automatic.
          </p>
        </div>
      </div>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Your message</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <p className="text-xs text-muted">{message.length} characters</p>
      </section>

      {customers.length > 0 && (
        <div className="flex items-center justify-between">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone"
            className="flex-1 rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5 text-sm outline-none focus:border-brand"
          />
          {sentCount > 0 && (
            <span className="ml-3 shrink-0 text-xs text-muted">
              {sentCount}/{customers.length} sent
            </span>
          )}
        </div>
      )}

      {customers.length === 0 ? (
        <EmptyState text="No customers yet. Add some from the Customers page first." />
      ) : filtered.length === 0 ? (
        <EmptyState text="No customers match that search." />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((c) => {
            const sent = sentIds.has(c.id);
            return (
              <li
                key={c.id}
                className={`flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-3 shadow-sm ${
                  sent ? "bg-background opacity-60" : "bg-surface"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                  <p className="text-xs text-muted">{c.phone}</p>
                </div>
                <a
                  href={buildWhatsAppLink(c.phone, message)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setSentIds((prev) => new Set(prev).add(c.id))}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white ${
                    sent ? "bg-gray-400" : "bg-[#25D366]"
                  }`}
                >
                  <WhatsAppIcon />
                  {sent ? "Sent" : "Send"}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function buildWhatsAppLink(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "");
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}

function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.3c1.4.8 3.1 1.3 4.8 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3C4 14.8 3.6 13.4 3.6 12c0-4.6 3.8-8.4 8.4-8.4s8.4 3.8 8.4 8.4-3.8 8.4-8.4 8.4zm4.6-6.3c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8.9-.2.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.2.2-.4.1-.1 0-.3 0-.4C10.4 9.4 10 8.4 9.8 8c-.2-.4-.3-.3-.5-.3h-.4c-.1 0-.4 0-.6.3-.2.2-.8.8-.8 2s.9 2.3 1 2.4c.1.2 1.7 2.6 4.1 3.6.6.2 1 .4 1.4.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.4-.3z" />
    </svg>
  );
}
