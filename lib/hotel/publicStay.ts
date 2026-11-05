import { createSupabaseAdminClient } from "../supabase/admin";
import { isModuleEnabled } from "../modules";
import { effectivePlan, modulesForPlan } from "../plans";
import { todayIso } from "../dateHelpers";
import { addDays } from "./dates";
import { availabilityByType } from "./availability";
import { hotelSchemaReady, loadActiveBookedRooms, loadInventory, toRoomLite } from "./server";
import { hotelOpsReady, loadRateRules, loose, quotesForStay } from "./ops";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type PublicHotel = { shopId: string; token: string; name: string; logoUrl: string | null; city: string | null; phone: string | null; about: string | null; policies: string | null };

/** The hotel behind a booking link, while its page is switched on and its plan includes it. */
export async function hotelForToken(admin: Admin, token: string): Promise<PublicHotel | null> {
  if (!token || token.length > 64 || !(await hotelSchemaReady(admin)) || !(await hotelOpsReady(admin))) return null;
  const { data: page } = await loose(admin).from("hotel_public_pages").select("shop_id, token, is_enabled, about, policies, contact_phone").eq("token", token).maybeSingle();
  if (!page?.is_enabled) return null;
  const { data: found } = await admin.from("shops").select("*").eq("id", page.shop_id).maybeSingle();
  const shop = found as unknown as { name: string; business_type: string; logo_url: string | null; city: string | null; plan?: string | null; subscription_valid_until?: string | null; trial_ends_at?: string | null; enabled_modules?: string[] | null } | null;
  if (!shop || shop.business_type !== "hotel") return null;
  const modules = "plan" in shop ? modulesForPlan(effectivePlan(shop).key, shop.enabled_modules ?? null) : (shop.enabled_modules ?? null);
  if (!isModuleEnabled(modules, "hotel_direct")) return null;
  return { shopId: page.shop_id, token: page.token, name: shop.name, logoUrl: shop.logo_url, city: shop.city, phone: page.contact_phone, about: page.about, policies: page.policies };
}

export type StayOption = { id: string; name: string; description: string | null; amenities: string | null; maxAdults: number; maxChildren: number; rate: number; rooms: number; stopReason: string | null };

/** What a guest can book for these dates. They see whether a room is free and its price, not how many
 * the hotel has; a rule's minimum stay or closed arrival stops the choice here, unlike at the desk. */
export async function stayOptions(admin: Admin, shopId: string, checkIn: string, checkOut: string): Promise<StayOption[]> {
  const [{ types, rooms }, booked, rules] = await Promise.all([loadInventory(admin, shopId), loadActiveBookedRooms(admin, shopId), loadRateRules(admin, shopId)]);
  const lite = toRoomLite(rooms);
  const free = availabilityByType({ rooms: lite, booked, checkIn, checkOut });
  const quotes = quotesForStay({ rules, types, rooms: lite, booked, checkIn, checkOut });
  return types
    .filter((t) => (free[t.id]?.total ?? 0) > 0)
    .map((t) => {
      const q = quotes[t.id];
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        amenities: t.amenities,
        maxAdults: t.maxAdults,
        maxChildren: t.maxChildren,
        rate: q.average,
        rooms: Math.min(5, free[t.id]?.available ?? 0),
        stopReason: q.closedToArrival ? "No arrivals on this date." : q.minStayShort ? `Minimum stay on these dates is ${q.minStayShort} nights.` : null,
      };
    });
}

/** Dates to choose from on the page: today up to a year ahead. */
export const stayDateRange = () => ({ min: todayIso(), max: addDays(todayIso(), 365) });
