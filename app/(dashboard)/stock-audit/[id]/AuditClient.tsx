"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateAuditItemAction, completeAuditAction, discardAuditAction } from "@/lib/actions/stock-audit";

type Item = {
  id: string;
  productName: string;
  unit: string;
  systemQuantity: number;
  countedQuantity: number | null;
};

export function AuditClient({
  auditId,
  status,
  items: initialItems,
}: {
  auditId: string;
  status: "draft" | "completed";
  items: Item[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);

  const isDraft = status === "draft";
  const countedCount = items.filter((i) => i.countedQuantity !== null).length;
  const discrepancies = items.filter((i) => i.countedQuantity !== null && i.countedQuantity !== i.systemQuantity);

  function updateCount(itemId: string, value: string) {
    const counted = value === "" ? null : Math.max(0, Number(value));
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, countedQuantity: counted } : i)));
  }

  function saveCount(itemId: string, counted: number | null) {
    startTransition(async () => {
      const result = await updateAuditItemAction(itemId, counted);
      if (result?.error) setError(result.error);
    });
  }

  function handleComplete() {
    startTransition(async () => {
      const result = await completeAuditAction(auditId);
      if (result?.error) setError(result.error);
    });
  }

  function handleDiscard() {
    startTransition(async () => {
      const result = await discardAuditAction(auditId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.push("/stock-audit");
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-20">
      <Link href="/stock-audit" className="text-sm text-muted">
        ← All counts
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">
          {isDraft ? "Counting in progress" : "Count completed"}
        </h1>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isDraft ? "bg-credit-soft text-credit" : "bg-brand-soft text-brand-text"}`}>
          {countedCount} / {items.length} counted
        </span>
      </div>

      {!isDraft && discrepancies.length > 0 && (
        <p className="rounded-lg border border-dashed border-credit bg-credit-soft px-3.5 py-2.5 text-xs text-credit">
          {discrepancies.length} item(s) had a mismatch — stock levels below were updated to match the physical count.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const diff = item.countedQuantity !== null ? item.countedQuantity - item.systemQuantity : null;
          return (
            <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.productName}</p>
                <p className="text-xs text-muted">
                  System: {item.systemQuantity} {item.unit}
                  {diff !== null && diff !== 0 && (
                    <span className={diff > 0 ? "text-brand" : "text-danger"}> · {diff > 0 ? "+" : ""}{diff} {item.unit}</span>
                  )}
                </p>
              </div>
              <input
                type="number"
                step="0.001"
                min="0"
                value={item.countedQuantity ?? ""}
                onChange={(e) => updateCount(item.id, e.target.value)}
                onBlur={() => saveCount(item.id, item.countedQuantity)}
                disabled={!isDraft}
                placeholder="Count"
                className="w-24 shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-right text-sm outline-none focus:border-brand disabled:opacity-60"
              />
            </li>
          );
        })}
      </ul>

      {error && <p className="text-sm text-danger">{error}</p>}

      {isDraft && (
        <div className="fixed inset-x-0 bottom-16 flex gap-2 border-t border-border bg-surface p-3">
          <button onClick={handleDiscard} disabled={isPending} className="rounded-lg border border-danger px-4 py-2.5 text-sm font-medium text-danger disabled:opacity-60">
            Discard
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={isPending || countedCount === 0}
            className="btn-primary flex-1 text-center disabled:opacity-60"
          >
            Complete audit ({countedCount} counted)
          </button>
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-xs rounded-2xl bg-surface p-5">
            <p className="text-sm font-semibold text-foreground">Apply this count?</p>
            <p className="mt-1 text-xs text-muted">
              Stock levels for every counted item will be updated to match what you entered.
              Items you didn&apos;t count are left untouched. This can&apos;t be undone.
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={handleComplete} disabled={isPending} className="btn-primary flex-1 text-center disabled:opacity-60">
                {isPending ? "Applying…" : "Yes, apply"}
              </button>
              <button onClick={() => setShowConfirm(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
                Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
