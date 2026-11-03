"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import Image from "next/image";
import { Mic, Minus, Plus, ReceiptText, ScanBarcode, Trash2, X, Zap } from "lucide-react";
import { formatMoney, paymentMethodLabel } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";
import { AIStatusBadge, type AIStatusBadgeHandle } from "@/app/components/AIStatusBadge";
import { KeyboardHint } from "@/app/components/KeyboardHint";
import { CashChange } from "@/app/components/CashChange";
import { SavingBill } from "@/app/components/SavingBill";
import { SplitPayments, type SplitRow } from "@/app/components/SplitPayments";
import type { calculateTransactionTotals } from "@/lib/validation/totals";
import { QuantityGrid } from "./QuantityGrid";
import type { FastCartLine, FastProduct } from "./FastBillingClient";

/** Fast Billing in the New look (THERAY_FINAL_DESIGN fast-billing-pos). The counter's state, keys,
 * voice and checkout all stay in FastBillingClient — this only lays them out: on a computer the
 * design's three panes (scan and categories, the bill as a table with the tap-to-add items under it,
 * the settlement panel), on a phone the items, the bill and a charge bar that opens the bill sheet. */
export function NewFastBilling(props: {
  categories: string[];
  visibleProducts: FastProduct[];
  productCount: number;
  cart: FastCartLine[];
  itemCount: number;
  total: number;
  search: string;
  setSearch: (s: string) => void;
  activeCategory: string | null;
  setActiveCategory: (c: string | null) => void;
  addToCart: (p: FastProduct, qty: number) => void;
  updateQty: (productId: string, qty: number) => void;
  clearCart: () => void;
  stockOf: (productId: string) => FastProduct | undefined;
  searchRef: RefObject<HTMLInputElement | null>;
  addFromSearch: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  keyboardBilling: boolean;
  voice: { supported: boolean; listening: boolean; status: string | null; start: () => void; statusRef: RefObject<AIStatusBadgeHandle | null> };
  hold: { start: (p: FastProduct) => void; end: () => void; consumed: () => boolean };
  selectedProduct: FastProduct | null;
  setSelectedProduct: (p: FastProduct | null) => void;
  setQuantity: (p: FastProduct, qty: number) => void;
  showBill: boolean;
  setShowBill: (v: boolean) => void;
  /** The settlement panel (FastCheckoutButton): beside the bill on a computer, in the charge sheet on a phone. */
  checkout: ReactNode;
}) {
  const { t } = useT();
  const wide = useWide();
  const { cart, itemCount } = props;
  const lines = cart.length;

  const scan = (
    <div className="n-card flex items-center gap-2 p-2.5">
      <span className="n-label hidden shrink-0 items-center gap-1.5 rounded-lg bg-brand-soft px-2.5 py-2 text-brand-text sm:flex">
        <ScanBarcode size={16} aria-hidden="true" /> {t("Fast scan")}
      </span>
      <input
        ref={props.searchRef}
        data-bill-search
        value={props.search}
        onChange={(e) => props.setSearch(e.target.value)}
        onKeyDown={props.addFromSearch}
        placeholder={t("Scan a barcode or type an item's name, then Enter")}
        className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-2 text-sm outline-none"
        aria-label={t("Find an item")}
      />
      {props.voice.supported && (
        <button
          type="button"
          onClick={props.voice.start}
          disabled={props.voice.listening}
          aria-label={t("voice.speakOrder")}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${props.voice.listening ? "animate-pulse bg-danger text-white" : "bg-brand text-white"}`}
        >
          <Mic size={17} />
        </button>
      )}
    </div>
  );

  const categories = props.categories.length > 0 && (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto scroll-hide px-1 pb-0.5">
      <Pill label={t("All items")} count={props.productCount} active={props.activeCategory === null} onClick={() => props.setActiveCategory(null)} />
      {props.categories.map((c) => (
        <Pill key={c} label={c} active={props.activeCategory === c} onClick={() => props.setActiveCategory(c)} />
      ))}
    </div>
  );

  const tiles = (
    // A phone: two rows that scroll sideways, so the bill stays in view under them (the design's strip).
    <div className={wide ? "grid grid-cols-4 gap-2 2xl:grid-cols-6" : "-mx-4 grid auto-cols-[31%] grid-flow-col grid-rows-2 gap-2 overflow-x-auto scroll-hide px-4 pb-1 sm:auto-cols-[23%]"}>
      {props.visibleProducts.map((p) => {
        const inCart = cart.find((l) => l.productId === p.id);
        const out = p.trackInventory && p.stockQuantity <= 0;
        return (
          <button
            key={p.id}
            type="button"
            disabled={out}
            onClick={() => {
              if (out || props.hold.consumed()) return;
              props.addToCart(p, 1);
            }}
            onPointerDown={() => !out && props.hold.start(p)}
            onPointerUp={props.hold.end}
            onPointerLeave={props.hold.end}
            onPointerCancel={props.hold.end}
            onContextMenu={(e) => e.preventDefault()}
            className={`relative flex select-none flex-col gap-1 rounded-xl border p-2.5 text-left transition-colors [-webkit-touch-callout:none] disabled:opacity-40 ${inCart ? "border-brand bg-brand-soft" : "border-transparent bg-surface-2 hover:border-brand/40"}`}
          >
            {inCart && <span className="n-code absolute right-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">{inCart.qty}</span>}
            {p.imageUrl ? (
              <span className="relative h-10 w-10 overflow-hidden rounded-lg bg-surface">
                <Image src={p.imageUrl} alt="" fill sizes="40px" className="object-cover" />
              </span>
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface text-sm font-bold text-brand-text">{p.name.charAt(0).toUpperCase()}</span>
            )}
            <span className="line-clamp-2 text-xs font-bold leading-tight text-foreground">{p.name}</span>
            <span className="flex items-center justify-between gap-1">
              <span className="n-code text-brand-text">{formatMoney(p.price)}</span>
              {p.trackInventory && <span className={`n-tax ${out ? "text-danger" : "text-muted"}`}>{out ? t("Out") : p.stockQuantity}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );

  const voiceLine = (props.voice.supported || props.voice.status) && (
    <div className="flex flex-wrap items-center gap-2">
      {props.voice.supported && <AIStatusBadge ref={props.voice.statusRef} provider="voice" />}
      {props.voice.status && <p className="text-xs font-medium text-brand-text">{props.voice.status}</p>}
    </div>
  );

  const quantityGrid = props.selectedProduct && (
    <QuantityGrid
      productName={props.selectedProduct.name}
      current={cart.find((l) => l.productId === props.selectedProduct!.id)?.qty}
      onSelect={(qty) => props.setQuantity(props.selectedProduct!, qty)}
      onRemove={
        cart.some((l) => l.productId === props.selectedProduct!.id)
          ? () => {
              props.updateQty(props.selectedProduct!.id, 0);
              props.setSelectedProduct(null);
            }
          : undefined
      }
      onClose={() => props.setSelectedProduct(null)}
    />
  );

  if (wide) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-4">
        <div className="flex min-w-0 flex-col gap-3">
          {scan}
          {voiceLine}
          {categories}
          <section className="n-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="n-label bg-surface-2 text-left text-muted">
                  <th className="px-4 py-2.5 font-medium">#</th>
                  <th className="px-2.5 py-2.5 font-medium">{t("Item")}</th>
                  <th className="px-2.5 py-2.5 font-medium">{t("Stock")}</th>
                  <th className="px-2.5 py-2.5 text-right font-medium">{t("Price")}</th>
                  <th className="px-2.5 py-2.5 text-center font-medium">{t("Quantity")}</th>
                  <th className="px-2.5 py-2.5 text-center font-medium">GST</th>
                  <th className="px-2.5 py-2.5 text-right font-medium">{t("Total")}</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-foreground">
                {cart.map((l, i) => {
                  const p = props.stockOf(l.productId);
                  return (
                    <tr key={l.productId}>
                      <td className="n-code px-4 py-2.5 text-muted">{String(i + 1).padStart(2, "0")}</td>
                      <td className="px-2.5 py-2.5 text-sm font-bold">{l.name}</td>
                      <td className="px-2.5 py-2.5">{p?.trackInventory ? <span className="n-tax rounded bg-brand-soft px-1.5 py-0.5 font-bold text-brand-text">{t("{n} in stock", { n: p.stockQuantity })}</span> : <span className="n-tax text-muted">—</span>}</td>
                      <td className="n-code px-2.5 py-2.5 text-right">{formatMoney(l.price)}</td>
                      <td className="px-2.5 py-2.5">
                        <span className="mx-auto flex w-fit items-center gap-1 rounded-lg bg-surface-2 p-0.5">
                          <button type="button" onClick={() => props.updateQty(l.productId, l.qty - 1)} className="flex h-8 w-8 items-center justify-center rounded-md bg-surface" aria-label={l.qty <= 1 ? t("Remove") : t("Decrease")}>
                            {l.qty <= 1 ? <Trash2 size={14} className="text-danger" /> : <Minus size={14} />}
                          </button>
                          <button type="button" onClick={() => p && props.setSelectedProduct(p)} className="n-code w-9 text-center font-bold" aria-label={t("Change quantity")}>
                            {l.qty}
                          </button>
                          <button type="button" onClick={() => props.updateQty(l.productId, l.qty + 1)} className="flex h-8 w-8 items-center justify-center rounded-md bg-surface" aria-label={t("Increase")}>
                            <Plus size={14} />
                          </button>
                        </span>
                      </td>
                      <td className="px-2.5 py-2.5 text-center">
                        <span className="n-tax rounded bg-secondary-soft px-1.5 py-0.5 font-bold text-secondary">{l.gstPercent}%</span>
                      </td>
                      <td className="n-code px-2.5 py-2.5 text-right font-bold">{formatMoney(l.qty * l.price)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button type="button" onClick={() => props.updateQty(l.productId, 0)} className="text-muted hover:text-danger" aria-label={t("Remove")}>
                          <X size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {lines === 0 && <p className="px-4 py-10 text-center text-sm text-muted">{t("Scan or tap an item below to start the bill.")}</p>}
            <div className="flex items-center justify-between gap-3 bg-surface-2 px-4 py-2.5">
              <span className="text-sm font-semibold text-foreground">
                {t("Items in cart")}: <span className="n-code rounded bg-brand-soft px-2 py-0.5 font-bold text-brand-text">{t("{n} items ({u} units)", { n: lines, u: itemCount })}</span>
              </span>
              {lines > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t("Clear every item from this bill?"))) props.clearCart();
                  }}
                  className="flex items-center gap-1 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-bold text-danger"
                >
                  <Trash2 size={13} /> {t("Clear cart")}
                </button>
              )}
            </div>
          </section>
          <section className="n-card flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <span className="n-label flex items-center gap-1.5 text-foreground">
                <Zap size={14} className="text-brand-text" aria-hidden="true" /> {t("Tap to add")}
              </span>
              <span className="n-tax text-muted">{t("Tap adds 1 · press and hold for a quantity")}</span>
            </div>
            {tiles}
          </section>
          {props.keyboardBilling && <KeyboardHint keys={[["Name + Enter", "add item"], ["F10", "save now"]]} />}
        </div>
        <aside className="sticky top-20 self-start">{props.checkout}</aside>
        {quantityGrid}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-32">
      {scan}
      {voiceLine}
      {categories}
      <section className="flex flex-col gap-2">
        <span className="n-label flex items-center gap-1.5 text-muted">
          <Zap size={14} className="text-brand-text" aria-hidden="true" /> {t("Tap to add")}
        </span>
        {tiles}
      </section>
      {lines > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="n-h2 text-foreground">{t("Active cart")}</h2>
            <span className="n-tax rounded-full bg-brand-soft px-2 py-0.5 font-bold text-brand-text">{t("{n} items ({u} units)", { n: lines, u: itemCount })}</span>
            <button type="button" onClick={() => window.confirm(t("Clear every item from this bill?")) && props.clearCart()} className="ml-auto flex items-center gap-1 text-xs font-bold text-danger">
              <Trash2 size={13} /> {t("Clear")}
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {cart.map((l) => {
              const p = props.stockOf(l.productId);
              return (
                <li key={l.productId} className="n-card flex items-center gap-3 p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-foreground">{l.name}</span>
                    <span className="n-tax block text-muted">
                      {formatMoney(l.price)} · GST {l.gstPercent}%
                    </span>
                    <span className="n-code block font-bold text-brand-text">{formatMoney(l.qty * l.price)}</span>
                  </span>
                  <span className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                    <button type="button" onClick={() => props.updateQty(l.productId, l.qty - 1)} className="flex h-10 w-10 items-center justify-center" aria-label={l.qty <= 1 ? t("Remove") : t("Decrease")}>
                      {l.qty <= 1 ? <Trash2 size={15} className="text-danger" /> : <Minus size={15} />}
                    </button>
                    <button type="button" onClick={() => p && props.setSelectedProduct(p)} className="n-code w-7 text-center font-bold">
                      {l.qty}
                    </button>
                    <button type="button" onClick={() => props.updateQty(l.productId, l.qty + 1)} className="flex h-10 w-10 items-center justify-center" aria-label={t("Increase")}>
                      <Plus size={15} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] z-20 border-t-2 border-transparent bg-surface px-3 pb-2.5 pt-2 shadow-[0_-8px_20px_-8px_rgba(0,0,0,0.15)] md:bottom-0 md:left-72" style={{ borderImage: "var(--ray-gradient) 1" }}>
          <div className="mb-2 flex items-end justify-between gap-2">
            <span className="n-tax text-muted">{t("{n} items ({u} units)", { n: lines, u: itemCount })}</span>
            <span className="text-right">
              <span className="n-label block text-muted">{t("Net payable")}</span>
              <span className="text-2xl font-extrabold leading-7 text-foreground">{formatMoney(props.total)}</span>
            </span>
          </div>
          <button type="button" onClick={() => props.setShowBill(true)} className="n-gradient flex h-13 w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-extrabold shadow-md">
            <ReceiptText size={18} aria-hidden="true" /> {t("Charge {amount}", { amount: formatMoney(props.total) })}
          </button>
        </div>
      )}
      {props.showBill && (
        <div data-keyboard-billing className="fixed inset-0 z-30 flex flex-col bg-background">
          <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
            <span className="n-h2 text-foreground">{t("Current bill")}</span>
            <button type="button" onClick={() => props.setShowBill(false)} className="rounded-full p-1.5 text-muted" aria-label={t("Close")}>
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 pb-8">{props.checkout}</div>
        </div>
      )}
      {quantityGrid}
    </div>
  );
}

/** The design's settlement panel: what the bill comes to, the customer, how it is paid, the change,
 * and save & print — every value and handler from FastCheckoutButton. */
export function NewSettlement(props: {
  t: (key: string, vars?: Record<string, string | number>) => string;
  figures: ReturnType<typeof calculateTransactionTotals>;
  /** Prices include GST: the GST row is what the total already holds. */
  inclusive: boolean;
  units: number;
  error?: string;
  pending: boolean;
  cart: FastCartLine[];
  isUdhar: boolean;
  paymentMethod: "cash" | "card" | "upi" | "online" | "other" | "udhar";
  choosePayment: (m: "cash" | "card" | "upi" | "online" | "other" | "udhar") => void;
  split: SplitRow[] | null;
  setSplit: (rows: SplitRow[] | null) => void;
  canDiscount: boolean;
  discount: { type: "percent" | "flat"; value: number; setType: (t: "percent" | "flat") => void; setValue: (v: number) => void };
  loyalty: { flat: boolean; checked: boolean; set: (v: boolean) => void; points: number; value: number } | null;
  canUdhaar: boolean;
  customer: ReactNode;
  form: ReactNode;
}) {
  const { t, figures, cart, split } = props;
  const payable = figures.total;
  const [discountOpen, setDiscountOpen] = useState(false);
  return (
    <section className="n-card relative flex flex-col gap-3 overflow-hidden p-4">
      <div className="n-gradient absolute inset-x-0 top-0 h-1" aria-hidden="true" />
      <div className="flex items-center justify-between pt-1">
        <h2 className="n-h2 text-foreground">{t("Settlement")}</h2>
        <span className="n-tax rounded bg-surface-2 px-2 py-0.5 text-muted">{t("{n} units", { n: props.units })}</span>
      </div>
      {props.customer}
      <dl className="flex flex-col gap-1.5 text-sm">
        <Row label={t("Items subtotal")} value={formatMoney(figures.subtotal)} />
        {figures.gstAmount > 0 && <Row label={props.inclusive ? t("Of which GST (CGST + SGST)") : t("GST (CGST + SGST)")} value={formatMoney(figures.gstAmount)} />}
        {props.canDiscount && (
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setDiscountOpen((v) => !v)} className="font-semibold text-credit">
              {t("Discount")} {props.discount.value > 0 ? `(${props.discount.type === "percent" ? `${props.discount.value}%` : formatMoney(props.discount.value)})` : `· ${t("tap to add")}`}
            </button>
            <dd className="n-code text-credit">{figures.discountAmount > 0 ? `−${formatMoney(figures.discountAmount)}` : "—"}</dd>
          </div>
        )}
        {discountOpen && (
          <div className="flex gap-1.5">
            {(["flat", "percent"] as const).map((k) => (
              <button key={k} type="button" onClick={() => props.discount.setType(k)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${props.discount.type === k ? "bg-brand text-white" : "bg-surface-2 text-muted"}`}>
                {k === "flat" ? "₹" : "%"}
              </button>
            ))}
            <input type="number" min={0} autoFocus value={props.discount.value || ""} onChange={(e) => props.discount.setValue(Math.max(0, Number(e.target.value) || 0))} placeholder="0" className="min-w-0 flex-1 rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-brand" aria-label={t("Discount")} />
          </div>
        )}
        {figures.roundOffAmount !== 0 && <Row label={t("Round off")} value={`${figures.roundOffAmount > 0 ? "+" : "−"}${formatMoney(Math.abs(figures.roundOffAmount))}`} />}
      </dl>
      {props.loyalty &&
        (props.loyalty.flat ? (
          <label className="flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-2 text-xs text-brand-text">
            <input type="checkbox" checked={props.loyalty.checked} onChange={(e) => props.loyalty!.set(e.target.checked)} className="h-4 w-4" />
            {t("Redeem {n} points for {amount} off", { n: props.loyalty.points, amount: formatMoney(props.loyalty.value) })}
          </label>
        ) : (
          <p className="text-xs text-muted">{t("Switch the discount to ₹ to redeem points.")}</p>
        ))}
      <div className="flex items-center justify-between rounded-xl bg-brand-soft px-4 py-3">
        <span>
          <span className="n-label block text-brand-text">{t("Net payable")}</span>
          <span className="text-[11px] text-brand-text">{t("All taxes included")}</span>
        </span>
        <span className="n-figure text-brand-text">{formatMoney(payable)}</span>
      </div>
      <span className="n-label text-muted">{t("How is it paid?")}</span>
      <div className="grid grid-cols-3 gap-1.5">
        {(["cash", "upi", "card", "online", "other", "udhar"] as const).map((m) => {
          const on = props.paymentMethod === m && !split;
          return (
            <button
              key={m}
              type="button"
              onClick={() => props.choosePayment(m)}
              className={`flex min-h-12 items-center justify-center rounded-xl px-1.5 py-2 text-center text-xs font-bold leading-tight ${
                m === "udhar" ? (on ? "bg-credit text-[color:var(--on-credit)]" : "bg-credit-soft text-credit") : on ? "bg-brand text-white shadow-sm" : "bg-surface-2 text-foreground hover:bg-brand-soft"
              }`}
            >
              {m === "udhar" ? t("Khata udhaar") : t(paymentMethodLabel(m))}
            </button>
          );
        })}
      </div>
      {cart.length > 0 && !props.isUdhar && (split ? (
        <SplitPayments rows={split} onChange={props.setSplit} payable={payable} canUdhaar={props.canUdhaar} onSingle={() => props.setSplit(null)} />
      ) : (
        <button
          type="button"
          onClick={() => props.setSplit([{ method: props.paymentMethod === "udhar" ? "cash" : props.paymentMethod, amount: payable, reference: "" }, { method: props.paymentMethod === "upi" ? "cash" : "upi", amount: "", reference: "" }])}
          className="flex items-center gap-1 self-start rounded-full border border-border px-3 py-1.5 text-xs font-bold text-brand-text"
        >
          <Plus size={13} /> {t("Split payment")}
        </button>
      ))}
      {props.paymentMethod === "cash" && !split && cart.length > 0 && <CashChange total={payable} resetKey={cart.length === 0} />}
      {props.error && <p className="text-sm text-danger">{props.error}</p>}
      <SavingBill pending={props.pending} lines={cart.map((l) => ({ name: l.name, quantity: l.qty, amount: Math.round(l.qty * l.price * 100) / 100 }))} total={payable} />
      {props.form}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="n-code text-foreground">{value}</dd>
    </div>
  );
}

function Pill({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${active ? "bg-brand text-white shadow-sm" : "n-card text-foreground"}`}>
      {label}
      {count !== undefined && <span className={`n-tax rounded px-1 ${active ? "bg-white/20" : "bg-surface-2 text-muted"}`}>{count}</span>}
    </button>
  );
}

/** A computer's width (the design's three panes need about 1280 px). */
function useWide() {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1280px)");
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}
