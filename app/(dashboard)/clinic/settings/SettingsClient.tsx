"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { savePrescriptionSettingsAction } from "@/lib/actions/clinic";
import { PageHeader } from "@/app/components/PageHeader";

export function SettingsClient({
  headerText: initialHeaderText,
  footerText: initialFooterText,
  showShopLogo: initialShowShopLogo,
  customFieldLabels: initialLabels,
}: {
  headerText: string;
  footerText: string;
  showShopLogo: boolean;
  customFieldLabels: string[];
}) {
  const router = useRouter();
  const [headerText, setHeaderText] = useState(initialHeaderText);
  const [footerText, setFooterText] = useState(initialFooterText);
  const [showShopLogo, setShowShopLogo] = useState(initialShowShopLogo);
  const [labels, setLabels] = useState<string[]>(initialLabels.length > 0 ? initialLabels : [""]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function updateLabel(index: number, value: string) {
    setLabels((prev) => prev.map((l, i) => (i === index ? value : l)));
  }
  function addLabel() {
    setLabels((prev) => [...prev, ""]);
  }
  function removeLabel(index: number) {
    setLabels((prev) => prev.filter((_, i) => i !== index));
  }

  function save() {
    setSaved(false);
    startTransition(async () => {
      const result = await savePrescriptionSettingsAction({
        headerText,
        footerText,
        showShopLogo,
        customFieldLabels: labels.map((l) => l.trim()).filter(Boolean),
      });
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
        title="Prescription pad settings"
        subtitle="Set your letterhead once — every prescription you print uses this."
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 3v4a1 1 0 0 0 1 1h4" />
            <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
            <path d="M9 13h6M9 17h4" />
          </svg>
        }
      />
      <Link href="/clinic" className="text-sm text-muted">
        ← Clinic
      </Link>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Header (doctor name, qualifications, registration no.)</span>
        <textarea
          value={headerText}
          onChange={(e) => setHeaderText(e.target.value)}
          rows={4}
          placeholder={"Dr. Ramesh Kumar\nMBBS, MD (Medicine)\nReg. No. MH12345"}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={showShopLogo} onChange={(e) => setShowShopLogo(e.target.checked)} className="h-4 w-4 rounded border-border" />
        Also show clinic logo (from More → Settings) at the top
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Footer (clinic timings, address, contact, disclaimer)</span>
        <textarea
          value={footerText}
          onChange={(e) => setFooterText(e.target.value)}
          rows={3}
          placeholder={"Mon–Sat: 10am–2pm, 6pm–9pm\n123 MG Road, Pune · 98765 43210"}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Rx fields</span>
        <p className="text-xs text-muted">
          These become sections on every new prescription (e.g. Chief Complaint, Diagnosis, Lab Tests, Vitals) — add or remove as many as you use.
        </p>
        {labels.map((label, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={label}
              onChange={(e) => updateLabel(i, e.target.value)}
              placeholder="e.g. Lab Tests"
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <button onClick={() => removeLabel(i)} className="rounded-lg border border-danger px-3 py-2 text-xs font-medium text-danger">
              Remove
            </button>
          </div>
        ))}
        <button onClick={addLabel} className="self-start text-sm font-medium text-brand">
          + Add field
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-brand">Saved.</p>}
      <button onClick={save} disabled={isPending} className="btn-primary w-full text-center disabled:opacity-60">
        {isPending ? "Saving…" : "Save settings"}
      </button>
    </div>
  );
}
