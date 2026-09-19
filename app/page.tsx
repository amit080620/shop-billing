import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { homePathFor } from "@/lib/businessType";

/** The app's front door. A shop opens the app dozens of times a day to do
 * one thing — make a sale — so it goes straight to that business's sale
 * screen. The full dashboard is one tap away at /dashboard.
 *
 * Deliberately outside the (dashboard) route group: that group has a
 * loading.tsx, so the layout streamed before this redirect ran, turning it
 * into a client-side redirect that crashed the Next.js router (React error
 * #310) on every login. Here nothing streams first, so it's a plain 307. */
export default async function AppEntryPage() {
  const session = await requireSession();
  redirect(homePathFor(session.businessType, session.fastBillingEnabled));
}
