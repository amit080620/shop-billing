import { PageHeader } from "@/app/components/PageHeader";
import { Rows3 } from "lucide-react";
import { BulkSaleEntryClient } from "./BulkSaleEntryClient";

export default function BulkSaleEntryPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={<Rows3 size={18} strokeWidth={1.8} />} title="Bulk sale entry" subtitle="Fast, spreadsheet-style entry for several sales at once" />
      <BulkSaleEntryClient />
    </div>
  );
}
