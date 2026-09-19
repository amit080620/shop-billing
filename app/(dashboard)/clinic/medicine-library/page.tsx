import { listMedicineLibraryAction } from "@/lib/actions/clinic";
import { PageHeader } from "@/app/components/PageHeader";
import { Pill } from "lucide-react";
import { MedicineLibraryClient } from "./MedicineLibraryClient";
import { getTranslator } from "@/lib/i18n/server";
import { BackLink } from "@/app/components/BackLink";

export default async function MedicineLibraryPage() {
  const { t } = await getTranslator();
  const medicines = await listMedicineLibraryAction();

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/clinic" />
      <PageHeader title={t("Medicine library")} icon={<Pill size={18} strokeWidth={1.8} />} />
      <p className="text-xs text-muted">
        Every medicine you&apos;ve typed into a prescription is genuinely saved here — pick it from the search box
        next time instead of typing the full name again.
      </p>

      <MedicineLibraryClient medicines={medicines} />
    </div>
  );
}
