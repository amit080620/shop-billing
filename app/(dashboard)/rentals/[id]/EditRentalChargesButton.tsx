"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editRentalChargesAction } from "@/lib/actions/rentals";
import { formatMoney } from "@/lib/format";

export function EditRentalChargesButton({
  rentalId,
  damageCharge: initialDamageCharge,
  lateFee: initialLateFee,
  securityDepositReturned: initialDepositReturned,
  securityDepositCollected,
}: {
  rentalId: string;
  damageCharge: number;
  lateFee: number;
  securityDepositReturned: number;
  securityDepositCollected: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [damageCharge, setDamageCharge] = useState(String(initialDamageCharge));
  const [lateFee, setLateFee] = useState(String(initialLateFee));
  const [depositReturned, setDepositReturned] = useState(String(initialDepositReturned));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await editRentalChargesAction(
        rentalId,
        {
          damageCharge: Number(damageCharge) || 0,
          lateFee: Number(lateFee) || 0,
          securityDepositReturned: Number(depositReturned) || 0,
        },
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
      <button onClick={() => setOpen(true)} className="mt-2 self-start text-xs font-medium text-brand">
        ✏️ Edit damage/late fee & deposit
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setOpen(false)}>
          <div className="flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-2xl bg-surface p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground">Correct return charges</p>
            <p className="text-xs text-muted">Deposit collected was {formatMoney(securityDepositCollected)}.</p>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">Damage charge (₹)</span>
              <input type="number" min={0} step="0.01" value={damageCharge} onChange={(e) => setDamageCharge(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">Late fee (₹)</span>
              <input type="number" min={0} step="0.01" value={lateFee} onChange={(e) => setLateFee(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">Deposit returned (₹)</span>
              <input type="number" min={0} step="0.01" value={depositReturned} onChange={(e) => setDepositReturned(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand" />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">Reason for this edit</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Damage was overestimated at return"
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
