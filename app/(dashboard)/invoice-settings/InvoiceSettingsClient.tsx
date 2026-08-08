"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveInvoiceSettingsAction } from "@/lib/actions/settings";
import { PageHeader } from "@/app/components/PageHeader";

const PRESET_COLORS = ["#0f6b5c", "#B45309", "#1D4ED8", "#B91C1C", "#7C3AED", "#0E7490"];

export function InvoiceSettingsClient({
  isOwner,
  tagline: initialTagline,
  footerText: initialFooter,
  termsAndConditions: initialTerms,
  bankDetails: initialBank,
  accentColor: initialColor,
}: {
  isOwner: boolean;
  tagline: string;
  footerText: string;
  termsAndConditions: string;
  bankDetails: string;
  accentColor: string;
}) {
  const router = useRouter();
  const [tagline, setTagline] = useState(initialTagline);
  const [footerText, setFooterText] = useState(initialFooter);
  const [terms, setTerms] = useState(initialTerms);
  const [bankDetails, setBankDetails] = useState(initialBank);
  const [accentColor, setAccentColor] = useState(initialColor);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!isOwner) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Invoice design"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19V5M4 19h16M8 15l3-4 3 3 4-6" />
            </svg>
          }
        />
        <p className="text-sm text-muted">Only the shop owner can change invoice branding.</p>
      </div>
    );
  }

  function save() {
    setSaved(false);
    startTransition(async () => {
      const result = await saveInvoiceSettingsAction({ tagline, footerText, termsAndConditions: terms, bankDetails, accentColor });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title="Invoice design"
        subtitle="Your shop's branding on invoices and prescriptions — the line items, tax breakup, and totals stay fixed for GST accuracy; these are the parts you control."
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19V5M4 19h16M8 15l3-4 3 3 4-6" />
          </svg>
        }
      />
      <Link href="/more" className="text-sm text-muted">
        ← More
      </Link>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Tagline (optional, shown under your shop name)</span>
        <input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="e.g. Quality you can trust since 1995"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Footer message</span>
        <input
          value={footerText}
          onChange={(e) => setFooterText(e.target.value)}
          placeholder="Thank you for your business!"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Terms & conditions (optional)</span>
        <textarea
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          rows={3}
          placeholder={"Goods once sold will not be taken back.\nSubject to local jurisdiction."}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Bank details for transfer (optional)</span>
        <textarea
          value={bankDetails}
          onChange={(e) => setBankDetails(e.target.value)}
          rows={2}
          placeholder={"A/c name: ...\nA/c No: ... · IFSC: ..."}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Accent colour</span>
        <p className="text-xs text-muted">Used on invoice and prescription headers — pick one that matches your shop&apos;s look.</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setAccentColor(c)}
              className={`h-9 w-9 rounded-full border-2 ${accentColor === c ? "border-foreground" : "border-transparent"}`}
              style={{ backgroundColor: c }}
              aria-label={c}
            />
          ))}
          <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-dashed border-border text-xs text-muted">
            <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="h-0 w-0 opacity-0" />
            +
          </label>
        </div>
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-surface p-3">
          <div className="h-8 w-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
          <p className="text-sm font-semibold" style={{ color: accentColor }}>
            Preview — Tax Invoice
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-brand">Saved.</p>}
      <button onClick={save} disabled={isPending} className="btn-primary w-full text-center disabled:opacity-60">
        {isPending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
