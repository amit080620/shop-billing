"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { addBatchAction } from "@/lib/actions/pharmacy";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary-sm disabled:opacity-60">
      {pending ? "Adding…" : "Add batch"}
    </button>
  );
}

export function AddBatchForm({ productId }: { productId: string }) {
  const [state, formAction] = useActionState(addBatchAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
      <input type="hidden" name="productId" value={productId} />
      <p className="text-sm font-semibold text-brand-dark">Add new batch (new stock arrived)</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-brand-dark">
          Batch number
          <input name="batchNumber" required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brand-dark">
          Quantity
          <input name="quantity" type="number" min="0.001" step="0.001" required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brand-dark">
          Mfg date (optional)
          <input name="mfgDate" type="date" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brand-dark">
          Expiry date
          <input name="expiryDate" type="date" required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brand-dark">
          Manufacturer (optional)
          <input name="manufacturer" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brand-dark">
          Cost price/unit (optional)
          <input name="purchasePrice" type="number" min="0" step="0.01" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
