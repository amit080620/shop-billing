"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Bell, Check, ShoppingCart, Ticket, ArrowLeft } from "lucide-react";
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
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";
import { BluetoothPrintButton } from "@/app/components/BluetoothPrintButton";
import { buildKotEscPos, buildReceiptEscPos, type ReceiptData } from "@/lib/escpos";
import { getThermalPrintSettingsAction } from "@/lib/actions/settings";
import { buildWhatsAppLink } from "@/lib/whatsapp";

type Product = { id: string; name: string; price: number; category: string };
type Combo = { id: string; name: string; price: number };
type Item = {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  status: "pending" | "ready" | "served" | "cancelled";
  selectedModifiers: { group: string; choice: string; price: number }[];
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

export function OrderClient({
  shopName,
  shopGstin,
  lang,
  order,
  items: initialItems,
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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [kotItems, setKotItems] = useState<{ name: string; quantity: number; modifiers: { group: string; choice: string; price: number }[] }[] | null>(null);
  const [showBillPrint, setShowBillPrint] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [waiterName, setWaiterName] = useState(order.waiterName ?? "");

  const [pickingProduct, setPickingProduct] = useState<Product | null>(null);

  function addItem(p: Product, quantity: number, selectedModifiers: { group: string; choice: string; price: number }[] = []) {
    startTransition(async () => {
      const result = await addOrderItemAction(order.id, p.id, quantity, selectedModifiers);
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
    setDeletingItemId(itemId);
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
    });
  }

  function printKotViaBrowser() {
    setTimeout(() => window.print(), 100);
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

      <OrderTimeline order={order} />

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
                order.orderType === type ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
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
                <p className="text-xs font-medium text-brand-text">{c.name}</p>
                <p className="text-[11px] text-brand-text/70">{formatMoney(c.price)}</p>
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
                  activeCategory === null ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
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
                    activeCategory === cat ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
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
                  className="neu-card flex flex-col items-start gap-0.5 px-3 py-2.5 text-left"
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
                <button onClick={() => setCartOpen(false)} className="flex items-center gap-1 text-xs text-muted">
                  <X size={12} /> Close
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
                  <li
                    key={item.id}
                    className={`neu-card flex items-center justify-between gap-2 px-3.5 py-2.5 ${deletingItemId === item.id ? "animate-delete" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="truncate text-sm text-foreground">{item.productName}</span>
                      {item.selectedModifiers.length > 0 && (
                        <p className="truncate text-xs text-muted">
                          {item.selectedModifiers.map((m) => `└ ${m.choice}${m.price > 0 ? ` (+${formatMoney(m.price)})` : ""}`).join("  ")}
                        </p>
                      )}
                      {item.status === "ready" && (
                        <span className="ml-2 flex w-fit items-center gap-0.5 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-text"><Bell size={9} /> Ready</span>
                      )}
                      {item.status === "served" && (
                        <span className="ml-2 flex w-fit items-center gap-0.5 rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-muted"><Check size={9} /> Served</span>
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
                    <span className="shrink-0 text-sm font-medium text-foreground">{formatMoney(item.unitPrice * item.quantity)}</span>
                    {!isReadOnly && item.status === "ready" && (
                      <button
                        onClick={() =>
                          startTransition(async () => {
                            await markItemServedAction(item.id, order.id);
                            router.refresh();
                          })
                        }
                        className="shrink-0 rounded-lg border border-brand bg-brand-soft px-2 py-1 text-xs font-medium text-brand-text"
                      >
                        Served
                      </button>
                    )}
                    {!isReadOnly && item.status !== "served" && (
                      <button onClick={() => removeItem(item.id)} className="shrink-0 text-xs text-danger">
                        <X size={13} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {initialItems.length > 0 && (
              <div className="flex justify-between rounded-lg bg-brand-soft px-3.5 py-2.5 text-sm">
                <span className="text-brand-text">{t("order.total")}</span>
                <span className="font-semibold text-brand-text">{formatMoney(order.total)}</span>
              </div>
            )}
          </section>
        </div>
      )}

      {error && <p className="no-print text-sm text-danger">{error}</p>}

      {initialItems.length > 0 && !cartOpen && (
        <div className="no-print fixed inset-x-0 bottom-16 z-30 flex flex-col border-t border-border bg-surface shadow-lg">
          <button
            onClick={() => setCartOpen(true)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))" }}
          >
            <span className="flex items-center gap-1">
              <ShoppingCart size={14} /> {initialItems.reduce((s, i) => s + i.quantity, 0)} item{initialItems.reduce((s, i) => s + i.quantity, 0) === 1 ? "" : "s"}
            </span>
            <span>{formatMoney(order.total)} · ▲ View order</span>
          </button>
          <div className="flex gap-2 p-3">
            {!isReadOnly && (
              <button onClick={printKot} disabled={isPending} className="flex-1 rounded-lg border border-border px-2 py-2.5 text-xs font-medium text-foreground disabled:opacity-60">
                {t("order.printKot")}
              </button>
            )}
            <button onClick={() => setShowBillPrint(true)} className="flex-1 rounded-lg border border-border px-2 py-2.5 text-xs font-medium text-foreground">
              {t("order.printBill")}
            </button>
            {!isReadOnly && (
              <>
                <button onClick={() => setShowSettle(true)} className="flex-1 rounded-lg bg-brand px-2 py-2.5 text-xs font-medium text-white">
                  {t("order.settle")}
                </button>
                <button onClick={() => setShowCancel(true)} className="rounded-lg border border-danger px-2 py-2.5 text-xs font-medium text-danger">
                  <X size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {kotItems && (
        <>
          <div className="no-print fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2 border-t border-border bg-surface p-3">
            <p className="text-xs font-medium text-muted">Send &quot;{kotItems.length} new item{kotItems.length === 1 ? "" : "s"}&quot; to the kitchen</p>
            <div className="flex gap-2">
              <BluetoothPrintButton
                getBytes={() =>
                  buildKotEscPos({
                    title: `KITCHEN ORDER — #${order.orderNumber}`,
                    subtitle: `${order.tableName} · ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}`,
                    items: kotItems.map((i) => ({
                      name: i.name,
                      qty: i.quantity,
                      modifiers: i.modifiers.map((m) => m.choice),
                    })),
                  })
                }
                onFallbackPrint={printKotViaBrowser}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-brand px-3 py-2.5 text-xs font-medium text-brand"
              />
              <button onClick={() => setKotItems(null)} className="rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-muted">
                {t("order.close")}
              </button>
            </div>
          </div>
          <div id="kot-print" className="hidden-on-screen">
            <p className="kot-title">KITCHEN ORDER — #{order.orderNumber}</p>
            <p className="kot-sub">{order.tableName} · {new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</p>
            <hr />
            {kotItems.map((item, i) => (
              <div key={i}>
                <p className="kot-item">{item.quantity} × {item.name}</p>
                {item.modifiers.length > 0 && (
                  <p className="kot-modifier">
                    {item.modifiers.map((m) => `— ${m.choice}`).join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {showBillPrint && (
        <BillPrintView shopName={shopName} shopGstin={shopGstin} order={order} items={initialItems} onClose={() => setShowBillPrint(false)} t={t} />
      )}
      {showSettle && (
        <SettleModal
          orderId={order.id}
          total={order.total}
          reservationTokenAmount={order.reservationTokenAmount}
          onClose={() => setShowSettle(false)}
          onDone={() => router.push("/restaurant")}
          onShowBill={() => setShowBillPrint(true)}
          hidden={showBillPrint}
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
  onConfirm: (quantity: number, selectedModifiers: { group: string; choice: string; price: number }[]) => void;
  onClose: () => void;
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
                  {g.isMultiSelect && <span className="ml-1 text-[10px] font-normal text-muted">(choose any)</span>}
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
                        <span className="text-xs text-muted">{c.extraPrice > 0 ? `+${formatMoney(c.extraPrice)}` : "Included"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-center text-sm text-muted">Total: {formatMoney(unitPrice * quantity)}</p>

        <div className="mt-4 flex gap-2">
          <button onClick={handleConfirm} disabled={missingRequired} className="btn-primary flex-1 text-center disabled:opacity-60">
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
          {showWhatsAppShare ? "Hide WhatsApp share" : "Also send this bill on WhatsApp"}
        </button>
        {showWhatsAppShare && (
          <div className="flex gap-1.5">
            <input
              type="tel"
              inputMode="numeric"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="Customer's 10-digit number"
              maxLength={10}
              className="flex-1 rounded-lg border border-border px-2.5 py-1.5 text-xs outline-none focus:border-brand"
            />
            <button
              type="button"
              disabled={customerPhone.length !== 10}
              onClick={shareOnWhatsApp}
              className="shrink-0 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              Send
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
        <div className="flex justify-between text-xs"><span>Taxable value</span><span>{formatMoney(order.taxableAmount)}</span></div>
        {order.cgstAmount > 0 && <div className="flex justify-between text-xs"><span>CGST</span><span>{formatMoney(order.cgstAmount)}</span></div>}
        {order.sgstAmount > 0 && <div className="flex justify-between text-xs"><span>SGST</span><span>{formatMoney(order.sgstAmount)}</span></div>}
        {order.igstAmount > 0 && <div className="flex justify-between text-xs"><span>IGST</span><span>{formatMoney(order.igstAmount)}</span></div>}
        {order.roundOffAmount !== 0 && (
          <div className="flex justify-between text-xs">
            <span>Round off</span>
            <span>{order.roundOffAmount > 0 ? "+ " : "− "}{formatMoney(Math.abs(order.roundOffAmount))}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-black pt-1 text-sm font-bold"><span>{t("order.total")}</span><span>{formatMoney(order.total)}</span></div>
        {qrDataUrl && creditAmount > 0 && upiLink && (
          <div className="no-print mt-3 flex flex-col gap-1.5 border-t border-dashed border-gray-400 pt-3">
            <p className="text-xs font-semibold text-gray-700">Or send the payment link on WhatsApp</p>
            <div className="flex gap-1.5">
              <input
                type="tel"
                inputMode="numeric"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="Customer's 10-digit number"
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
                Send
              </button>
            </div>
          </div>
        )}
        {qrDataUrl && creditAmount > 0 && (
          <div className="mt-3 flex flex-col items-center gap-1 border-t border-dashed border-gray-400 pt-3">
            <p className="text-xs font-semibold text-gray-700">Scan to pay {formatMoney(creditAmount)}</p>
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
  onDone: () => void;
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
      onDone();
    });
  }

  if (hidden) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-surface p-5 sm:rounded-2xl">
        {step === "review" ? (
          <>
            <p className="text-sm font-semibold text-foreground">{t("order.settleBill")}</p>
            <p className="mt-0.5 text-xs text-muted">Review the bill and apply a discount if needed — the customer should see the final amount before paying.</p>

            <div className="mt-3 rounded-lg border border-border px-3.5 py-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Bill amount</span>
                <span className={discountValue > 0 ? "text-muted line-through" : "font-semibold text-foreground"}>{formatMoney(total)}</span>
              </div>
              {discountValue > 0 && (
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-muted">After discount</span>
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
                {isPending ? "Saving…" : discountValue > 0 ? "Show updated bill →" : "Proceed to payment →"}
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
              <p className="text-sm font-semibold text-foreground">Collect payment</p>
            </div>
            {discountValue > 0 && (
              <div className="mt-2 rounded-lg bg-brand-soft px-3.5 py-2.5 text-xs text-brand-text">
                Final bill after {formatMoney(discountValue)} discount: <span className="font-semibold">{formatMoney(netTotal)}</span> — show this to the customer before collecting payment.
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
                className="rounded-lg border border-border px-2 py-2 text-xs outline-none focus:border-brand"
              >
                {(["cash", "card", "upi", "online", "other"] as const).map((m) => (
                  <option key={m} value={m}>{m}</option>
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
            <span className="flex items-center gap-1 text-muted"><Ticket size={12} /> Reservation token already paid</span>
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

function OrderTimeline({ order }: { order: Order }) {
  const steps: { label: string; time: string | null }[] = [
    { label: "Ordered", time: order.createdAt },
    { label: "Ready", time: order.firstReadyAt },
    { label: "Served", time: order.servedAt },
    { label: "Paid", time: order.settledAt },
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
