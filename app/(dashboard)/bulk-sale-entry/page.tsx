import { PageHeader } from "@/app/components/PageHeader";
import { Rows3 } from "lucide-react";
import { BulkSaleEntryClient } from "./BulkSaleEntryClient";
import { getTranslator } from "@/lib/i18n/server";

export default async function BulkSaleEntryPage() {
  const { t } = await getTranslator();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={<Rows3 size={18} strokeWidth={1.8} />} title={t("Bulk sale entry")} subtitle="Fast, spreadsheet-style entry for several sales at once" />
      <BulkSaleEntryClient />
    </div>
  );
}
