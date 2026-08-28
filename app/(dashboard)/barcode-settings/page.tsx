import Link from "next/link";
import { getBarcodeScanModeAction } from "@/lib/actions/settings";
import { BarcodeScanModeToggle } from "@/app/components/BarcodeScanModeToggle";
import { PageHeader } from "@/app/components/PageHeader";
import { ScanLine } from "lucide-react";

export default async function BarcodeSettingsPage() {
  const barcodeScanMode = await getBarcodeScanModeAction();

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader title="Barcode scanning" icon={<ScanLine size={18} strokeWidth={1.8} />} />
      <Link href="/profile" className="text-sm text-muted">
        ← Profile
      </Link>

      <BarcodeScanModeToggle initial={barcodeScanMode} />
    </div>
  );
}
