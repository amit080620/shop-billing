"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";

/** The notes a customer is likely to hand over for this amount: the next round 50, 100 and 500 above
 * it, and the next big notes — ₹375 → 400, 500, 1000, 2000. */
export function likelyNotes(total: number): number[] {
  if (!(total > 0)) return [];
  // The next round amount strictly above the bill (₹100 → 150 and 200, not 100 itself).
  const up = (step: number) => (Math.floor(total / step) + 1) * step;
  const picks = [up(50), up(100), up(200), up(500), up(1000), up(2000)];
  return [...new Set(picks)].sort((a, c) => a - c).slice(0, 4);
}

/** The change to hand back (positive) or what is still short (negative), to the paisa. */
export const changeFor = (total: number, given: number) => Math.round((given - total) * 100) / 100;

/** "Customer gave ₹500 → give back ₹125". Only a helper for the counter: the bill itself records the
 * bill's amount as paid (a note bigger than the bill is never "paid" beyond it). Shown for a cash
 * payment; tapping a note fills it in. */
export function CashChange({ total, onPaidInFull, resetKey }: { total: number; onPaidInFull?: () => void; resetKey?: unknown }) {
  const { t } = useT();
  const [given, setGiven] = useState<number | "">("");
  const notes = useMemo(() => likelyNotes(total), [total]);
  // A new bill starts with nothing given.
  useEffect(() => setGiven(""), [resetKey]);

  if (!(total > 0)) return null;
  const amount = typeof given === "number" ? given : 0;
  const diff = changeFor(total, amount);

  function choose(n: number) {
    setGiven(n);
    if (n >= total) onPaidInFull?.();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <p className="text-xs font-medium text-muted">{t("Customer gave (for change)")}</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => choose(total)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${amount === total ? "border-brand bg-brand-soft text-brand-text" : "border-border text-foreground"}`}>
          {t("Exact")}
        </button>
        {notes.map((n) => (
          <button key={n} type="button" onClick={() => choose(n)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${amount === n ? "border-brand bg-brand-soft text-brand-text" : "border-border text-foreground"}`}>
            ₹{n.toLocaleString("en-IN")}
          </button>
        ))}
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="1"
          value={given}
          onChange={(e) => {
            const v = e.target.value === "" ? "" : Math.max(0, Number(e.target.value));
            setGiven(v);
            if (typeof v === "number" && v >= total) onPaidInFull?.();
          }}
          placeholder={t("Other ₹")}
          aria-label={t("Amount the customer gave")}
          className="w-24 rounded-full border border-border bg-transparent px-3 py-1.5 text-xs outline-none focus:border-brand"
        />
      </div>
      {typeof given === "number" && given > 0 && (
        diff >= 0 ? (
          <p className="rounded-lg bg-success/10 px-3 py-2 text-center text-lg font-bold text-success" aria-live="polite">
            {diff === 0 ? t("Exact — no change") : t("Give back {amount}", { amount: formatMoney(diff) })}
          </p>
        ) : (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-center text-sm font-semibold text-danger" aria-live="polite">
            {t("{amount} short", { amount: formatMoney(-diff) })}
          </p>
        )
      )}
    </div>
  );
}
