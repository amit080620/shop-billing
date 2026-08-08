"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { createReturnAction } from "@/lib/actions/returns";
import { formatMoney } from "@/lib/format";

type BillItem = {
  id: string;
  productName: string;
  originalQuantity: number;
  alreadyReturned: number;
  unitPrice: number;
  gstPercent: number;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full text-center disabled:opacity-60">
      {pending ? "Processing…" : "Confirm return"}
    </button>
  );
}

export function ReturnClient({
  billId,
  invoiceNumber,
  customerName,
  businessType,
  items,
}: {
  billId: string;
  invoiceNumber: string;
  customerName: string | null;
  businessType: string;
  items: BillItem[];
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<"cash" | "card" | "upi" | "online" | "other" | "credit_adjustment">("cash");

  function setQty(itemId: string, qty: number, max: number) {
    setQuantities((prev) => ({ ...prev, [itemId]: Math.max(0, Math.min(qty, max)) }));
  }

  const selectedLines = items
    .map((item) => ({ item, quantity: quantities[item.id] ?? 0 }))
    .filter((l) => l.quantity > 0);

  const totals = useMemo(() => {
    let subtotal = 0;
    let gst = 0;
    for (const line of selectedLines) {
      const lineSubtotal = line.quantity * line.item.unitPrice;
      subtotal += lineSubtotal;
      gst += lineSubtotal * (line.item.gstPercent / 100);
    }
    return { subtotal: Math.round(subtotal * 100) / 100, total: Math.round((subtotal + gst) * 100) / 100 };
  }, [selectedLines]);

  const lines = JSON.stringify(selectedLines.map((l) => ({ billItemId: l.item.id, quantity: l.quantity })));

  const [state, formAction] = useActionState(createReturnAction, null);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-sm text-muted">Every item on this bill has already been fully returned.</p>
        <Link href={`/print/bill/${billId}`} className="text-sm text-brand">
          ← Back to bill
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="billId" value={billId} />
      <input type="hidden" name="lines" value={lines} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Return / Exchange</h1>
          <p className="text-xs text-muted">Invoice #{invoiceNumber} · {customerName ?? (businessType === "clinic" ? "Walk-in patient" : "Walk-in")}</p>
        </div>
        <Link href={`/print/bill/${billId}`} className="text-sm text-brand">
          ← Bill
        </Link>
      </div>

      <p className="text-sm text-muted">Set how many of each item are being returned.</p>

      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const remaining = item.originalQuantity - item.alreadyReturned;
          const qty = quantities[item.id] ?? 0;
          return (
            <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.productName}</p>
                <p className="text-xs text-muted">
                  {formatMoney(item.unitPrice)}/unit · {remaining} of {item.originalQuantity} returnable
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button type="button" onClick={() => setQty(item.id, qty - 1, remaining)} className="h-7 w-7 rounded-full border border-border text-sm">−</button>
                <span className="w-8 text-center text-sm font-medium">{qty}</span>
                <button type="button" onClick={() => setQty(item.id, qty + 1, remaining)} className="h-7 w-7 rounded-full border border-brand bg-brand-soft text-sm text-brand-dark">+</button>
              </div>
            </li>
          );
        })}
      </ul>

      {selectedLines.length > 0 && (
        <div className="flex justify-between rounded-lg bg-brand-soft px-3.5 py-2.5 text-sm">
          <span className="text-brand-dark">Refund total (incl. GST)</span>
          <span className="font-semibold text-brand-dark">{formatMoney(totals.total)}</span>
        </div>
      )}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Reason (optional)</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          name="reason"
          placeholder="e.g. size didn't fit, item damaged"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-foreground">Refund given via</p>
        <div className="flex flex-wrap gap-2">
          {(["cash", "card", "upi", "online", "credit_adjustment", "other"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setRefundMethod(m)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize ${
                refundMethod === m ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"
              }`}
            >
              {m === "credit_adjustment" ? "Adjust against credit" : m}
            </button>
          ))}
        </div>
        <input type="hidden" name="refundMethod" value={refundMethod} />
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Manager PIN (if your shop uses one)</span>
        <input
          name="managerPin"
          type="text"
          inputMode="numeric"
          placeholder="Leave blank if not set up"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
