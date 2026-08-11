"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addOrderItemAction,
  removeOrderItemAction,
  updateOrderItemQuantityAction,
  getNewKotItemsAction,
  settleOrderAction,
  cancelOrderAction,
  setOrderTypeAction,
  setWaiterAction,
  markItemServedAction,
  mergeTableAction,
  type SettlePayment,
} from "@/lib/actions/restaurant";
import { addComboToOrderAction } from "@/lib/actions/combos";
import { formatMoney } from "@/lib/format";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

type Product = { id: string; name: string; price: number; category: string };
type Combo = { id: string; name: string; price: number };
type Item = { id: string; productName: string; quantity: number; unitPrice: number; lineTotal: number; status: "pending" | "ready" | "served" | "cancelled" };
type Order = {
  id: string;
  orderNumber: string;
  status: "open" | "settled" | "cancelled";
  orderType: "dine_in" | "takeaway" | "delivery";
  waiterName: string | null;
  subtotal: number;
  discountAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  total: number;
  tableName: string;
  reservationTokenAmount: number;
};

export function OrderClient({
  shopName,
  lang,
  order,
  items: initialItems,
  products,
  combos,
  otherTables,
}: {
  shopName: string;
  lang: Lang;
  order: Order;
  items: Item[];
  products: Product[];
  combos: Combo[];
  otherTables: { orderId: string; tableName: string }[];
}) {
  const { t } = useTranslation(lang);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kotItems, setKotItems] = useState<{ name: string; quantity: number }[] | null>(null);
  const [showBillPrint, setShowBillPrint] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [waiterName, setWaiterName] = useState(order.waiterName ?? "");

  const [pickingProduct, setPickingProduct] = useState<Product | null>(null);

  function addItem(p: Product, quantity: number) {
    startTransition(async () => {
      const result = await addOrderItemAction(order.id, p.id, quantity);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  function addCombo(comboId: string) {
    startTransition(async () => {
      const result = await addComboToOrderAction(order.id, comboId);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  function removeItem(itemId: string) {
    startTransition(async () => {
      const result = await removeOrderItemAction(itemId, order.id);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  function changeQuantity(itemId: string, newQuantity: number) {
    if (newQuantity <= 0) {
      removeItem(itemId);
      return;
    }
    startTransition(async () => {
      const result = await updateOrderItemQuantityAction(itemId, order.id, newQuantity);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  function printKot() {
    startTransition(async () => {
      const result = await getNewKotItemsAction(order.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (!result.items || result.items.length === 0) {
        setError(t("order.nothingNewKitchen"));
        return;
      }
      setKotItems(result.items);
      setTimeout(() => window.print(), 100);
    });
  }

  const isReadOnly = order.status !== "open";
  const categories = [...new Set(products.map((p) => p.category))].sort();

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="no-print flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{order.tableName}</h1>
          <p className="text-xs text-muted">#{order.orderNumber} · {order.status}</p>
        </div>
        <Link href="/restaurant" className="text-sm text-brand">
          {t("order.backToTables")}
        </Link>
      </div>

      {!isReadOnly && (
        <div className="no-print flex gap-2">
          {(["dine_in", "takeaway", "delivery"] as const).map((type) => (
            <button
              key={type}
              onClick={() =>
                startTransition(async () => {
                  await setOrderTypeAction(order.id, type);
                  router.refresh();
                })
              }
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                order.orderType === type ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"
              }`}
            >
              {type === "dine_in" ? t("order.dineIn") : type === "takeaway" ? t("order.takeaway") : t("order.delivery")}
            </button>
          ))}
        </div>
      )}

      {!isReadOnly && (
        <input
          value={waiterName}
          onChange={(e) => setWaiterName(e.target.value)}
          onBlur={() => {
            if (waiterName !== (order.waiterName ?? "")) {
              startTransition(async () => {
                await setWaiterAction(order.id, waiterName);
                router.refresh();
              });
            }
          }}
          placeholder={`${t("order.waiter")}: ${t("order.waiterPlaceholder")}`}
          className="no-print rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      )}
      {isReadOnly && order.waiterName && (
        <p className="no-print text-xs text-muted">{t("order.waiter")}: {order.waiterName}</p>
      )}

      {!isReadOnly && otherTables.length > 0 && (
        <button onClick={() => setShowMerge(true)} className="no-print self-start text-xs text-brand">
          {t("order.mergeTable")}
        </button>
      )}

      {!isReadOnly && combos.length > 0 && (
        <section className="no-print flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">{t("order.combos")}</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {combos.map((c) => (
              <button
                key={c.id}
                onClick={() => addCombo(c.id)}
                disabled={isPending}
                className="shrink-0 rounded-lg border border-brand bg-brand-soft px-3 py-2 text-left disabled:opacity-60"
              >
                <p className="text-xs font-medium text-brand-dark">{c.name}</p>
                <p className="text-[11px] text-brand-dark/70">{formatMoney(c.price)}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {!isReadOnly && (
        <section className="no-print flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">{t("order.addItems")}</p>

          {categories.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  activeCategory === null ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
                    activeCategory === cat ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {activeCategory ? (
            <div className="grid grid-cols-2 gap-2">
              {products.filter((p) => p.category === activeCategory).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPickingProduct(p)}
                  className="flex flex-col items-start gap-0.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-left"
                >
                  <span className="truncate text-sm font-medium text-foreground">{p.name}</span>
                  <span className="text-xs text-muted">{formatMoney(p.price)}</span>
                </button>
              ))}
            </div>
          ) : (
            <SearchableSelect
            lang={lang}
              items={products}
              getKey={(p) => p.id}
              getLabel={(p) => p.name}
              getSubLabel={(p) => formatMoney(p.price)}
              onSelect={(p) => setPickingProduct(p)}
              placeholder={t("order.searchMenu")}
            />
          )}
        </section>
      )}

      {(cartOpen || initialItems.length === 0) && (
        <div
          className={
            initialItems.length === 0
              ? "no-print flex flex-col gap-2"
              : "no-print fixed inset-0 z-40 flex items-end justify-center bg-black/50"
          }
          onClick={() => initialItems.length > 0 && setCartOpen(false)}
        >
          <section
            className={initialItems.length === 0 ? "flex flex-col gap-2" : "flex max-h-[80vh] w-full max-w-md flex-col gap-2 overflow-y-auto rounded-t-2xl bg-background p-4"}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{t("order.orderLabel")}</p>
              {initialItems.length > 0 && (
                <button onClick={() => setCartOpen(false)} className="text-xs text-muted">
                  ✕ Close
                </button>
              )}
            </div>
            {initialItems.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3.5 py-6 text-center text-sm text-muted">
                {t("order.noItemsYet")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {initialItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <span className="truncate text-sm text-foreground">{item.productName}</span>
                      {item.status === "ready" && (
                        <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-dark">🔔 Ready</span>
                      )}
                      {item.status === "served" && (
                        <span className="ml-2 rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-muted">✓ Served</span>
                      )}
                    </div>
                    {!isReadOnly && item.status !== "served" && item.status !== "cancelled" ? (
                      <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border">
                        <button onClick={() => changeQuantity(item.id, item.quantity - 1)} className="px-2 py-1 text-sm font-bold text-foreground">
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-semibold text-foreground">{item.quantity}</span>
                        <button onClick={() => changeQuantity(item.id, item.quantity + 1)} className="px-2 py-1 text-sm font-bold text-foreground">
                          +
                        </button>
                      </div>
                    ) : (
                      <span className="shrink-0 text-sm text-muted">× {item.quantity}</span>
                    )}
                    <span className="shrink-0 text-sm font-medium text-foreground">{formatMoney(item.lineTotal)}</span>
                    {!isReadOnly && item.status === "ready" && (
                      <button
                        onClick={() =>
                          startTransition(async () => {
                            await markItemServedAction(item.id, order.id);
                            router.refresh();
                          })
                        }
                        className="shrink-0 rounded-lg border border-brand bg-brand-soft px-2 py-1 text-xs font-medium text-brand-dark"
                      >
                        Served
                      </button>
                    )}
                    {!isReadOnly && item.status !== "served" && (
                      <button onClick={() => removeItem(item.id)} className="shrink-0 text-xs text-danger">
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {initialItems.length > 0 && (
              <div className="flex justify-between rounded-lg bg-brand-soft px-3.5 py-2.5 text-sm">
                <span className="text-brand-dark">{t("order.total")}</span>
                <span className="font-semibold text-brand-dark">{formatMoney(order.total)}</span>
              </div>
            )}
          </section>
        </div>
      )}

      {error && <p className="no-print text-sm text-danger">{error}</p>}

      {initialItems.length > 0 && (
        <div className="no-print fixed inset-x-0 bottom-16 z-30 flex flex-col border-t border-border bg-surface shadow-lg">
          <button
            onClick={() => setCartOpen(true)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))" }}
          >
            <span>
              🛒 {initialItems.reduce((s, i) => s + i.quantity, 0)} item{initialItems.reduce((s, i) => s + i.quantity, 0) === 1 ? "" : "s"}
            </span>
            <span>{formatMoney(order.total)} · ▲ View order</span>
          </button>
          {!isReadOnly && (
            <div className="flex gap-2 p-3">
              <button onClick={printKot} disabled={isPending} className="flex-1 rounded-lg border border-border px-2 py-2.5 text-xs font-medium text-foreground disabled:opacity-60">
                {t("order.printKot")}
              </button>
              <button onClick={() => setShowBillPrint(true)} className="flex-1 rounded-lg border border-border px-2 py-2.5 text-xs font-medium text-foreground">
                {t("order.printBill")}
              </button>
              <button onClick={() => setShowSettle(true)} className="flex-1 rounded-lg bg-brand px-2 py-2.5 text-xs font-medium text-white">
                {t("order.settle")}
              </button>
              <button onClick={() => setShowCancel(true)} className="rounded-lg border border-danger px-2 py-2.5 text-xs font-medium text-danger">
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {kotItems && (
        <div id="kot-print" className="hidden-on-screen">
          <p className="kot-title">KITCHEN ORDER — #{order.orderNumber}</p>
          <p className="kot-sub">{order.tableName} · {new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
          <hr />
          {kotItems.map((item, i) => (
            <p key={i} className="kot-item">{item.quantity} × {item.name}</p>
          ))}
        </div>
      )}

      {showBillPrint && (
        <BillPrintView shopName={shopName} order={order} items={initialItems} onClose={() => setShowBillPrint(false)} t={t} />
      )}
      {showSettle && (
        <SettleModal
          orderId={order.id}
          total={order.total}
          reservationTokenAmount={order.reservationTokenAmount}
          onClose={() => setShowSettle(false)}
          onDone={() => router.push("/restaurant")}
          t={t}
        />
      )}
      {showCancel && (
        <CancelModal orderId={order.id} onClose={() => setShowCancel(false)} onDone={() => router.push("/restaurant")} t={t} />
      )}
      {showMerge && (
        <MergeModal
          currentOrderId={order.id}
          otherTables={otherTables}
          onClose={() => setShowMerge(false)}
          onDone={() => router.refresh()}
          t={t}
        />
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
        }
      `}</style>
      {pickingProduct && (
        <QuantityPickerModal
          product={pickingProduct}
          onConfirm={(qty) => {
            addItem(pickingProduct, qty);
            setPickingProduct(null);
          }}
          onClose={() => setPickingProduct(null)}
        />
      )}
    </div>
  );
}

function QuantityPickerModal({
  product,
  onConfirm,
  onClose,
}: {
  product: Product;
  onConfirm: (quantity: number) => void;
  onClose: () => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const quickPicks = [1, 2, 3, 4, 5, 6];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl bg-surface p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-foreground">{product.name}</p>
        <p className="text-xs text-muted">{formatMoney(product.price)} each</p>

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
                quantity === n ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <p className="mt-4 text-center text-sm text-muted">Total: {formatMoney(product.price * quantity)}</p>

        <div className="mt-4 flex gap-2">
          <button onClick={() => onConfirm(quantity)} className="btn-primary flex-1 text-center">
            Add {quantity} to order
          </button>
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

type Translator = (key: string, vars?: Record<string, string | number>) => string;

function BillPrintView({
  shopName,
  order,
  items,
  onClose,
  t,
}: {
  shopName: string;
  order: Order;
  items: Item[];
  onClose: () => void;
  t: Translator;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50">
      <div className="no-print flex justify-end gap-2 bg-surface p-3">
        <button onClick={() => window.print()} className="btn-primary-sm">
          {t("order.printBill")}
        </button>
        <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
          {t("order.close")}
        </button>
      </div>
      <div id="bill-print" className="mx-auto w-full max-w-sm overflow-y-auto bg-white p-6 text-black">
        <p className="text-center text-lg font-bold">{shopName}</p>
        <p className="text-center text-xs">Invoice #{order.orderNumber} · {order.tableName}</p>
        <p className="text-center text-xs">{new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
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
                <td className="py-0.5">{item.productName}</td>
                <td className="py-0.5 text-right">{item.quantity}</td>
                <td className="py-0.5 text-right">{formatMoney(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className="my-2 border-dashed" />
        <div className="flex justify-between text-xs"><span>{t("order.subtotal")}</span><span>{formatMoney(order.subtotal)}</span></div>
        {order.discountAmount > 0 && <div className="flex justify-between text-xs"><span>{t("order.discount")}</span><span>− {formatMoney(order.discountAmount)}</span></div>}
        {order.cgstAmount > 0 && <div className="flex justify-between text-xs"><span>CGST</span><span>{formatMoney(order.cgstAmount)}</span></div>}
        {order.sgstAmount > 0 && <div className="flex justify-between text-xs"><span>SGST</span><span>{formatMoney(order.sgstAmount)}</span></div>}
        {order.igstAmount > 0 && <div className="flex justify-between text-xs"><span>IGST</span><span>{formatMoney(order.igstAmount)}</span></div>}
        <div className="mt-1 flex justify-between border-t border-black pt-1 text-sm font-bold"><span>{t("order.total")}</span><span>{formatMoney(order.total)}</span></div>
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
  t,
}: {
  orderId: string;
  total: number;
  reservationTokenAmount: number;
  onClose: () => void;
  onDone: () => void;
  t: Translator;
}) {
  const [discountValue, setDiscountValue] = useState(0);
  const [splitCount, setSplitCount] = useState(1);
  const netTotal = Math.max(0, total - discountValue);
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
      onDone();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-surface p-5 sm:rounded-2xl">
        <p className="text-sm font-semibold text-foreground">{t("order.settleBill")}</p>
        <label className="mt-3 flex flex-col gap-1 text-xs text-muted">
          {t("order.discountOptional")}
          <input
            type="number"
            min={0}
            value={discountValue}
            onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <label className="mt-1 flex flex-col gap-1 text-xs text-muted">
          {t("order.splitAmong")}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSplitCount((n) => Math.max(1, n - 1))} className="h-8 w-8 rounded-full border border-border text-sm">−</button>
            <span className="w-8 text-center text-sm font-medium text-foreground">{splitCount}</span>
            <button type="button" onClick={() => setSplitCount((n) => n + 1)} className="h-8 w-8 rounded-full border border-brand bg-brand-soft text-sm text-brand-dark">+</button>
            <span className="text-xs text-muted">{splitCount === 1 ? t("order.person") : t("order.people")}</span>
          </div>
        </label>
        {perPerson !== null && (
          <div className="rounded-lg bg-brand-soft px-3.5 py-2.5 text-sm">
            <span className="text-brand-dark">{t("order.eachPersonPays")} </span>
            <span className="font-semibold text-brand-dark">{formatMoney(perPerson)}</span>
          </div>
        )}

        <p className="mt-3 text-xs font-medium text-muted">{t("order.paymentSplit")}</p>
        <div className="flex flex-col gap-2">
          {payments.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={p.method}
                onChange={(e) => updatePayment(i, { method: e.target.value as SettlePayment["method"] })}
                className="rounded-lg border border-border px-2 py-2 text-xs outline-none focus:border-brand"
              >
                {(["cash", "card", "upi", "online", "other"] as const).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                value={p.amount}
                onChange={(e) => updatePayment(i, { amount: Number(e.target.value) || 0 })}
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
              />
              {payments.length > 1 && (
                <button onClick={() => removePaymentRow(i)} className="text-xs text-danger">✕</button>
              )}
            </div>
          ))}
          <button onClick={addPaymentRow} className="self-start text-xs text-brand">{t("order.splitPayment")}</button>
        </div>

        {reservationTokenAmount > 0 && (
          <div className="mt-3 flex justify-between text-sm">
            <span className="text-muted">🎫 Reservation token already paid</span>
            <span className="font-semibold text-brand">− {formatMoney(reservationTokenAmount)}</span>
          </div>
        )}
        <div className="mt-3 flex justify-between text-sm">
          <span className="text-muted">{t("order.billTotal")}</span>
          <span className="font-semibold text-foreground">{formatMoney(total)}</span>
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
