"use client";

import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DateRangeControls({
  from,
  to,
  basePath = "/restaurant/reports",
  lang,
}: {
  from: string;
  to: string;
  basePath?: string;
  lang: Lang;
}) {
  const router = useRouter();
  const { t } = useTranslation(lang);

  function go(f: string, t: string) {
    router.push(`${basePath}?from=${f}&to=${t}`);
  }

  function setToday() {
    const t = iso(new Date());
    go(t, t);
  }
  function setYesterday() {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    go(iso(y), iso(y));
  }
  function setThisWeek() {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    go(iso(start), iso(now));
  }
  function setLastWeek() {
    const now = new Date();
    const end = new Date(now);
    end.setDate(now.getDate() - 7);
    const start = new Date(now);
    start.setDate(now.getDate() - 13);
    go(iso(start), iso(end));
  }
  function setThisMonth() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    go(iso(start), iso(now));
  }
  function setLastMonth() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    go(iso(start), iso(end));
  }
  function setThisQuarter() {
    const now = new Date();
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const start = new Date(now.getFullYear(), qStartMonth, 1);
    go(iso(start), iso(now));
  }
  function setLastQuarter() {
    const now = new Date();
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3 - 3;
    const start = new Date(now.getFullYear(), qStartMonth, 1);
    const end = new Date(now.getFullYear(), qStartMonth + 3, 0);
    go(iso(start), iso(end));
  }

  const pillClass = "shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-medium text-muted";
  const pillStyle = { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        <button onClick={setToday} className={pillClass} style={pillStyle}>
          {t("rreports.today")}
        </button>
        <button onClick={setYesterday} className={pillClass} style={pillStyle}>
          {t("rreports.yesterday")}
        </button>
        <button onClick={setThisWeek} className={pillClass} style={pillStyle}>
          {t("rreports.thisWeek")}
        </button>
        <button onClick={setLastWeek} className={pillClass} style={pillStyle}>
          {t("rreports.lastWeek")}
        </button>
        <button onClick={setThisMonth} className={pillClass} style={pillStyle}>
          {t("rreports.thisMonth")}
        </button>
        <button onClick={setLastMonth} className={pillClass} style={pillStyle}>
          {t("rreports.lastMonth")}
        </button>
        <button onClick={setThisQuarter} className={pillClass} style={pillStyle}>
          This quarter
        </button>
        <button onClick={setLastQuarter} className={pillClass} style={pillStyle}>
          Last quarter
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          defaultValue={from}
          onChange={(e) => go(e.target.value, to)}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <span className="text-xs text-muted">{t("rreports.to")}</span>
        <input
          type="date"
          defaultValue={to}
          onChange={(e) => go(from, e.target.value)}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </div>
    </div>
  );
}
