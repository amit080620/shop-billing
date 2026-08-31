import { PageHeader } from "@/app/components/PageHeader";
import { History } from "lucide-react";
import { SalesHistoryImportClient } from "./SalesHistoryImportClient";

export default function ImportSalesHistoryPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={<History size={18} strokeWidth={1.8} />} title="Import old sales register" subtitle="Photograph your paper sales book — AI reads every past sale, free" />
      <SalesHistoryImportClient />
    </div>
  );
}
