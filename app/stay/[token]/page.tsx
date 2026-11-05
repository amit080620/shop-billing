import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { todayIso } from "@/lib/dateHelpers";
import { addDays } from "@/lib/hotel/dates";
import { hotelForToken } from "@/lib/hotel/publicStay";
import { StayClient } from "./StayClient";

export const metadata = { title: "Book your stay", robots: { index: false } };

/** A hotel's own booking page, on a link it shares. No commission: the guest's request goes to its desk. */
export default async function StayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const hotel = await hotelForToken(createSupabaseAdminClient(), token);
  if (!hotel) notFound();
  const today = todayIso();
  return <StayClient token={token} name={hotel.name} logoUrl={hotel.logoUrl} city={hotel.city} phone={hotel.phone} about={hotel.about} policies={hotel.policies} today={today} tomorrow={addDays(today, 1)} />;
}
