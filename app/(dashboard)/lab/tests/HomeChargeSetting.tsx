"use client";

import { useState, useTransition } from "react";
import { Home } from "lucide-react";
import { saveLabHomeChargeAction } from "@/lib/actions/lab";
import { useT } from "@/lib/i18n/LangContext";

/** The lab's usual home collection charge, filled in on each new home-collection order. */
export function HomeChargeSetting({ initial }: { initial: number }) {
  const { t } = useT();
  const [value, setValue] = useState<number | "">(initial || "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="neu-card flex flex-col gap-2 p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Home size={15} /> {t("Home collection charge")}
      </p>
      <p className="text-xs text-muted">{t("Added to every home-collection order as its own line on the bill. Can be changed on each order.")}</p>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">₹</span>
        <input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value === "" ? "" : Number(e.target.value))} aria-label={t("Home collection charge")} className="w-28 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveLabHomeChargeAction(Number(value) || 0);
              setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: t("Saved.") });
            })
          }
          className="btn-primary-sm disabled:opacity-60"
        >
          {pending ? t("Saving…") : t("Save")}
        </button>
      </div>
      {msg && <p className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
    </section>
  );
}
