import "server-only";
import { cookies } from "next/headers";

export async function getTheme(): Promise<"light" | "dark" | "auto"> {
  const cookieStore = await cookies();
  const v = cookieStore.get("theme")?.value;
  if (v === "dark" || v === "auto") return v;
  return "light";
}

export async function getAccent(): Promise<"blue" | "copper" | "gold" | "purple" | "coral"> {
  const cookieStore = await cookies();
  const v = cookieStore.get("accent")?.value;
  return v === "copper" || v === "gold" || v === "purple" || v === "coral" ? v : "blue";
}

export async function getTextColor(): Promise<"default" | "navy" | "charcoal" | "slate"> {
  const cookieStore = await cookies();
  const v = cookieStore.get("textColor")?.value;
  return v === "navy" || v === "charcoal" || v === "slate" ? v : "default";
}
