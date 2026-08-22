import Link from "next/link";
import { listMedicineLibraryAction } from "@/lib/actions/clinic";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { Pill } from "lucide-react";
import { MedicineLibraryClient } from "./MedicineLibraryClient";

export default async function MedicineLibraryPage() {
  const medicines = await listMedicineLibraryAction();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Medicine library" icon={<Pill size={18} strokeWidth={1.8} />} />
      <Link href="/clinic" className="text-sm text-muted">
        ← Clinic
      </Link>
      <p className="text-xs text-muted">
        Every medicine you&apos;ve typed into a prescription is genuinely saved here — pick it from the search box
        next time instead of typing the full name again.
      </p>

      {medicines.length === 0 ? (
        <EmptyState text="No medicines saved yet — they'll genuinely appear here the first time you write a prescription." />
      ) : (
        <MedicineLibraryClient medicines={medicines} />
      )}
    </div>
  );
}
