import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** The app's genuine front door. A shop owner opens this app dozens of
 * times a day almost always to do ONE thing — make a bill — so that's
 * what they should see immediately, not a dashboard full of stats,
 * calendars and festival reminders. The full dashboard still exists
 * (at /dashboard, one tap away via the menu) for whenever someone
 * genuinely wants the bigger picture. */
export default async function AppEntryPage() {
  const session = await requireSession();

  if (session.businessType === "restaurant") {
    redirect("/restaurant");
  }

  const admin = createSupabaseAdminClient();
  const { data: shop } = await admin.from("shops").select("fast_billing_enabled").eq("id", session.shopId).single();

  if (shop?.fast_billing_enabled) {
    redirect("/fast-billing");
  }

  redirect("/bills/new");
}
