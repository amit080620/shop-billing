"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createLabOrderAction } from "@/lib/actions/lab";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import type { Lang } from "@/lib/i18n/dictionary";
import { FlaskConical } from "lucide-react";

type Test = { id: string; name: string; price: number; sampleType: string };
type Package = { id: string; name: string; price: number };
type Patient = { id: string; name: string; phone: string };

export function NewOrderClient({
  lang,
  tests,
  packages,
  patients,
  staff,
}: {
  lang: Lang;
  tests: Test[];
  packages: Package[];
  patients: Patient[];
  staff: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [referringDoctorName, setReferringDoctorName] = useState("");
  const [collectionType, setCollectionType] = useState<"walk_in" | "home_collection">("walk_in");
  const [homeAddress, setHomeAddress] = useState("");
  const [collectionSlot, setCollectionSlot] = useState("");
  const [phlebotomistId, setPhlebotomistId] = useState("");
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [selectedPackageIds, setSelectedPackageIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const testsTotal = tests.filter((t) => selectedTestIds.includes(t.id)).reduce((s, t) => s + t.price, 0);
  const packagesTotal = packages.filter((p) => selectedPackageIds.includes(p.id)).reduce((s, p) => s + p.price, 0);
  const total = testsTotal + packagesTotal;

  function toggleTest(id: string) {
    setSelectedTestIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }
  function togglePackage(id: string) {
    setSelectedPackageIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  function submit() {
    startTransition(async () => {
      const result = await createLabOrderAction({
        patientId: selectedPatient?.id ?? null,
        patientName,
        patientPhone,
        patientAge,
        patientGender,
        referringDoctorName,
        collectionType,
        homeAddress,
        collectionSlot,
        phlebotomistId: phlebotomistId || null,
        testIds: selectedTestIds,
        packageIds: selectedPackageIds,
      });
      if (result.error || !result.orderId) {
        setError(result.error ?? "Could not create order");
        return;
      }
      router.push(`/lab/orders/${result.orderId}`);
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title="New order"
        icon={<FlaskConical size={18} strokeWidth={1.8} />}
      />
      <Link href="/lab/orders" className="text-sm text-muted">
        ← Orders
      </Link>

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
          }}
          placeholder="Search existing patient, or just type below for a new one"
        />
        <div className="grid grid-cols-2 gap-2">
          <input value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="Name" className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
          <input value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} placeholder="Phone" className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
          <input value={patientAge} onChange={(e) => setPatientAge(e.target.value)} placeholder="Age" className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
          <select value={patientGender} onChange={(e) => setPatientGender(e.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand">
            <option value="">Gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
        <input value={referringDoctorName} onChange={(e) => setReferringDoctorName(e.target.value)} placeholder="Referring doctor (optional)" className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Collection</p>
        <div className="flex gap-2">
          <button
            onClick={() => setCollectionType("walk_in")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${collectionType === "walk_in" ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"}`}
          >
            🚶 Walk-in
          </button>
          <button
            onClick={() => setCollectionType("home_collection")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${collectionType === "home_collection" ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"}`}
          >
            🏠 Home collection
          </button>
        </div>
        {collectionType === "home_collection" && (
          <textarea value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} placeholder="Full address for sample collection" rows={2} className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
        )}
        <div className="grid grid-cols-2 gap-2">
          <input value={collectionSlot} onChange={(e) => setCollectionSlot(e.target.value)} placeholder="Preferred time slot (e.g. 8-9 AM)" className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
          <select value={phlebotomistId} onChange={(e) => setPhlebotomistId(e.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand">
            <option value="">Assign staff (optional)</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Packages</p>
        <div className="flex flex-col gap-1.5">
          {packages.map((p) => (
            <label key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={selectedPackageIds.includes(p.id)} onChange={() => togglePackage(p.id)} className="h-4 w-4 rounded border-border" />
                {p.name}
              </span>
              <span className="text-muted">{formatMoney(p.price)}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Individual tests</p>
        <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
          {tests.map((t) => (
            <label key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={selectedTestIds.includes(t.id)} onChange={() => toggleTest(t.id)} className="h-4 w-4 rounded border-border" />
                {t.name}
              </span>
              <span className="text-muted">{formatMoney(t.price)}</span>
            </label>
          ))}
        </div>
      </section>

      {total > 0 && (
        <div className="flex justify-between rounded-lg bg-brand-soft px-3.5 py-2.5 text-sm">
          <span className="text-brand-dark">Total</span>
          <span className="font-semibold text-brand-dark">{formatMoney(total)}</span>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      <button onClick={submit} disabled={isPending || total === 0} className="btn-primary w-full text-center disabled:opacity-60">
        {isPending ? "Creating…" : "Create order"}
      </button>
    </div>
  );
}
