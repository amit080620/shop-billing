import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { homePathFor } from "@/lib/businessType";
import { LandingPage } from "./LandingPage";

/** The app's front door. A shop opens the app dozens of times a day to do
 * one thing — make a sale — so a logged-in owner goes straight to that
 * business's sale screen. The full dashboard is one tap away at /dashboard.
 *
 * A logged-OUT visitor is a different person entirely — someone who's
 * never seen the product, following a shared link — so they see actual
 * marketing content here instead of every other route's bare redirect to
 * /login. That gap (nothing on the domain explained what this even was
 * before asking for a password) was a real reason shared links converted
 * nobody.
 *
 * Deliberately outside the (dashboard) route group: that group has a
 * loading.tsx, so the layout streamed before a redirect from in there ran,
 * turning it into a client-side redirect that crashed the Next.js router
 * (React error #310) on every login. Here nothing streams first, so the
 * logged-in path is a plain 307. */
export default async function AppEntryPage() {
  const user = await getAuthenticatedUser();
  if (!user) return <LandingPage />;

  const session = await requireSession();
  redirect(homePathFor(session.businessType, session.fastBillingEnabled));
}
