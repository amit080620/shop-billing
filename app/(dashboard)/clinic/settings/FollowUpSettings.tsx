"use client";

import { useState, useTransition } from "react";
import { CalendarCheck } from "lucide-react";
import { saveFollowUpSettingsAction } from "@/lib/actions/followUp";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";

/** "Come back within 7 days — no fee": the days, and which fees are consultations. */
export function FollowUpSettings({ days: initialDays, selected, fees, isOwner }: { days: number | null; selected: string[]; fees: { id: string; name: string; price: number }[]; isOwner: boolean }) {
  const { t } = useT();
  const [days, setDays] = useState<number | "">(initialDays ?? "");
  const [ids, setIds] = useState<string[]>(selected);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="neu-card flex flex-col gap-3 p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <CalendarCheck size={16} /> {t("Free follow-up")}
      </p>
      <p className="text-xs text-muted">{t("A patient who paid for a consultation and comes back within these days is not charged the fee again — New Bill makes it ₹0 by itself.")}</p>
      <label className="flex items-center gap-2 text-sm text-foreground">
        {t("Free within")}
        <input type="number" min={0} max={90} value={days} onChange={(e) => setDays(e.target.value === "" ? "" : Number(e.target.value))} disabled={!isOwner} aria-label={t("Days")} className="w-20 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand" />
        {t("days (empty = off)")}
      </label>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-foreground">{t("Which fees are a consultation?")}</p>
        {fees.map((f) => (
          <label key={f.id} className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={ids.includes(f.id)} disabled={!isOwner} onChange={() => setIds((p) => (p.includes(f.id) ? p.filter((x) => x !== f.id) : [...p, f.id]))} className="h-4 w-4" />
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <span className="shrink-0 text-xs text-muted">{formatMoney(f.price)}</span>
          </label>
        ))}
      </div>
      {isOwner && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveFollowUpSettingsAction(typeof days === "number" ? days : null, ids);
              setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: t("Saved.") });
            })
          }
          className="btn-primary-sm self-start disabled:opacity-60"
        >
          {pending ? t("Saving…") : t("Save")}
        </button>
      )}
      {msg && <p className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
    </section>
  );
}
