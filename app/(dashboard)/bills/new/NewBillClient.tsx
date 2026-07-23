"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createBillAction } from "@/lib/actions/bills";
import { calculateTransactionTotals } from "@/lib/validation/schemas";
import { determineSupplyType } from "@/lib/gst";
import { formatMoney } from "@/lib/format";
import { SearchableSelect } from "@/app/components/SearchableSelect";

type Product = { id: string; name: string; price: number; gstPercent: number; hsnCode: string | null };
type Customer = { id: string; name: string; phone: string; gstin: string | null; state_code: string | null };
type CartLine = {
  productId: string;
  name: string;
  price: number;
  gstPercent: number;
  hsnCode: string | null;
  quantity: number;
};

function SubmitButton({ blocked }: { blocked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || blocked}
      className="w-full rounded-xl bg-brand px-4 py-3.5 text-center font-medium text-white active:bg-brand-dark disabled:opacity-60"
    >
      {pending ? "Generating invoice…" : "Generate invoice"}
    </button>
  );
}

export function NewBillClient({
  shopStateCode,
  products,
  customers,
}: {
  shopStateCode: string;
  products: Product[];
  customers: Customer[];
}) {
  const [step, setStep] = useState<"cart" | "ticket">("cart");
  const [cart, setCart] = useState<CartLine[]>([]);
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
        <h1 className="text-lg font-semibold text-foreground">New bill</h1>

        <section className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">Customer</p>
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
              Walk-in (no record)
            </button>
            <button
              onClick={() => setCustomerMode("existing")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                customerMode === "existing"
                  ? "border-brand bg-brand-soft text-brand-dark"
                  : "border-border text-muted"
              }`}
            >
              Existing customer
            </button>
          </div>

          {customerMode === "existing" &&
            (selectedCustomer ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-2.5">
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
                  Change
                </button>
              </div>
            ) : (
              <SearchableSelect
                items={customers}
                getKey={(c) => c.id}
                getLabel={(c) => c.name}
                getSubLabel={(c) => c.phone}
                onSelect={setSelectedCustomer}
                placeholder="Search customer by name or phone"
              />
            ))}
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">Add products</p>
          <SearchableSelect
            items={products}
            getKey={(p) => p.id}
            getLabel={(p) => p.name}
            getSubLabel={(p) => formatMoney(p.price)}
            onSelect={addProduct}
            placeholder="Search products to add"
          />
        </section>

        {cart.length > 0 && (
          <section className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">Cart</p>
            <ul className="flex flex-col gap-2">
              {cart.map((line) => (
                <li
                  key={line.productId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {line.name}
                    </p>
                    <p className="text-xs text-muted">
                      {formatMoney(line.price)} · GST {line.gstPercent}%
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => updateQuantity(line.productId, line.quantity - 1)}
                      className="h-7 w-7 rounded-full border border-border text-sm font-medium text-foreground"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-medium text-foreground">
                      {line.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(line.productId, line.quantity + 1)}
                      className="h-7 w-7 rounded-full border border-border text-sm font-medium text-foreground"
                    >
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between rounded-lg bg-brand-soft px-3.5 py-2.5 text-sm">
              <span className="text-brand-dark">Subtotal</span>
              <span className="font-semibold text-brand-dark">
                {formatMoney(totals.subtotal)}
              </span>
            </div>
          </section>
        )}

        <button
          disabled={cart.length === 0 || (customerMode === "existing" && !selectedCustomer)}
          onClick={() => {
            setPaidAmount(totals.total);
            setStep("ticket");
          }}
          className="rounded-xl bg-brand px-4 py-3.5 text-center font-medium text-white disabled:opacity-40"
        >
          Complete ticket →
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
          ← Back to cart
        </button>
      </div>
      <h1 className="text-lg font-semibold text-foreground">Complete ticket</h1>

      <section className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-medium text-foreground">
          {customerMode === "existing" ? selectedCustomer?.name : "Walk-in customer"}
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

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-medium text-foreground">Discount</p>
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
            ₹ Flat amount
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
            % Percentage
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

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-sm">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            {supplyType === "intra" ? "Local sale · CGST + SGST" : "Inter-state sale · IGST"}
          </span>
        </div>
        <Row label="Subtotal" value={formatMoney(totals.subtotal)} />
        <Row label="Discount" value={`− ${formatMoney(totals.discountAmount)}`} />
        <Row label="Taxable value" value={formatMoney(totals.taxableAmount)} />
        {supplyType === "intra" ? (
          <>
            <Row label="CGST" value={`+ ${formatMoney(totals.cgstAmount)}`} />
            <Row label="SGST" value={`+ ${formatMoney(totals.sgstAmount)}`} />
          </>
        ) : (
          <Row label="IGST" value={`+ ${formatMoney(totals.igstAmount)}`} />
        )}
        <div className="my-1 h-px bg-border" />
        <Row label="Total" value={formatMoney(totals.total)} bold />
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-medium text-foreground">Paid via</p>
        <div className="flex flex-wrap gap-2">
          {(["cash", "card", "upi", "online", "other"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPaymentMethod(m)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium capitalize ${
                paymentMethod === m
                  ? "border-brand bg-brand-soft text-brand-dark"
                  : "border-border text-muted"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Amount paid now (₹)</span>
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
        {totals.balanceAmount > 0 && (
          <p className="text-sm text-credit">
            {formatMoney(totals.balanceAmount)} will be added to this customer&apos;s credit (udhaar).
          </p>
        )}
        {totals.balanceAmount > 0 && customerMode === "walkin" && (
          <p className="text-sm text-credit">
            Walk-in sales can&apos;t carry credit — attach an existing customer to track this balance.
          </p>
        )}
      </section>

      {state?.error && (
        <p className="rounded-lg bg-credit-soft px-3 py-2 text-sm text-credit">
          {state.error}
        </p>
      )}

      <SubmitButton blocked={customerMode === "walkin" && totals.balanceAmount > 0} />
    </form>
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
