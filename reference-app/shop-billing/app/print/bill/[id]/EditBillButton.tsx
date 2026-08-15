"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editBillQuantitiesAction } from "@/lib/actions/bills";

type Item = { id: string; productName: string; quantity: number };

export function EditBillButton({ billId, invoiceNumber, items }: { billId: string; invoiceNumber: string; items: Item[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>(Object.fromEntries(items.map((i) => [i.id, i.quantity])));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasChanges = items.some((i) => quantities[i.id] !== i.quantity);

  function save() {
    if (!hasChanges) {
      setError("Change at least one quantity first");
      return;
    }
    startTransition(async () => {
      const result = await editBillQuantitiesAction(
        billId,
        items.filter((i) => quantities[i.id] !== i.quantity).map((i) => ({ billItemId: i.id, newQuantity: quantities[i.id] })),
        reason,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="no-print block w-full rounded-lg border border-brand px-4 py-2.5 text-center text-sm font-medium text-brand-text"
      >
        <span className="flex items-center gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- small branded SVG icon */}
          <img src="/assets/ray-icons/edit.svg" alt="" className="h-3.5 w-3.5" /> Edit bill
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setOpen(false)}>
          <div className="flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-2xl bg-surface p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground">Edit invoice #{invoiceNumber}</p>
            <p className="text-xs text-muted">
              Only quantities can be corrected here — to add or remove a different item, void this bill and create a new one instead. The invoice number stays the same; who edited it and why is recorded.
            </p>

            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                  <p className="min-w-0 flex-1 truncate text-sm text-foreground">{item.productName}</p>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    value={quantities[item.id]}
                    onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))}
                    className="w-20 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand"
                  />
                </div>
              ))}
            </div>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">Reason for this edit</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Customer said quantity was wrong"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>

            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
              <button onClick={save} disabled={isPending} className="btn-primary-sm flex-1 disabled:opacity-60">
                {isPending ? "Saving…" : "Save changes"}
              </button>
              <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
