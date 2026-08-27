import { getThermalPrintSettingsAction } from "@/lib/actions/settings";
import { ThermalPrintSettingsClient } from "./ThermalPrintSettingsClient";

export default async function ThermalPrintSettingsPage() {
  const settings = await getThermalPrintSettingsAction();
  return <ThermalPrintSettingsClient initial={settings} />;
}
