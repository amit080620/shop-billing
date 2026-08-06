"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
import { CameraBarcodeScanner } from "@/app/components/CameraBarcodeScanner";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import type { Lang } from "@/lib/i18n/dictionary";

type Product = {
  id: string;
  name: string;
  price: number;
  gstPercent: number;
  hsnCode: string | null;
  barcode: string | null;
  unit: string;
  trackInventory: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
  requiresPrescription: boolean;
  unitsPerPack: number | null;
  looseUnitName: string | null;
};
type Customer = { id: string; name: string; phone: string; gstin: string | null; state_code: string | null };
type CartLine = {
  productId: string;
  name: string;
  price: number;
  packPrice: number;
  gstPercent: number;
  hsnCode: string | null;
  unit: string;
  quantity: number;
  trackInventory: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
  requiresPrescription: boolean;
  unitsPerPack: number | null;
  looseUnitName: string | null;
  saleMode: "pack" | "loose";
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
  frequentProductIds,
  shopContext,
  vehicles,
}: {
  shopStateCode: string;
  products: Product[];
  customers: Customer[];
  lang: Lang;
  frequentProductIds: string[];
  vehicles: { id: string; name: string; ratePerKm: number }[];
  shopContext: {
    shopId: string;
    shopName: string;
    shopStateCode: string;
    staffId: string;
    staffName: string;
    invoicePrefix: string;
  };
}) {
  const { t } = useTranslation(lang);
  const isOnline = useOnlineStatus();
  const [step, setStep] = useState<"cart" | "ticket">("cart");
  const [cart, setCart] = useState<CartLine[]>([]);

  // Refresh the offline cache every time this page loads successfully
  // (i.e. while online) — so if the connection drops mid-day, there's
  // always a reasonably fresh local copy of products/customers to work
  // from in the offline billing flow.
  useEffect(() => {
    import("@/lib/offline-db").then(({ cacheForOffline }) => {
      cacheForOffline(
        { ...shopContext, cachedAt: new Date().toISOString() },
        products.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          gstPercent: p.gstPercent,
          hsnCode: p.hsnCode,
          barcode: p.barcode,
          unit: p.unit,
        })),
        customers.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          gstin: c.gstin,
          stateCode: c.state_code,
        })),
      )
        .then(() => console.log("[offline-db] Cached for offline use:", products.length, "products,", customers.length, "customers"))
        .catch((err) => console.error("[offline-db] Failed to cache for offline use:", err));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [scanError, setScanError] = useState<string | null>(null);
  const frequentProducts = frequentProductIds
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is Product => Boolean(p));
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
  const [doctorName, setDoctorName] = useState("");
  const [patientName, setPatientName] = useState("");
  const [tripInfo, setTripInfo] = useState<{ vehicleId: string; km: number; driverName: string; loadWeight: number | null; loadUnit: string } | null>(null);

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

  function handleBarcodeScan(code: string) {
    const match = products.find((p) => p.barcode === code);
    if (match) {
      addProduct(match);
      setScanError(null);
    } else {
      setScanError(`${t("bill.noProductFound")}: "${code}"`);
    }
  }

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
          packPrice: p.price,
          gstPercent: p.gstPercent,
          hsnCode: p.hsnCode,
          unit: p.unit,
          quantity: 1,
          trackInventory: p.trackInventory,
          stockQuantity: p.stockQuantity,
          lowStockThreshold: p.lowStockThreshold,
          requiresPrescription: p.requiresPrescription,
          unitsPerPack: p.unitsPerPack,
          looseUnitName: p.looseUnitName,
          saleMode: "pack",
        },
      ];
    });
  }

  function addTransportCharge(
    vehicleId: string,
    vehicleName: string,
    km: number,
    ratePerKm: number,
    driverName: string,
    loadWeight: number | null,
    loadUnit: string,
  ) {
    const amount = Math.round(km * ratePerKm * 100) / 100;
    const loadLabel = loadWeight ? ` · ${loadWeight} ${loadUnit}` : "";
    setCart((prev) => [
      ...prev.filter((c) => c.productId !== "__transport_charge__"),
      {
        productId: "__transport_charge__",
        name: `🚚 Transport: ${vehicleName} (${km} km${loadLabel})`,
        price: amount,
        packPrice: amount,
        gstPercent: 0,
        hsnCode: null,
        unit: "trip",
        quantity: 1,
        trackInventory: false,
        stockQuantity: 0,
        lowStockThreshold: 0,
        requiresPrescription: false,
        unitsPerPack: null,
        looseUnitName: null,
        saleMode: "pack",
      },
    ]);
    setTripInfo({ vehicleId, km, driverName, loadWeight, loadUnit });
  }

  function updateQuantity(productId: string, quantity: number) {
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((c) => c.productId !== productId)
        : prev.map((c) => (c.productId === productId ? { ...c, quantity } : c)),
    );
  }

  function toggleSaleMode(productId: string, mode: "pack" | "loose") {
    setCart((prev) =>
      prev.map((c) => {
        if (c.productId !== productId || c.saleMode === mode) return c;
        if (mode === "loose" && c.unitsPerPack) {
          return { ...c, saleMode: "loose", quantity: 1, price: round2(c.packPrice / c.unitsPerPack) };
        }
        return { ...c, saleMode: "pack", quantity: 1, price: c.packPrice };
      }),
    );
  }

  if (step === "cart") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold text-foreground">{t("bill.title")}</h1>

        {!isOnline && (
          <Link
            href="/offline-bill"
            className="rounded-lg border border-credit bg-credit-soft px-3.5 py-3 text-sm text-credit"
          >
            You&apos;re offline — this screen needs a connection. Tap here for offline billing
            instead (bills sync automatically once you&apos;re back online). →
          </Link>
        )}

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
            lang={lang}
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
          {frequentProducts.length > 0 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {frequentProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className="shrink-0 rounded-full border border-brand bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand-dark"
                >
                  ⚡ {p.name}
                </button>
              ))}
            </div>
          )}
          <BarcodeScanInput
            placeholder={t("bill.scanPlaceholder")}
            onScan={handleBarcodeScan}
          />
          <CameraBarcodeScanner onScan={handleBarcodeScan} />
          {scanError && <p className="text-xs text-credit">{scanError}</p>}
          <SearchableSelect
            lang={lang}
            items={products}
            getKey={(p) => p.id}
            getLabel={(p) => p.name}
            getSubLabel={(p) =>
              p.trackInventory ? `${formatMoney(p.price)} · ${p.stockQuantity} ${p.unit} left` : formatMoney(p.price)
            }
            onSelect={addProduct}
            placeholder={t("bill.searchProducts")}
          />
          <InlineQuickAdd<Product>
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
              return {
                data: r.product
                  ? { ...r.product, packPrice: r.product.price, trackInventory: false, stockQuantity: 0, lowStockThreshold: 0, requiresPrescription: false, unitsPerPack: null, looseUnitName: null }
                  : undefined,
                error: r.error,
              };
            }}
            onCreated={addProduct}
          />
        </section>

        {vehicles.length > 0 && <TransportChargePicker vehicles={vehicles} onAdd={addTransportCharge} />}

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
                        {formatMoney(line.price)}/{line.saleMode === "loose" ? line.looseUnitName : line.unit} · GST {line.gstPercent}%
                      </p>
                      {line.unitsPerPack && line.looseUnitName && (
                        <div className="mt-1 flex gap-1.5">
                          <button
                            onClick={() => toggleSaleMode(line.productId, "pack")}
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                              line.saleMode === "pack" ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"
                            }`}
                          >
                            Full {line.unit}
                          </button>
                          <button
                            onClick={() => toggleSaleMode(line.productId, "loose")}
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${
                              line.saleMode === "loose" ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"
                            }`}
                          >
                            Loose {line.looseUnitName}
                          </button>
                        </div>
                      )}
                      {line.trackInventory && (
                        <StockIndicator
                          remaining={round2(
                            line.stockQuantity -
                              (line.saleMode === "loose" && line.unitsPerPack ? line.quantity / line.unitsPerPack : line.quantity),
                          )}
                          threshold={line.lowStockThreshold}
                          unit={line.unit}
                        />
                      )}
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
                      <QuantityInput
                        value={line.quantity}
                        onCommit={(num) => updateQuantity(line.productId, num)}
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
                        <SmallUnitInput
                          unit={line.unit}
                          onCommit={(qty) => updateQuantity(line.productId, qty)}
                        />
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
      productId: c.productId === "__transport_charge__" ? null : c.productId,
      description: c.name,
      hsnCode: c.hsnCode,
      quantity: c.quantity,
      unitPrice: c.price,
      gstPercent: c.gstPercent,
      stockQuantity: c.saleMode === "loose" && c.unitsPerPack ? round2(c.quantity / c.unitsPerPack) : c.quantity,
    })),
    discountType,
    discountValue,
    paidAmount: typeof paidAmount === "number" ? paidAmount : 0,
    paymentMethod,
    doctorName,
    patientName,
    tripVehicleId: tripInfo?.vehicleId ?? null,
    tripKm: tripInfo?.km ?? null,
    tripDriverName: tripInfo?.driverName ?? "",
    tripLoadWeight: tripInfo?.loadWeight ?? null,
    tripLoadUnit: tripInfo?.loadUnit ?? "",
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
          max={discountType === "percent" ? 100 : undefined}
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

        {tripInfo && totals.total > 50000 && (
          <p className="rounded-lg border border-dashed border-credit bg-credit-soft px-3.5 py-2.5 text-xs text-credit">
            ⚠️ This delivery is over ₹50,000 — an E-way Bill is legally required for goods
            movement above this value. Generate one on the GST e-way bill portal before the
            vehicle leaves.
          </p>
        )}

        {cart.some((c) => c.requiresPrescription) && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-brand bg-brand-soft p-3">
            <p className="text-xs font-medium text-brand-dark">
              💊 One or more items need a prescription (Rx) — enter both before generating the invoice.
            </p>
            <input
              value={doctorName}
              onChange={(e) => setDoctorName(e.target.value)}
              placeholder="Doctor's name"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <input
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Patient's name"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
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

/** Shows remaining stock right in the cart, color-coded so a low/about-to-
 * run-out item is obvious without switching to the Products screen:
 * red = at or under the low-stock threshold, orange = within 3 units of it. */
function StockIndicator({
  remaining,
  threshold,
  unit,
}: {
  remaining: number;
  threshold: number;
  unit: string;
}) {
  const isLow = remaining <= threshold;
  const isNearLow = !isLow && remaining <= threshold + 3;

  if (remaining <= 0) {
    return <p className="text-xs font-semibold text-danger">⚠ Out of stock after this sale</p>;
  }
  if (isLow) {
    return (
      <p className="text-xs font-semibold text-danger">
        ● Low stock: {remaining} {unit} left
      </p>
    );
  }
  if (isNearLow) {
    return (
      <p className="text-xs font-medium" style={{ color: "#c2760f" }}>
        ● {remaining} {unit} left — getting low
      </p>
    );
  }
  return (
    <p className="text-xs text-muted">
      {remaining} {unit} in stock
    </p>
  );
}

function presetLabel(value: number, unit: string): string {
  if ((unit === "KG" || unit === "LTR") && value < 1) {
    return `${value * 1000}${unit === "KG" ? "g" : "ml"}`;
  }
  return `${value}${unit === "KG" ? "kg" : unit === "LTR" ? "L" : unit.toLowerCase()}`;
}

/** A plain controlled `<input value={n}>` fights the user the moment they
 * backspace to clear it — React immediately snaps it back to the last
 * number, since "" isn't a valid quantity yet. This keeps its own text
 * buffer so clearing/retyping feels normal, and only commits the parsed
 * number to the cart on blur (or Enter). */
function QuantityInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  function commit() {
    const num = Number(text);
    if (text.trim() !== "" && !Number.isNaN(num) && num > 0) {
      onCommit(round2(num));
    } else {
      setText(String(value)); // invalid/empty — revert rather than silently zeroing the line
    }
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      step="0.01"
      min="0"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="w-14 rounded-lg border border-border px-1 py-1 text-center text-sm font-medium text-foreground outline-none focus:border-brand"
    />
  );
}

/** Free-text grams/ml entry for KG/LTR products — applies on blur (tapping
 * away) as well as Enter, so it doesn't force an extra keypress on mobile. */
function SmallUnitInput({ unit, onCommit }: { unit: "KG" | "LTR"; onCommit: (qty: number) => void }) {
  const [text, setText] = useState("");

  function commit() {
    const small = Number(text);
    if (text.trim() !== "" && !Number.isNaN(small) && small > 0) {
      // 3-decimal precision — needed for things like 1 gram of saffron
      // (0.001kg), which the usual 2dp rounding would otherwise zero out.
      onCommit(Math.round((small / 1000) * 1000) / 1000);
    }
    setText("");
  }

  return (
    <div className="flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-1">
      <input
        type="number"
        inputMode="decimal"
        placeholder={unit === "KG" ? "e.g. 1" : "e.g. 5"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-12 bg-transparent text-xs outline-none"
      />
      <span className="text-xs text-muted">{unit === "KG" ? "g" : "ml"}</span>
    </div>
  );
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

function TransportChargePicker({
  vehicles,
  onAdd,
}: {
  vehicles: { id: string; name: string; ratePerKm: number }[];
  onAdd: (
    vehicleId: string,
    vehicleName: string,
    km: number,
    ratePerKm: number,
    driverName: string,
    loadWeight: number | null,
    loadUnit: string,
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [km, setKm] = useState<number | "">("");
  const [driverName, setDriverName] = useState("");
  const [loadWeight, setLoadWeight] = useState<number | "">("");
  const [loadUnit, setLoadUnit] = useState("TON");

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const charge = vehicle && typeof km === "number" ? Math.round(km * vehicle.ratePerKm * 100) / 100 : null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start text-sm font-medium text-brand">
        🚚 Add transport charge
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-brand bg-brand-soft p-3">
      <select
        value={vehicleId}
        onChange={(e) => setVehicleId(e.target.value)}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      >
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} — {formatMoney(v.ratePerKm)}/km
          </option>
        ))}
      </select>
      <input
        type="number"
        min={0}
        step="0.1"
        value={km}
        onChange={(e) => setKm(e.target.value === "" ? "" : Number(e.target.value))}
        placeholder="Distance covered (km)"
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      />
      <input
        value={driverName}
        onChange={(e) => setDriverName(e.target.value)}
        placeholder="Driver name (optional)"
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          min={0}
          step="0.01"
          value={loadWeight}
          onChange={(e) => setLoadWeight(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder="Load carried (optional)"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <select
          value={loadUnit}
          onChange={(e) => setLoadUnit(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        >
          <option value="TON">Ton</option>
          <option value="QTL">Quintal</option>
          <option value="KG">Kg</option>
          <option value="CFT">Cu. ft</option>
        </select>
      </div>
      {charge !== null && <p className="text-xs text-brand-dark">Transport charge: {formatMoney(charge)}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!vehicle || typeof km !== "number" || km <= 0}
          onClick={() => {
            if (!vehicle || typeof km !== "number") return;
            onAdd(vehicle.id, vehicle.name, km, vehicle.ratePerKm, driverName, typeof loadWeight === "number" ? loadWeight : null, loadUnit);
            setOpen(false);
            setKm("");
            setDriverName("");
            setLoadWeight("");
          }}
          className="btn-primary-sm disabled:opacity-60"
        >
          Add to bill
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}
