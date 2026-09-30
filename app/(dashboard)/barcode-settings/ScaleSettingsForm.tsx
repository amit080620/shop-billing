"use client";

import { useState, useTransition } from "react";
import { Scale } from "lucide-react";
import { saveScaleSettingsAction } from "@/lib/actions/scale";
import { useT } from "@/lib/i18n/LangContext";

/** The weighing scale's label format, so a scanned label bills the item at its weight or price. */
export function ScaleSettingsForm({ initial, isOwner }: { initial: { prefix: string; mode: "weight" | "price"; codeDigits: number }; isOwner: boolean }) {
  const { t } = useT();
  const [prefix, setPrefix] = useState(initial.prefix);
  const [mode, setMode] = useState(initial.mode);
  const [digits, setDigits] = useState(initial.codeDigits);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const input = "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <section className="neu-card flex flex-col gap-3 p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Scale size={16} /> {t("Weighing scale labels")}
      </p>
      <p className="text-xs text-muted">
        {t("Loose items weighed on a label-printing scale: scan the label on New Bill and the item comes in at its weight (or price). Save each loose item's scale code (PLU) as its barcode.")}
      </p>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t("Label starts with")}
          <input value={prefix} onChange={(e) => setPrefix(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="21" inputMode="numeric" className={input} disabled={!isOwner} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t("Item code digits")}
          <select value={digits} onChange={(e) => setDigits(Number(e.target.value))} className={input} disabled={!isOwner}>
            {[4, 5, 6].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t("Label carries")}
          <select value={mode} onChange={(e) => setMode(e.target.value as "weight" | "price")} className={input} disabled={!isOwner}>
            <option value="weight">{t("Weight (grams)")}</option>
            <option value="price">{t("Price (paise)")}</option>
          </select>
        </label>
      </div>
      <p className="text-[11px] text-muted">{t("Leave \"Label starts with\" empty to switch this off. Most scales: 21, 5 digits, weight.")}</p>
      {isOwner && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveScaleSettingsAction({ prefix, mode, codeDigits: digits });
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
