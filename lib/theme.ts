import "server-only";
import { cookies } from "next/headers";

export async function getTheme(): Promise<"light" | "dark" | "auto"> {
  const cookieStore = await cookies();
  const v = cookieStore.get("theme")?.value;
  if (v === "dark" || v === "auto") return v;
  return "light";
}
