"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  X, Bell, Check, ShoppingCart, Ticket, ArrowLeft, ChefHat, ChevronUp, Layers, Loader2, Merge, Minus, Plus,
  Printer, Search, Trash2, UserRound, UtensilsCrossed, Wallet,
} from "lucide-react";
import { listProductOptionsAction, type OptionGroup } from "@/lib/actions/product-options";
import {
  addOrderItemAction,
  removeOrderItemAction,
  updateOrderItemQuantityAction,
  getNewKotItemsAction,
  settleOrderAction,
  applyOrderDiscountAction,
  cancelOrderAction,
  setOrderTypeAction,
  setWaiterAction,
  markItemServedAction,
  mergeTableAction,
  getOrderUpiQrAction,
  type SettlePayment,
} from "@/lib/actions/restaurant";
import { addComboToOrderAction } from "@/lib/actions/combos";
import { formatMoney } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";
import { BluetoothPrintButton } from "@/app/components/BluetoothPrintButton";
import { buildKotEscPos, buildReceiptEscPos, type ReceiptData } from "@/lib/escpos";
import { getThermalPrintSettingsAction } from "@/lib/actions/settings";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { BackLink, canGoBackInApp } from "@/app/components/BackLink";
import { EmptyState } from "@/app/components/EmptyState";
import { VoiceSearchButton } from "@/app/components/VoiceSearchButton";
import { useToast } from "@/app/components/Toast";
import { paymentMethodLabel } from "@/lib/format";

type Product = { id: string; name: string; price: number; category: string; hasOptions: boolean };
type Combo = { id: string; name: string; price: number };
type Item = {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  status: "pending" | "ready" | "served" | "cancelled";
  selectedModifiers: { group: string; choice: string; price: number }[];
  kotPrinted: boolean;
};
type Order = {
  id: string;
  orderNumber: string;
  status: "open" | "settled" | "cancelled";
  orderType: "dine_in" | "takeaway" | "delivery";
  waiterName: string | null;
  subtotal: number;
  taxableAmount: number;
  discountAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  total: number;
  roundOffAmount: number;
  tableName: string;
  reservationTokenAmount: number;
  createdAt: string;
  firstReadyAt: string | null;
  servedAt: string | null;
  settledAt: string | null;
};

/** ₹220 for whole rupees, ₹22.50 otherwise — menu tiles stay short. */
function menuPrice(n: number) {
  return Number.isInteger(n) ? `₹${n.toLocaleString("en-IN")}` : formatMoney(n);
}

const STATUS_CHIP: Record<Order["status"], { label: string; className: string }> = {
  open: { label: "Open", className: "bg-success-soft text-success" },
  settled: { label: "Paid", className: "bg-brand-soft text-brand-text" },
  cancelled: { label: "Cancelled", className: "bg-danger-soft text-danger" },
};

export function OrderClient({
  shopName,
  shopGstin,
  lang,
  order,
  items: serverItems,
  products,
  combos,
  otherTables,
}: {
  shopName: string;
  shopGstin: string | null;
  lang: Lang;
  order: Order;
  items: Item[];
  products: Product[];
  combos: Combo[];
  otherTables: { orderId: string; tableName: string }[];
}) {
  const { t } = useTranslation(lang);
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kotItems, setKotItems] = useState<{ name: string; quantity: number; modifiers: { group: string; choice: string; price: number }[] }[] | null>(null);
  const [showBillPrint, setShowBillPrint] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [menuQuery, setMenuQuery] = useState("");
  const [waiterName, setWaiterName] = useState(order.waiterName ?? "");
  const [pickingProduct, setPickingProduct] = useState<Product | null>(null);

  // A tapped dish shows in the order at once; the action's response
  // (it revalidates this page) then replaces it with the saved line.
  const [items, addOptimistic] = useOptimistic(serverItems, (state: Item[], product: Product) => {
    const i = state.findIndex((x) => x.productId === product.id && !x.kotPrinted && x.status === "pending" && x.selectedModifiers.length === 0);
    if (i >= 0) return state.map((x, idx) => (idx === i ? { ...x, quantity: x.quantity + 1, lineTotal: (x.quantity + 1) * x.unitPrice } : x));
    return [
      ...state,
      { id: `tmp-${product.id}-${state.length}`, productId: product.id, productName: product.name, quantity: 1, unitPrice: product.price, lineTotal: product.price, status: "pending" as const, selectedModifiers: [], kotPrinted: false },
    ];
  });

  const isReadOnly = order.status !== "open";
  const activeItems = items.filter((i) => i.status !== "cancelled");
  const itemCount = activeItems.reduce((s, i) => s + i.quantity, 0);
  const newForKitchen = activeItems.filter((i) => !i.kotPrinted).reduce((s, i) => s + i.quantity, 0);
  // While a tap is still saving, the stored total is a moment behind the
  // lines on screen — show the lines' own sum until the server catches up,
  // so the amount never reads lower than what's in the order.
  const itemsSum = activeItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const liveTotal = isPending ? Math.max(0, itemsSum - order.discountAmount) : order.total;
  const qtyByProduct = new Map<string, number>();
  for (const i of activeItems) if (i.productId) qtyByProduct.set(i.productId, (qtyByProduct.get(i.productId) ?? 0) + i.quantity);

  const categories = [...new Set(products.map((p) => p.category))].sort();
  const q = menuQuery.trim().toLowerCase();
  const visibleProducts = products.filter((p) => (!activeCategory || p.category === activeCategory) && (!q || p.name.toLowerCase().includes(q)));

  function run(action: () => Promise<{ error?: string } | void>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && result.error) setError(result.error);
      router.refresh();
    });
  }

  function tapProduct(p: Product) {
    if (p.hasOptions) {
      setPickingProduct(p);
      return;
    }
    navigator.vibrate?.(8);
    setError(null);
    startTransition(async () => {
      addOptimistic(p);
      const result = await addOrderItemAction(order.id, p.id, 1);
      if (result.error) setError(result.error);
    });
  }

  function addItem(p: Product, quantity: number, selectedModifiers: { group: string; choice: string; price: number }[] = []) {
    run(() => addOrderItemAction(order.id, p.id, quantity, selectedModifiers));
  }

  function changeQuantity(itemId: string, newQuantity: number) {
    if (newQuantity <= 0) run(() => removeOrderItemAction(itemId, order.id));
    else run(() => updateOrderItemQuantityAction(itemId, order.id, newQuantity));
  }

  function sendToKitchen() {
    setError(null);
    startTransition(async () => {
      const result = await getNewKotItemsAction(order.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (!result.items || result.items.length === 0) {
        showToast(t("order.nothingNewKitchen"), "info");
        return;
      }
      setKotItems(result.items);
      router.refresh();
    });
  }

  // Back to the tables grid the way the phone's back button would go, so
  // a settled order isn't left behind in history.
  function leaveToTables() {
    if (canGoBackInApp()) router.back();
    else router.replace("/restaurant");
  }

  const chip = STATUS_CHIP[order.status];
  const orderPanel = (
    <OrderPanel
      items={items}
      order={order}
      isReadOnly={isReadOnly}
      syncing={isPending}
      liveTotal={liveTotal}
      onQuantity={changeQuantity}
      onRemove={(id) => run(() => removeOrderItemAction(id, order.id))}
      onServed={(id) => run(() => markItemServedAction(id, order.id))}
      t={t}
    />
  );
  const actionButtons = (
    <div className="flex gap-2">
      {!isReadOnly && (
        <button
          onClick={sendToKitchen}
          disabled={isPending && !kotItems}
          className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-sm font-semibold whitespace-nowrap disabled:opacity-60 ${
            newForKitchen > 0 ? "border-warning/50 bg-warning-soft text-warning" : "border-border text-foreground"
          }`}
        >
          <ChefHat size={16} /> {t("KOT")}
          {newForKitchen > 0 && (
            <span className="shrink-0 whitespace-nowrap rounded-full bg-warning px-1.5 text-[11px] font-bold leading-5 text-white">{t("{n} new", { n: newForKitchen })}</span>
          )}
        </button>
      )}
      <button onClick={() => setShowBillPrint(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border px-2 py-3 text-sm font-semibold text-foreground">
        <Printer size={16} /> {t("Bill")}
      </button>
      {!isReadOnly && (
        <button onClick={() => setShowSettle(true)} className="flex flex-[1.3] items-center justify-center gap-1.5 rounded-xl bg-brand px-2 py-3 text-sm font-semibold text-white">
          <Wallet size={16} /> {t("order.settle")}
        </button>
      )}
    </div>
  );

  return (
    <div className={`flex flex-col gap-3 ${activeItems.length > 0 ? "pb-36" : "pb-6"} md:pb-6`}>
      <div className="no-print flex flex-col gap-1">
        <BackLink fallback="/restaurant" label={t("Tables")} />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-bold tracking-tight text-foreground md:text-2xl">{order.tableName}</h1>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}>{t(chip.label)}</span>
            </div>
            <p className="text-xs text-muted">#{order.orderNumber}</p>
          </div>
          {!isReadOnly && otherTables.length > 0 && (
            <button onClick={() => setShowMerge(true)} className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted hover:text-foreground">
              <Merge size={13} /> {t("Merge")}
            </button>
          )}
        </div>
      </div>

      {activeItems.length > 0 && <OrderTimeline order={order} t={t} />}

      {!isReadOnly && (
        <div className="no-print flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex gap-1.5">
            {(["dine_in", "takeaway", "delivery"] as const).map((type) => (
              <button
                key={type}
                onClick={() => run(() => setOrderTypeAction(order.id, type))}
                aria-pressed={order.orderType === type}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  order.orderType === type ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
                }`}
              >
                {type === "dine_in" ? t("order.dineIn") : type === "takeaway" ? t("order.takeaway") : t("order.delivery")}
              </button>
            ))}
          </div>
          <label className="relative min-w-0 flex-1">
            <UserRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={waiterName}
              onChange={(e) => setWaiterName(e.target.value)}
              onBlur={() => {
                if (waiterName !== (order.waiterName ?? "")) run(() => setWaiterAction(order.id, waiterName));
              }}
              placeholder={t("Waiter name")}
              aria-label={t("order.waiter")}
              className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:border-brand"
            />
          </label>
        </div>
      )}

      <div className="md:grid md:grid-cols-[minmax(0,1fr)_340px] md:items-start md:gap-5">
        <div className="flex min-w-0 flex-col gap-3">
          {!isReadOnly && combos.length > 0 && (
            <section className="no-print flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">{t("order.combos")}</p>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
                {combos.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => run(() => addComboToOrderAction(order.id, c.id))}
                    className="shrink-0 rounded-xl border border-brand/40 bg-brand-soft px-3 py-2 text-left active:scale-[0.97]"
                  >
                    <p className="text-sm font-medium text-brand-text">{c.name}</p>
                    <p className="text-xs text-brand-text/70">{menuPrice(c.price)}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {!isReadOnly && (
            <section className="no-print flex flex-col gap-2.5">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  value={menuQuery}
                  onChange={(e) => setMenuQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && visibleProducts.length > 0 && q) {
                      e.preventDefault();
                      tapProduct(visibleProducts[0]);
                      setMenuQuery("");
                    }
                  }}
                  placeholder={t("order.searchMenu")}
                  enterKeyHint="done"
                  className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-20 text-sm outline-none focus:border-brand"
                />
                <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">
                  {menuQuery && (
                    <button type="button" onClick={() => setMenuQuery("")} aria-label={t("Clear")} className="flex h-8 w-8 items-center justify-center rounded-full text-muted">
                      <X size={15} />
                    </button>
                  )}
                  <VoiceSearchButton lang={lang} onResult={setMenuQuery} />
                </div>
              </div>

              {categories.length > 1 && (
                <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:px-0">
                  {[null, ...categories].map((cat) => (
                    <button
                      key={cat ?? "all"}
                      type="button"
                      onClick={() => setActiveCategory(cat)}
                      aria-pressed={activeCategory === cat}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
                        activeCategory === cat ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
                      }`}
                    >
                      {cat === null ? t("All") : cat === "Other" ? t("Other") : cat}
                    </button>
                  ))}
                </div>
              )}

              {products.length === 0 ? (
                <EmptyState
                  icon={UtensilsCrossed}
                  title={t("Your menu is empty")}
                  text={t("Add your dishes once — then tap them here to take orders.")}
                  action={
                    <Link href="/products" className="btn-primary-sm">
                      {t("Add menu items")}
                    </Link>
                  }
                />
              ) : visibleProducts.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("No matching items")}</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {visibleProducts.map((p) => {
                    const qty = qtyByProduct.get(p.id) ?? 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => tapProduct(p)}
                        className={`relative flex min-h-[68px] flex-col items-start justify-between gap-1 rounded-xl border px-3 py-2.5 text-left transition-transform active:scale-[0.96] ${
                          qty > 0 ? "border-brand/50 bg-brand-soft" : "border-border bg-surface hover:border-border-strong"
                        }`}
                      >
                        <span className="line-clamp-2 pr-5 text-sm font-medium leading-snug text-foreground">{p.name}</span>
                        <span className="flex items-center gap-1 text-xs text-muted">
                          {menuPrice(p.price)}
                          {p.hasOptions && <Layers size={11} aria-label={t("Has options")} />}
                        </span>
                        {qty > 0 && (
                          <span className="absolute right-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-white">
                            {qty}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {isReadOnly && <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">{orderPanel}</section>}
          {isReadOnly && (
            <button onClick={() => setShowBillPrint(true)} className="btn-primary flex items-center justify-center gap-2">
              <Printer size={16} /> {t("order.printBill")}
            </button>
          )}
        </div>

        {!isReadOnly && (
          <aside className="no-print sticky top-4 hidden flex-col gap-3 rounded-2xl border border-border bg-surface p-4 md:flex">
            {orderPanel}
            {activeItems.length > 0 && actionButtons}
            <OrderFooterLinks onCancel={() => setShowCancel(true)} t={t} />
          </aside>
        )}
      </div>

      {error && <p className="no-print rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      {!isReadOnly && activeItems.length > 0 && !cartOpen && (
        <div className="no-print fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] z-30 flex flex-col border-t border-border bg-surface shadow-lg md:hidden">
          <button onClick={() => setCartOpen(true)} className="flex w-full items-center justify-between bg-brand px-4 py-2.5 text-sm font-semibold text-white">
            <span className="flex items-center gap-1.5">
              <ShoppingCart size={15} /> {t(itemCount === 1 ? "1 item" : "{n} items", { n: itemCount })}
            </span>
            <span className="flex items-center gap-1.5">
              {isPending && <Loader2 size={13} className="animate-spin" />}
              {formatMoney(liveTotal)} · {t("View")} <ChevronUp size={15} />
            </span>
          </button>
          <div className="p-2.5">{actionButtons}</div>
        </div>
      )}

      {cartOpen && !isReadOnly && (
        <div className="no-print fixed inset-0 z-40 flex items-end justify-center bg-black/50 md:hidden" onClick={() => setCartOpen(false)}>
          <section
            className="ray-pop flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-foreground">{t("{table} — order", { table: order.tableName })}</p>
              <button onClick={() => setCartOpen(false)} aria-label={t("common.close")} className="-mr-1.5 rounded-lg p-1.5 text-muted hover:text-foreground">
                <X size={20} />
              </button>
            </div>
            {orderPanel}
            {activeItems.length > 0 && actionButtons}
            <OrderFooterLinks onCancel={() => { setCartOpen(false); setShowCancel(true); }} t={t} />
          </section>
        </div>
      )}

      {kotItems && (
        <>
          <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setKotItems(null)}>
            <div className="ray-pop w-full max-w-sm rounded-t-2xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-warning-soft text-warning">
                  <ChefHat size={18} />
                </span>
                <div>
                  <p className="text-base font-semibold text-foreground">{t("Sent to kitchen")}</p>
                  <p className="text-xs text-muted">{t("Print the KOT slip if your kitchen uses one.")}</p>
                </div>
              </div>
              <ul className="mt-3 flex flex-col gap-1 rounded-xl border border-border p-3">
                {kotItems.map((item, i) => (
                  <li key={i} className="text-sm text-foreground">
                    <span className="font-semibold">{item.quantity} ×</span> {item.name}
                    {item.modifiers.length > 0 && <span className="text-xs text-muted"> — {item.modifiers.map((m) => m.choice).join(", ")}</span>}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <BluetoothPrintButton
                  getBytes={() =>
                    buildKotEscPos({
                      title: `KITCHEN ORDER — #${order.orderNumber}`,
                      subtitle: `${order.tableName} · ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}`,
                      items: kotItems.map((i) => ({ name: i.name, qty: i.quantity, modifiers: i.modifiers.map((m) => m.choice) })),
                    })
                  }
                  onFallbackPrint={() => setTimeout(() => window.print(), 100)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand px-3 py-3 text-sm font-semibold text-brand"
                />
                <button onClick={() => setKotItems(null)} className="rounded-xl border border-border px-4 py-3 text-sm font-medium text-muted">
                  {t("Done")}
                </button>
              </div>
            </div>
          </div>
          <div id="kot-print" className="hidden-on-screen">
            <p className="kot-title">KITCHEN ORDER — #{order.orderNumber}</p>
            <p className="kot-sub">{order.tableName} · {new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</p>
            <hr />
            {kotItems.map((item, i) => (
              <div key={i}>
                <p className="kot-item">{item.quantity} × {item.name}</p>
                {item.modifiers.length > 0 && <p className="kot-modifier">{item.modifiers.map((m) => `— ${m.choice}`).join(", ")}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {showBillPrint && (
        <BillPrintView shopName={shopName} shopGstin={shopGstin} order={order} items={activeItems} onClose={() => setShowBillPrint(false)} t={t} />
      )}
      {showSettle && (
        <SettleModal
          orderId={order.id}
          total={order.total}
          reservationTokenAmount={order.reservationTokenAmount}
          onClose={() => setShowSettle(false)}
          onDone={(paid) => {
            showToast(t("{table} settled — {amount}", { table: order.tableName, amount: formatMoney(paid) }));
            leaveToTables();
          }}
          onShowBill={() => setShowBillPrint(true)}
          hidden={showBillPrint}
          t={t}
        />
      )}
      {showCancel && (
        <CancelModal
          orderId={order.id}
          onClose={() => setShowCancel(false)}
          onDone={() => {
            showToast(t("Order cancelled"), "info");
            leaveToTables();
          }}
          t={t}
        />
      )}
      {showMerge && (
        <MergeModal currentOrderId={order.id} otherTables={otherTables} onClose={() => setShowMerge(false)} onDone={() => router.refresh()} t={t} />
      )}

      <style jsx global>{`
        .hidden-on-screen {
          display: none;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          #kot-print {
            display: block !important;
            font-family: monospace;
            width: 72mm;
          }
          .kot-title {
            font-weight: bold;
            font-size: 14px;
            text-align: center;
          }
          .kot-sub {
            font-size: 10px;
            text-align: center;
          }
          .kot-item {
            font-size: 13px;
            margin: 4px 0;
          }
          .kot-modifier {
            font-size: 11px;
            margin: 0 0 4px 14px;
            font-style: italic;
          }
        }
      `}</style>
      {pickingProduct && (
        <QuantityPickerModal
          product={pickingProduct}
          onConfirm={(qty, selectedModifiers) => {
            addItem(pickingProduct, qty, selectedModifiers);
            setPickingProduct(null);
          }}
          onClose={() => setPickingProduct(null)}
          t={t}
        />
      )}
    </div>
  );
}

function OrderPanel({
  items,
  order,
  isReadOnly,
  syncing,
  liveTotal,
  onQuantity,
  onRemove,
  onServed,
  t,
}: {
  items: Item[];
  order: Order;
  isReadOnly: boolean;
  syncing: boolean;
  liveTotal: number;
  onQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  onServed: (itemId: string) => void;
  t: Translator;
}) {
  const active = items.filter((i) => i.status !== "cancelled");
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-border px-4 py-6 text-center">
        <UtensilsCrossed size={20} className="text-muted" />
        <p className="text-sm text-muted">{t("Tap a dish to add it to this order.")}</p>
      </div>
    );
  }
  const tax = order.cgstAmount + order.sgstAmount + order.igstAmount;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-border">
        {items.map((item) => {
          const cancelled = item.status === "cancelled";
          const pending = item.id.startsWith("tmp-");
          const editable = !isReadOnly && !pending && item.status !== "served" && !cancelled;
          return (
            <li key={item.id} className={`flex items-center gap-2 py-2 ${cancelled ? "opacity-50" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium text-foreground ${cancelled ? "line-through" : ""}`}>{item.productName}</p>
                {item.selectedModifiers.length > 0 && (
                  <p className="truncate text-xs text-muted">{item.selectedModifiers.map((m) => `${m.choice}${m.price > 0 ? ` +${menuPrice(m.price)}` : ""}`).join(", ")}</p>
                )}
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-muted">{menuPrice(item.unitPrice)}</span>
                  {cancelled ? (
                    <span className="font-medium text-danger">{t("Cancelled")}</span>
                  ) : item.status === "ready" ? (
                    <span className="flex items-center gap-0.5 rounded-full bg-brand-soft px-1.5 font-medium text-brand-text"><Bell size={9} /> {t("Ready")}</span>
                  ) : item.status === "served" ? (
                    <span className="flex items-center gap-0.5 text-muted"><Check size={10} /> {t("Served")}</span>
                  ) : !item.kotPrinted && !isReadOnly ? (
                    <span className="rounded-full bg-warning-soft px-1.5 font-medium text-warning">{t("Not sent")}</span>
                  ) : null}
                </div>
              </div>
              {editable ? (
                <div className="flex shrink-0 items-center rounded-lg border border-border">
                  <button onClick={() => onQuantity(item.id, item.quantity - 1)} aria-label={t("Fewer")} className="flex h-8 w-8 items-center justify-center text-foreground">
                    <Minus size={14} />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold text-foreground">{item.quantity}</span>
                  <button onClick={() => onQuantity(item.id, item.quantity + 1)} aria-label={t("More")} className="flex h-8 w-8 items-center justify-center text-foreground">
                    <Plus size={14} />
                  </button>
                </div>
              ) : (
                <span className="shrink-0 text-sm text-muted">× {item.quantity}</span>
              )}
              <span className="w-16 shrink-0 text-right text-sm font-semibold text-foreground">{menuPrice(item.unitPrice * item.quantity)}</span>
              {!isReadOnly && item.status === "ready" && (
                <button onClick={() => onServed(item.id)} className="shrink-0 rounded-lg border border-brand bg-brand-soft px-2 py-1 text-xs font-medium text-brand-text">
                  {t("Served")}
                </button>
              )}
              {editable && (
                <button onClick={() => onRemove(item.id)} aria-label={t("Remove {name}", { name: item.productName })} className="-mr-1 shrink-0 rounded-md p-1 text-muted hover:text-danger">
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {active.length > 0 && (
        <div className="flex flex-col gap-0.5 rounded-xl bg-brand-soft px-3.5 py-2.5">
          {order.discountAmount > 0 && (
            <div className="flex justify-between text-xs text-brand-text/80">
              <span>{t("order.discount")}</span>
              <span>− {formatMoney(order.discountAmount)}</span>
            </div>
          )}
          {tax > 0 && (
            <div className="flex justify-between text-xs text-brand-text/80">
              <span>GST</span>
              <span>{formatMoney(tax)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-brand-text">{t("order.total")}</span>
            <span className="flex items-center gap-1.5 font-bold text-brand-text">
              {syncing && <Loader2 size={13} className="animate-spin" />}
              {formatMoney(liveTotal)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderFooterLinks({ onCancel, t }: { onCancel: () => void; t: Translator }) {
  return (
    <button onClick={onCancel} className="self-center py-1 text-xs font-medium text-danger">
      {t("Cancel this order")}
    </button>
  );
}

function QuantityPickerModal({
  product,
  onConfirm,
  onClose,
  t,
}: {
  product: Product;
  onConfirm: (quantity: number, selectedModifiers: { group: string; choice: string; price: number }[]) => void;
  onClose: () => void;
  t: Translator;
}) {
  const [quantity, setQuantity] = useState(1);
  const quickPicks = [1, 2, 3, 4, 5, 6];
  const [groups, setGroups] = useState<OptionGroup[] | null>(null);
  // groupId -> selected choiceId(s)
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let cancelled = false;
    listProductOptionsAction(product.id).then((g) => {
      if (cancelled) return;
      setGroups(g);
      // Pre-select each group's default choice (if any) so a required
      // group isn't left empty by default.
      const initial: Record<string, string[]> = {};
      for (const group of g) {
        const def = group.choices.find((c) => c.isDefault);
        if (def) initial[group.id] = [def.id];
      }
      setSelected(initial);
    });
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  function toggleChoice(group: OptionGroup, choiceId: string) {
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      if (group.isMultiSelect) {
        const next = current.includes(choiceId) ? current.filter((id) => id !== choiceId) : [...current, choiceId];
        return { ...prev, [group.id]: next };
      }
      return { ...prev, [group.id]: [choiceId] };
    });
  }

  const modifierExtra = (groups ?? []).reduce((sum, g) => {
    const chosenIds = selected[g.id] ?? [];
    const groupSum = g.choices.filter((c) => chosenIds.includes(c.id)).reduce((s, c) => s + c.extraPrice, 0);
    return sum + groupSum;
  }, 0);

  const missingRequired = (groups ?? []).some((g) => g.isRequired && (selected[g.id] ?? []).length === 0);
  const unitPrice = product.price + modifierExtra;

  function handleConfirm() {
    const chosen: { group: string; choice: string; price: number }[] = [];
    for (const g of groups ?? []) {
      const ids = selected[g.id] ?? [];
      for (const c of g.choices.filter((c) => ids.includes(c.id))) {
        chosen.push({ group: g.name, choice: c.name, price: c.extraPrice });
      }
    }
    onConfirm(quantity, chosen);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-surface p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-foreground">{product.name}</p>
        <p className="text-xs text-muted">{t("{price} each", { price: menuPrice(product.price) })}</p>

        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-xl font-bold text-foreground"
          >
            −
          </button>
          <span className="w-12 text-center text-3xl font-bold text-foreground">{quantity}</span>
          <button
            onClick={() => setQuantity((q) => q + 1)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-xl font-bold text-foreground"
          >
            +
          </button>
        </div>

        <div className="mt-4 flex justify-center gap-1.5">
          {quickPicks.map((n) => (
            <button
              key={n}
              onClick={() => setQuantity(n)}
              className={`h-9 w-9 rounded-full border text-sm font-semibold ${
                quantity === n ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        {groups && groups.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
            {groups.map((g) => (
              <div key={g.id}>
                <p className="text-xs font-semibold text-foreground">
                  {g.name} {g.isRequired && <span className="text-danger">*</span>}
                  {g.isMultiSelect && <span className="ml-1 text-[10px] font-normal text-muted">{t("(choose any)")}</span>}
                </p>
                <div className="mt-1.5 flex flex-col gap-1">
                  {g.choices.map((c) => {
                    const isChecked = (selected[g.id] ?? []).includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleChoice(g, c.id)}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                          isChecked ? "border-brand bg-brand-soft text-brand-text" : "border-border text-foreground"
                        }`}
                      >
                        <span>{c.name}</span>
                        <span className="text-xs text-muted">{c.extraPrice > 0 ? `+${menuPrice(c.extraPrice)}` : t("Included")}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-center text-sm text-muted">{t("order.total")}: {formatMoney(unitPrice * quantity)}</p>

        <div className="mt-4 flex gap-2">
          <button onClick={handleConfirm} disabled={missingRequired} className="btn-primary flex-1 text-center disabled:opacity-60">
            {t("Add {n} to order", { n: quantity })}
          </button>
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

type Translator = (key: string, vars?: Record<string, string | number>) => string;

function BillPrintView({
  shopName,
  shopGstin,
  order,
  items,
  onClose,
  t,
}: {
  shopName: string;
  shopGstin: string | null;
  order: Order;
  items: Item[];
  onClose: () => void;
  t: Translator;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [upiLink, setUpiLink] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState(0);
  const [customerPhone, setCustomerPhone] = useState("");
  const [paperWidth, setPaperWidth] = useState<32 | 48>(32);
  const [showWhatsAppShare, setShowWhatsAppShare] = useState(false);

  useEffect(() => {
    getOrderUpiQrAction(order.id).then((result) => {
      if (result.qrDataUrl) setQrDataUrl(result.qrDataUrl);
      if (result.upiLink) setUpiLink(result.upiLink);
      if (result.creditAmount) setCreditAmount(result.creditAmount);
    });
  }, [order.id]);

  async function buildReceiptBytes() {
    // Genuinely the shop's own saved formatting preferences for this
    // paper width — same source of truth the main bill print page
    // uses, so a restaurant-printed bill looks consistent with every
    // other bill this shop prints.
    const settings = await getThermalPrintSettingsAction();
    const format =
      paperWidth === 32
        ? { shopNameBold: settings.t58ShopNameBold, shopNameItalic: settings.t58ShopNameItalic, shopNameSize: settings.t58ShopNameSize, shopNameAlign: settings.t58ShopNameAlign, itemsBold: settings.t58ItemsBold, totalBold: settings.t58TotalBold, totalItalic: settings.t58TotalItalic, totalSize: settings.t58TotalSize, totalAlign: settings.t58TotalAlign }
        : { shopNameBold: settings.t80ShopNameBold, shopNameItalic: settings.t80ShopNameItalic, shopNameSize: settings.t80ShopNameSize, shopNameAlign: settings.t80ShopNameAlign, itemsBold: settings.t80ItemsBold, totalBold: settings.t80TotalBold, totalItalic: settings.t80TotalItalic, totalSize: settings.t80TotalSize, totalAlign: settings.t80TotalAlign };

    const receipt: ReceiptData = {
      shopName,
      gstin: shopGstin,
      invoiceNumber: `${order.orderNumber} · ${order.tableName}`,
      dateText: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }),
      items: items.map((i) => ({
        name: i.selectedModifiers.length > 0 ? `${i.productName} (${i.selectedModifiers.map((m) => m.choice).join(", ")})` : i.productName,
        qty: i.quantity,
        price: i.unitPrice,
        lineTotal: i.unitPrice * i.quantity,
      })),
      subtotal: order.subtotal,
      discount: order.discountAmount,
      taxTotal: order.cgstAmount + order.sgstAmount + order.igstAmount,
      total: order.total,
    };
    return buildReceiptEscPos(receipt, paperWidth, format);
  }

  function shareOnWhatsApp() {
    if (customerPhone.length !== 10) return;
    const lines = [
      `*${shopName}*`,
      `Order ${order.orderNumber} (${order.tableName})`,
      "",
      "```",
      ...items.map((i) => `${i.productName} x${i.quantity}...${formatMoney(i.unitPrice * i.quantity)}`),
      "```",
      `*Total: ${formatMoney(order.total)}*`,
      "",
      "_Thank you, visit again!_",
    ];
    window.open(buildWhatsAppLink(customerPhone, lines.join("\n")), "_blank");
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50" onClick={onClose}>
      <div className="no-print flex flex-col gap-2 bg-surface p-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="mr-auto flex gap-1">
            {([32, 48] as const).map((w) => (
              <button
                key={w}
                onClick={() => setPaperWidth(w)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${paperWidth === w ? "bg-brand text-white" : "border border-border text-muted"}`}
              >
                {w === 32 ? "58mm" : "80mm"}
              </button>
            ))}
          </div>
          <BluetoothPrintButton
            getBytes={buildReceiptBytes}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-brand px-3 py-1.5 text-xs font-medium text-brand"
          />
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
            {t("order.close")}
          </button>
        </div>
        <button onClick={() => setShowWhatsAppShare((v) => !v)} className="self-start text-xs font-medium text-brand">
          {showWhatsAppShare ? t("Hide WhatsApp share") : t("Also send this bill on WhatsApp")}
        </button>
        {showWhatsAppShare && (
          <div className="flex gap-1.5">
            <input
              type="tel"
              inputMode="numeric"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder={t("Customer's 10-digit number")}
              maxLength={10}
              className="flex-1 rounded-lg border border-border px-2.5 py-1.5 text-xs outline-none focus:border-brand"
            />
            <button
              type="button"
              disabled={customerPhone.length !== 10}
              onClick={shareOnWhatsApp}
              className="shrink-0 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              {t("Send")}
            </button>
          </div>
        )}
      </div>
      <div id="bill-print" className="animate-print-slip mx-auto w-full max-w-sm overflow-y-auto bg-white p-6 text-black" onClick={(e) => e.stopPropagation()}>
        <p className="text-center text-lg font-bold">{shopName}</p>
        {shopGstin && <p className="text-center text-xs">GSTIN: {shopGstin}</p>}
        <p className="text-center text-xs">Invoice #{order.orderNumber} · {order.tableName}</p>
        <p className="text-center text-xs">{new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</p>
        <hr className="my-2 border-dashed" />
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1">{t("order.item")}</th>
              <th className="py-1 text-right">{t("order.qty")}</th>
              <th className="py-1 text-right">{t("order.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="py-0.5">
                  {item.productName}
                  {item.selectedModifiers.length > 0 && (
                    <div className="text-[10px] text-gray-600">
                      {item.selectedModifiers.map((m) => m.choice).join(", ")}
                    </div>
                  )}
                </td>
                <td className="py-0.5 text-right">{item.quantity}</td>
                <td className="py-0.5 text-right">{formatMoney(item.unitPrice * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className="my-2 border-dashed" />
        <div className="flex justify-between text-xs"><span>{t("order.subtotal")}</span><span>{formatMoney(order.subtotal)}</span></div>
        {order.discountAmount > 0 && <div className="flex justify-between text-xs"><span>{t("order.discount")}</span><span>− {formatMoney(order.discountAmount)}</span></div>}
        <div className="flex justify-between text-xs"><span>{t("Taxable value")}</span><span>{formatMoney(order.taxableAmount)}</span></div>
        {order.cgstAmount > 0 && <div className="flex justify-between text-xs"><span>CGST</span><span>{formatMoney(order.cgstAmount)}</span></div>}
        {order.sgstAmount > 0 && <div className="flex justify-between text-xs"><span>SGST</span><span>{formatMoney(order.sgstAmount)}</span></div>}
        {order.igstAmount > 0 && <div className="flex justify-between text-xs"><span>IGST</span><span>{formatMoney(order.igstAmount)}</span></div>}
        {order.roundOffAmount !== 0 && (
          <div className="flex justify-between text-xs">
            <span>{t("Round off")}</span>
            <span>{order.roundOffAmount > 0 ? "+ " : "− "}{formatMoney(Math.abs(order.roundOffAmount))}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-black pt-1 text-sm font-bold"><span>{t("order.total")}</span><span>{formatMoney(order.total)}</span></div>
        {qrDataUrl && creditAmount > 0 && upiLink && (
          <div className="no-print mt-3 flex flex-col gap-1.5 border-t border-dashed border-gray-400 pt-3">
            <p className="text-xs font-semibold text-gray-700">{t("Or send the payment link on WhatsApp")}</p>
            <div className="flex gap-1.5">
              <input
                type="tel"
                inputMode="numeric"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder={t("Customer's 10-digit number")}
                maxLength={10}
                className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs outline-none"
              />
              <button
                type="button"
                disabled={customerPhone.length !== 10}
                onClick={() => {
                  const message = `Please pay ${formatMoney(creditAmount)} for Order ${order.orderNumber} at ${shopName}:\n${upiLink}`;
                  window.open(`https://wa.me/91${customerPhone}?text=${encodeURIComponent(message)}`, "_blank");
                }}
                className="shrink-0 rounded bg-[#25D366] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                {t("Send")}
              </button>
            </div>
          </div>
        )}
        {qrDataUrl && creditAmount > 0 && (
          <div className="mt-3 flex flex-col items-center gap-1 border-t border-dashed border-gray-400 pt-3">
            <p className="text-xs font-semibold text-gray-700">{t("Scan to pay {amount}", { amount: formatMoney(creditAmount) })}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- static data URL */}
            <img src={qrDataUrl} alt="UPI payment QR code" className="h-32 w-32" />
          </div>
        )}
        <p className="mt-3 text-center text-[10px]">{t("order.thankYou")}</p>
      </div>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #bill-print, #bill-print * {
            visibility: visible;
          }
          #bill-print {
            position: fixed;
            top: 0;
            left: 0;
          }
        }
      `}</style>
    </div>
  );
}

function SettleModal({
  orderId,
  total,
  reservationTokenAmount,
  onClose,
  onDone,
  onShowBill,
  hidden,
  t,
}: {
  orderId: string;
  total: number;
  reservationTokenAmount: number;
  onClose: () => void;
  onDone: (paidAmount: number) => void;
  onShowBill: () => void;
  hidden?: boolean;
  t: Translator;
}) {
  const [discountValue, setDiscountValue] = useState(0);
  const [step, setStep] = useState<"review" | "payment">("review");
  const router = useRouter();
  const [splitCount, setSplitCount] = useState(1);
  const netTotal = Math.max(0, Math.round(total - discountValue));
  const stillDue = Math.max(0, netTotal - reservationTokenAmount);
  const [payments, setPayments] = useState<SettlePayment[]>([{ method: "cash", amount: stillDue }]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const perPerson = splitCount > 1 ? Math.round((stillDue / splitCount) * 100) / 100 : null;

  const paidTotal = payments.reduce((s, p) => s + (p.amount || 0), 0);

  function addPaymentRow() {
    setPayments((prev) => [...prev, { method: "cash", amount: 0 }]);
  }
  function updatePayment(i: number, patch: Partial<SettlePayment>) {
    setPayments((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function removePaymentRow(i: number) {
    setPayments((prev) => prev.filter((_, idx) => idx !== i));
  }

  function confirm() {
    startTransition(async () => {
      const result = await settleOrderAction(orderId, payments, "flat", discountValue);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone(paidTotal + reservationTokenAmount);
    });
  }

  if (hidden) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-surface p-5 sm:rounded-2xl">
        {step === "review" ? (
          <>
            <p className="text-sm font-semibold text-foreground">{t("order.settleBill")}</p>
            <p className="mt-0.5 text-xs text-muted">{t("Check the bill and add a discount if needed — the customer should see the final amount before paying.")}</p>

            <div className="mt-3 rounded-lg border border-border px-3.5 py-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted">{t("Bill amount")}</span>
                <span className={discountValue > 0 ? "text-muted line-through" : "font-semibold text-foreground"}>{formatMoney(total)}</span>
              </div>
              {discountValue > 0 && (
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-muted">{t("After discount")}</span>
                  <span className="font-semibold text-brand-text">{formatMoney(netTotal)}</span>
                </div>
              )}
            </div>

            <label className="mt-3 flex flex-col gap-1 text-xs text-muted">
              {t("order.discountOptional")}
              <input
                type="number"
                min={0}
                value={discountValue || ""}
                onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  startTransition(async () => {
                    const result = await applyOrderDiscountAction(orderId, "flat", discountValue);
                    if (result.error) {
                      setError(result.error);
                      return;
                    }
                    router.refresh();
                    setPayments([{ method: "cash", amount: stillDue }]);
                    if (discountValue > 0) {
                      onShowBill();
                    }
                    setStep("payment");
                  });
                }}
                disabled={isPending}
                className="btn-primary flex-1 text-center disabled:opacity-60"
              >
                {isPending ? t("products.saving") : discountValue > 0 ? t("Show updated bill →") : t("Take payment →")}
              </button>
              <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
                {t("common.cancel")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button onClick={() => setStep("review")} className="text-muted">
                <ArrowLeft size={16} />
              </button>
              <p className="text-sm font-semibold text-foreground">{t("Collect payment")}</p>
            </div>
            {discountValue > 0 && (
              <div className="mt-2 rounded-lg bg-brand-soft px-3.5 py-2.5 text-xs text-brand-text">
                {t("Final bill after {discount} discount:", { discount: formatMoney(discountValue) })} <span className="font-semibold">{formatMoney(netTotal)}</span>
              </div>
            )}
        <label className="mt-1 flex flex-col gap-1 text-xs text-muted">
          {t("order.splitAmong")}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSplitCount((n) => Math.max(1, n - 1))} className="h-8 w-8 rounded-full border border-border text-sm">−</button>
            <span className="w-8 text-center text-sm font-medium text-foreground">{splitCount}</span>
            <button type="button" onClick={() => setSplitCount((n) => n + 1)} className="h-8 w-8 rounded-full border border-brand bg-brand-soft text-sm text-brand-text">+</button>
            <span className="text-xs text-muted">{splitCount === 1 ? t("order.person") : t("order.people")}</span>
          </div>
        </label>
        {perPerson !== null && (
          <div className="rounded-lg bg-brand-soft px-3.5 py-2.5 text-sm">
            <span className="text-brand-text">{t("order.eachPersonPays")} </span>
            <span className="font-semibold text-brand-text">{formatMoney(perPerson)}</span>
          </div>
        )}

        <p className="mt-3 text-xs font-medium text-muted">{t("order.paymentSplit")}</p>
        <div className="flex flex-col gap-2">
          {payments.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={p.method}
                onChange={(e) => updatePayment(i, { method: e.target.value as SettlePayment["method"] })}
                aria-label={t("Paid via")}
                className="rounded-lg border border-border px-2 py-2 text-xs outline-none focus:border-brand"
              >
                {(["cash", "card", "upi", "online", "other"] as const).map((m) => (
                  <option key={m} value={m}>{t(paymentMethodLabel(m))}</option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                value={p.amount || ""}
                onChange={(e) => updatePayment(i, { amount: Number(e.target.value) || 0 })}
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
              />
              {payments.length > 1 && (
                <button onClick={() => removePaymentRow(i)} className="text-xs text-danger"><X size={13} /></button>
              )}
            </div>
          ))}
          <button onClick={addPaymentRow} className="self-start text-xs text-brand">{t("order.splitPayment")}</button>
        </div>

        {reservationTokenAmount > 0 && (
          <div className="mt-3 flex justify-between text-sm">
            <span className="flex items-center gap-1 text-muted"><Ticket size={12} /> {t("Reservation token already paid")}</span>
            <span className="font-semibold text-brand">− {formatMoney(reservationTokenAmount)}</span>
          </div>
        )}
        <div className="mt-3 flex justify-between text-sm">
          <span className="text-muted">{t("order.billTotal")}</span>
          <span className="font-semibold text-foreground">{formatMoney(netTotal)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">{t("order.collectingNow")}</span>
          <span className={`font-semibold ${paidTotal + reservationTokenAmount < total ? "text-credit" : "text-brand"}`}>{formatMoney(paidTotal)}</span>
        </div>
        {paidTotal + reservationTokenAmount < total && (
          <p className="text-xs text-credit">{formatMoney(total - paidTotal - reservationTokenAmount)} {t("order.willGoOnCredit")}</p>
        )}

        {error && <p className="mt-2 text-xs text-danger">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button onClick={confirm} disabled={isPending} className="btn-primary flex-1 text-center disabled:opacity-60">
            {isPending ? t("order.settling") : t("order.confirmSettlement")}
          </button>
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
            {t("common.cancel")}
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}

function CancelModal({
  orderId,
  onClose,
  onDone,
  t,
}: {
  orderId: string;
  onClose: () => void;
  onDone: () => void;
  t: Translator;
}) {
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await cancelOrderAction(orderId, pin, reason);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-xs rounded-2xl bg-surface p-5">
        <p className="text-sm font-semibold text-danger">{t("order.cancelOrderQuestion")}</p>
        <p className="mt-1 text-xs text-muted">{t("order.needsManagerPin")}</p>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder={t("order.managerPinPlaceholder")}
          className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-danger"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("order.reasonPlaceholder")}
          className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-danger"
        />
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={confirm} disabled={isPending || !pin} className="flex-1 rounded-lg border border-danger px-4 py-2 text-sm font-medium text-danger disabled:opacity-60">
            {isPending ? t("order.cancelling") : t("order.confirmCancel")}
          </button>
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
            {t("order.back")}
          </button>
        </div>
      </div>
    </div>
  );
}

function MergeModal({
  currentOrderId,
  otherTables,
  onClose,
  onDone,
  t,
}: {
  currentOrderId: string;
  otherTables: { orderId: string; tableName: string }[];
  onClose: () => void;
  onDone: () => void;
  t: Translator;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function merge(secondaryOrderId: string) {
    startTransition(async () => {
      const result = await mergeTableAction(currentOrderId, secondaryOrderId);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-xs rounded-2xl bg-surface p-5">
        <p className="text-sm font-semibold text-foreground">{t("order.mergeQuestion")}</p>
        <p className="mt-1 text-xs text-muted">{t("order.mergeExplain")}</p>
        <ul className="mt-3 flex flex-col gap-1.5">
          {otherTables.map((t) => (
            <li key={t.orderId}>
              <button
                onClick={() => merge(t.orderId)}
                disabled={isPending}
                className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm text-foreground disabled:opacity-60"
              >
                {t.tableName}
              </button>
            </li>
          ))}
        </ul>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <button onClick={onClose} className="mt-4 w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

function OrderTimeline({ order, t }: { order: Order; t: Translator }) {
  const steps: { label: string; time: string | null }[] = [
    { label: t("Ordered"), time: order.createdAt },
    { label: t("Ready"), time: order.firstReadyAt },
    { label: t("Served"), time: order.servedAt },
    { label: t("common.paid"), time: order.settledAt },
  ];
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <div className="no-print flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-surface px-3 py-2 text-xs">
      {steps.map((s, i) => (
        <div key={s.label} className="flex shrink-0 items-center gap-1">
          {i > 0 && <span className="mx-1 h-px w-3 bg-border" />}
          <span className={s.time ? "font-medium text-foreground" : "text-muted"}>{s.label}</span>
          {s.time && <span className="text-muted">{fmt(s.time)}</span>}
        </div>
      ))}
    </div>
  );
}
