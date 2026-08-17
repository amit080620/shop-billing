import { requireSession } from "@/lib/auth";
import { MenuScanClient } from "./MenuScanClient";

export default async function MenuScanPage() {
  await requireSession();
  return <MenuScanClient />;
}
