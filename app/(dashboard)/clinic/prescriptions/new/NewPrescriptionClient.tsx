"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPrescriptionAction, type PrescriptionItemInput } from "@/lib/actions/clinic";
import { PageHeader } from "@/app/components/PageHeader";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { COMMON_MEDICINE_NAMES } from "@/lib/constants/commonMedicines";
import type { Lang } from "@/lib/i18n/dictionary";
import { FileText, Smile, ClipboardList } from "lucide-react";

type Patient = { id: string; name: string; phone: string; dateOfBirth: string | null; gender: string | null };
type MedicineRow = PrescriptionItemInput & { key: string };

const FREQUENCY_PRESETS = ["1-0-0", "0-1-0", "0-0-1", "1-0-1", "1-1-1", "1-1-0", "SOS"];
const INSTRUCTION_PRESETS = ["Before food", "After food", "With food", "Empty stomach", "At bedtime"];

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
  lang,
  specialty,
}: {
  patients: Patient[];
  fieldLabels: string[];
  appointmentId: string | null;
  prefillPatientName: string;
  prefillPatientPhone: string;
  lang: Lang;
  specialty: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dentalChart, setDentalChart] = useState<Record<string, string>>({});
  const [vitals, setVitals] = useState<Record<string, string>>({});

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
        dentalChart: Object.keys(dentalChart).length > 0 ? dentalChart : undefined,
        vitals: Object.keys(vitals).length > 0 ? vitals : undefined,
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
        icon={<FileText size={18} strokeWidth={1.8} />}
      />
      <Link href="/clinic" className="text-sm text-muted">
        ← Clinic
      </Link>

      {/* Patient */}
      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Patient</p>
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

      {specialty === "dental" && <ToothChart chart={dentalChart} onChange={setDentalChart} />}
      {specialty in VITALS_FIELDS && <VitalsPanel specialty={specialty} vitals={vitals} onChange={setVitals} />}

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
                  lang={lang}
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
            <div className="flex flex-wrap gap-1">
              {INSTRUCTION_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => updateMedicine(med.key, { instructions: p })}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    med.instructions === p ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"
                  }`}
                >
                  {p}
                </button>
              ))}
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

// ─── Dental: visual tooth chart (FDI notation) ─────────────────────────
// Tap a tooth to cycle through its condition — this is purely a record
// of what the doctor observed, nothing here is calculated or diagnosed.
const TOOTH_CONDITIONS = ["healthy", "cavity", "filled", "missing", "crown", "root_canal"] as const;
const CONDITION_COLORS: Record<string, string> = {
  healthy: "bg-surface border-border text-muted",
  cavity: "bg-red-100 border-red-400 text-red-700",
  filled: "bg-blue-100 border-blue-400 text-blue-700",
  missing: "bg-gray-200 border-gray-400 text-gray-500",
  crown: "bg-amber-100 border-amber-400 text-amber-700",
  root_canal: "bg-purple-100 border-purple-400 text-purple-700",
};
const CONDITION_LABELS: Record<string, string> = {
  healthy: "Healthy",
  cavity: "Cavity",
  filled: "Filled",
  missing: "Missing",
  crown: "Crown",
  root_canal: "Root canal",
};
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];

function ToothChart({ chart, onChange }: { chart: Record<string, string>; onChange: (chart: Record<string, string>) => void }) {
  function cycleTooth(tooth: number) {
    const current = chart[tooth] ?? "healthy";
    const nextIndex = (TOOTH_CONDITIONS.indexOf(current as (typeof TOOTH_CONDITIONS)[number]) + 1) % TOOTH_CONDITIONS.length;
    const next = TOOTH_CONDITIONS[nextIndex];
    const updated = { ...chart };
    if (next === "healthy") delete updated[tooth];
    else updated[tooth] = next;
    onChange(updated);
  }

  function ToothButton({ tooth }: { tooth: number }) {
    const condition = chart[tooth] ?? "healthy";
    return (
      <button
        type="button"
        onClick={() => cycleTooth(tooth)}
        className={`flex h-9 w-9 items-center justify-center rounded-lg border text-[11px] font-semibold ${CONDITION_COLORS[condition]}`}
        title={CONDITION_LABELS[condition]}
      >
        {tooth}
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3.5">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Smile size={14} /> Tooth chart</p>
      <p className="text-xs text-muted">Tap a tooth to cycle its condition — a record of what you observed.</p>
      <div className="flex flex-col items-center gap-1">
        <div className="flex gap-1">
          {UPPER_RIGHT.map((t) => (
            <ToothButton key={t} tooth={t} />
          ))}
          <span className="w-2" />
          {UPPER_LEFT.map((t) => (
            <ToothButton key={t} tooth={t} />
          ))}
        </div>
        <div className="flex gap-1">
          {LOWER_RIGHT.map((t) => (
            <ToothButton key={t} tooth={t} />
          ))}
          <span className="w-2" />
          {LOWER_LEFT.map((t) => (
            <ToothButton key={t} tooth={t} />
          ))}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-2">
        {TOOTH_CONDITIONS.filter((c) => c !== "healthy").map((c) => (
          <span key={c} className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${CONDITION_COLORS[c]}`}>
            {CONDITION_LABELS[c]}
          </span>
        ))}
      </div>
    </section>
  );
}

// ─── Vitals panel: plain structured capture, no scoring ────────────────
const VITALS_FIELDS: Record<string, { key: string; label: string; placeholder: string }[]> = {
  cardiology: [
    { key: "bpSystolic", label: "BP — Systolic (mmHg)", placeholder: "120" },
    { key: "bpDiastolic", label: "BP — Diastolic (mmHg)", placeholder: "80" },
    { key: "pulse", label: "Pulse (bpm)", placeholder: "72" },
    { key: "spo2", label: "SpO2 (%)", placeholder: "98" },
  ],
  physiotherapy: [
    { key: "affectedArea", label: "Affected area", placeholder: "e.g. Lower back" },
    { key: "painScale", label: "Patient-reported pain (0-10)", placeholder: "5" },
    { key: "rangeOfMotion", label: "Range of motion notes", placeholder: "e.g. Limited flexion" },
  ],
  orthopedic: [
    { key: "affectedJoint", label: "Affected joint/bone", placeholder: "e.g. Right knee" },
    { key: "mobility", label: "Mobility notes", placeholder: "e.g. Weight-bearing with support" },
    { key: "swelling", label: "Swelling / tenderness", placeholder: "e.g. Mild swelling noted" },
  ],
  ophthalmology: [
    { key: "visualAcuityRight", label: "Visual acuity — Right eye", placeholder: "e.g. 6/6" },
    { key: "visualAcuityLeft", label: "Visual acuity — Left eye", placeholder: "e.g. 6/9" },
    { key: "pinholeTest", label: "Pinhole test result", placeholder: "e.g. Improves to 6/6" },
    { key: "iop", label: "IOP — Intraocular pressure (mmHg)", placeholder: "e.g. 16 / 15" },
    { key: "colorVision", label: "Colour vision", placeholder: "e.g. Normal" },
  ],
  gynecology: [
    { key: "lmp", label: "LMP — Last menstrual period", placeholder: "DD/MM/YYYY" },
    { key: "gravidaPara", label: "Gravida / Para (G/P)", placeholder: "e.g. G2P1" },
    { key: "cycleRegularity", label: "Cycle regularity", placeholder: "e.g. Regular, 28 days" },
  ],
  ent: [
    { key: "ear", label: "Ear examination", placeholder: "e.g. Right — clear, Left — wax" },
    { key: "nose", label: "Nose examination", placeholder: "e.g. Mild congestion" },
    { key: "throat", label: "Throat examination", placeholder: "e.g. Mild redness" },
  ],
  dermatology: [
    { key: "affectedArea", label: "Affected area", placeholder: "e.g. Face, forearms" },
    { key: "lesionType", label: "Lesion type / appearance", placeholder: "e.g. Papules, plaques, scaling" },
    { key: "severity", label: "Severity", placeholder: "e.g. Mild, moderate, severe" },
    { key: "duration", label: "Duration", placeholder: "e.g. 2 weeks" },
  ],
  psychiatry: [
    { key: "mood", label: "Mood", placeholder: "e.g. Low, anxious" },
    { key: "affect", label: "Affect", placeholder: "e.g. Flat, reactive" },
    { key: "sleep", label: "Sleep pattern", placeholder: "e.g. Disturbed, 4-5 hrs" },
    { key: "appetite", label: "Appetite", placeholder: "e.g. Reduced" },
  ],
};

function VitalsPanel({ specialty, vitals, onChange }: { specialty: string; vitals: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const fields = VITALS_FIELDS[specialty] ?? [];
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3.5">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><ClipboardList size={14} /> Vitals & notes</p>
      <p className="text-xs text-muted">Plain record of what you measured/observed — nothing here is auto-scored.</p>
      <div className="grid grid-cols-2 gap-2">
        {fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-xs">
            <span className="text-muted">{f.label}</span>
            <input
              value={vitals[f.key] ?? ""}
              onChange={(e) => onChange({ ...vitals, [f.key]: e.target.value })}
              placeholder={f.placeholder}
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-brand"
            />
          </label>
        ))}
      </div>
    </section>
  );
}
