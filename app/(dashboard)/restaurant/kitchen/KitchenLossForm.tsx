"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteKitchenLossAction, recordKitchenLossAction } from "@/lib/actions/recipes";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { useT } from "@/lib/i18n/LangContext";
import { smallUnit } from "@/lib/recipes";

type Raw = { id: string; name: string; unit: string };

/** Food thrown away, or eaten by staff: off the stock and written down. */
export function KitchenLossForm({ raws }: { raws: Raw[] }) {
  const { t, lang } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState<Raw | null>(null);
  const [amount, setAmount] = useState<number | "">("");
  const [kind, setKind] = useState<"wastage" | "staff_meal">("wastage");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand";
  const small = smallUnit(raw?.unit ?? "");

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary text-center">
        {t("+ Wastage or staff meal")}
      </button>
    );
  }

  function save() {
    if (!raw) return setError(t("Pick the raw material."));
    const q = typeof amount === "number" ? (small ? amount / small.factor : amount) : 0;
    setError(null);
    start(async () => {
      const r = await recordKitchenLossAction({ ingredientId: raw.id, quantity: q, kind, note });
      if (r.error) {
        setError(r.error);
        return;
      }
      setRaw(null);
      setAmount("");
      setNote("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="neu-card flex flex-col gap-2.5 p-4">
      <div className="grid grid-cols-2 gap-1.5" role="group">
        {(["wastage", "staff_meal"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${kind === k ? "border-brand bg-brand text-white" : "border-border text-muted"}`}>
            {k === "wastage" ? t("Wastage") : t("Staff meal")}
          </button>
        ))}
      </div>
      {raw ? (
        <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm">
          <span className="text-foreground">{raw.name}</span>
          <button type="button" onClick={() => setRaw(null)} className="text-xs text-muted">
            {t("Change")}
          </button>
        </div>
      ) : (
        <SearchableSelect lang={lang} items={raws} getKey={(r) => r.id} getLabel={(r) => r.name} getSubLabel={(r) => r.unit} onSelect={setRaw} placeholder={t("Which raw material?")} />
      )}
      <div className="flex items-center gap-2">
        <input type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))} placeholder={t("How much")} aria-label={t("How much")} className={`${input} flex-1`} />
        <span className="w-10 text-sm text-muted">{small ? small.label : (raw?.unit ?? "").toLowerCase()}</span>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "wastage" ? t("Why (e.g. milk curdled)") : t("Note (optional)")} className={input} />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={pending} className="btn-primary flex-1 text-center disabled:opacity-60">
          {pending ? t("Saving…") : t("Save")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
          {t("Cancel")}
        </button>
      </div>
    </div>
  );
}

export function DeleteLossButton({ id }: { id: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={t("Remove")}
      onClick={() => {
        if (!window.confirm(t("Remove this entry? The stock comes back."))) return;
        start(async () => {
          const r = await deleteKitchenLossAction(id);
          if (r.error) window.alert(r.error);
          router.refresh();
        });
      }}
      className="shrink-0 px-1 text-xs text-danger disabled:opacity-50"
    >
      ✕
    </button>
  );
}
