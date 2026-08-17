import "server-only";
import { cookies } from "next/headers";
import { translate, interpolate, type Lang } from "./dictionary";

export async function getLang(): Promise<Lang> {
  const cookieStore = await cookies();
  const value = cookieStore.get("lang")?.value;
  if (value === "hi" || value === "mr") return value;
  return "en";
}

/** Server Component translator — usage: const { lang, t } = await getTranslator(); */
export async function getTranslator() {
  const lang = await getLang();
  return {
    lang,
    t: (key: string, values?: Record<string, string | number>) =>
      values ? interpolate(translate(lang, key), values) : translate(lang, key),
  };
}
