"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { updateShopSettingsAction } from "@/lib/actions/settings";
import { INDIAN_STATES } from "@/lib/constants/states";

type ShopSettings = {
  name: string;
  legalName: string;
  gstin: string;
  gstScheme: "regular" | "composition";
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateCode: string;
  pincode: string;
  invoicePrefix: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brand px-4 py-3 font-medium text-white disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save GST profile"}
    </button>
  );
}

export function SettingsClient({ shop }: { shop: ShopSettings }) {
  const [state, formAction] = useActionState(updateShopSettingsAction, null);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/more" className="text-sm text-muted">
        ← More
      </Link>
      <div>
        <h1 className="text-lg font-semibold text-foreground">GST & shop profile</h1>
        <p className="text-sm text-muted">
          Drives invoice numbering, CGST/SGST vs IGST, and every GST report.
        </p>
      </div>

      {!shop.stateCode && (
        <p className="rounded-lg bg-credit-soft px-3 py-2 text-sm text-credit">
          Set your shop&apos;s state below — billing is blocked until this is filled in,
          since it decides whether a sale is CGST+SGST or IGST.
        </p>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        <Section title="Business">
          <Field name="name" label="Display name" defaultValue={shop.name} required />
          <Field
            name="legalName"
            label="Legal / registered name (optional)"
            defaultValue={shop.legalName}
          />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">GST scheme</span>
            <select
              name="gstScheme"
              defaultValue={shop.gstScheme}
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            >
              <option value="regular">Regular — files GSTR-1 & GSTR-3B, can claim ITC</option>
              <option value="composition">Composition — fixed low rate, no ITC, no GSTR-1/3B</option>
            </select>
            {shop.gstScheme === "composition" && (
              <span className="text-xs text-credit">
                GST reports in this app (GSTR-1/3B) are built for Regular scheme and won&apos;t
                apply to you — Composition dealers file CMP-08 instead.
              </span>
            )}
          </label>
          <Field
            name="gstin"
            label="GSTIN (optional if not yet registered)"
            defaultValue={shop.gstin}
            placeholder="22AAAAA0000A1Z5"
            className="uppercase"
          />
        </Section>

        <Section title="Address (appears on invoices)">
          <Field name="addressLine1" label="Address line 1" defaultValue={shop.addressLine1} />
          <Field name="addressLine2" label="Address line 2" defaultValue={shop.addressLine2} />
          <div className="grid grid-cols-2 gap-3">
            <Field name="city" label="City" defaultValue={shop.city} />
            <Field name="pincode" label="Pincode" defaultValue={shop.pincode} />
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">State *</span>
            <select
              name="stateCode"
              defaultValue={shop.stateCode}
              required
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            >
              <option value="" disabled>
                Select state
              </option>
              {INDIAN_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </Section>

        <Section title="Invoicing">
          <Field
            name="invoicePrefix"
            label="Invoice number prefix"
            defaultValue={shop.invoicePrefix}
          />
          <p className="text-xs text-muted">
            Invoices are numbered {shop.invoicePrefix || "INV"}-2026-27/00001 style — sequential
            per financial year, as required for GST filing.
          </p>
        </Section>

        {state?.error && (
          <p className="rounded-lg bg-credit-soft px-3 py-2 text-sm text-credit">{state.error}</p>
        )}
        <SubmitButton />
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {children}
    </section>
  );
}

function Field({
  name,
  label,
  defaultValue,
  placeholder,
  required,
  className = "",
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className={`rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand ${className}`}
      />
    </label>
  );
}
