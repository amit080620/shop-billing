import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { garmentGate } from "../gate";
import { GarmentImportClient } from "./GarmentImportClient";

/** The garment shop's bulk upload and export: its own Excel file of styles, colours and sizes. */
export default async function GarmentImportPage() {
  const gate = await garmentGate("bulk_import_export");
  if ("blocked" in gate) return gate.blocked;
  const { t } = gate;
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment" />
      <PageHeader title={t("Bulk upload and export")} subtitle={t("Your styles, colours and sizes in one Excel file")} icon={<FileSpreadsheet size={18} strokeWidth={1.8} />} />
      <GarmentImportClient />
    </div>
  );
}
