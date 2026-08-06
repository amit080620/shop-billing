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
  function setThisWeek() {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    go(iso(start), iso(now));
  }
  function setThisMonth() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    go(iso(start), iso(now));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button onClick={setToday} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted">
          {t("rreports.today")}
        </button>
        <button onClick={setThisWeek} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted">
          {t("rreports.thisWeek")}
        </button>
        <button onClick={setThisMonth} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted">
          {t("rreports.thisMonth")}
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
