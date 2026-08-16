import "server-only";
import { cookies } from "next/headers";

export async function getTheme(): Promise<"light" | "dark"> {
  const cookieStore = await cookies();
  return cookieStore.get("theme")?.value === "dark" ? "dark" : "light";
}

export async function getAccent(): Promise<"blue" | "saffron"> {
  const cookieStore = await cookies();
  return cookieStore.get("accent")?.value === "saffron" ? "saffron" : "blue";
}

export async function getTextColor(): Promise<"default" | "navy" | "charcoal" | "slate"> {
  const cookieStore = await cookies();
  const v = cookieStore.get("textColor")?.value;
  return v === "navy" || v === "charcoal" || v === "slate" ? v : "default";
}
