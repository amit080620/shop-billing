"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkUpdatePricesAction } from "@/lib/actions/prices";
import { formatMoney, unitLabel } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";

type Item = { id: string; name: string; price: number; offerPrice: number | null; unit: string; categoryId: string | null };
type Edit = { price: number | ""; offer: number | "" };

/** Every item in a list with its price and offer price as boxes: type the new ones (or move a whole
 * category by a percentage), see what changed, save once. */
export function PriceBoard({ items, categories }: { items: Item[]; categories: { id: string; name: string }[] }) {
  const { t } = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [pct, setPct] = useState<number | "">("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shown = useMemo(
    () => items.filter((i) => (cat === "all" || (cat === "none" ? !i.categoryId : i.categoryId === cat)) && (!q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()))),
    [items, cat, q],
  );
  const value = (i: Item): Edit => edits[i.id] ?? { price: i.price, offer: i.offerPrice ?? "" };
  const changed = items.filter((i) => {
    const e = edits[i.id];
    if (!e) return false;
    return e.price !== i.price || (e.offer === "" ? null : e.offer) !== i.offerPrice;
  });
  const set = (i: Item, patch: Partial<Edit>) => {
    setMessage(null);
    setEdits((prev) => ({ ...prev, [i.id]: { ...value(i), ...patch } }));
  };

  function shiftAll() {
    if (typeof pct !== "number" || pct === 0) return;
    setMessage(null);
    setEdits((prev) => {
      const next = { ...prev };
      for (const i of shown) {
        const cur = next[i.id] ?? { price: i.price, offer: i.offerPrice ?? "" };
        const base = typeof cur.price === "number" ? cur.price : i.price;
        // To the rupee: prices on a board are whole rupees.
        next[i.id] = { ...cur, price: Math.max(0, Math.round(base * (1 + pct / 100))) };
      }
      return next;
    });
  }

  function save() {
    setError(null);
    setMessage(null);
    start(async () => {
      const r = await bulkUpdatePricesAction(
        changed.map((i) => {
          const e = edits[i.id];
          return { id: i.id, price: typeof e.price === "number" ? e.price : i.price, offerPrice: typeof e.offer === "number" ? e.offer : null };
        }),
      );
      if (r.error && !r.saved) {
        setError(r.error);
        return;
      }
      setEdits({});
      setMessage(r.error ?? t("{n} prices saved — billing uses them now.", { n: r.saved ?? 0 }));
      router.refresh();
    });
  }

  const input = "w-20 rounded-lg border border-border bg-surface px-2 py-1.5 text-right text-sm outline-none focus:border-brand";

  return (
    <div className="flex flex-col gap-3 pb-20">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search items")} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {[{ id: "all", name: t("All") }, ...categories, { id: "none", name: t("No category") }].map((c) => (
          <button key={c.id} type="button" onClick={() => setCat(c.id)} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${cat === c.id ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs">
        <span className="text-muted">{t("Change the {n} items shown by", { n: shown.length })}</span>
        <input type="number" value={pct} onChange={(e) => setPct(e.target.value === "" ? "" : Number(e.target.value))} placeholder="+5 / −5" aria-label={t("Percent")} className="w-16 rounded-lg border border-border px-2 py-1 text-right outline-none focus:border-brand" />
        <span className="text-muted">%</span>
        <button type="button" onClick={shiftAll} disabled={typeof pct !== "number" || pct === 0} className="ml-auto rounded-lg border border-brand px-2.5 py-1 font-medium text-brand-text disabled:opacity-40">
          {t("Apply")}
        </button>
      </div>

      <div className="flex items-center justify-between px-1 text-[11px] font-medium text-muted">
        <span>{t("Item")}</span>
        <span className="flex gap-2">
          <span className="w-20 text-right">{t("Price ₹")}</span>
          <span className="w-20 text-right">{t("Offer ₹")}</span>
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {shown.map((i) => {
          const e = value(i);
          const dirty = !!edits[i.id] && (e.price !== i.price || (e.offer === "" ? null : e.offer) !== i.offerPrice);
          return (
            <li key={i.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${dirty ? "border-brand bg-brand-soft/40" : "border-border bg-surface"}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{i.name}</p>
                <p className="text-[11px] text-muted">
                  {dirty ? `${formatMoney(i.price)} → ${typeof e.price === "number" ? formatMoney(e.price) : "—"}` : `/${unitLabel(i.unit)}`}
                </p>
              </div>
              <input type="number" min={0} step="any" value={e.price} onChange={(ev) => set(i, { price: ev.target.value === "" ? "" : Number(ev.target.value) })} aria-label={`${i.name} ${t("price")}`} className={input} />
              <input type="number" min={0} step="any" value={e.offer} onChange={(ev) => set(i, { offer: ev.target.value === "" ? "" : Number(ev.target.value) })} placeholder="—" aria-label={`${i.name} ${t("offer price")}`} className={input} />
            </li>
          );
        })}
      </ul>

      {(changed.length > 0 || message || error) && (
        <div className="fixed inset-x-0 bottom-16 z-30 mx-auto flex max-w-xl items-center gap-2 border-t border-border bg-surface px-4 py-2.5 shadow-lg md:bottom-4 md:rounded-xl md:border">
          <p className="min-w-0 flex-1 text-xs">
            {error ? <span className="text-danger">{error}</span> : message && !changed.length ? <span className="text-success">{message}</span> : t("{n} prices changed", { n: changed.length })}
          </p>
          {changed.length > 0 && (
            <>
              <button type="button" onClick={() => setEdits({})} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted">
                {t("Undo")}
              </button>
              <button type="button" onClick={save} disabled={pending} className="btn-primary-sm disabled:opacity-60">
                {pending ? t("Saving…") : t("Save {n}", { n: changed.length })}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
