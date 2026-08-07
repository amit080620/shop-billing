"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPrescriptionAction, type PrescriptionItemInput } from "@/lib/actions/clinic";
import { PageHeader } from "@/app/components/PageHeader";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { COMMON_MEDICINE_NAMES } from "@/lib/constants/commonMedicines";

type Patient = { id: string; name: string; phone: string; dateOfBirth: string | null; gender: string | null };
type MedicineRow = PrescriptionItemInput & { key: string };

const FREQUENCY_PRESETS = ["1-0-0", "0-1-0", "0-0-1", "1-0-1", "1-1-1", "1-1-0", "SOS"];

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function newMedicineRow(): MedicineRow {
  return { key: Math.random().toString(36).slice(2), medicineName: "", dosage: "", frequency: "", duration: "", instructions: "", quantity: undefined };
}

export function NewPrescriptionClient({
  patients,
  fieldLabels,
  appointmentId,
  prefillPatientName,
  prefillPatientPhone,
}: {
  patients: Patient[];
  fieldLabels: string[];
  appointmentId: string | null;
  prefillPatientName: string;
  prefillPatientPhone: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientName, setPatientName] = useState(prefillPatientName);
  const [patientPhone, setPatientPhone] = useState(prefillPatientPhone);
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  const [sections, setSections] = useState<{ label: string; value: string }[]>(fieldLabels.map((l) => ({ label: l, value: "" })));
  const [medicines, setMedicines] = useState<MedicineRow[]>([newMedicineRow()]);

  function updateSection(index: number, value: string) {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, value } : s)));
  }

  function updateMedicine(key: string, patch: Partial<MedicineRow>) {
    setMedicines((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  }
  function addMedicineRow() {
    setMedicines((prev) => [...prev, newMedicineRow()]);
  }
  function removeMedicineRow(key: string) {
    setMedicines((prev) => (prev.length > 1 ? prev.filter((m) => m.key !== key) : prev));
  }

  function submit() {
    if (!patientName.trim()) {
      setError("Enter the patient's name");
      return;
    }
    startTransition(async () => {
      const result = await createPrescriptionAction({
        patientId: selectedPatient?.id ?? null,
        patientName,
        patientAge,
        patientGender,
        patientPhone,
        doctorName,
        customSections: sections,
        followUpDate: followUpDate || null,
        appointmentId,
        items: medicines.filter((m) => m.medicineName.trim()),
      });
      if (result.error || !result.prescriptionId) {
        setError(result.error ?? "Could not save prescription");
        return;
      }
      router.push(`/print/prescription/${result.prescriptionId}`);
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title="New prescription"
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

      {/* Patient */}
      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Patient</p>
        <SearchableSelect
          items={patients}
          getKey={(p) => p.id}
          getLabel={(p) => p.name}
          getSubLabel={(p) => p.phone}
          onSelect={(p) => {
            setSelectedPatient(p);
            setPatientName(p.name);
            setPatientPhone(p.phone);
            if (p.gender) setPatientGender(p.gender);
            if (p.dateOfBirth) {
              const age = Math.floor((Date.now() - new Date(p.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
              setPatientAge(String(age));
            }
          }}
          placeholder="Search existing patient, or just type below"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            placeholder="Patient name"
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <input
            value={patientPhone}
            onChange={(e) => setPatientPhone(e.target.value)}
            placeholder="Phone"
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            value={patientAge}
            onChange={(e) => setPatientAge(e.target.value)}
            placeholder="Age (e.g. 34)"
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <select
            value={patientGender}
            onChange={(e) => setPatientGender(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          >
            <option value="">Gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
      </section>

      {/* Custom Rx sections — fully driven by clinic settings, no hard limit */}
      {sections.map((section, i) => (
        <label key={i} className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{section.label}</span>
          <textarea
            value={section.value}
            onChange={(e) => updateSection(i, e.target.value)}
            rows={2}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
      ))}

      {/* Medicines */}
      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Medicines (Rx)</p>
        {medicines.map((med) => (
          <div key={med.key} className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-2.5">
            <div className="flex gap-2">
              <div className="flex-1">
                <SearchableSelect
                  items={COMMON_MEDICINE_NAMES}
                  getKey={(m) => m}
                  getLabel={(m) => m}
                  onSelect={(m) => updateMedicine(med.key, { medicineName: m })}
                  placeholder="Search medicine name…"
                />
              </div>
              {medicines.length > 1 && (
                <button type="button" onClick={() => removeMedicineRow(med.key)} className="shrink-0 text-xs font-medium text-danger">
                  Remove
                </button>
              )}
            </div>
            <input
              value={med.medicineName}
              onChange={(e) => updateMedicine(med.key, { medicineName: e.target.value })}
              placeholder="Medicine name (or pick from search above)"
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={med.dosage}
                onChange={(e) => updateMedicine(med.key, { dosage: e.target.value })}
                placeholder="Dosage (e.g. 500mg)"
                className="rounded-lg border border-border px-2 py-1.5 text-xs outline-none focus:border-brand"
              />
              <input
                value={med.duration}
                onChange={(e) => updateMedicine(med.key, { duration: e.target.value })}
                placeholder="Duration (e.g. 5 days)"
                className="rounded-lg border border-border px-2 py-1.5 text-xs outline-none focus:border-brand"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {FREQUENCY_PRESETS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => updateMedicine(med.key, { frequency: f })}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    med.frequency === f ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"
                  }`}
                >
                  {f}
                </button>
              ))}
              <input
                value={med.frequency}
                onChange={(e) => updateMedicine(med.key, { frequency: e.target.value })}
                placeholder="or type frequency"
                className="w-28 rounded-full border border-border px-2 py-0.5 text-[11px] outline-none focus:border-brand"
              />
            </div>
            <input
              value={med.instructions}
              onChange={(e) => updateMedicine(med.key, { instructions: e.target.value })}
              placeholder="Instructions (e.g. after food)"
              className="rounded-lg border border-border px-3 py-1.5 text-xs outline-none focus:border-brand"
            />
          </div>
        ))}
        <button type="button" onClick={addMedicineRow} className="self-start text-sm font-medium text-brand">
          + Add medicine
        </button>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Doctor (optional)</span>
          <input
            value={doctorName}
            onChange={(e) => setDoctorName(e.target.value)}
            placeholder="If more than one doctor"
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Follow-up date (optional)</span>
          <input
            type="date"
            value={followUpDate}
            min={todayIso()}
            onChange={(e) => setFollowUpDate(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      <button onClick={submit} disabled={isPending} className="btn-primary w-full text-center disabled:opacity-60">
        {isPending ? "Saving…" : "Save & print prescription"}
      </button>
    </div>
  );
}
