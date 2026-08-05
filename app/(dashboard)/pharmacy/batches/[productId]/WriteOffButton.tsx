"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { writeOffBatchAction } from "@/lib/actions/pharmacy";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary-sm disabled:opacity-60">
      {pending ? "Saving…" : "Confirm write-off"}
    </button>
  );
}

export function WriteOffButton({
  batchId,
  productId,
  batchNumber,
  maxQuantity,
  unit,
}: {
  batchId: string;
  productId: string;
  batchNumber: string;
  maxQuantity: number;
  unit: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(writeOffBatchAction, null);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="shrink-0 text-xs text-credit">
        Write off
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <form action={formAction} className="w-full max-w-xs rounded-2xl bg-surface p-5">
        <input type="hidden" name="batchId" value={batchId} />
        <input type="hidden" name="productId" value={productId} />
        <p className="text-sm font-semibold text-foreground">Write off batch {batchNumber}</p>
        <p className="mt-1 text-xs text-muted">
          For stock that&apos;s expired or damaged — this records it as a loss and removes it
          from stock. Not for correcting a data-entry mistake (use Remove for that).
        </p>

        <label className="mt-3 flex flex-col gap-1 text-xs text-muted">
          Quantity to write off (max {maxQuantity} {unit})
          <input
            name="quantity"
            type="number"
            min="0.001"
            max={maxQuantity}
            step="0.001"
            defaultValue={maxQuantity}
            required
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <div className="mt-3 flex flex-col gap-1">
          <span className="text-xs text-muted">Reason</span>
          <div className="flex gap-2">
            {(["expired", "damaged", "other"] as const).map((r) => (
              <label key={r} className="flex items-center gap-1.5 text-xs text-foreground">
                <input type="radio" name="reason" value={r} defaultChecked={r === "expired"} className="h-3.5 w-3.5" />
                <span className="capitalize">{r}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="mt-3 flex flex-col gap-1 text-xs text-muted">
          Notes (optional)
          <input
            name="notes"
            placeholder="e.g. found during monthly check"
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        {state?.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}

        <div className="mt-4 flex gap-2">
          <SubmitButton />
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
