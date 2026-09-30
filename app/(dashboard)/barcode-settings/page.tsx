import { getBarcodeScanModeAction } from "@/lib/actions/settings";
import { BarcodeScanModeToggle } from "@/app/components/BarcodeScanModeToggle";
import { PageHeader } from "@/app/components/PageHeader";
import { ScanLine } from "lucide-react";
import { getTranslator } from "@/lib/i18n/server";
import { BackLink } from "@/app/components/BackLink";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { gapsReady } from "@/lib/gapsData";
import { ScaleSettingsForm } from "./ScaleSettingsForm";

export default async function BarcodeSettingsPage() {
  const { t } = await getTranslator();
  const session = await requireSession();
  const barcodeScanMode = await getBarcodeScanModeAction();
  // Weighing-scale labels (migration 0052).
  const admin = createSupabaseAdminClient();
  const { data: scale } = (await gapsReady(admin))
    ? await admin.from("shops").select("scale_barcode_prefix, scale_barcode_mode, scale_code_digits").eq("id", session.shopId).single()
    : { data: null };

  return (
    <div className="flex flex-col gap-4 pb-6">
      <BackLink fallback="/profile" />
      <PageHeader title={t("Barcode scanning")} icon={<ScanLine size={18} strokeWidth={1.8} />} />

      <BarcodeScanModeToggle initial={barcodeScanMode} />
      {scale && (
        <ScaleSettingsForm
          isOwner={session.role === "owner"}
          initial={{ prefix: scale.scale_barcode_prefix ?? "", mode: scale.scale_barcode_mode === "price" ? "price" : "weight", codeDigits: Number(scale.scale_code_digits) || 5 }}
        />
      )}
    </div>
  );
}
