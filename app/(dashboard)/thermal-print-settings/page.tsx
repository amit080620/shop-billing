import { getThermalPrintSettingsAction, getDefaultPrintFormatAction } from "@/lib/actions/settings";
import { ThermalPrintSettingsClient } from "./ThermalPrintSettingsClient";

export default async function ThermalPrintSettingsPage() {
  const [settings, defaultFormat] = await Promise.all([getThermalPrintSettingsAction(), getDefaultPrintFormatAction()]);
  return <ThermalPrintSettingsClient initial={settings} initialDefaultFormat={defaultFormat} />;
}
