"use client";

import { useState, useTransition } from "react";
import { saveBlockOversellAction } from "@/lib/actions/settings";

/** Settings → Stock: may the counter bill more of an item than is in stock? Saved as it is tapped. */
export function StockRuleToggle({ initial }: { initial: boolean }) {
  const [block, setBlock] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function change(next: boolean) {
    setBlock(next);
    setError(null);
    startTransition(async () => {
      const r = await saveBlockOversellAction(next);
      if (r.error) {
        setError(r.error);
        setBlock(!next);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <section className="neu-card flex flex-col gap-2 p-4">
      <p className="text-sm font-semibold text-foreground">Stock</p>
      <label className="flex cursor-pointer items-start justify-between gap-3">
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">Don&apos;t bill more than the stock</span>
          <span className="text-xs text-muted">
            On: a bill can&apos;t be saved if an item would go below zero — the counter is told how many are left. Off: billing goes on and
            the stock can show a minus (fix it later with a stock count).
          </span>
        </span>
        <input type="checkbox" checked={block} disabled={isPending} onChange={(e) => change(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand)]" />
      </label>
      {saved && <p className="text-xs text-success">Saved ✓</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  );
}
