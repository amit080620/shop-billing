"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addOrderItemAction,
  removeOrderItemAction,
  getNewKotItemsAction,
  settleOrderAction,
  cancelOrderAction,
  setOrderTypeAction,
  setWaiterAction,
  markItemServedAction,
  type SettlePayment,
} from "@/lib/actions/restaurant";
import { formatMoney } from "@/lib/format";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

type Product = { id: string; name: string; price: number; category: string };
type Item = { id: string; productName: string; quantity: number; unitPrice: number; lineTotal: number; status: "pending" | "ready" | "served" };
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
};

export function OrderClient({
  shopName,
  lang,
  order,
  items: initialItems,
  products,
}: {
  shopName: string;
  lang: Lang;
  order: Order;
  items: Item[];
  products: Product[];
}) {
  const { t } = useTranslation(lang);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kotItems, setKotItems] = useState<{ name: string; quantity: number }[] | null>(null);
  const [showBillPrint, setShowBillPrint] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [waiterName, setWaiterName] = useState(order.waiterName ?? "");

  function addItem(p: Product) {
    startTransition(async () => {
      const result = await addOrderItemAction(order.id, p.id, 1);
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
                  onClick={() => addItem(p)}
                  className="flex flex-col items-start gap-0.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-left"
                >
                  <span className="truncate text-sm font-medium text-foreground">{p.name}</span>
                  <span className="text-xs text-muted">{formatMoney(p.price)}</span>
                </button>
              ))}
            </div>
          ) : (
            <SearchableSelect
              items={products}
              getKey={(p) => p.id}
              getLabel={(p) => p.name}
              getSubLabel={(p) => formatMoney(p.price)}
              onSelect={addItem}
              placeholder={t("order.searchMenu")}
            />
          )}
        </section>
      )}

      <section className="no-print flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">{t("order.orderLabel")}</p>
        {initialItems.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3.5 py-6 text-center text-sm text-muted">
            {t("order.noItemsYet")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {initialItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm text-foreground">{item.productName} × {item.quantity}</span>
                  {item.status === "ready" && (
                    <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-dark">🔔 Ready</span>
                  )}
                  {item.status === "served" && (
                    <span className="ml-2 rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-muted">✓ Served</span>
                  )}
                </div>
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

      {error && <p className="no-print text-sm text-danger">{error}</p>}

      {!isReadOnly && initialItems.length > 0 && (
        <div className="no-print fixed inset-x-0 bottom-16 flex gap-2 border-t border-border bg-surface p-3">
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
          onClose={() => setShowSettle(false)}
          onDone={() => router.push("/restaurant")}
          t={t}
        />
      )}
      {showCancel && (
        <CancelModal orderId={order.id} onClose={() => setShowCancel(false)} onDone={() => router.push("/restaurant")} t={t} />
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
  onClose,
  onDone,
  t,
}: {
  orderId: string;
  total: number;
  onClose: () => void;
  onDone: () => void;
  t: Translator;
}) {
  const [discountValue, setDiscountValue] = useState(0);
  const [splitCount, setSplitCount] = useState(1);
  const [payments, setPayments] = useState<SettlePayment[]>([{ method: "cash", amount: total }]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const netTotal = Math.max(0, total - discountValue);
  const perPerson = splitCount > 1 ? Math.round((netTotal / splitCount) * 100) / 100 : null;

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
          Split equally among (optional — just a calculator, doesn&apos;t change how you record payment)
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSplitCount((n) => Math.max(1, n - 1))} className="h-8 w-8 rounded-full border border-border text-sm">−</button>
            <span className="w-8 text-center text-sm font-medium text-foreground">{splitCount}</span>
            <button type="button" onClick={() => setSplitCount((n) => n + 1)} className="h-8 w-8 rounded-full border border-brand bg-brand-soft text-sm text-brand-dark">+</button>
            <span className="text-xs text-muted">{splitCount === 1 ? "person" : "people"}</span>
          </div>
        </label>
        {perPerson !== null && (
          <div className="rounded-lg bg-brand-soft px-3.5 py-2.5 text-sm">
            <span className="text-brand-dark">Each person pays </span>
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

        <div className="mt-3 flex justify-between text-sm">
          <span className="text-muted">{t("order.billTotal")}</span>
          <span className="font-semibold text-foreground">{formatMoney(total)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">{t("order.collectingNow")}</span>
          <span className={`font-semibold ${paidTotal < total ? "text-credit" : "text-brand"}`}>{formatMoney(paidTotal)}</span>
        </div>
        {paidTotal < total && <p className="text-xs text-credit">{formatMoney(total - paidTotal)} {t("order.willGoOnCredit")}</p>}

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
