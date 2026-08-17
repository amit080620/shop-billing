import { requireSession } from "@/lib/auth";
import { MenuPdfClient } from "./MenuPdfClient";

export default async function MenuPdfPage() {
  await requireSession();
  return <MenuPdfClient />;
}
