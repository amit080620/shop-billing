"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { generateBillFromPrescriptionAction } from "@/lib/actions/clinic";

export function GenerateBillButton({
  prescriptionId,
  alreadyBilled,
  existingBillId,
}: {
  prescriptionId: string;
  alreadyBilled: boolean;
  existingBillId: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi" | "online" | "other">("cash");

  if (alreadyBilled && existingBillId) {
    return (
      <Link href={`/print/bill/${existingBillId}`} className="rounded-lg border border-brand bg-brand-soft px-4 py-2.5 text-center text-sm font-medium text-brand-text">
        View bill for this prescription →
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-brand bg-brand-soft p-3">
      <p className="text-xs text-brand-text">
        Generate an invoice for these medicines — prices come from your product catalog where the names match, others bill as manual lines.
      </p>
      <div className="flex gap-2">
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        >
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="upi">UPI</option>
          <option value="online">Online</option>
          <option value="other">Other</option>
        </select>
        <button
          onClick={() =>
            startTransition(async () => {
              const result = await generateBillFromPrescriptionAction(prescriptionId, paymentMethod);
              if (result.error || !result.billId) {
                setError(result.error ?? "Could not generate bill");
                return;
              }
              router.push(`/print/bill/${result.billId}`);
            })
          }
          disabled={isPending}
          className="btn-primary-sm shrink-0 disabled:opacity-60"
        >
          {isPending ? "Generating…" : "Generate bill"}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
