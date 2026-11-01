"use server";

import { cookies } from "next/headers";
import { requireSession } from "../auth";
import { UI_COOKIE, newUiAllowed, type UiVersion } from "../uiVersion";

/** Preferences → App look: remembers Classic or New on this device. New is refused
 * for a shop that isn't on the allowlist (lib/uiVersion); Classic is always allowed. */
export async function setUiVersionAction(version: UiVersion): Promise<{ error?: string }> {
  const session = await requireSession();
  if (version !== "classic" && version !== "new") return { error: "Couldn't switch the look — try again." };
  if (version === "new" && !newUiAllowed(session)) return { error: "The new look isn't open for this shop yet." };
  const cookieStore = await cookies();
  cookieStore.set(UI_COOKIE, version, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return {};
}
