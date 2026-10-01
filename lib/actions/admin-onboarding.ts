"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "../admin-auth";
import { ONBOARDING_STEPS } from "../onboarding";
import { updateOnboardingEntry } from "../onboardingData";

const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

/** Ticks or unticks one step of a shop's set-up checklist. */
export async function setOnboardingTickAction(shopId: string, stepId: string, done: boolean): Promise<{ error?: string }> {
  await requireSuperAdmin();
  if (!ONBOARDING_STEPS.some((s) => s.id === stepId)) return { error: "Unknown step" };
  try {
    await updateOnboardingEntry(shopId, (e) => {
      const ticks = { ...e.ticks };
      if (done) ticks[stepId] = today();
      else delete ticks[stepId];
      return { ...e, ticks };
    });
  } catch (e) {
    return { error: `Could not save: ${(e as Error).message}` };
  }
  revalidatePath(`/admin/shops/${shopId}`);
  revalidatePath("/admin");
  return {};
}

/** The team's running note on the shop: feedback, what's missing, what was promised. */
export async function saveOnboardingNoteAction(shopId: string, note: string): Promise<{ error?: string }> {
  await requireSuperAdmin();
  try {
    await updateOnboardingEntry(shopId, (e) => ({ ...e, note: note.slice(0, 4000) }));
  } catch (e) {
    return { error: `Could not save: ${(e as Error).message}` };
  }
  revalidatePath(`/admin/shops/${shopId}`);
  return {};
}
