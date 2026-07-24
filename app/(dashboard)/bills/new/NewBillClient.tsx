"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createBillAction } from "@/lib/actions/bills";
import { quickCreateCustomerAction } from "@/lib/actions/customers";
import { quickCreateProductAction } from "@/lib/actions/products";
import { calculateTransactionTotals } from "@/lib/validation/schemas";
import { determineSupplyType, round2 } from "@/lib/gst";
import { UNITS } from "@/lib/constants/states";
import { formatMoney } from "@/lib/format";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { InlineQuickAdd } from "@/app/components/InlineQuickAdd";
import { BarcodeScanInput } from "@/app/components/BarcodeScanInput";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

type Product = { id: string; name: string; price: number; gstPercent: number; hsnCode: string | null; barcode: string | null; unit: string };
type Customer = { id: string; name: string; phone: string; gstin: string | null; state_code: string | null };
type CartLine = {
  productId: string;
  name: string;
  price: number;
  gstPercent: number;
  hsnCode: string | null;
  unit: string;
  quantity: number;
};

function SubmitButton({ blocked, generatingLabel, submitLabel }: { blocked: boolean; generatingLabel: string; submitLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || blocked}
      className="btn-primary w-full text-center"
    >
      {pending ? generatingLabel : submitLabel}
    </button>
  );
}

export function NewBillClient({
  shopStateCode,
  products,
  customers,
  lang,
}: {
  shopStateCode: string;
  products: Product[];
  customers: Customer[];
  lang: Lang;
}) {
  const { t } = useTranslation(lang);
  const [step, setStep] = useState<"cart" | "ticket">("cart");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const cartEndRef = useRef<HTMLDivElement>(null);

  // Scroll the newest cart item into view whenever something is added —
  // on mobile the keyboard often covers half the screen while searching,
  // so without this the item you just added isn't visible until you
  // manually scroll or dismiss the keyboard.
  useEffect(() => {
    if (cart.length > 0) {
      cartEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [cart.length]);
  const [customerMode, setCustomerMode] = useState<"walkin" | "existing">("walkin");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [discountType, setDiscountType] = useState<"percent" | "flat">("flat");
  const [discountValue, setDiscountValue] = useState(0);
  const [paidAmount, setPaidAmount] = useState<number | "">("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi" | "online" | "other">("cash");

  const supplyType = useMemo(
    () =>
      determineSupplyType(
        shopStateCode,
        customerMode === "existing" ? selectedCustomer?.state_code ?? null : null,
      ),
    [shopStateCode, customerMode, selectedCustomer],
  );

  const totals = useMemo(
    () =>
      calculateTransactionTotals({
        items: cart.map((c) => ({
          quantity: c.quantity,
          unitPrice: c.price,
          gstPercent: c.gstPercent,
        })),
        discountType,
        discountValue,
        paidAmount: typeof paidAmount === "number" ? paidAmount : 0,
        supplyType,
      }),
    [cart, discountType, discountValue, paidAmount, supplyType],
  );

  const [state, formAction] = useActionState(createBillAction, null);

  function addProduct(p: Product) {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === p.id);
      if (existing) {
        return prev.map((c) =>
          c.productId === p.id ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          price: p.price,
          gstPercent: p.gstPercent,
          hsnCode: p.hsnCode,
          unit: p.unit,
          quantity: 1,
        },
      ];
    });
  }

  function updateQuantity(productId: string, quantity: number) {
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((c) => c.productId !== productId)
        : prev.map((c) => (c.productId === productId ? { ...c, quantity } : c)),
    );
  }

  if (step === "cart") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold text-foreground">{t("bill.title")}</h1>

        <section className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">{t("bill.customer")}</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setCustomerMode("walkin");
                setSelectedCustomer(null);
              }}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                customerMode === "walkin"
                  ? "border-brand bg-brand-soft text-brand-dark"
                  : "border-border text-muted"
              }`}
            >
              {t("bill.walkin")}
            </button>
            <button
              onClick={() => setCustomerMode("existing")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                customerMode === "existing"
                  ? "border-brand bg-brand-soft text-brand-dark"
                  : "border-border text-muted"
              }`}
            >
              {t("bill.existingCustomer")}
            </button>
          </div>

          {customerMode === "existing" &&
            (selectedCustomer ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {selectedCustomer.name}
                  </p>
                  <p className="text-xs text-muted">{selectedCustomer.phone}</p>
                </div>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="shrink-0 text-xs font-medium text-brand"
                >
                  {t("bill.change")}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <SearchableSelect
                  items={customers}
                  getKey={(c) => c.id}
                  getLabel={(c) => c.name}
                  getSubLabel={(c) => c.phone}
                  onSelect={setSelectedCustomer}
                  placeholder={t("bill.searchCustomer")}
                />
                <InlineQuickAdd<{ id: string; name: string; phone: string; gstin: string | null; state_code: string | null }>
                  triggerLabel={t("bill.addNewCustomer")}
                  fields={[
                    { name: "name", label: t("bill.name"), required: true },
                    { name: "phone", label: t("bill.phone"), type: "tel", required: true },
                  ]}
                  onSubmit={async (v) => {
                    const r = await quickCreateCustomerAction(v.name, v.phone);
                    return { data: r.customer, error: r.error };
                  }}
                  onCreated={setSelectedCustomer}
                  contactFields={{ name: "name", phone: "phone" }}
                />
              </div>
            ))}
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">{t("bill.addProducts")}</p>
          <BarcodeScanInput
            placeholder={t("bill.scanPlaceholder")}
            onScan={(code) => {
              const match = products.find((p) => p.barcode === code);
              if (match) {
                addProduct(match);
                setScanError(null);
              } else {
                setScanError(`${t("bill.noProductFound")}: "${code}"`);
              }
            }}
          />
          {scanError && <p className="text-xs text-credit">{scanError}</p>}
          <SearchableSelect
            items={products}
            getKey={(p) => p.id}
            getLabel={(p) => p.name}
            getSubLabel={(p) => formatMoney(p.price)}
            onSelect={addProduct}
            placeholder={t("bill.searchProducts")}
          />
          <InlineQuickAdd<{ id: string; name: string; price: number; gstPercent: number; hsnCode: string | null; barcode: string | null; unit: string }>
            triggerLabel={t("bill.addNewProduct")}
            fields={[
              { name: "name", label: t("bill.addNewProduct").replace("+ ", ""), required: true },
              { name: "price", label: "Price (₹)", type: "number", required: true },
              { name: "unit", label: "Unit", options: [...UNITS], defaultValue: "NOS" },
              { name: "gstPercent", label: "GST %", type: "number" },
            ]}
            onSubmit={async (v) => {
              const r = await quickCreateProductAction(
                v.name,
                Number(v.price) || 0,
                Number(v.gstPercent) || 0,
                v.unit || "NOS",
              );
              return { data: r.product, error: r.error };
            }}
            onCreated={addProduct}
          />
        </section>

        {cart.length > 0 && (
          <section className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">{t("bill.cart")}</p>
            <ul className="flex flex-col gap-2">
              {cart.map((line) => (
                <li
                  key={line.productId}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {line.name}
                      </p>
                      <p className="text-xs text-muted">
                        {formatMoney(line.price)}/{line.unit} · GST {line.gstPercent}%
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() =>
                          updateQuantity(line.productId, round2(line.quantity - quantityStep(line.unit)))
                        }
                        className="h-7 w-7 shrink-0 rounded-full border border-border text-sm font-medium text-foreground"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={line.quantity}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") return;
                          const num = Number(v);
                          if (!Number.isNaN(num)) updateQuantity(line.productId, num);
                        }}
                        className="w-14 rounded-lg border border-border px-1 py-1 text-center text-sm font-medium text-foreground outline-none focus:border-brand"
                      />
                      <button
                        onClick={() =>
                          updateQuantity(line.productId, round2(line.quantity + quantityStep(line.unit)))
                        }
                        className="h-7 w-7 shrink-0 rounded-full border border-border text-sm font-medium text-foreground"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {quantityPresets(line.unit).length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {quantityPresets(line.unit).map((preset) => (
                        <button
                          key={preset}
                          onClick={() => updateQuantity(line.productId, preset)}
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                            line.quantity === preset
                              ? "border-brand bg-brand-soft text-brand-dark"
                              : "border-border text-muted"
                          }`}
                        >
                          {presetLabel(preset, line.unit)}
                        </button>
                      ))}
                      {(line.unit === "KG" || line.unit === "LTR") && (
                        <div className="flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-1">
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder={line.unit === "KG" ? "e.g. 1" : "e.g. 5"}
                            className="w-12 bg-transparent text-xs outline-none"
                            onKeyDown={(e) => {
                              if (e.key !== "Enter") return;
                              e.preventDefault();
                              const target = e.target as HTMLInputElement;
                              const small = Number(target.value);
                              if (!Number.isNaN(small) && small > 0) {
                                // 3-decimal precision — needed for things like
                                // 1 gram of saffron (0.001kg), which the usual
                                // 2dp rounding would otherwise zero out.
                                const qty = Math.round((small / 1000) * 1000) / 1000;
                                updateQuantity(line.productId, qty);
                                target.value = "";
                              }
                            }}
                          />
                          <span className="text-xs text-muted">
                            {line.unit === "KG" ? "g" : "ml"}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between rounded-lg bg-brand-soft px-3.5 py-2.5 text-sm">
              <span className="text-brand-dark">{t("bill.subtotal")}</span>
              <span className="font-semibold text-brand-dark">
                {formatMoney(totals.subtotal)}
              </span>
            </div>
            <div ref={cartEndRef} />
          </section>
        )}

        <button
          disabled={cart.length === 0 || (customerMode === "existing" && !selectedCustomer)}
          onClick={() => {
            setPaidAmount(totals.total);
            setStep("ticket");
          }}
          className="btn-primary text-center disabled:opacity-40"
        >
          {t("bill.completeTicket")} →
        </button>
      </div>
    );
  }

  // --- Complete Ticket screen: GST + discount entered here, before the invoice is generated ---
  const payload = JSON.stringify({
    customerId: customerMode === "existing" ? selectedCustomer?.id ?? null : null,
    items: cart.map((c) => ({
      productId: c.productId,
      description: c.name,
      hsnCode: c.hsnCode,
      quantity: c.quantity,
      unitPrice: c.price,
      gstPercent: c.gstPercent,
    })),
    discountType,
    discountValue,
    paidAmount: typeof paidAmount === "number" ? paidAmount : 0,
    paymentMethod,
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="payload" value={payload} />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setStep("cart")}
          className="text-sm text-muted"
        >
          {t("bill.backToCart")}
        </button>
      </div>
      <h1 className="text-lg font-semibold text-foreground">{t("bill.completeTicket")}</h1>

      <section className="rounded-xl border border-border bg-surface shadow-sm p-4">
        <p className="text-sm font-medium text-foreground">
          {customerMode === "existing" ? selectedCustomer?.name : t("common.walkinCustomer")}
        </p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {cart.map((line) => (
            <li key={line.productId} className="flex justify-between text-sm">
              <span className="min-w-0 flex-1 truncate text-muted">
                {line.name} × {line.quantity}
              </span>
              <span className="shrink-0 text-foreground">
                {formatMoney(line.price * line.quantity)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface shadow-sm p-4">
        <p className="text-sm font-medium text-foreground">{t("bill.discount")}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDiscountType("flat")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
              discountType === "flat"
                ? "border-brand bg-brand-soft text-brand-dark"
                : "border-border text-muted"
            }`}
          >
            {t("bill.flatAmount")}
          </button>
          <button
            type="button"
            onClick={() => setDiscountType("percent")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
              discountType === "percent"
                ? "border-brand bg-brand-soft text-brand-dark"
                : "border-border text-muted"
            }`}
          >
            {t("bill.percentage")}
          </button>
        </div>
        <input
          type="number"
          min="0"
          step="0.01"
          value={discountValue || ""}
          onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
          placeholder={discountType === "flat" ? "e.g. 20" : "e.g. 10"}
          className="rounded-lg border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand"
        />
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface shadow-sm p-4 text-sm">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            {supplyType === "intra" ? t("bill.localSale") : t("bill.interStateSale")}
          </span>
        </div>
        <Row label={t("bill.subtotal")} value={formatMoney(totals.subtotal)} />
        <Row label={t("bill.discount")} value={`− ${formatMoney(totals.discountAmount)}`} />
        <Row label={t("bill.taxableValue")} value={formatMoney(totals.taxableAmount)} />
        {supplyType === "intra" ? (
          <>
            <Row label="CGST" value={`+ ${formatMoney(totals.cgstAmount)}`} />
            <Row label="SGST" value={`+ ${formatMoney(totals.sgstAmount)}`} />
          </>
        ) : (
          <Row label="IGST" value={`+ ${formatMoney(totals.igstAmount)}`} />
        )}
        <div className="my-1 h-px bg-border" />
        <Row label={t("bill.total")} value={formatMoney(totals.total)} bold />
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface shadow-sm p-4">
        <p className="text-sm font-medium text-foreground">{t("bill.howMuchPaid")}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPaidAmount(totals.total)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
              paidAmount === totals.total
                ? "border-brand bg-brand-soft text-brand-dark"
                : "border-border text-muted"
            }`}
          >
            {t("bill.fullyPaid")}
          </button>
          <button
            type="button"
            onClick={() => setPaidAmount(0)}
            disabled={customerMode === "walkin"}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
              paidAmount === 0
                ? "border-credit bg-credit-soft text-credit"
                : "border-border text-muted"
            }`}
          >
            {t("bill.fullUdhaar")}
          </button>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{t("bill.orPartPayment")}</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={paidAmount}
            onChange={(e) =>
              setPaidAmount(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="rounded-lg border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand"
          />
        </label>

        {typeof paidAmount === "number" && paidAmount > 0 && (
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-sm font-medium text-foreground">
              {t("bill.howWasPaid", { amount: formatMoney(paidAmount) })}
            </p>
            <div className="flex flex-wrap gap-2">
              {(["cash", "card", "upi", "online", "other"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium ${
                    paymentMethod === m
                      ? "border-brand bg-brand-soft text-brand-dark"
                      : "border-border text-muted"
                  }`}
                >
                  {t(`bill.${m}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        {totals.balanceAmount > 0 && (
          <p className="text-sm text-credit">
            {t("bill.willAddCredit", { amount: formatMoney(totals.balanceAmount) })}
          </p>
        )}
        {totals.balanceAmount > 0 && customerMode === "walkin" && (
          <p className="text-sm text-credit">
            {t("bill.walkinNoCredit")}
          </p>
        )}
      </section>

      {state?.error && (
        <p className="rounded-lg bg-credit-soft px-3 py-2 text-sm text-credit">
          {state.error}
        </p>
      )}

      <SubmitButton blocked={customerMode === "walkin" && totals.balanceAmount > 0} generatingLabel={t("bill.generating")} submitLabel={t("bill.generateInvoice")} />
    </form>
  );
}

/** How much +/- should move by for a given unit — whole items step by 1,
 * kg/litre step by half, gram/ml step by 50 (since those are already the
 * "small" unit, half a gram isn't a realistic increment). */
function quantityStep(unit: string): number {
  if (unit === "KG" || unit === "LTR") return 0.5;
  if (unit === "GM" || unit === "ML") return 50;
  return 1;
}

/** Quick-tap presets for common partial amounts — e.g. a customer asking
 * for "500 grams" or "half a litre" shouldn't require typing decimals. */
function quantityPresets(unit: string): number[] {
  if (unit === "KG" || unit === "LTR") return [0.25, 0.5, 1, 2, 5];
  if (unit === "GM" || unit === "ML") return [100, 250, 500, 1000];
  return [];
}

function presetLabel(value: number, unit: string): string {
  if ((unit === "KG" || unit === "LTR") && value < 1) {
    return `${value * 1000}${unit === "KG" ? "g" : "ml"}`;
  }
  return `${value}${unit === "KG" ? "kg" : unit === "LTR" ? "L" : unit.toLowerCase()}`;
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={bold ? "font-semibold text-foreground" : "text-muted"}>{label}</span>
      <span className={bold ? "font-semibold text-foreground" : "text-foreground"}>
        {value}
      </span>
    </div>
  );
}
