"use client";

import Link from "@/lib/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createDebitNoteAction } from "@/lib/actions/debitNotes";
import { keepValuesOnError } from "@/lib/keepValuesOnError";
import { formatMoney } from "@/lib/format";
import { round2, splitTax } from "@/lib/gst";

const METHODS = [
  ["cash", "Cash"],
  ["upi", "UPI"],
  ["card", "Card"],
  ["online", "Online"],
  ["other", "Other"],
  ["udhar", "Add to udhaar"],
] as const;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
      {pending ? "Saving…" : "Issue debit note"}
    </button>
  );
}

export function DebitNoteClient({
  billId,
  invoiceNumber,
  customerName,
  canUseUdhar,
  isInterState,
  isComposition,
  suggestedRate,
  rates,
}: {
  billId: string;
  invoiceNumber: string;
  customerName: string | null;
  canUseUdhar: boolean;
  isInterState: boolean;
  isComposition: boolean;
  suggestedRate: number;
  rates: number[];
}) {
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState(isComposition ? 0 : suggestedRate);
  const [method, setMethod] = useState<(typeof METHODS)[number][0]>("cash");
  const [state, formAction] = useActionState(keepValuesOnError(createDebitNoteAction), null);

  const base = Math.max(0, Number(amount) || 0);
  const tax = splitTax(base, rate, isInterState ? "inter" : "intra");
  const total = round2(base + tax.cgst + tax.sgst + tax.igst);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="billId" value={billId} />
      <input type="hidden" name="gstPercent" value={rate} />
      <input type="hidden" name="paymentMethod" value={method} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground md:text-2xl">Debit note</h1>
          <p className="text-xs text-muted">
            Invoice #{invoiceNumber} · {customerName ?? "Walk-in"}
          </p>
        </div>
        <Link href={`/print/bill/${billId}`} className="text-sm text-brand">
          ← Bill
        </Link>
      </div>

      <p className="rounded-lg bg-surface-2 px-3.5 py-2.5 text-xs text-muted">
        Use this when the invoice was too low — a price that should have been higher, or a charge added later. The invoice stays as it is; this note adds the extra and its GST, and goes into your GST reports for this month.
      </p>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Extra amount, before GST (₹)</span>
        <input
          name="amount"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 500"
          className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand"
        />
      </label>

      {!isComposition && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-foreground">GST rate on it</p>
          <div className="flex flex-wrap gap-2">
            {rates.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRate(r)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${rate === r ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}
              >
                {r}%
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Why the value is going up</span>
        <input
          name="reason"
          placeholder="e.g. Price revised as agreed, transport charged later"
          className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-foreground">How the customer pays the extra</p>
        <div className="flex flex-wrap gap-2">
          {METHODS.filter(([m]) => m !== "udhar" || canUseUdhar).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${method === m ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {base > 0 && (
        <div className="neu-card flex flex-col gap-1 p-4 text-sm">
          <Row label="Extra amount" value={formatMoney(base)} />
          {isInterState ? <Row label="IGST" value={formatMoney(tax.igst)} /> : (
            <>
              <Row label="CGST" value={formatMoney(tax.cgst)} />
              <Row label="SGST" value={formatMoney(tax.sgst)} />
            </>
          )}
          <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-semibold text-foreground">
            <span>Debit note total</span>
            <span>{formatMoney(total)}</span>
          </div>
        </div>
      )}

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <Submit />
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
