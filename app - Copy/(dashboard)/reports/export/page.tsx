import { requireSession } from "@/lib/auth";
import { ExportClient } from "./ExportClient";

export default async function ExportPage() {
  await requireSession();
  return <ExportClient />;
}
