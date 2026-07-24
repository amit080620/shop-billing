"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { voidBillAction } from "@/lib/actions/bills";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded border border-danger px-3 py-1.5 text-sm font-medium text-danger disabled:opacity-60"
    >
      {pending ? "Voiding…" : "Confirm void"}
    </button>
  );
}

export function VoidBillButton({ billId, invoiceNumber }: { billId: string; invoiceNumber: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(voidBillAction, null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="self-end text-xs font-medium text-danger underline"
      >
        Void this invoice
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-lg border border-danger bg-red-50 p-3"
    >
      <input type="hidden" name="billId" value={billId} />
      <p className="text-sm font-medium text-danger">
        Void invoice #{invoiceNumber}?
      </p>
      <p className="text-xs text-danger/80">
        This can&apos;t be undone. The invoice number stays reserved (never reused), stock is
        restored, and it&apos;s excluded from all totals and GST reports. Use this for genuine
        mistakes — issue a fresh corrected invoice afterward if the sale still happened.
      </p>
      <input
        name="reason"
        required
        placeholder="Reason (e.g. entered by mistake, duplicate)"
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-danger"
      />
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <div className="flex gap-2">
        <SubmitButton />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-border px-3 py-1.5 text-sm font-medium text-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
