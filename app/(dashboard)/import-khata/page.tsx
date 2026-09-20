import { PageHeader } from "@/app/components/PageHeader";
import { BookOpenCheck } from "lucide-react";
import { KhataImportClient } from "./KhataImportClient";
import { getTranslator } from "@/lib/i18n/server";
import { BackLink } from "@/app/components/BackLink";

export default async function ImportKhataPage() {
  const { t } = await getTranslator();
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/dashboard" />
      <PageHeader icon={<BookOpenCheck size={18} strokeWidth={1.8} />} title={t("Import old khata")} subtitle="Digitize your paper account book — free, uses AI" />
      <KhataImportClient />
    </div>
  );
}
