import "server-only";
import { cookies } from "next/headers";

export async function getTheme(): Promise<"light" | "dark" | "auto"> {
  const cookieStore = await cookies();
  const v = cookieStore.get("theme")?.value;
  if (v === "dark" || v === "auto") return v;
  return "light";
}

/** Floating calculator — defaults ON since it's a genuinely useful
 * everyday shop tool (checking change, quick math while someone's
 * mid-purchase), toggleable off in Preferences for anyone who'd
 * rather not have the bubble on screen. */
export async function getCalculatorEnabled(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("calc")?.value !== "off";
}

/** AI shop assistant — same default-on reasoning as the calculator. */
export async function getAssistantEnabled(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("assistant")?.value !== "off";
}

/** Lite Mode — speed over looks, for older phones and slow networks: no shadows, blur, animations
 * or sounds, the system font, a plain login screen and simple bars instead of the chart library.
 * Auto by default: switched on by itself on a phone with little memory, few cores, data saver or
 * a 2G/3G connection. */
export async function getLiteMode(): Promise<boolean> {
  const setting = await getLiteSetting();
  if (setting !== "auto") return setting === "on";
  const cookieStore = await cookies();
  // Auto: the little script in the root layout checks the phone (memory, cores, network) on every
  // visit and leaves its answer here.
  return cookieStore.get("lite_auto")?.value === "1";
}

/** What the owner chose in Preferences: Auto (the default — on for older phones and slow
 * networks), always On, or always Off. */
export async function getLiteSetting(): Promise<"auto" | "on" | "off"> {
  const cookieStore = await cookies();
  const v = cookieStore.get("lite_mode")?.value;
  return v === "on" || v === "off" ? v : "auto";
}
