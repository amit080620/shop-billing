"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Share2 } from "lucide-react";
import { saveRateListAction } from "@/lib/actions/rates";
import { formatMoney, unitLabel } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";

type Item = { id: string; name: string; unit: string; categoryId: string | null; mrp: number | null; price: number; wholesale: number | null; scheme: string | null };
type Edit = { mrp: number | ""; price: number | ""; wholesale: number | "" };
const num = (v: number | "") => (v === "" ? null : v);

/** MRP · retail · wholesale for each item, set by hand or as "MRP less x %" for everything shown. */
export function RateList({ items, categories, shopName }: { items: Item[]; categories: { id: string; name: string }[]; shopName: string }) {
  const { t } = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [retailPct, setRetailPct] = useState<number | "">("");
  const [wholesalePct, setWholesalePct] = useState<number | "">("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shown = useMemo(() => items.filter((i) => (cat === "all" || i.categoryId === cat) && (!q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()))), [items, cat, q]);
  const value = (i: Item): Edit => edits[i.id] ?? { mrp: i.mrp ?? "", price: i.price, wholesale: i.wholesale ?? "" };
  const changed = items.filter((i) => {
    const e = edits[i.id];
    return !!e && (num(e.mrp) !== i.mrp || e.price !== i.price || num(e.wholesale) !== i.wholesale);
  });
  const set = (i: Item, patch: Partial<Edit>) => {
    setMessage(null);
    setEdits((prev) => ({ ...prev, [i.id]: { ...value(i), ...patch } }));
  };
  /** "MRP less x %" for every item shown that has an MRP — to the rupee. */
  function fromMrp(field: "price" | "wholesale", pct: number | "") {
    if (typeof pct !== "number") return;
    setMessage(null);
    setEdits((prev) => {
      const next = { ...prev };
      for (const i of shown) {
        const cur = next[i.id] ?? value(i);
        const mrp = typeof cur.mrp === "number" ? cur.mrp : null;
        if (!mrp) continue;
        next[i.id] = { ...cur, [field]: Math.max(0, Math.round(mrp * (1 - pct / 100) * 100) / 100) };
      }
      return next;
    });
  }
  function save() {
    setError(null);
    start(async () => {
      const r = await saveRateListAction(changed.map((i) => { const e = edits[i.id]; return { id: i.id, mrp: num(e.mrp), price: typeof e.price === "number" ? e.price : i.price, wholesalePrice: num(e.wholesale) }; }));
      if (r.error && !r.saved) return setError(r.error);
      setEdits({});
      setMessage(r.error ?? t("{n} rates saved — billing uses them now.", { n: r.saved ?? 0 }));
      router.refresh();
    });
  }
  function share() {
    const date = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const lines = shown.slice(0, 80).map((i) => {
      const v = value(i);
      const rate = num(v.wholesale) ?? (typeof v.price === "number" ? v.price : i.price);
      return `• ${i.name} — ${num(v.mrp) ? `MRP ${formatMoney(num(v.mrp)!)} · ` : ""}${t("Rate")} ${formatMoney(rate)}/${unitLabel(i.unit)}${i.scheme ? ` · ${t("Scheme")} ${i.scheme}` : ""}`;
    });
    const text = `*${shopName}* — ${t("Rate list")} (${date})\n\n${lines.join("\n")}\n\n${t("Order on WhatsApp or ask our salesman.")}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  const input = "w-full rounded-lg border border-border bg-surface px-1.5 py-1.5 text-right text-sm outline-none focus:border-brand";
  return (
    <div className="flex flex-col gap-3 pb-20">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search items")} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {[{ id: "all", name: t("All") }, ...categories].map((c) => (
          <button key={c.id} type="button" onClick={() => setCat(c.id)} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${cat === c.id ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="neu-card flex flex-col gap-2 p-3 text-xs">
        <p className="text-muted">{t("Set the rates of the {n} items shown from their MRP:", { n: shown.length })}</p>
        {([["price", t("Retail rate = MRP −"), retailPct, setRetailPct], ["wholesale", t("Wholesale rate = MRP −"), wholesalePct, setWholesalePct]] as const).map(([field, label, pct, setPct]) => (
          <div key={field} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-foreground">{label}</span>
            <input type="number" min={0} max={90} value={pct} onChange={(e) => setPct(e.target.value === "" ? "" : Number(e.target.value))} placeholder="10" aria-label={label} className="w-16 rounded-lg border border-border px-2 py-1 text-right" />
            <span className="text-muted">%</span>
            <button type="button" onClick={() => fromMrp(field, pct)} className="rounded-lg border border-brand px-2.5 py-1 font-medium text-brand-text">
              {t("Apply")}
            </button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_4.2rem_4.2rem_4.2rem] gap-1.5 px-1 text-[11px] font-medium text-muted">
        <span>{t("Item")}</span>
        <span className="text-right">MRP</span>
        <span className="text-right">{t("Retail")}</span>
        <span className="text-right">{t("Wholesale")}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {shown.map((i) => {
          const v = value(i);
          const dirty = changed.some((c) => c.id === i.id);
          return (
            <li key={i.id} className={`grid grid-cols-[1fr_4.2rem_4.2rem_4.2rem] items-center gap-1.5 rounded-lg border px-2 py-1.5 ${dirty ? "border-brand bg-brand-soft" : "border-border bg-surface"}`}>
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{i.name}</p>
                <p className="text-[11px] text-muted">
                  /{unitLabel(i.unit)}
                  {i.scheme ? ` · ${t("Scheme")} ${i.scheme}` : ""}
                </p>
              </div>
              <input type="number" min={0} step="any" value={v.mrp} onChange={(e) => set(i, { mrp: e.target.value === "" ? "" : Number(e.target.value) })} aria-label={`${i.name} MRP`} className={input} />
              <input type="number" min={0} step="any" value={v.price} onChange={(e) => set(i, { price: e.target.value === "" ? "" : Number(e.target.value) })} aria-label={`${i.name} ${t("retail rate")}`} className={input} />
              <input type="number" min={0} step="any" value={v.wholesale} onChange={(e) => set(i, { wholesale: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="—" aria-label={`${i.name} ${t("wholesale rate")}`} className={input} />
            </li>
          );
        })}
      </ul>
      <div className="fixed inset-x-0 bottom-16 z-20 mx-auto flex max-w-2xl items-center gap-2 border-t border-border bg-surface px-4 py-2.5 md:bottom-0">
        <p className="min-w-0 flex-1 text-xs text-muted">
          {error ? <span className="text-danger">{error}</span> : message && !changed.length ? <span className="text-success">{message}</span> : t("{n} rates changed", { n: changed.length })}
        </p>
        <button type="button" onClick={share} className="flex shrink-0 items-center gap-1 rounded-lg border border-success px-3 py-2 text-xs font-semibold text-success">
          <Share2 size={13} /> {t("Share")}
        </button>
        <button type="button" disabled={pending || !changed.length} onClick={save} className="btn-primary-sm shrink-0 disabled:opacity-50">
          {pending ? t("Saving…") : t("Save {n}", { n: changed.length })}
        </button>
      </div>
    </div>
  );
}
