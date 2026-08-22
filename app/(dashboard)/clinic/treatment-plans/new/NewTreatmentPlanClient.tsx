"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createTreatmentPlanAction } from "@/lib/actions/treatmentPlans";
import { PhoneInput } from "@/app/components/PhoneInput";
import { PageHeader } from "@/app/components/PageHeader";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { useToast } from "@/app/components/Toast";
import type { Lang } from "@/lib/i18n/dictionary";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { ToothChart, CONDITION_LABELS } from "@/app/components/ToothChart";

type Patient = { id: string; name: string; phone: string };
type PlanItem = { key: string; toothNumber: string; procedureName: string; description: string; estimatedCost: string };

const COMMON_PROCEDURES = [
  "Consultation", "Scaling & Polishing", "Filling", "Root Canal Treatment (RCT)", "Crown", "Bridge",
  "Extraction", "Implant", "Sealant", "Whitening", "Denture", "Braces / Aligners",
];

// Genuinely a starting estimate per tooth-chart procedure — the
// doctor can still edit the exact amount afterward, this just saves
// having to type it fresh every single time.
const DEFAULT_TOOTH_PROCEDURE_COST: Record<string, number> = {
  cavity: 500,
  filled: 800,
  crown: 5000,
  root_canal: 4000,
  extraction: 1000,
  bridge: 8000,
  implant: 25000,
  sealant: 600,
};

function newItem(): PlanItem {
  return { key: Math.random().toString(36).slice(2), toothNumber: "", procedureName: "", description: "", estimatedCost: "" };
}

export function NewTreatmentPlanClient({
  patients,
  lang,
  prefillPatientId,
  prefillPatientName,
  prefillPatientPhone,
  prefillDoctorName,
}: {
  patients: Patient[];
  lang: Lang;
  prefillPatientId?: string;
  prefillPatientName?: string;
  prefillPatientPhone?: string;
  prefillDoctorName?: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const prefillMatchedPatient = prefillPatientId ? patients.find((p) => p.id === prefillPatientId) ?? null : null;
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(prefillMatchedPatient);
  const [patientName, setPatientName] = useState(prefillPatientName ?? "");
  const [patientPhone, setPatientPhone] = useState(prefillPatientPhone ?? "");
  const [doctorName, setDoctorName] = useState(prefillDoctorName ?? "");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<PlanItem[]>([newItem()]);
  const [dentalChart, setDentalChart] = useState<Record<string, string>>({});

  function handleDentalChartChange(newChart: Record<string, string>) {
    setDentalChart(newChart);
    setItems((prev) => {
      // Genuinely drop any auto-added row whose tooth no longer has a
      // condition set (tapped back to "healthy").
      const withoutStale = prev.filter((it) => {
        if (!it.key.startsWith("tooth-")) return true;
        const tooth = it.key.slice("tooth-".length);
        return Boolean(newChart[tooth]);
      });

      // Genuinely upsert a row for every tooth that has a condition —
      // updates the existing row if the tooth's procedure changed,
      // adds a fresh one otherwise. Never duplicates a tooth's row.
      let next = withoutStale;
      for (const [tooth, condition] of Object.entries(newChart)) {
        const key = `tooth-${tooth}`;
        const label = CONDITION_LABELS[condition] ?? condition;
        const existingIndex = next.findIndex((it) => it.key === key);
        if (existingIndex !== -1) {
          next = next.map((it, i) => (i === existingIndex ? { ...it, procedureName: label } : it));
        } else {
          next = [
            ...next,
            {
              key,
              toothNumber: tooth,
              procedureName: label,
              description: "",
              estimatedCost: String(DEFAULT_TOOTH_PROCEDURE_COST[condition] ?? 0),
            },
          ];
        }
      }

      // Genuinely drop the one always-present blank starter row once
      // the tooth chart has added real rows, so it doesn't linger as
      // an empty, confusing entry.
      if (next.length > 1) next = next.filter((it) => it.procedureName.trim() !== "" || it.key.startsWith("tooth-"));

      return next.length > 0 ? next : [newItem()];
    });
  }
  const [error, setError] = useState("");

  function updateItem(key: string, patch: Partial<PlanItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, newItem()]);
  }
  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
    if (key.startsWith("tooth-")) {
      const tooth = key.slice("tooth-".length);
      setDentalChart((prev) => {
        const next = { ...prev };
        delete next[tooth];
        return next;
      });
    }
  }

  const total = items.reduce((s, it) => s + (Number(it.estimatedCost) || 0), 0);

  function submit() {
    if (!patientName.trim()) {
      setError("Enter the patient's name");
      return;
    }
    const validItems = items.filter((it) => it.procedureName.trim());
    if (validItems.length === 0) {
      setError("Add at least one treatment");
      return;
    }
    startTransition(async () => {
      const result = await createTreatmentPlanAction({
        patientId: selectedPatient?.id ?? null,
        patientName,
        patientPhone: patientPhone || null,
        doctorName: doctorName || null,
        notes: notes || null,
        items: validItems.map((it) => ({
          toothNumber: it.toothNumber || null,
          procedureName: it.procedureName,
          description: it.description || null,
          estimatedCost: Number(it.estimatedCost) || 0,
        })),
        dentalChart,
      });
      if (result.error || !result.planId) {
        setError(result.error ?? "Could not save treatment plan");
        return;
      }
      showToast("Treatment plan saved");
      router.push(`/print/treatment-plan/${result.planId}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="New treatment plan" icon={<ClipboardList size={18} strokeWidth={1.8} />} />
      <Link href="/clinic/treatment-plans" className="text-sm text-muted">
        ← Treatment plans
      </Link>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Patient</span>
        <SearchableSelect
          lang={lang}
          items={patients}
          getKey={(p) => p.id}
          getLabel={(p) => p.name}
          getSubLabel={(p) => p.phone}
          onSelect={(p) => {
            setSelectedPatient(p);
            setPatientName(p.name);
            setPatientPhone(p.phone);
          }}
          placeholder="Search existing patient, or just type below"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Name</span>
          <input
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Phone</span>
          <PhoneInput value={patientPhone} onChange={setPatientPhone} />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Doctor</span>
        <input
          value={doctorName}
          onChange={(e) => setDoctorName(e.target.value)}
          placeholder="Doctor's name"
          className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      <ToothChart chart={dentalChart} onChange={handleDentalChartChange} />

      <div className="flex flex-col gap-2.5">
        <p className="text-sm font-medium text-foreground">Treatments planned</p>
        {items.map((it) => (
          <div key={it.key} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
            <div className="flex gap-2">
              <input
                value={it.toothNumber}
                onChange={(e) => updateItem(it.key, { toothNumber: e.target.value })}
                placeholder="Tooth #"
                className="w-20 rounded-lg border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-brand"
              />
              <div className="flex-1">
                <SearchableSelect
                  lang={lang}
                  items={COMMON_PROCEDURES}
                  getKey={(p) => p}
                  getLabel={(p) => p}
                  onSelect={(p) => updateItem(it.key, { procedureName: p })}
                  placeholder="Search procedure…"
                />
              </div>
              {items.length > 1 && (
                <button type="button" onClick={() => removeItem(it.key)} className="shrink-0 text-danger" aria-label="Remove">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <input
              value={it.procedureName}
              onChange={(e) => updateItem(it.key, { procedureName: e.target.value })}
              placeholder="Procedure name (or pick above)"
              className="rounded-lg border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-brand"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={it.description}
                onChange={(e) => updateItem(it.key, { description: e.target.value })}
                placeholder="Notes (optional)"
                className="rounded-lg border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-brand"
              />
              <input
                type="number"
                min={0}
                value={it.estimatedCost}
                onChange={(e) => updateItem(it.key, { estimatedCost: e.target.value })}
                placeholder="Estimated cost (₹)"
                className="rounded-lg border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
          </div>
        ))}
        <button type="button" onClick={addItem} className="flex items-center gap-1 self-start text-sm font-medium text-brand">
          <Plus size={14} /> Add treatment
        </button>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-2.5">
        <span className="text-sm font-medium text-foreground">Estimated total</span>
        <span className="text-base font-bold text-foreground">₹{total.toLocaleString("en-IN")}</span>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Notes for the patient (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}
      <button onClick={submit} disabled={isPending} className="btn-primary w-full text-center disabled:opacity-60">
        {isPending ? "Saving…" : "Save plan & view quotation"}
      </button>
    </div>
  );
}
