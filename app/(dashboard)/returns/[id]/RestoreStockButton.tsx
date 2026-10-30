"use client";

import { useState, useTransition } from "react";
import { retryReturnStockAction } from "@/lib/actions/returns";

/** This credit note's goods didn't go back on the shelf (the database call failed): try again. Safe
 * to tap more than once — only goods not yet back are moved. */
export function RestoreStockButton({ returnId }: { returnId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-warning bg-surface p-3">
      <p className="text-sm text-foreground">The returned goods didn&apos;t go back into stock (the connection dropped).</p>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const r = await retryReturnStockAction(returnId);
            setError(r.error ?? null);
          })
        }
        className="btn-primary self-start px-3 py-2 text-sm disabled:opacity-60"
      >
        {isPending ? "Putting back…" : "Put back in stock"}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
