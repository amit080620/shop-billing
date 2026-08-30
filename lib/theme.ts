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
