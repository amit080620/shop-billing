import { getThermalPrintSettingsAction, getDefaultPrintFormatAction } from "@/lib/actions/settings";
import { requireSession } from "@/lib/auth";
import { ThermalPrintSettingsClient } from "./ThermalPrintSettingsClient";

export default async function ThermalPrintSettingsPage() {
  const [settings, defaultFormat, session] = await Promise.all([getThermalPrintSettingsAction(), getDefaultPrintFormatAction(), requireSession()]);
  // Printers aren't offered to restaurants on the app for now (the owner offers one in person).
  return <ThermalPrintSettingsClient initial={settings} initialDefaultFormat={defaultFormat} offerPrinters={session.businessType !== "restaurant"} />;
}
