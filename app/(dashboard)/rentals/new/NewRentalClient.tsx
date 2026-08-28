"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { createRentalAction } from "@/lib/actions/rentals";
import { calculateRentalTotals } from "@/lib/validation/schemas";
import { determineSupplyType } from "@/lib/gst";
import { formatMoney } from "@/lib/format";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { InlineQuickAdd } from "@/app/components/InlineQuickAdd";
import { quickCreateCustomerAction, lookupCustomerByPhoneAction } from "@/lib/actions/customers";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

type Product = {
  id: string;
  name: string;
  unit: string;
  gstPercent: number;
  stockQuantity: number;
  rentalRateHourly: number | null;
  rentalRateDaily: number | null;
  rentalRateWeekly: number | null;
  rentalRateMonthly: number | null;
  securityDeposit: number;
};
type Customer = { id: string; name: string; phone: string; stateCode: string | null };
type RateType = "hourly" | "daily" | "weekly" | "monthly";

type CartLine = {
  productId: string;
  name: string;
  unit: string;
  gstPercent: number;
  rateType: RateType;
  rate: number;
  quantity: number;
  duration: number;
  depositPerUnit: number;
};

type Translator = (key: string, vars?: Record<string, string | number>) => string;

function SubmitButton({ t }: { t: Translator }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full text-center disabled:opacity-60">
      {pending ? t("rental.booking") : t("rental.confirmBooking")}
    </button>
  );
}

export function NewRentalClient({
  shopStateCode,
  lang,
  products,
  customers: initialCustomers,
}: {
  shopStateCode: string;
  lang: Lang;
  products: Product[];
  customers: Customer[];
}) {
  const { t } = useTranslation(lang);
  const [customers, setCustomers] = useState(initialCustomers);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [deliveryRequired, setDeliveryRequired] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCharge, setDeliveryCharge] = useState<number | "">("");
  const [paidAmount, setPaidAmount] = useState<number | "">("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi" | "online" | "other">("cash");
  const [notes, setNotes] = useState("");

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;
  const supplyType = determineSupplyType(shopStateCode, selectedCustomer?.stateCode ?? null);

  const totals = useMemo(
    () =>
      calculateRentalTotals({
        items: cart.map((c) => ({ quantity: c.quantity, rate: c.rate, duration: c.duration, gstPercent: c.gstPercent, depositPerUnit: c.depositPerUnit })),
        deliveryCharge: typeof deliveryCharge === "number" ? deliveryCharge : 0,
        paidAmount: typeof paidAmount === "number" ? paidAmount : 0,
        supplyType,
      }),
    [cart, deliveryCharge, paidAmount, supplyType],
  );

  function addProduct(p: Product) {
    const defaultRateType: RateType = p.rentalRateDaily != null ? "daily" : p.rentalRateHourly != null ? "hourly" : p.rentalRateWeekly != null ? "weekly" : "monthly";
    const defaultRate = { hourly: p.rentalRateHourly, daily: p.rentalRateDaily, weekly: p.rentalRateWeekly, monthly: p.rentalRateMonthly }[defaultRateType] ?? 0;
    setCart((prev) => {
      if (prev.find((c) => c.productId === p.id)) return prev;
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          unit: p.unit,
          gstPercent: p.gstPercent,
          rateType: defaultRateType,
          rate: defaultRate ?? 0,
          quantity: 1,
          duration: 1,
          depositPerUnit: p.securityDeposit,
        },
      ];
    });
  }

  function updateLine(productId: string, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((c) => (c.productId === productId ? { ...c, ...patch } : c)));
  }
  function removeLine(productId: string) {
    setCart((prev) => prev.filter((c) => c.productId !== productId));
  }

  function rateFor(p: Product, type: RateType) {
    return { hourly: p.rentalRateHourly, daily: p.rentalRateDaily, weekly: p.rentalRateWeekly, monthly: p.rentalRateMonthly }[type];
  }

  function durationLabel(rateType: RateType) {
    return rateType === "hourly"
      ? t("rental.durationHrs")
      : rateType === "daily"
        ? t("rental.durationDays")
        : rateType === "weekly"
          ? t("rental.durationWks")
          : t("rental.durationMo");
  }

  const payload = useMemo(
    () =>
      JSON.stringify({
        customerId,
        startDate: startDate ? new Date(startDate).toISOString() : "",
        endDate: endDate ? new Date(endDate).toISOString() : "",
        items: cart.map((c) => ({
          productId: c.productId,
          description: c.name,
          quantity: c.quantity,
          rateType: c.rateType,
          rate: c.rate,
          duration: c.duration,
          gstPercent: c.gstPercent,
          depositPerUnit: c.depositPerUnit,
        })),
        deliveryRequired,
        deliveryAddress: deliveryRequired ? deliveryAddress : "",
        deliveryCharge: typeof deliveryCharge === "number" ? deliveryCharge : 0,
        paidAmount: typeof paidAmount === "number" ? paidAmount : 0,
        paymentMethod,
        notes,
      }),
    [customerId, startDate, endDate, cart, deliveryRequired, deliveryAddress, deliveryCharge, paidAmount, paymentMethod, notes],
  );

  const [state, formAction] = useActionState(createRentalAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="payload" value={payload} />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">{t("rental.title")}</h1>
        <Link href="/rentals" className="text-sm text-brand">
          {t("rental.backToRentals")}
        </Link>
      </div>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">{t("rental.customerRequired")}</p>
        {selectedCustomer ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <span>{selectedCustomer.name} · {selectedCustomer.phone}</span>
            <button type="button" onClick={() => setCustomerId(null)} className="text-xs text-brand">
              {t("rental.change")}
            </button>
          </div>
        ) : (
          <>
            <SearchableSelect
            lang={lang}
              items={customers}
              getKey={(c) => c.id}
              getLabel={(c) => c.name}
              getSubLabel={(c) => c.phone}
              onSelect={(c) => setCustomerId(c.id)}
              placeholder={t("rental.searchCustomer")}
            />
            <InlineQuickAdd<{ id: string; name: string; phone: string; state_code: string | null }>
              triggerLabel={t("rental.addNewCustomer")}
              fields={[
                { name: "name", label: t("rental.name"), required: true },
                { name: "phone", label: t("rental.phone"), type: "tel", required: true },
              ]}
              contactFields={{ name: "name", phone: "phone" }}
              phoneAutofill={async (phone) => (await lookupCustomerByPhoneAction(phone)).name}
              onSubmit={async (v) => {
                const r = await quickCreateCustomerAction(v.name, v.phone);
                return { data: r.customer, error: r.error };
              }}
              onCreated={(c) => {
                setCustomers((prev) => [...prev, { id: c.id, name: c.name, phone: c.phone, stateCode: c.state_code }]);
                setCustomerId(c.id);
              }}
            />
          </>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{t("rental.start")}</span>
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{t("rental.end")}</span>
          <input
            type="datetime-local"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">{t("rental.addItemsToRent")}</p>
        <SearchableSelect
            lang={lang}
          items={products}
          getKey={(p) => p.id}
          getLabel={(p) => p.name}
          getSubLabel={(p) => `${p.stockQuantity} owned`}
          onSelect={addProduct}
          placeholder={t("rental.searchRentable")}
        />
        {products.length === 0 && (
          <p className="text-xs text-muted">{t("rental.noRentableProducts")}</p>
        )}
      </section>

      {cart.length > 0 && (
        <section className="flex flex-col gap-3">
          {cart.map((line) => {
            const product = products.find((p) => p.id === line.productId);
            const availableRateTypes = (["hourly", "daily", "weekly", "monthly"] as RateType[]).filter(
              (rt) => product && rateFor(product, rt) != null,
            );
            return (
              <div key={line.productId} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{line.name}</p>
                  <button type="button" onClick={() => removeLine(line.productId)} className="text-xs text-danger">
                    {t("rental.remove")}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {availableRateTypes.map((rt) => (
                    <button
                      key={rt}
                      type="button"
                      onClick={() => updateLine(line.productId, { rateType: rt, rate: (product && rateFor(product, rt)) ?? 0 })}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${
                        line.rateType === rt ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
                      }`}
                    >
                      {rt} · {formatMoney((product && rateFor(product, rt)) ?? 0)}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    {t("rental.qty")}
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.productId, { quantity: Number(e.target.value) || 0 })}
                      className="rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-brand"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    {durationLabel(line.rateType)}
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={line.duration}
                      onChange={(e) => updateLine(line.productId, { duration: Number(e.target.value) || 0 })}
                      className="rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-brand"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    {t("rental.depositPerUnit")}
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.depositPerUnit}
                      onChange={(e) => updateLine(line.productId, { depositPerUnit: Number(e.target.value) || 0 })}
                      className="rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-brand"
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={deliveryRequired}
            onChange={(e) => setDeliveryRequired(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          {t("rental.willDeliver")}
        </label>
        {deliveryRequired && (
          <div className="flex flex-col gap-2">
            <input
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder={t("rental.deliveryAddress")}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <input
              type="number"
              value={deliveryCharge}
              onChange={(e) => setDeliveryCharge(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder={t("rental.deliveryCharge")}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
        )}
      </section>

      {cart.length > 0 && (
        <section className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-3.5 text-sm">
          <Row label={t("rental.subtotal")} value={formatMoney(totals.subtotal)} />
          <Row label={t("rental.gst")} value={formatMoney(totals.gstAmount)} />
          {deliveryRequired && <Row label={t("rental.delivery")} value={formatMoney(typeof deliveryCharge === "number" ? deliveryCharge : 0)} />}
          <Row label={t("rental.depositRefundable")} value={formatMoney(totals.depositTotal)} />
          <Row label={t("rental.totalToCollect")} value={formatMoney(totals.total)} bold />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{t("rental.amountPaidNow")}</span>
          <input
            type="number"
            value={paidAmount}
            onChange={(e) => setPaidAmount(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder={String(totals.total)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {(["cash", "card", "upi", "online", "other"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPaymentMethod(m)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize ${
                paymentMethod === m ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("rental.notesOptional")}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </section>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <SubmitButton t={t} />
    </form>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={bold ? "font-semibold text-foreground" : "text-muted"}>{label}</span>
      <span className={bold ? "font-semibold text-foreground" : "text-foreground"}>{value}</span>
    </div>
  );
}
