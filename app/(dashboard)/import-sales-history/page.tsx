import { PageHeader } from "@/app/components/PageHeader";
import { History } from "lucide-react";
import { SalesHistoryImportClient } from "./SalesHistoryImportClient";
import { getTranslator } from "@/lib/i18n/server";
import { BackLink } from "@/app/components/BackLink";

export default async function ImportSalesHistoryPage() {
  const { t } = await getTranslator();
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/dashboard" />
      <PageHeader icon={<History size={18} strokeWidth={1.8} />} title={t("Import old sales register")} subtitle="Photograph your paper sales book — AI reads every past sale, free" />
      <SalesHistoryImportClient />
    </div>
  );
}
