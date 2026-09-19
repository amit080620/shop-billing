import { PageHeader } from "@/app/components/PageHeader";
import { AlertOctagon } from "lucide-react";
import { ProfitLeakClient } from "./ProfitLeakClient";
import { getTranslator } from "@/lib/i18n/server";

export default async function ProfitLeakPage() {
  const { t } = await getTranslator();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={<AlertOctagon size={18} strokeWidth={1.8} />} title={t("Profit leaks")} subtitle="Where your money is stuck right now" />
      <ProfitLeakClient />
    </div>
  );
}
