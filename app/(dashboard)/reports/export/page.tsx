import { requireSession } from "@/lib/auth";
import { ExportClient } from "./ExportClient";

export default async function ExportPage() {
  const session = await requireSession();
  return <ExportClient businessType={session.businessType} />;
}
