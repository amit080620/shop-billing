"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createPurchaseAction } from "@/lib/actions/purchases";
import { quickCreateVendorAction } from "@/lib/actions/vendors";
import { calculateTransactionTotals } from "@/lib/validation/schemas";
import { formatMoney } from "@/lib/format";
import { COMMON_GST_RATES } from "@/lib/constants/states";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { InlineQuickAdd } from "@/app/components/InlineQuickAdd";

type Vendor = { id: string; name: string; gstin: string | null; phone: string | null };
type Product = { id: string; name: string; hsnCode: string | null };
type Line = {
  key: string;
  productId: string | null;
  description: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  gstPercent: number;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary w-full text-center"
    >
      {pending ? "Saving purchase…" : "Save purchase"}
    </button>
  );
}

export function NewPurchaseClient({
  vendors,
  products,
  preselectedVendorId,
}: {
  vendors: Vendor[];
  products: Product[];
  preselectedVendorId: string | null;
}) {
  const [vendor, setVendor] = useState<Vendor | null>(
    vendors.find((v) => v.id === preselectedVendorId) ?? null,
  );
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([]);
  const [paidAmount, setPaidAmount] = useState<number | "">("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi" | "online" | "other">("cash");
  const [itcEligible, setItcEligible] = useState(true);
  const [reverseCharge, setReverseCharge] = useState(false);

  const totals = useMemo(
    () =>
      calculateTransactionTotals({
        items: lines.map((l) => ({
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          gstPercent: l.gstPercent,
        })),
        discountType: "flat",
        discountValue: 0,
        paidAmount: typeof paidAmount === "number" ? paidAmount : 0,
        supplyType: "intra", // preview only — server recomputes from real vendor state
      }),
    [lines, paidAmount],
  );

  const [state, formAction] = useActionState(createPurchaseAction, null);

  function addProduct(p: Product) {
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        productId: p.id,
        description: p.name,
        hsnCode: p.hsnCode ?? "",
        quantity: 1,
        unitPrice: 0,
        gstPercent: 0,
      },
    ]);
  }

  function addCustomLine() {
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        productId: null,
        description: "",
        hsnCode: "",
        quantity: 1,
        unitPrice: 0,
        gstPercent: 0,
      },
    ]);
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const payload = JSON.stringify({
    vendorId: vendor?.id ?? null,
    vendorInvoiceNumber,
    purchaseDate,
    items: lines.map((l) => ({
      productId: l.productId,
      description: l.description,
      hsnCode: l.hsnCode || null,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      gstPercent: l.gstPercent,
    })),
    paidAmount: typeof paidAmount === "number" ? paidAmount : totals.total,
    paymentMethod,
    itcEligible,
    reverseCharge,
  });

  const canSubmit =
    vendor && vendorInvoiceNumber.trim().length > 0 && lines.length > 0 &&
    lines.every((l) => l.description.trim() && l.quantity > 0);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="payload" value={payload} />
      <h1 className="text-lg font-semibold text-foreground">Record purchase</h1>
      <p className="text-sm text-muted">
        Enter what&apos;s on the vendor&apos;s bill — this is your input GST / ITC record.
      </p>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Vendor</p>
        {vendor ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{vendor.name}</p>
              <p className="text-xs text-muted">{vendor.gstin ?? vendor.phone ?? "No GSTIN on file"}</p>
            </div>
            <button type="button" onClick={() => setVendor(null)} className="shrink-0 text-xs font-medium text-brand">
              Change
            </button>
          </div>
        ) : vendors.length > 0 ? (
          <SearchableSelect
            items={vendors}
            getKey={(v) => v.id}
            getLabel={(v) => v.name}
            getSubLabel={(v) => v.gstin ?? v.phone ?? ""}
            onSelect={setVendor}
            placeholder="Search vendor by name"
          />
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3.5 py-2.5 text-sm text-muted">
            No vendors yet — add one below.
          </p>
        )}
        {!vendor && (
          <InlineQuickAdd<{ id: string; name: string; gstin: string | null; phone: string | null }>
            triggerLabel="+ Add new vendor"
            fields={[
              { name: "name", label: "Vendor name", required: true },
              { name: "phone", label: "Phone (optional)", type: "tel" },
            ]}
            onSubmit={async (v) => {
              const r = await quickCreateVendorAction(v.name, v.phone ?? "");
              return { data: r.vendor, error: r.error };
            }}
            onCreated={setVendor}
            contactFields={{ name: "name", phone: "phone" }}
          />
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Vendor&apos;s invoice #</span>
          <input
            value={vendorInvoiceNumber}
            onChange={(e) => setVendorInvoiceNumber(e.target.value)}
            required
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Purchase date</span>
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            required
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
      </div>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Items</p>
        {products.length > 0 && (
          <SearchableSelect
            items={products}
            getKey={(p) => p.id}
            getLabel={(p) => p.name}
            getSubLabel={(p) => p.hsnCode ?? ""}
            onSelect={addProduct}
            placeholder="Add from your product catalog"
          />
        )}
        <button
          type="button"
          onClick={addCustomLine}
          className="self-start text-sm font-medium text-brand"
        >
          + Add item not in catalog
        </button>

        {lines.map((line) => (
          <div key={line.key} className="flex flex-col gap-2 rounded-lg border border-border bg-surface shadow-sm p-3">
            <div className="flex items-center gap-2">
              <input
                value={line.description}
                onChange={(e) => updateLine(line.key, { description: e.target.value })}
                placeholder="Item description"
                className="min-w-0 flex-1 rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => removeLine(line.key)}
                className="shrink-0 text-xs font-medium text-danger"
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <LabeledInput
                label="Qty"
                type="number"
                value={line.quantity}
                onChange={(v) => updateLine(line.key, { quantity: Number(v) || 0 })}
              />
              <LabeledInput
                label="Rate ₹"
                type="number"
                value={line.unitPrice}
                onChange={(v) => updateLine(line.key, { unitPrice: Number(v) || 0 })}
              />
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-muted">GST %</span>
                <select
                  value={line.gstPercent}
                  onChange={(e) => updateLine(line.key, { gstPercent: Number(e.target.value) })}
                  className="rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-brand"
                >
                  {COMMON_GST_RATES.map((r) => (
                    <option key={r} value={r}>
                      {r}%
                    </option>
                  ))}
                </select>
              </label>
              <LabeledInput
                label="HSN"
                type="text"
                value={line.hsnCode}
                onChange={(v) => updateLine(line.key, { hsnCode: String(v) })}
              />
            </div>
          </div>
        ))}
      </section>

      {lines.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface shadow-sm p-4 text-sm">
          <Row label="Taxable value" value={formatMoney(totals.taxableAmount)} />
          <Row
            label="GST (exact CGST/SGST/IGST split saved after vendor state is checked)"
            value={`+ ${formatMoney(totals.gstAmount)}`}
          />
          <div className="my-1 h-px bg-border" />
          <Row label="Total" value={formatMoney(totals.total)} bold />
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface shadow-sm p-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Amount paid now (₹)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={paidAmount}
            onChange={(e) => setPaidAmount(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder={formatMoney(totals.total)}
            className="rounded-lg border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand"
          />
        </label>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Paid via</span>
          <div className="flex flex-wrap gap-2">
            {(["cash", "card", "upi", "online", "other"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentMethod(m)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize ${
                  paymentMethod === m
                    ? "border-brand bg-brand-soft text-brand-dark"
                    : "border-border text-muted"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={itcEligible}
            onChange={(e) => setItcEligible(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Eligible for Input Tax Credit (ITC)
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={reverseCharge}
            onChange={(e) => setReverseCharge(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Reverse charge (you pay this GST directly, not the vendor)
        </label>
      </section>

      {state?.error && (
        <p className="rounded-lg bg-credit-soft px-3 py-2 text-sm text-credit">{state.error}</p>
      )}

      <SubmitButton />
      {!canSubmit && (
        <p className="text-center text-xs text-muted">
          Add a vendor, invoice number, and at least one item to save.
        </p>
      )}
    </form>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-brand"
      />
    </label>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={bold ? "font-semibold text-foreground" : "text-muted"}>{label}</span>
      <span className={`shrink-0 ${bold ? "font-semibold text-foreground" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}
