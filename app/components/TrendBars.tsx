import { formatMoney } from "@/lib/format";

/** The 7-day sales bars for Lite Mode: plain boxes, no chart library and no script — nothing to
 * download or run on an older phone. Same data as SalesTrendChart. */
export function TrendBars({ data }: { data: { day: string; date: string; total: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <div className="flex h-28 items-end gap-1.5">
      {data.map((d) => (
        <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${d.day}: ${formatMoney(d.total)}`}>
          <div className="w-full rounded-t bg-brand" style={{ height: `${Math.max(d.total > 0 ? 4 : 1, Math.round((d.total / max) * 84))}px`, opacity: d.total > 0 ? 1 : 0.25 }} />
          <span className="text-[10px] text-muted">{d.day}</span>
        </div>
      ))}
    </div>
  );
}
