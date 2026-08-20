import { requireSession } from "@/lib/auth";
import { CaExportClient } from "./CaExportClient";

export default async function CaExportPage() {
  await requireSession();
  return <CaExportClient />;
}
