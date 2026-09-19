import { getBarcodeScanModeAction } from "@/lib/actions/settings";
import { BarcodeScanModeToggle } from "@/app/components/BarcodeScanModeToggle";
import { PageHeader } from "@/app/components/PageHeader";
import { ScanLine } from "lucide-react";
import { getTranslator } from "@/lib/i18n/server";
import { BackLink } from "@/app/components/BackLink";

export default async function BarcodeSettingsPage() {
  const { t } = await getTranslator();
  const barcodeScanMode = await getBarcodeScanModeAction();

  return (
    <div className="flex flex-col gap-4 pb-6">
      <BackLink fallback="/profile" />
      <PageHeader title={t("Barcode scanning")} icon={<ScanLine size={18} strokeWidth={1.8} />} />

      <BarcodeScanModeToggle initial={barcodeScanMode} />
    </div>
  );
}
