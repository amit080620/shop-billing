"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveInvoiceSettingsAction, uploadSettingsImageAction } from "@/lib/actions/settings";
import { PageHeader } from "@/app/components/PageHeader";

const PRESET_COLORS = ["#0f6b5c", "#B45309", "#1D4ED8", "#B91C1C", "#7C3AED", "#0E7490"];

export function InvoiceSettingsClient({
  isOwner,
  tagline: initialTagline,
  footerText: initialFooter,
  termsAndConditions: initialTerms,
  bankDetails: initialBank,
  accentColor: initialColor,
  headerImageUrl,
  footerImageUrl,
}: {
  isOwner: boolean;
  tagline: string;
  footerText: string;
  termsAndConditions: string;
  bankDetails: string;
  accentColor: string;
  headerImageUrl: string | null;
  footerImageUrl: string | null;
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
  const [uploadingImage, setUploadingImage] = useState<"header" | "footer" | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  async function handleImageUpload(kind: "invoice_header" | "invoice_footer", file: File) {
    setUploadingImage(kind === "invoice_header" ? "header" : "footer");
    setImageError(null);
    const formData = new FormData();
    formData.append("image", file);
    const result = await uploadSettingsImageAction(kind, formData);
    if (result.error) setImageError(result.error);
    setUploadingImage(null);
    router.refresh();
  }

  if (!isOwner) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Invoice design"
          // eslint-disable-next-line @next/next/no-img-element -- small branded SVG icon
          icon={<img src="/assets/ray-icons/invoice.svg" alt="" className="h-9 w-9 md:h-11 md:w-11" />}
          bareIcon
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
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title="Invoice design"
        subtitle="Your shop's branding on invoices and prescriptions — the line items, tax breakup, and totals stay fixed for GST accuracy; these are the parts you control."
        // eslint-disable-next-line @next/next/no-img-element -- small branded SVG icon
        icon={<img src="/assets/ray-icons/invoice.svg" alt="" className="h-9 w-9 md:h-11 md:w-11" />}
        bareIcon
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

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Header image (optional)</span>
          <label className="relative flex h-20 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-surface text-xs text-muted">
            {headerImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- small settings preview
              <img src={headerImageUrl} alt="" className="h-full w-full object-contain" />
            ) : uploadingImage === "header" ? (
              "Uploading…"
            ) : (
              "Tap to upload"
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload("invoice_header", file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Footer image (optional)</span>
          <label className="relative flex h-20 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-surface text-xs text-muted">
            {footerImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- small settings preview
              <img src={footerImageUrl} alt="" className="h-full w-full object-contain" />
            ) : uploadingImage === "footer" ? (
              "Uploading…"
            ) : (
              "Tap to upload"
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload("invoice_footer", file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
      {imageError && <p className="text-sm text-danger">{imageError}</p>}
      <p className="-mt-2 text-xs text-muted">
        Best size: about 800×200px for the header banner, 800×150px for the footer (wide, short strips work best on an A4 print) — PNG/JPG/WEBP, under 2MB.
      </p>
      <p className="-mt-2 text-xs text-muted">A header image (e.g. a printed letterhead banner) shows above your shop name; a footer image (e.g. a stamp or signature) shows at the bottom.</p>

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
      <button
        onClick={save}
        disabled={isPending}
        className={`btn-primary w-full text-center disabled:opacity-60 ${saved ? "animate-save-success" : ""}`}
      >
        {isPending ? "Saving…" : saved ? "Saved ✓" : "Save"}
      </button>
    </div>
  );
}
