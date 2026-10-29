"use client";

import { useState } from "react";
import Link from "@/lib/link";
import { useT } from "@/lib/i18n/LangContext";
import { formatMoney } from "@/lib/format";

/** The dashboard's 7-day sales bars. Plain elements, no chart library: a chart library was 104 KB
 * of script for seven bars, downloaded and run on every dashboard open. Tapping a bar shows that
 * day's sales; tapping it again opens that day's summary. Drawn on the server, so it shows with the
 * page instead of after a loading box. */
export function SalesTrendChart({ data }: { data: { day: string; date: string; total: number }[] }) {
  const { t } = useT();
  const [picked, setPicked] = useState<string | null>(null);
  const max = Math.max(1, ...data.map((d) => d.total));
  const hasAnySales = data.some((d) => d.total > 0);
  const chosen = data.find((d) => d.date === picked);

  return (
    <div className="relative h-28 w-full">
      <div className="flex h-full items-end gap-1.5 px-1">
        {data.map((d) => {
          const height = Math.max(d.total > 0 ? 6 : 2, Math.round((d.total / max) * 82));
          const isPicked = d.date === picked;
          const bar = (
            <span
              className="block w-full max-w-[22px] rounded-md"
              style={{
                height: `${height}px`,
                background: "linear-gradient(to bottom, var(--brand-light), var(--brand-dark))",
                boxShadow: d.total > 0 ? "0 2px 4px var(--neu-dark)" : undefined,
                opacity: d.total > 0 ? 1 : 0.25,
                outline: isPicked ? "2px solid var(--brand-soft)" : undefined,
              }}
            />
          );
          return (
            <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              {isPicked ? (
                <Link href={`/daily-summary?date=${d.date}`} className="flex w-full justify-center" aria-label={`${d.day}: ${formatMoney(d.total)} — open that day`}>
                  {bar}
                </Link>
              ) : (
                <button type="button" onClick={() => setPicked(d.date)} className="flex w-full justify-center" aria-label={`${d.day}: ${formatMoney(d.total)}`}>
                  {bar}
                </button>
              )}
              <span className="text-[10px] text-muted">{d.day}</span>
            </div>
          );
        })}
      </div>

      {chosen && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-foreground shadow-sm">
          {chosen.day}: <span className="font-semibold">{formatMoney(chosen.total)}</span>
        </div>
      )}

      {!hasAnySales && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background text-center">
          <p className="text-xs text-muted">{t("No sales in this period yet")}</p>
          <p className="text-[11px] text-muted/70">{t("Your first bill will show up here")}</p>
        </div>
      )}
    </div>
  );
}
