import { requireSession } from "@/lib/auth";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { isModuleEnabled } from "@/lib/modules";
import { CaExportClient } from "./CaExportClient";

export default async function CaExportPage() {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "advanced_reports")) return <ModuleBlocked moduleKey="advanced_reports" />;
  return <CaExportClient />;
}
