"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function isoMonthsAgo(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function SalesReportDateControls({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const [showCustom, setShowCustom] = useState(false);

  function go(newFrom: string, newTo: string) {
    router.push(`/reports/sales?from=${newFrom}&to=${newTo}`);
  }

  const pillClass = "shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-medium text-muted";
  const activeStyle = { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        <button onClick={() => go(todayIso(), todayIso())} className={pillClass} style={from === todayIso() && to === todayIso() ? activeStyle : undefined}>
          Today
        </button>
        <button onClick={() => go(isoDaysAgo(7), todayIso())} className={pillClass} style={from === isoDaysAgo(7) && to === todayIso() ? activeStyle : undefined}>
          This week
        </button>
        <button onClick={() => go(isoMonthsAgo(1), todayIso())} className={pillClass} style={from === isoMonthsAgo(1) && to === todayIso() ? activeStyle : undefined}>
          This month
        </button>
        <button onClick={() => setShowCustom((v) => !v)} className={pillClass} style={showCustom ? activeStyle : undefined}>
          Custom range
        </button>
      </div>
      {showCustom && (
        <div className="neu-card flex items-end gap-2 p-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-muted">From</span>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none" />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-muted">To</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none" />
          </label>
          <button onClick={() => go(customFrom, customTo)} className="btn-primary-sm shrink-0">
            Apply
          </button>
        </div>
      )}
      <p className="text-xs text-muted">Showing {from} → {to}</p>
    </div>
  );
}
