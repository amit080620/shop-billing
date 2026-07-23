"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { recordVendorPaymentAction } from "@/lib/actions/vendors";
import { formatMoney, formatDateTime } from "@/lib/format";
import { EmptyState } from "@/app/components/EmptyState";

type Purchase = {
  id: string;
  vendorInvoiceNumber: string;
  purchaseDate: string;
  total: number;
  paidAmount: number;
  payableAmount: number;
  createdAt: string;
};
type Payment = { id: string; amount: number; note: string | null; createdAt: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Saving…" : "Record payment"}
    </button>
  );
}

export function VendorLedgerClient({
  vendor,
  balance,
  purchases,
  payments,
}: {
  vendor: { id: string; name: string; phone: string | null; gstin: string | null };
  balance: number;
  purchases: Purchase[];
  payments: Payment[];
}) {
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const [state, formAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await recordVendorPaymentAction(prev, formData);
      if (!result?.error) setShowPaymentForm(false);
      return result;
    },
    null,
  );

  const timeline = [
    ...purchases.map((p) => ({ type: "purchase" as const, at: p.createdAt, data: p })),
    ...payments.map((p) => ({ type: "payment" as const, at: p.createdAt, data: p })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="flex flex-col gap-4">
      <Link href="/vendors" className="text-sm text-muted">
        ← Vendors
      </Link>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h1 className="text-lg font-semibold text-foreground">{vendor.name}</h1>
        <p className="text-sm text-muted">
          {vendor.gstin ? vendor.gstin : vendor.phone || "No GSTIN on file"}
        </p>
        <div className="mt-3">
          <p className="text-xs text-muted">You owe</p>
          <p className={`text-2xl font-semibold ${balance > 0 ? "text-credit" : "text-foreground"}`}>
            {formatMoney(balance)}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Link
          href={`/purchases/new?vendorId=${vendor.id}`}
          className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-center text-sm font-medium text-white"
        >
          + Record purchase
        </Link>
        <button
          onClick={() => setShowPaymentForm((v) => !v)}
          className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground"
        >
          {showPaymentForm ? "Cancel" : "+ Pay vendor"}
        </button>
      </div>

      {showPaymentForm && (
        <form
          action={formAction}
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
        >
          <input type="hidden" name="vendorId" value={vendor.id} />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Amount paid (₹)</span>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Note (optional)</span>
            <input
              name="note"
              placeholder="e.g. Paid via UPI"
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
          <EmptyState text="No purchases or payments recorded yet." />
        ) : (
          <ul className="flex flex-col gap-2">
            {timeline.map((entry) =>
              entry.type === "purchase" ? (
                <li
                  key={entry.data.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      Bill #{entry.data.vendorInvoiceNumber}
                    </p>
                    <p className="text-xs text-muted">{formatDateTime(entry.data.createdAt)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {formatMoney(entry.data.total)}
                    </p>
                    {entry.data.payableAmount > 0 && (
                      <p className="text-xs text-credit">
                        {formatMoney(entry.data.payableAmount)} owed
                      </p>
                    )}
                  </div>
                </li>
              ) : (
                <li
                  key={entry.data.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-brand-soft px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-brand-dark">Payment made</p>
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
