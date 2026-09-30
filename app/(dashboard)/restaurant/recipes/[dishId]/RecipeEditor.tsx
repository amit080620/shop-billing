"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createRawMaterialAction, saveRecipeAction } from "@/lib/actions/recipes";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";
import { foodCostPercent, smallUnit } from "@/lib/recipes";

type Raw = { id: string; name: string; unit: string; stock: number; cost: number | null };
type Line = { ingredientId: string; amount: number | "" }; // amount as entered (g / ml for a KG / LTR item)
const UNITS = ["KG", "GM", "LTR", "ML", "NOS", "PCS", "DZN", "PKT", "BOX", "BOTTLE", "BAG"];

/** One dish's recipe: what a plate takes, what that costs, and the food cost it comes to. */
export function RecipeEditor({
  dishId,
  sellBeforeGst,
  rawMaterials,
  initial,
}: {
  dishId: string;
  sellBeforeGst: number;
  rawMaterials: Raw[];
  initial: { ingredientId: string; quantity: number }[];
}) {
  const { t, lang } = useT();
  const router = useRouter();
  const [raws, setRaws] = useState<Raw[]>(rawMaterials);
  const byId = (id: string) => raws.find((r) => r.id === id);
  const toAmount = (id: string, qty: number) => {
    const small = smallUnit(byId(id)?.unit ?? "");
    return small ? Math.round(qty * small.factor * 100) / 100 : qty;
  };
  const toQuantity = (id: string, amount: number) => {
    const small = smallUnit(byId(id)?.unit ?? "");
    return small ? amount / small.factor : amount;
  };
  const [lines, setLines] = useState<Line[]>(initial.map((l) => ({ ingredientId: l.ingredientId, amount: toAmount(l.ingredientId, l.quantity) })));
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", unit: "KG", cost: "" as number | "", stock: "" as number | "", low: "" as number | "" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const input = "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand";

  const lineCost = (l: Line) => {
    const raw = byId(l.ingredientId);
    if (!raw || raw.cost == null || typeof l.amount !== "number") return null;
    return Math.round(raw.cost * toQuantity(l.ingredientId, l.amount) * 100) / 100;
  };
  const cost = lines.reduce((s, l) => s + (lineCost(l) ?? 0), 0);
  const unpriced = lines.filter((l) => byId(l.ingredientId)?.cost == null).length;
  const pct = foodCostPercent(cost, sellBeforeGst);

  function add(id: string) {
    setSaved(false);
    setLines((prev) => (prev.some((l) => l.ingredientId === id) ? prev : [...prev, { ingredientId: id, amount: "" }]));
  }

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      const r = await saveRecipeAction(
        dishId,
        lines.filter((l) => typeof l.amount === "number" && l.amount > 0).map((l) => ({ ingredientId: l.ingredientId, quantity: toQuantity(l.ingredientId, l.amount as number) })),
      );
      if (r.error) {
        setError(r.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  function createRaw() {
    setError(null);
    start(async () => {
      const r = await createRawMaterialAction({
        name: draft.name,
        unit: draft.unit,
        costPerUnit: typeof draft.cost === "number" ? draft.cost : 0,
        stockNow: typeof draft.stock === "number" ? draft.stock : 0,
        lowAt: typeof draft.low === "number" ? draft.low : 0,
      });
      if (r.error || !r.id) {
        setError(r.error ?? t("Could not save — try again."));
        return;
      }
      setRaws((prev) => [...prev, { id: r.id!, name: draft.name.trim(), unit: draft.unit, stock: typeof draft.stock === "number" ? draft.stock : 0, cost: typeof draft.cost === "number" && draft.cost > 0 ? draft.cost : null }]);
      setLines((prev) => [...prev, { ingredientId: r.id!, amount: "" }]);
      setDraft({ name: "", unit: "KG", cost: "", stock: "", low: "" });
      setCreating(false);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="neu-card flex flex-col gap-2 p-3.5">
        <p className="text-sm font-semibold text-foreground">{t("One plate takes")}</p>
        {lines.length === 0 && <p className="text-xs text-muted">{t("Add the raw materials that go into one plate.")}</p>}
        {lines.map((l, i) => {
          const raw = byId(l.ingredientId);
          const small = smallUnit(raw?.unit ?? "");
          const c = lineCost(l);
          return (
            <div key={l.ingredientId} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{raw?.name ?? "—"}</p>
                <p className="text-[11px] text-muted">{c != null ? formatMoney(c) : t("no price yet")}</p>
              </div>
              <input
                type="number"
                min={0}
                step="any"
                value={l.amount}
                onChange={(e) => {
                  setSaved(false);
                  const v = e.target.value === "" ? "" : Number(e.target.value);
                  setLines((prev) => prev.map((x, j) => (j === i ? { ...x, amount: v } : x)));
                }}
                aria-label={`${raw?.name ?? ""} ${t("per plate")}`}
                className="w-20 rounded-lg border border-border bg-surface px-2 py-1.5 text-right text-sm outline-none focus:border-brand"
              />
              <span className="w-8 shrink-0 text-xs text-muted">{small ? small.label : (raw?.unit ?? "").toLowerCase()}</span>
              <button type="button" onClick={() => { setSaved(false); setLines((prev) => prev.filter((_, j) => j !== i)); }} aria-label={t("Remove")} className="shrink-0 p-1 text-muted hover:text-danger">
                <X size={15} />
              </button>
            </div>
          );
        })}
        <SearchableSelect
          lang={lang}
          items={raws.filter((r) => !lines.some((l) => l.ingredientId === r.id))}
          getKey={(r) => r.id}
          getLabel={(r) => r.name}
          getSubLabel={(r) => `${r.stock.toLocaleString("en-IN")} ${r.unit.toLowerCase()} ${t("in stock")}${r.cost != null ? ` · ${formatMoney(r.cost)}/${r.unit.toLowerCase()}` : ""}`}
          onSelect={(r) => add(r.id)}
          placeholder={t("Add a raw material…")}
        />
        {!creating ? (
          <button type="button" onClick={() => setCreating(true)} className="self-start text-xs font-medium text-brand-text">
            {t("+ New raw material")}
          </button>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg bg-background p-2.5">
            <div className="grid grid-cols-3 gap-2">
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t("Name (e.g. Paneer)")} className={`${input} col-span-2`} />
              <select value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} className={input} aria-label={t("Unit")}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input type="number" min={0} value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value === "" ? "" : Number(e.target.value) })} placeholder={t("₹ per {unit}", { unit: draft.unit.toLowerCase() })} aria-label={t("Buying price")} className={input} />
              <input type="number" min={0} value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value === "" ? "" : Number(e.target.value) })} placeholder={t("Stock now")} aria-label={t("Stock now")} className={input} />
              <input type="number" min={0} value={draft.low} onChange={(e) => setDraft({ ...draft, low: e.target.value === "" ? "" : Number(e.target.value) })} placeholder={t("Alert below")} aria-label={t("Alert below")} className={input} />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={createRaw} disabled={pending} className="btn-primary-sm disabled:opacity-60">
                {t("Add raw material")}
              </button>
              <button type="button" onClick={() => setCreating(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted">
                {t("Cancel")}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="grid grid-cols-3 gap-2 text-center">
        <div className="neu-card p-3">
          <p className="text-[11px] text-muted">{t("Plate costs")}</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{formatMoney(cost)}</p>
        </div>
        <div className="neu-card p-3">
          <p className="text-[11px] text-muted">{t("Food cost")}</p>
          <p className={`mt-0.5 text-sm font-semibold ${pct != null && pct > 35 ? "text-danger" : "text-foreground"}`}>{pct != null ? `${pct}%` : "—"}</p>
        </div>
        <div className="neu-card p-3">
          <p className="text-[11px] text-muted">{t("Left per plate")}</p>
          <p className="mt-0.5 text-sm font-semibold text-success">{formatMoney(sellBeforeGst - cost)}</p>
        </div>
      </section>
      {unpriced > 0 && <p className="text-xs text-credit">{t("{n} raw material(s) have no price yet — record a purchase, or add the price, for the true cost.", { n: unpriced })}</p>}

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-success">{t("Saved — each plate sold now takes these off stock.")}</p>}
      <button type="button" onClick={save} disabled={pending} className="btn-primary text-center disabled:opacity-60">
        {pending ? t("Saving…") : t("Save recipe")}
      </button>
    </div>
  );
}
