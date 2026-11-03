"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, Plus, Search, Shirt, X } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";
import { formatMoney } from "@/lib/format";
import { prepareStyleForPurchaseAction, type PurchaseVariant } from "@/lib/actions/garment";
import { parseList, parseSizes, variantMatrix } from "@/lib/garment/rules";
import { cellKey, gridLines, styleGrid } from "@/lib/garment/purchaseGrid";

export type GridStyle = { id: string; name: string; code: string | null; brand: string | null; gstPercent: number };
export type GridItem = { id: string; styleId: string; colour: string | null; size: string | null; stock: number | null; price: number; mrp: number | null; last: { rate: number; date: string } | null };
export type GridAdd = { productId: string; quantity: number; rate: number; mrp: number | null; saleRate: number | null };

const FIELD = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand";
const CELL = "w-14 rounded-lg border border-border bg-surface px-1.5 py-1.5 text-center text-sm font-semibold outline-none focus:border-brand";
const SIZE_SETS = [
  { label: "S–XXL", value: "S M L XL XXL" },
  { label: "XS–XL", value: "XS S M L XL" },
  { label: "28–36", value: "28 30 32 34 36" },
  { label: "Free size", value: "Free Size" },
];
const num = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? 0 : Number(s));
const label = (v: string | null, none: string) => v ?? none;

type NewStyle = { name: string; code: string; brand: string; categoryId: string; hsnCode: string; gstPercent: number; price: string; mrp: string; fabric: string; season: string; colours: string; sizes: string; autoBarcode: boolean };

/** Purchase entry → Sizes × colours: pick a style (or make one), type each colour × size's quantity
 * and the rate, and every filled cell becomes a line of the purchase. Cells the style doesn't have
 * yet become its items when added, with barcodes, the same as on New style. */
export function GarmentPurchaseGrid({
  styles,
  categories,
  items,
  startNew,
  onAdd,
  onClose,
}: {
  styles: GridStyle[];
  categories: { id: string; name: string }[];
  items: GridItem[];
  startNew: string | null;
  /** `made`: the style when this grid created it, so a second grid on the same bill can find it. */
  onAdd: (variants: PurchaseVariant[], lines: GridAdd[], made: GridStyle | null) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [step, setStep] = useState<"pick" | "new" | "grid">(startNew !== null ? "new" : "pick");
  const [query, setQuery] = useState("");
  const [styleId, setStyleId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewStyle>({ name: startNew ?? "", code: "", brand: "", categoryId: "", hsnCode: "", gstPercent: 5, price: "", mrp: "", fabric: "", season: "", colours: "", sizes: "", autoBarcode: true });
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [rate, setRate] = useState("");
  const [bySize, setBySize] = useState(false);
  const [rateBySize, setRateBySize] = useState<Record<string, number>>({});
  const [mrp, setMrp] = useState("");
  const [saleRate, setSaleRate] = useState("");
  const [moreColours, setMoreColours] = useState<string[]>([]);
  const [moreSizes, setMoreSizes] = useState<string[]>([]);
  const [addColour, setAddColour] = useState("");
  const [addSize, setAddSize] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tableRef = useRef<HTMLTableElement>(null);

  const style = styles.find((s) => s.id === styleId) ?? null;
  const styleItems = useMemo(() => (styleId ? items.filter((i) => i.styleId === styleId) : []), [items, styleId]);
  const newVariants = useMemo(() => (step !== "pick" && !styleId ? variantMatrix(parseList(draft.colours), parseSizes(draft.sizes)) : []), [step, styleId, draft.colours, draft.sizes]);
  const grid = useMemo(
    () =>
      styleId
        ? styleGrid(styleItems.map((i) => ({ id: i.id, colour: i.colour, size: i.size })), moreColours, moreSizes)
        : styleGrid(newVariants.map((v) => ({ id: "", colour: v.colour, size: v.size }))),
    [styleId, styleItems, newVariants, moreColours, moreSizes],
  );
  const itemOf = (colour: string | null, size: string | null) => (styleId ? styleItems.find((i) => cellKey(i.colour, i.size) === cellKey(colour, size)) : undefined);
  const lines = gridLines({ ...grid, item: (c, s) => itemOf(c, s)?.id ?? null }, quantities, num(rate), bySize ? rateBySize : {});
  const pieces = lines.reduce((s, l) => s + l.quantity, 0);
  const amount = lines.reduce((s, l) => s + l.quantity * l.rate, 0);
  const needsRate = lines.some((l) => !(l.rate > 0));

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? styles.filter((s) => [s.name, s.code ?? "", s.brand ?? ""].some((v) => v.toLowerCase().includes(q))) : styles;
    return list.slice(0, 30);
  }, [query, styles]);

  function openStyle(id: string) {
    const own = items.filter((i) => i.styleId === id);
    // The last rate this style was bought at, as a start.
    const last = own.filter((i) => i.last).sort((a, b) => (b.last!.date > a.last!.date ? 1 : -1))[0]?.last;
    setStyleId(id);
    setRate(last ? String(last.rate) : "");
    setMrp("");
    setSaleRate("");
    setQuantities({});
    setMoreColours([]);
    setMoreSizes([]);
    setStep("grid");
  }

  function startGridForNew() {
    setError(null);
    if (!draft.name.trim()) return setError(t("Enter the style's name."));
    if (!(num(draft.price) > 0)) return setError(t("Enter the selling price."));
    if (draft.mrp.trim() && num(draft.mrp) < num(draft.price)) return setError(t("MRP can't be below the selling price."));
    setMrp(draft.mrp);
    setSaleRate(draft.price);
    setQuantities({});
    setStep("grid");
  }

  function setQty(colour: string | null, size: string | null, value: string) {
    setQuantities((prev) => ({ ...prev, [cellKey(colour, size)]: Math.max(0, Math.round(num(value) * 1000) / 1000) }));
  }

  /** Enter moves along the row and down to the next one, like a register. */
  function nextCell(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const boxes = [...(tableRef.current?.querySelectorAll<HTMLInputElement>("input[data-cell]") ?? [])];
    const next = boxes[boxes.indexOf(e.currentTarget) + 1];
    if (next) {
      next.focus();
      next.select();
    }
  }

  function add() {
    setError(null);
    if (!lines.length) return setError(t("Type a quantity in at least one size."));
    if (needsRate) return setError(t("Enter the rate a piece."));
    const sale = saleRate.trim() ? num(saleRate) : null;
    const m = mrp.trim() ? num(mrp) : null;
    if (sale !== null && m !== null && m < sale) return setError(t("MRP can't be below the selling price."));
    const missing = lines.filter((l) => !l.productId);
    const finish = (variants: PurchaseVariant[]) => {
      const byCell = new Map(variants.map((v) => [cellKey(v.colour, v.size), v.id]));
      const out = lines.map((l) => ({ productId: l.productId ?? byCell.get(cellKey(l.colour, l.size)) ?? "", quantity: l.quantity, rate: l.rate, mrp: m, saleRate: sale }));
      if (out.some((l) => !l.productId)) return setError(t("A size or colour couldn't be made — check the style and try again."));
      const made = !styleId && variants[0] ? { id: variants[0].styleId, name: draft.name.trim(), code: draft.code.trim() || null, brand: draft.brand.trim() || null, gstPercent: draft.gstPercent } : null;
      onAdd(variants, out, made);
    };
    if (!missing.length && styleId) return finish([]);
    start(async () => {
      const r = await prepareStyleForPurchaseAction(
        styleId
          ? { styleId, cells: missing.map((l) => ({ colour: l.colour, size: l.size })) }
          : {
              styleId: null,
              style: { ...draft, price: num(draft.price), mrp: draft.mrp.trim() ? num(draft.mrp) : null, colours: parseList(draft.colours), sizes: parseSizes(draft.sizes) },
              cells: [],
            },
      );
      if (r.error || !r.variants) return setError(r.error ?? t("Couldn't add the style."));
      finish(r.variants);
    });
  }

  // Something typed here that closing would lose.
  const typed =
    step === "grid"
      ? Object.values(quantities).some((q) => q > 0) || (!style && !!draft.name.trim())
      : step === "new" && [draft.name, draft.code, draft.brand, draft.price, draft.mrp, draft.colours, draft.sizes].some((v) => v.trim());
  /** Only the ✕ closes it (a click beside it, or a text selection let go outside, must not), and
   * asks first when something is typed. */
  function close() {
    if (typed && !window.confirm(t("Close without adding to the purchase? What you typed here will be lost."))) return;
    onClose();
  }
  // Esc works wherever the focus is (a click beside the popup takes it out of the popup).
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div
        className="flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-surface shadow-xl sm:max-h-[90vh] sm:rounded-2xl"
        onKeyDown={(e) => {
          // It opens inside the purchase form: Enter in a box here must never save the purchase.
          if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
        }}
        role="dialog"
        aria-label={t("Sizes × colours")}
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          {step !== "pick" && (
            <button type="button" onClick={() => { setStep("pick"); setStyleId(null); setError(null); }} aria-label={t("Back")} className="text-muted">
              <ArrowLeft size={18} />
            </button>
          )}
          <Shirt size={18} className="text-brand-text" aria-hidden="true" />
          <p className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
            {step === "pick" ? t("Buy by size and colour") : step === "new" ? t("New style") : style ? style.name : draft.name}
            {step === "grid" && !style && <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-text">{t("new style")}</span>}
          </p>
          <button type="button" onClick={close} aria-label={t("Close")} className="text-muted">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {step === "pick" && (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search a style by name, code or brand")} className={`${FIELD} pl-9`} />
              </div>
              <button
                type="button"
                onClick={() => {
                  setDraft((d) => ({ ...d, name: d.name || query.trim() }));
                  setStep("new");
                }}
                className="flex items-center gap-2 rounded-xl border border-dashed border-brand px-3 py-2.5 text-sm font-semibold text-brand-text"
              >
                <Plus size={16} /> {query.trim() ? t("New style “{name}”", { name: query.trim() }) : t("New style")}
              </button>
              {matches.length > 0 ? (
                <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                  {matches.map((s) => {
                    const own = items.filter((i) => i.styleId === s.id);
                    const stock = own.reduce((sum, i) => sum + (i.stock ?? 0), 0);
                    return (
                      <li key={s.id}>
                        <button type="button" onClick={() => openStyle(s.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-surface-2">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-foreground">{s.name}</span>
                            <span className="block truncate text-[11px] text-muted">{[s.code, s.brand].filter(Boolean).join(" · ") || "—"}</span>
                          </span>
                          <span className="shrink-0 text-right text-[11px] text-muted">
                            {t("{n} sizes and colours", { n: own.length })}
                            <br />
                            {t("Stock {n}", { n: stock })}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-center text-sm text-muted">{styles.length ? t("No style matches — make it new above.") : t("No styles yet — make the first one above.")}</p>
              )}
            </div>
          )}

          {step === "new" && (
            <div className="flex flex-col gap-3">
              <input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t("Style name (e.g. Cotton Kurti)")} className={FIELD} />
              <div className="grid grid-cols-2 gap-2">
                <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder={t("Style code (e.g. KUR-101)")} className={FIELD} />
                <input value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} placeholder={t("Brand")} className={FIELD} />
                <select value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })} className={FIELD} aria-label={t("Garment category")}>
                  <option value="">{t("No category")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input value={draft.hsnCode} onChange={(e) => setDraft({ ...draft, hsnCode: e.target.value })} placeholder={t("HSN (e.g. 6204)")} className={FIELD} />
                <input value={draft.fabric} onChange={(e) => setDraft({ ...draft, fabric: e.target.value })} placeholder={t("Fabric")} className={FIELD} />
                <input value={draft.season} onChange={(e) => setDraft({ ...draft, season: e.target.value })} placeholder={t("Season / collection")} className={FIELD} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs text-muted">
                  {t("Selling price (₹)")}
                  <input type="number" min={0} step="0.01" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} className={FIELD} />
                </label>
                <label className="text-xs text-muted">
                  {t("MRP")}
                  <input type="number" min={0} step="0.01" inputMode="decimal" value={draft.mrp} onChange={(e) => setDraft({ ...draft, mrp: e.target.value })} className={FIELD} />
                </label>
                <label className="text-xs text-muted">
                  {t("GST %")}
                  <select value={draft.gstPercent} onChange={(e) => setDraft({ ...draft, gstPercent: Number(e.target.value) })} className={FIELD}>
                    {[0, 5, 12, 18].map((g) => (
                      <option key={g} value={g}>
                        {g}%
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <input value={draft.colours} onChange={(e) => setDraft({ ...draft, colours: e.target.value })} placeholder={t("Colours, with commas (Red, Blue, Black)")} className={FIELD} />
              <input value={draft.sizes} onChange={(e) => setDraft({ ...draft, sizes: e.target.value })} placeholder={t("Sizes (S M L XL, or 28 30 32)")} className={FIELD} />
              <div className="flex flex-wrap gap-1.5">
                {SIZE_SETS.map((s) => (
                  <button key={s.label} type="button" onClick={() => setDraft({ ...draft, sizes: s.value })} className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:border-brand">
                    {t(s.label)}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.autoBarcode} onChange={(e) => setDraft({ ...draft, autoBarcode: e.target.checked })} />
                {t("Make a barcode for each size and colour (print labels from Products)")}
              </label>
              {(draft.colours.trim() || draft.sizes.trim()) && <p className="text-xs text-muted">{t("{n} items will be created", { n: newVariants.length })}</p>}
            </div>
          )}

          {step === "grid" && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs font-medium text-muted">
                  {t("Rate a piece (before GST)")}
                  <input autoFocus type="number" min={0} step="any" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="₹" className={`${FIELD} text-right ${!bySize && !(num(rate) > 0) ? "border-danger/60" : ""}`} />
                </label>
                <label className="text-xs font-medium text-muted">
                  {t("Sale rate")}
                  <input type="number" min={0} step="any" inputMode="decimal" value={saleRate} onChange={(e) => setSaleRate(e.target.value)} placeholder={style ? t("each item's own") : ""} className={`${FIELD} text-right`} />
                </label>
                <label className="text-xs font-medium text-muted">
                  MRP
                  <input type="number" min={0} step="any" inputMode="decimal" value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder={style ? t("each item's own") : ""} className={`${FIELD} text-right`} />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input type="checkbox" checked={bySize} onChange={(e) => setBySize(e.target.checked)} />
                {t("A different rate for each size")}
              </label>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table ref={tableRef} className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-surface-2 text-xs text-muted">
                      <th className="sticky left-0 bg-surface-2 px-3 py-2 text-left font-semibold">{t("Colour")} \ {t("Size")}</th>
                      {grid.sizes.map((s) => (
                        <th key={cellKey(null, s)} className="px-1.5 py-2 text-center font-semibold text-foreground">
                          {label(s, t("One size"))}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right font-semibold">{t("Total")}</th>
                    </tr>
                    {bySize && (
                      <tr className="bg-surface-2">
                        <td className="sticky left-0 bg-surface-2 px-3 py-1.5 text-[11px] text-muted">{t("Rate")}</td>
                        {grid.sizes.map((s) => (
                          <td key={cellKey(null, s)} className="px-1.5 py-1.5 text-center">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              inputMode="decimal"
                              value={rateBySize[cellKey(null, s)] ?? ""}
                              onChange={(e) => setRateBySize((prev) => ({ ...prev, [cellKey(null, s)]: num(e.target.value) }))}
                              placeholder={rate || "₹"}
                              className={CELL}
                              aria-label={`${t("Rate")} ${label(s, t("One size"))}`}
                            />
                          </td>
                        ))}
                        <td />
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-border">
                    {grid.colours.map((c) => {
                      const rowTotal = grid.sizes.reduce((sum, s) => sum + (quantities[cellKey(c, s)] ?? 0), 0);
                      return (
                        <tr key={cellKey(c, null)}>
                          <th scope="row" className="sticky left-0 bg-surface px-3 py-1.5 text-left text-sm font-semibold text-foreground">
                            {label(c, t("One colour"))}
                          </th>
                          {grid.sizes.map((s) => {
                            const item = itemOf(c, s);
                            return (
                              <td key={cellKey(c, s)} className="px-1.5 py-1.5 text-center align-top">
                                <input
                                  data-cell
                                  type="number"
                                  min={0}
                                  step="any"
                                  inputMode="numeric"
                                  value={quantities[cellKey(c, s)] || ""}
                                  onChange={(e) => setQty(c, s, e.target.value)}
                                  onKeyDown={nextCell}
                                  onFocus={(e) => e.target.select()}
                                  className={CELL}
                                  aria-label={`${label(c, t("One colour"))} ${label(s, t("One size"))}`}
                                />
                                <span className={`mt-0.5 block text-[10px] ${item ? "text-muted" : "font-semibold text-brand-text"}`}>
                                  {item ? (item.stock !== null ? t("has {n}", { n: item.stock }) : "") : t("new")}
                                </span>
                              </td>
                            );
                          })}
                          <td className="px-3 py-1.5 text-right font-semibold text-foreground">{rowTotal || ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {style && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="flex items-center gap-1">
                    <input value={addColour} onChange={(e) => setAddColour(e.target.value)} placeholder={t("Another colour")} className="w-32 rounded-lg border border-border px-2 py-1.5" />
                    <button type="button" disabled={!addColour.trim()} onClick={() => { setMoreColours((m) => [...m, ...parseList(addColour)]); setAddColour(""); }} className="rounded-lg border border-brand px-2 py-1.5 font-semibold text-brand-text disabled:opacity-40">
                      {t("Add")}
                    </button>
                  </span>
                  <span className="flex items-center gap-1">
                    <input value={addSize} onChange={(e) => setAddSize(e.target.value)} placeholder={t("Another size")} className="w-28 rounded-lg border border-border px-2 py-1.5" />
                    <button type="button" disabled={!addSize.trim()} onClick={() => { setMoreSizes((m) => [...m, ...parseSizes(addSize)]); setAddSize(""); }} className="rounded-lg border border-brand px-2 py-1.5 font-semibold text-brand-text disabled:opacity-40">
                      {t("Add")}
                    </button>
                  </span>
                  <span className="self-center text-muted">{t("A new colour or size becomes an item of this style when added.")}</span>
                </div>
              )}
            </div>
          )}
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </div>

        {step !== "pick" && (
          <footer className="flex items-center gap-3 border-t border-border px-4 py-3">
            {step === "new" ? (
              <button type="button" onClick={startGridForNew} disabled={!newVariants.length} className="btn-primary w-full disabled:opacity-50">
                {t("Next: quantities")}
              </button>
            ) : (
              <>
                <span className="min-w-0 flex-1 text-sm text-muted">
                  {t("{n} pieces", { n: pieces })} · <span className="font-semibold text-foreground">{formatMoney(amount)}</span> <span className="text-[11px]">{t("before GST")}</span>
                </span>
                <button type="button" onClick={add} disabled={pending || !pieces} className="btn-primary shrink-0 disabled:opacity-50">
                  {pending ? t("Adding…") : t("Add to purchase")}
                </button>
              </>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}
