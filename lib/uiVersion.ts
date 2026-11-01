import "server-only";
import { cookies } from "next/headers";
import { isDemoEmail } from "@/lib/demo/config";

/** The app's two looks: Classic, which every shop has, and New — the redesign
 * (THERAY_FINAL_DESIGN) being tried on a few chosen shops first. Same pages, same
 * data and actions; only the presentation differs. */
export type UiVersion = "classic" | "new";

/** Which look this device asked for. Only a preference: it never opens the New look
 * by itself — the shop has to be on the allowlist too. */
export const UI_COOKIE = "ray-ui";

/** Shops allowed to try the New look. NEW_UI_SHOPS is a comma-separated list of
 * shop ids; the word "demo" lets the demo shops in. Unset or empty (the default):
 * no shop at all. */
export function newUiAllowed(
  shop: { shopId: string; email: string | null },
  list: string = process.env.NEW_UI_SHOPS ?? "",
): boolean {
  const entries = list.split(",").map((s) => s.trim()).filter(Boolean);
  if (entries.includes(shop.shopId)) return true;
  return entries.includes("demo") && isDemoEmail(shop.email);
}

/** New only when the shop is allowed AND this device chose it. */
export function resolveUi(allowed: boolean, cookie: string | undefined): UiVersion {
  return allowed && cookie === "new" ? "new" : "classic";
}

/** The look for this request. A shop that isn't allowed is Classic without the
 * cookie even being read. */
export async function getUiVersion(shop: { shopId: string; email: string | null }): Promise<UiVersion> {
  if (!newUiAllowed(shop)) return "classic";
  const cookieStore = await cookies();
  return resolveUi(true, cookieStore.get(UI_COOKIE)?.value);
}
