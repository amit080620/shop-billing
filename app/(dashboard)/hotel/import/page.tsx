import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { isModuleEnabled } from "@/lib/modules";
import { isoDaysAgo, todayIso } from "@/lib/dateHelpers";
import { hotelSchemaReady } from "@/lib/hotel/server";
import { HotelSetupNotice } from "../HotelSetupNotice";
import { HotelImportClient } from "./HotelImportClient";

/** The hotel's bulk upload and export: rooms and bookings in its own Excel file. It works before
 * migration 0065 too, so this page doesn't wait for that. */
export default async function HotelImportPage() {
  const session = await requireSession();
  const { t } = await getTranslator();
  if (!(await hotelSchemaReady(createSupabaseAdminClient()))) return <HotelSetupNotice />;
  if (!isModuleEnabled(session.enabledModules, "bulk_import_export")) return <ModuleBlocked moduleKey="bulk_import_export" />;
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/hotel" />
      <PageHeader title={t("Hotel import / export")} subtitle={t("Rooms and bookings in Excel")} icon={<FileSpreadsheet size={18} strokeWidth={1.8} />} />
      <HotelImportClient from={isoDaysAgo(29)} to={todayIso()} />
    </div>
  );
}
