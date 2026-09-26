"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { todayIso, isoDaysAgo, formatIsoDate } from "@/lib/dateHelpers";
import { useT } from "@/lib/i18n/LangContext";

/** Today / Last 7 days / Last 30 days presets plus a custom range, shared by
 * the Sales, Profit, Staff Performance, Insights and Service report pages.
 * Ranges include today, so "Last 7 days" starts 6 days ago. */
export function DateRangeControls({ from, to, basePath }: { from: string; to: string; basePath: string }) {
  const router = useRouter();
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const [showCustom, setShowCustom] = useState(false);
  const { t } = useT();

  function go(newFrom: string, newTo: string) {
    router.push(`${basePath}?from=${newFrom}&to=${newTo}`);
  }

  const today = todayIso();
  const presets = [
    { label: t("range.today"), from: today },
    { label: t("range.last7"), from: isoDaysAgo(6) },
    { label: t("range.last30"), from: isoDaysAgo(29) },
  ];
  const pill = (active: boolean) =>
    `rounded-full bg-background px-3 py-1.5 text-xs font-medium ${active ? "text-brand-text" : "text-muted"}`;
  const activeStyle = { boxShadow: "var(--elev-xs)" };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const active = !showCustom && from === p.from && to === today;
          return (
            <button key={p.label} onClick={() => go(p.from, today)} className={pill(active)} style={active ? activeStyle : undefined}>
              {p.label}
            </button>
          );
        })}
        <button onClick={() => setShowCustom((v) => !v)} className={pill(showCustom)} style={showCustom ? activeStyle : undefined}>
          {t("range.custom")}
        </button>
      </div>

      {showCustom && (
        <div className="neu-card flex items-end gap-2 p-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-muted">{t("range.from")}</span>
            <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none" />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-muted">{t("range.to")}</span>
            <input type="date" value={customTo} min={customFrom} max={today} onChange={(e) => setCustomTo(e.target.value)} className="rounded-lg px-3 py-2 text-sm outline-none" />
          </label>
          <button onClick={() => go(customFrom, customTo)} disabled={!customFrom || !customTo || customFrom > customTo} className="btn-primary-sm shrink-0 disabled:opacity-50">
            {t("range.apply")}
          </button>
        </div>
      )}

      <p className="text-xs text-muted">{from === to ? formatIsoDate(from) : `${formatIsoDate(from)} – ${formatIsoDate(to)}`}</p>
    </div>
  );
}
