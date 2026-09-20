"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { generateBillFromPrescriptionAction } from "@/lib/actions/clinic";
import { formatMoney, paymentMethodLabel } from "@/lib/format";

type Line = { medicineName: string; quantity: number; unitPrice: number; inCatalog: boolean };

/** Bills the medicines on a prescription. Prices come from the catalog
 * where the names match; anything else starts at zero and is typed here,
 * so a prescription never silently turns into a ₹0 invoice. */
export function GenerateBillButton({
  prescriptionId,
  alreadyBilled,
  existingBillId,
  initialLines,
  labels,
}: {
  prescriptionId: string;
  alreadyBilled: boolean;
  existingBillId: string | null;
  initialLines: Line[];
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi" | "online" | "other">("cash");
  const [lines, setLines] = useState<Line[]>(initialLines);
  const [collectNow, setCollectNow] = useState(true);

  if (alreadyBilled && existingBillId) {
    return (
      <Link href={`/print/bill/${existingBillId}`} className="rounded-lg border border-brand bg-brand-soft px-4 py-2.5 text-center text-sm font-medium text-brand-text">
        {labels.viewBill}
      </Link>
    );
  }

  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const unpriced = lines.filter((l) => l.unitPrice <= 0).length;

  return (
    <div className="no-print flex flex-col gap-2.5 rounded-lg border border-border bg-surface p-3">
      <p className="text-sm font-semibold text-foreground">{labels.title}</p>
      <ul className="flex flex-col divide-y divide-border">
        {lines.map((line, i) => (
          <li key={i} className="flex items-center gap-2 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{line.medicineName}</span>
            <input
              type="number"
              min={1}
              value={line.quantity}
              onChange={(e) =>
                setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, quantity: Math.max(1, Number(e.target.value) || 1) } : l)))
              }
              aria-label={labels.qty}
              className="w-14 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm outline-none focus:border-brand"
            />
            <input
              type="number"
              min={0}
              step="0.01"
              value={line.unitPrice || ""}
              placeholder={labels.price}
              onChange={(e) =>
                setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, unitPrice: Math.max(0, Number(e.target.value) || 0) } : l)))
              }
              aria-label={labels.price}
              className={`w-20 rounded-lg border bg-background px-2 py-1.5 text-right text-sm outline-none focus:border-brand ${
                line.unitPrice > 0 ? "border-border" : "border-warning"
              }`}
            />
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between rounded-lg bg-brand-soft px-3 py-2 text-sm">
        <span className="text-brand-text">{labels.total}</span>
        <span className="font-bold text-brand-text">{formatMoney(total)}</span>
      </div>
      {unpriced > 0 && <p className="text-xs text-warning">{labels.unpriced}</p>}

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={collectNow} onChange={(e) => setCollectNow(e.target.checked)} className="h-4 w-4 rounded border-border" />
        {labels.collectNow}
      </label>

      <div className="flex gap-2">
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
          aria-label={labels.paidVia}
          disabled={!collectNow}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand disabled:opacity-50"
        >
          {(["cash", "card", "upi", "online", "other"] as const).map((m) => (
            <option key={m} value={m}>
              {paymentMethodLabel(m)}
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await generateBillFromPrescriptionAction(prescriptionId, paymentMethod, {
                lines: lines.map((l) => ({ medicineName: l.medicineName, quantity: l.quantity, unitPrice: l.unitPrice })),
                collectNow,
              });
              if (result.error || !result.billId) {
                setError(result.error ?? labels.failed);
                return;
              }
              router.push(`/print/bill/${result.billId}`);
            })
          }
          disabled={isPending || total <= 0}
          className="btn-primary-sm flex-1 disabled:opacity-60"
        >
          {isPending ? labels.generating : labels.generate}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
