"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { recordPaymentAction } from "@/lib/actions/customers";
import { formatMoney, formatDateTime } from "@/lib/format";
import { EmptyState } from "@/app/components/EmptyState";
import { DownloadStatementButton } from "./DownloadStatementButton";
import { PaymentMethodPicker } from "@/app/components/PaymentMethodPicker";

type BillItem = { name: string; quantity: number; unitPrice: number; lineTotal: number };
type Bill = {
  id: string;
  invoiceNumber: string;
  total: number;
  paidAmount: number;
  creditAmount: number;
  status: "active" | "voided";
  createdAt: string;
  items: BillItem[];
};
type Payment = { id: string; amount: number; note: string | null; createdAt: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary-sm">
      {pending ? "Saving…" : "Record payment"}
    </button>
  );
}

export function LedgerClient({
  customer,
  shopName,
  balance,
  bills,
  payments,
}: {
  customer: { id: string; name: string; phone: string };
  shopName: string;
  balance: number;
  bills: Bill[];
  payments: Payment[];
}) {
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);

  const [state, formAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await recordPaymentAction(prev, formData);
      if (!result?.error) setShowPaymentForm(false);
      return result;
    },
    null,
  );

  const timeline = [
    ...bills.map((b) => ({ type: "bill" as const, at: b.createdAt, data: b })),
    ...payments.map((p) => ({ type: "payment" as const, at: p.createdAt, data: p })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const whatsappHref = buildWhatsAppReminderLink(customer, balance);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/customers" className="text-sm text-muted">
        ← Customers
      </Link>

      <div className="rounded-xl border border-border bg-surface shadow-sm p-4">
        <h1 className="text-lg font-semibold text-foreground">{customer.name}</h1>
        <p className="text-sm text-muted">{customer.phone}</p>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-xs text-muted">Outstanding balance</p>
            <p className={`text-2xl font-semibold ${balance > 0 ? "text-credit" : "text-foreground"}`}>
              {formatMoney(balance)}
            </p>
          </div>
          {balance > 0 && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3.5 py-2 text-sm font-medium text-white"
            >
              <WhatsAppIcon />
              Remind
            </a>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setShowPaymentForm((v) => !v)}
          className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground"
        >
          {showPaymentForm ? "Cancel" : "+ Record a payment"}
        </button>
        <DownloadStatementButton customer={customer} shopName={shopName} balance={balance} bills={bills} payments={payments} />
      </div>
      <p className="text-xs text-muted">
        Tap any bill below to see exactly what was bought that day — a full itemized statement
        (downloadable above) keeps monthly settlement transparent for regular udhaar customers.
      </p>

      {showPaymentForm && (
        <form
          action={formAction}
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface shadow-sm p-4"
        >
          <input type="hidden" name="customerId" value={customer.id} />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Amount received (₹)</span>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <PaymentMethodPicker />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Note (optional)</span>
            <input
              name="note"
              placeholder="e.g. Paid in cash"
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          {state?.error && <p className="text-sm text-credit">{state.error}</p>}
          <SubmitButton />
        </form>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">History</h2>
        {timeline.length === 0 ? (
          <EmptyState text="No bills or payments recorded yet." />
        ) : (
          <ul className="flex flex-col gap-2">
            {timeline.map((entry) =>
              entry.type === "bill" ? (
                <li
                  key={entry.data.id}
                  className={`rounded-lg border shadow-sm ${
                    entry.data.status === "voided"
                      ? "border-border bg-background opacity-60"
                      : "border-border bg-surface"
                  }`}
                >
                  <button
                    onClick={() =>
                      setExpandedBillId((cur) => (cur === entry.data.id ? null : entry.data.id))
                    }
                    className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-medium text-foreground ${
                          entry.data.status === "voided" ? "line-through" : ""
                        }`}
                      >
                        Bill #{entry.data.invoiceNumber}
                      </p>
                      <p className="text-xs text-muted">{formatDateTime(entry.data.createdAt)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {entry.data.status === "voided" ? (
                        <p className="text-xs font-medium text-danger">Voided</p>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-foreground">
                            {formatMoney(entry.data.total)}
                          </p>
                          {entry.data.creditAmount > 0 && (
                            <p className="text-xs text-credit">
                              {formatMoney(entry.data.creditAmount)} on credit
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </button>
                  {expandedBillId === entry.data.id && (
                    <div className="border-t border-border px-3.5 py-2.5">
                      <ul className="flex flex-col gap-1">
                        {entry.data.items.map((item, i) => (
                          <li key={i} className="flex justify-between text-xs text-muted">
                            <span className="min-w-0 flex-1 truncate">
                              {item.name} × {item.quantity}
                            </span>
                            <span className="shrink-0 text-foreground">
                              {formatMoney(item.lineTotal)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <Link
                        href={`/print/bill/${entry.data.id}`}
                        className="mt-2 inline-block text-xs font-medium text-brand"
                      >
                        View full invoice →
                      </Link>
                    </div>
                  )}
                </li>
              ) : (
                <li
                  key={entry.data.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-brand-soft px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-brand-dark">
                      Payment received
                    </p>
                    <p className="truncate text-xs text-muted">
                      {formatDateTime(entry.data.createdAt)}
                      {entry.data.note ? ` · ${entry.data.note}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-brand-dark">
                    − {formatMoney(entry.data.amount)}
                  </p>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

function buildWhatsAppReminderLink(customer: { name: string; phone: string }, balance: number) {
  // wa.me only supports pre-filled TEXT, never file/image attachments —
  // this is a platform limitation, not a shortcut. See lib note in bills.ts.
  const digits = customer.phone.replace(/\D/g, "");
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  const message =
    `Hi ${customer.name}, this is a reminder that you have an outstanding ` +
    `balance of ${formatMoney(balance)}. Please pay at your earliest convenience. Thank you!`;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.3c1.4.8 3.1 1.3 4.8 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3C4 14.8 3.6 13.4 3.6 12c0-4.6 3.8-8.4 8.4-8.4s8.4 3.8 8.4 8.4-3.8 8.4-8.4 8.4zm4.6-6.3c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8.9-.2.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.2.2-.4.1-.1 0-.3 0-.4C10.4 9.4 10 8.4 9.8 8c-.2-.4-.3-.3-.5-.3h-.4c-.1 0-.4 0-.6.3-.2.2-.8.8-.8 2s.9 2.3 1 2.4c.1.2 1.7 2.6 4.1 3.6.6.2 1 .4 1.4.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.4-.3z" />
    </svg>
  );
}
