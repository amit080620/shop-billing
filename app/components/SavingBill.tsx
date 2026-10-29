"use client";

import { useFormStatus } from "react-dom";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";

export type SavingLine = { name: string; quantity: number; unit?: string; amount: number };

/** The bill, the moment Save is tapped — while the server saves it and gives it its invoice number,
 * which takes about a second. Only a view of what was on the screen: nothing can be printed or sent
 * from it (the real bill page, with its number, replaces it), and if the save fails it goes away and
 * the bill is still there to fix. Inside a form it follows that form's save; elsewhere pass `pending`. */
export function SavingBill({ lines, total, pending }: { lines: SavingLine[]; total: number; pending?: boolean }) {
  const status = useFormStatus();
  const { t } = useT();
  const show = pending ?? status.pending;
  if (!show || lines.length === 0) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="status" aria-live="polite">
      <div className="flex max-h-[80vh] w-full max-w-sm flex-col gap-3 overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl">
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="text-sm font-semibold text-foreground">{t("Saving the bill…")}</p>
        </div>
        <ul className="flex flex-col divide-y divide-border text-sm">
          {lines.slice(0, 12).map((l, i) => (
            <li key={i} className="flex justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate text-foreground">
                {l.name} <span className="text-muted">× {Number(l.quantity.toFixed(3))}{l.unit ? ` ${l.unit}` : ""}</span>
              </span>
              <span className="shrink-0 text-foreground">{formatMoney(l.amount)}</span>
            </li>
          ))}
          {lines.length > 12 && <li className="py-1.5 text-xs text-muted">+ {lines.length - 12} more</li>}
        </ul>
        <div className="flex justify-between border-t border-border pt-2 text-base font-bold text-foreground">
          <span>{t("Total")}</span>
          <span>{formatMoney(total)}</span>
        </div>
        <p className="text-xs text-muted">{t("The bill number and print come in a moment.")}</p>
      </div>
    </div>
  );
}
