"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createPrescriptionAction,
  saveMedicinesToLibraryAction,
  getMedicineLibraryAction,
  savePrescriptionTemplateAction,
  listPrescriptionTemplatesAction,
  applyPrescriptionTemplateAction,
  deletePrescriptionTemplateAction,
  getQuickPhrasesAction,
  saveQuickPhrasesAction,
  type PrescriptionItemInput,
} from "@/lib/actions/clinic";
import { PageHeader } from "@/app/components/PageHeader";
import { PhoneInput } from "@/app/components/PhoneInput";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { COMMON_MEDICINE_NAMES } from "@/lib/constants/commonMedicines";
import type { Lang } from "@/lib/i18n/dictionary";
import { FileText, ClipboardList } from "lucide-react";
import { ToothChart, type ToothChartData } from "@/app/components/ToothChart";
import { todayIso } from "@/lib/dateHelpers";

type Patient = { id: string; name: string; phone: string; dateOfBirth: string | null; gender: string | null };
type MedicineRow = PrescriptionItemInput & {
  key: string;
  composition?: string;
  packSizeLabel?: string;
  medicineType?: string;
  sideEffects?: string;
  description?: string;
  showFullDetails?: boolean;
};

const FREQUENCY_PRESETS = ["1-0-0", "0-1-0", "0-0-1", "1-0-1", "1-1-1", "1-1-0", "SOS"];
const INSTRUCTION_PRESETS = ["Before food", "After food", "With food", "Empty stomach", "At bedtime"];

function newMedicineRow(): MedicineRow {
  return {
    key: Math.random().toString(36).slice(2),
    medicineName: "",
    dosage: "",
    frequency: "",
    duration: "",
    instructions: "",
    quantity: undefined,
    composition: "",
    packSizeLabel: "",
    medicineType: "",
    sideEffects: "",
    description: "",
    showFullDetails: false,
  };
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
  const [dentalChart, setDentalChart] = useState<ToothChartData>({});
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
  const [shopMedicineLibrary, setShopMedicineLibrary] = useState<string[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string; usageCount: number }[]>([]);
  const [quickPhrases, setQuickPhrases] = useState<Record<string, string[]>>({});
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // Genuinely load this shop's own saved templates once on mount —
  // tap one to instantly prefill Chief Complaint, Diagnosis, Advice
  // and the whole medicine list for a common case like "Fever".
  useEffect(() => {
    listPrescriptionTemplatesAction()
      .then(setTemplates)
      .catch((err) => console.error("Genuinely could not load prescription templates", err));
  }, []);

  // Genuinely load quick-tap phrase suggestions for every text field
  // on this Rx pad (Chief Complaint, Diagnosis, Advice, and any
  // specialty-specific custom fields) — grows automatically over time
  // as the doctor types, no extra effort required.
  useEffect(() => {
    Promise.all(fieldLabels.map((label) => getQuickPhrasesAction(label).then((phrases) => [label, phrases] as const)))
      .then((entries) => setQuickPhrases(Object.fromEntries(entries)))
      .catch((err) => console.error("Genuinely could not load quick phrases", err));
  }, [fieldLabels]);

  function applyTemplate(templateId: string) {
    startTransition(async () => {
      const template = await applyPrescriptionTemplateAction(templateId);
      if (!template) return;
      setSections((prev) =>
        prev.map((s) => {
          if (s.label === "Chief Complaint") return { ...s, value: template.chiefComplaint };
          if (s.label === "Diagnosis") return { ...s, value: template.diagnosis };
          if (s.label === "Advice") return { ...s, value: template.advice };
          const matchInTemplate = template.customSections.find((cs) => cs.label === s.label);
          return matchInTemplate ? { ...s, value: matchInTemplate.value } : s;
        }),
      );
      if (template.medicines.length > 0) {
        setMedicines(
          template.medicines.map((m) => ({
            key: Math.random().toString(36).slice(2),
            medicineName: m.medicineName,
            dosage: m.dosage,
            frequency: m.frequency,
            duration: m.duration,
            instructions: m.instructions,
            quantity: undefined,
          })),
        );
      }
    });
  }

  function saveAsTemplate() {
    if (!templateName.trim()) return;
    setIsSavingTemplate(true);
    startTransition(async () => {
      const chiefComplaint = sections.find((s) => s.label === "Chief Complaint")?.value ?? "";
      const diagnosis = sections.find((s) => s.label === "Diagnosis")?.value ?? "";
      const advice = sections.find((s) => s.label === "Advice")?.value ?? "";
      const otherSections = sections.filter((s) => !["Chief Complaint", "Diagnosis", "Advice"].includes(s.label));
      const result = await savePrescriptionTemplateAction({
        name: templateName,
        chiefComplaint,
        diagnosis,
        advice,
        customSections: otherSections,
        medicines: medicines
          .filter((m) => m.medicineName.trim())
          .map((m) => ({
            medicineName: m.medicineName,
            dosage: m.dosage ?? "",
            frequency: m.frequency ?? "",
            duration: m.duration ?? "",
            instructions: m.instructions ?? "",
          })),
      });
      setIsSavingTemplate(false);
      if (!result.error) {
        setShowSaveTemplate(false);
        setTemplateName("");
        listPrescriptionTemplatesAction().then(setTemplates);
      }
    });
  }

  // Genuinely load this shop's own growing medicine library once on
  // mount — any medicine typed before is available for one-tap
  // selection, no need to type the full name again.
  useEffect(() => {
    getMedicineLibraryAction()
      .then((r) => setShopMedicineLibrary(r.names))
      .catch((err) => console.error("Genuinely could not load the shop's medicine library", err));
  }, []);

  // The shop's own history genuinely comes first (most relevant, since
  // it reflects what THIS shop actually prescribes), followed by the
  // generic starter list for anything not seen yet.
  const medicineSuggestions = [...new Set([...shopMedicineLibrary, ...COMMON_MEDICINE_NAMES])];

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
      // Genuinely grow the quick-phrase library for every filled field
      // (Chief Complaint, Diagnosis, Advice, etc.) — awaited for the
      // same reason as the medicine library save below.
      try {
        await saveQuickPhrasesAction(sections.filter((s) => s.value.trim()));
      } catch (err) {
        console.error("Genuinely could not save quick phrases", err);
      }
      // Genuinely grow the shop's medicine library — any name typed
      // here becomes a one-tap suggestion on every future prescription.
      // Genuinely awaited — without this, the immediate page navigation
      // right after could cancel the save request mid-flight before it
      // ever reached the database.
      const usedMedicines = medicines
        .filter((m) => m.medicineName.trim())
        .map((m) => ({
          name: m.medicineName.trim(),
          composition: m.composition?.trim() || undefined,
          packSizeLabel: m.packSizeLabel?.trim() || undefined,
          medicineType: m.medicineType?.trim() || undefined,
          sideEffects: m.sideEffects?.trim() || undefined,
          description: m.description?.trim() || undefined,
        }));
      if (usedMedicines.length > 0) {
        try {
          await saveMedicinesToLibraryAction(usedMedicines);
        } catch (err) {
          console.error("Genuinely could not save medicines to the library", err);
        }
      }
      router.push(`/print/prescription/${result.prescriptionId}`);
    });
  }

  return (
    <div className="flex flex-col gap-3 pb-6">
      <PageHeader
        title="New prescription"
        icon={<FileText size={18} strokeWidth={1.8} />}
      />
      <Link href="/clinic" className="text-sm text-muted">
        ← Clinic
      </Link>

      {templates.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted">Use a template</p>
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <span
                key={t.id}
                className="flex items-center gap-1 rounded-full border border-brand bg-brand-soft pl-3 pr-1.5 py-1 text-xs font-medium text-brand-text"
              >
                <button type="button" onClick={() => applyTemplate(t.id)} disabled={isPending} className="disabled:opacity-60">
                  {t.name}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTemplates((prev) => prev.filter((x) => x.id !== t.id));
                    deletePrescriptionTemplateAction(t.id).catch((err) => console.error("Genuinely could not delete template", err));
                  }}
                  className="rounded-full px-1 text-brand-text/60 hover:text-danger"
                  aria-label={`Delete ${t.name} template`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

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
          <PhoneInput value={patientPhone} onChange={setPatientPhone} />
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

      {patientName.trim() && (
        <Link
          href={`/clinic/treatment-plans/new?patientId=${selectedPatient?.id ?? ""}&patientName=${encodeURIComponent(patientName)}&patientPhone=${encodeURIComponent(patientPhone)}&doctorName=${encodeURIComponent(doctorName)}`}
          className="flex items-center justify-between rounded-xl border border-brand bg-brand-soft px-4 py-3 text-sm font-medium text-brand-text"
          style={{ boxShadow: "-3px -3px 8px var(--neu-light), 3px 3px 8px var(--neu-dark)" }}
        >
          <span>+ Give {patientName} a treatment plan / quotation</span>
          <span>→</span>
        </Link>
      )}

      {/* Custom Rx sections — fully driven by clinic settings, no hard limit */}
      {sections.map((section, i) => (
        <label key={i} className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{section.label}</span>
          {(quickPhrases[section.label]?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1">
              {quickPhrases[section.label]!.map((phrase, pi) => (
                <button
                  key={pi}
                  type="button"
                  onClick={() => updateSection(i, phrase)}
                  className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted hover:border-brand hover:text-brand-text"
                >
                  {phrase}
                </button>
              ))}
            </div>
          )}
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
                  items={medicineSuggestions}
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
                    med.frequency === f ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
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
                    med.instructions === p ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
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

            <button
              type="button"
              onClick={() => updateMedicine(med.key, { showFullDetails: !med.showFullDetails })}
              className="self-start text-xs font-medium text-brand"
            >
              {med.showFullDetails ? "− Hide" : "+ Add"} full details (composition, pack, side effects…)
            </button>

            {med.showFullDetails && (
              <div className="flex flex-col gap-1.5 rounded-lg bg-background p-2">
                <input
                  value={med.composition ?? ""}
                  onChange={(e) => updateMedicine(med.key, { composition: e.target.value })}
                  placeholder="Composition (e.g. Albendazole (200mg))"
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={med.packSizeLabel ?? ""}
                    onChange={(e) => updateMedicine(med.key, { packSizeLabel: e.target.value })}
                    placeholder="Pack (e.g. bottle of 10 ml Syrup)"
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                  />
                  <input
                    value={med.medicineType ?? ""}
                    onChange={(e) => updateMedicine(med.key, { medicineType: e.target.value })}
                    placeholder="Type (e.g. allopathy)"
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                  />
                </div>
                <input
                  value={med.sideEffects ?? ""}
                  onChange={(e) => updateMedicine(med.key, { sideEffects: e.target.value })}
                  placeholder="Side effects"
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                />
                <textarea
                  value={med.description ?? ""}
                  onChange={(e) => updateMedicine(med.key, { description: e.target.value })}
                  placeholder="About this medicine (optional)"
                  rows={2}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                />
                <p className="text-[10px] text-muted">These genuinely save to your medicine library, so you never need to type them again.</p>
              </div>
            )}
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

      {showSaveTemplate ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
          <p className="text-sm font-medium text-foreground">Save this as a template</p>
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g. Fever, Viral, Cold"
            autoFocus
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowSaveTemplate(false)}
              className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveAsTemplate}
              disabled={isSavingTemplate || !templateName.trim()}
              className="btn-primary flex-1 disabled:opacity-40"
            >
              {isSavingTemplate ? "Saving…" : "Save template"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowSaveTemplate(true)}
          className="self-start text-sm font-medium text-brand"
        >
          + Save as template for next time
        </button>
      )}

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
