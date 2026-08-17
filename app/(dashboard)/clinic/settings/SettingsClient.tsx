"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { savePrescriptionSettingsAction } from "@/lib/actions/clinic";
import { uploadSettingsImageAction } from "@/lib/actions/settings";
import { PageHeader } from "@/app/components/PageHeader";
import { Stethoscope } from "lucide-react";

export function SettingsClient({
  headerText: initialHeaderText,
  footerText: initialFooterText,
  showShopLogo: initialShowShopLogo,
  customFieldLabels: initialLabels,
  headerImageUrl,
  footerImageUrl,
  specialty: initialSpecialty,
}: {
  headerText: string;
  footerText: string;
  showShopLogo: boolean;
  customFieldLabels: string[];
  headerImageUrl: string | null;
  footerImageUrl: string | null;
  specialty: string;
}) {
  const router = useRouter();
  const [headerText, setHeaderText] = useState(initialHeaderText);
  const [footerText, setFooterText] = useState(initialFooterText);
  const [showShopLogo, setShowShopLogo] = useState(initialShowShopLogo);
  const [specialty, setSpecialty] = useState(initialSpecialty);
  const [labels, setLabels] = useState<string[]>(initialLabels.length > 0 ? initialLabels : [""]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [uploadingImage, setUploadingImage] = useState<"header" | "footer" | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  async function handleImageUpload(kind: "prescription_header" | "prescription_footer", file: File) {
    setUploadingImage(kind === "prescription_header" ? "header" : "footer");
    setImageError(null);
    const formData = new FormData();
    formData.append("image", file);
    const result = await uploadSettingsImageAction(kind, formData);
    if (result.error) setImageError(result.error);
    setUploadingImage(null);
    router.refresh();
  }

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
        specialty,
      });
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
        title="Prescription pad settings"
        subtitle="Set your letterhead once — every prescription you print uses this."
        icon={<Stethoscope size={18} strokeWidth={1.8} />}
      />
      <Link href="/clinic" className="text-sm text-muted">
        ← Clinic
      </Link>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Specialty</span>
        <select value={specialty} onChange={(e) => setSpecialty(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand">
          <option value="general">General / Other</option>
          <option value="dental">Dental — adds a visual tooth chart</option>
          <option value="cardiology">Cardiology — adds a vitals panel</option>
          <option value="physiotherapy">Physiotherapy — adds a vitals panel</option>
          <option value="orthopedic">Orthopedic — adds a vitals panel</option>
          <option value="ophthalmology">Ophthalmology / Eye — adds a vitals panel</option>
          <option value="gynecology">Gynecology — adds a vitals panel</option>
          <option value="ent">ENT — adds a vitals panel</option>
          <option value="psychiatry">Psychiatry — adds a vitals panel</option>
          <option value="dermatology">Dermatology — adds a vitals panel + before/after photos</option>
          <option value="pediatric">Pediatric — adds a growth chart</option>
        </select>
        <p className="text-xs text-muted">Changes what shows up on the New Prescription screen — just extra structured fields to fill in, nothing is auto-calculated or diagnosed.</p>
      </label>

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

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Letterhead banner (optional)</span>
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
                if (file) handleImageUpload("prescription_header", file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Footer image / stamp (optional)</span>
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
                if (file) handleImageUpload("prescription_footer", file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
      {imageError && <p className="text-sm text-danger">{imageError}</p>}
      <p className="-mt-2 text-xs text-muted">
        Best size: about 800×200px for the letterhead banner, 800×150px for the footer (wide, short strips work best on an A4 print) — PNG/JPG/WEBP, under 2MB.
      </p>

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
      <button
        onClick={save}
        disabled={isPending}
        className={`btn-primary w-full text-center disabled:opacity-60 ${saved ? "animate-save-success" : ""}`}
      >
        {isPending ? "Saving…" : saved ? "Saved ✓" : "Save settings"}
      </button>
    </div>
  );
}
