import { buildSessionForUser, runAsSession } from "@/lib/auth";
import { demoBusiness, DEMO_TYPES, type DemoType } from "../config";
import { rng } from "../util";
import type { Admin, SeedCtx } from "./common";
import { seedRetail } from "./retail";
import { seedRestaurant } from "./restaurant";
import { seedHotel } from "./hotel";
import { seedPharmacy } from "./pharmacy";
import { seedRental } from "./rental";
import { seedTransport } from "./transport";
import { seedService } from "./service";
import { seedSalon } from "./salon";
import { seedJewellery } from "./jewellery";
import { seedClinic } from "./clinic";
import { seedGym } from "./gym";
import { seedLab } from "./lab";

/** Each business type's own filler. A Record, so adding a business type without giving it a
 * demo is a compile error. */
const SEEDERS: Record<DemoType, (ctx: SeedCtx) => Promise<void>> = {
  grocery: seedRetail,
  mart: seedRetail,
  hardware: seedRetail,
  general: seedRetail,
  pharmacy: seedPharmacy,
  restaurant: seedRestaurant,
  hotel: seedHotel,
  rental: seedRental,
  transport: seedTransport,
  service: seedService,
  salon: seedSalon,
  jewellery: seedJewellery,
  clinic: seedClinic,
  gym: seedGym,
  lab: seedLab,
};

/** Removes the demo shop a user owns (if any). The tables that point at bills or
 * customers without cascading are emptied first, like the admin "delete shop". */
export async function removeDemoShop(admin: Admin, userId: string): Promise<void> {
  const { data: staff } = await admin.from("staff").select("shop_id").eq("id", userId).maybeSingle();
  if (!staff) return;
  const shopId = staff.shop_id;
  // A hotel stay and its bill point at each other; cut that link first.
  await admin.from("bills").update({ hotel_booking_id: null }).eq("shop_id", shopId).not("hotel_booking_id", "is", null);
  for (const table of ["restaurant_orders", "combos", "rentals", "service_jobs", "lab_orders", "prescriptions", "treatment_plans", "purchases", "bills"] as const) {
    await admin.from(table).delete().eq("shop_id", shopId);
  }
  const { error } = await admin.from("shops").delete().eq("id", shopId);
  if (error) throw new Error(`demo: could not remove old shop: ${error.message}`);
}

/** Creates the demo shop for a business type and fills it. `userId` is the demo owner's login. */
export async function seedDemoShop(admin: Admin, type: DemoType, userId: string, email: string): Promise<{ shopId: string }> {
  const biz = demoBusiness(type);
  await removeDemoShop(admin, userId);

  const gstinBase = `${biz.stateCode}AAAPL1234C1Z`;
  const { data: shop, error: shopError } = await admin
    .from("shops")
    .insert({
      name: `${biz.shopName}`,
      legal_name: `${biz.shopName} (demo)`,
      gstin: `${gstinBase}5`,
      address_line1: "Shop 12, Main Bazaar",
      city: biz.city,
      state: biz.state,
      state_code: biz.stateCode,
      pincode: "411001",
      price_includes_gst: true,
      invoice_prefix: "INV",
      upi_id: "demo@upi",
      business_type: type,
      business_type_locked: true,
      // Everything switched on, no trial or renewal banners.
      plan: "pro_plus",
      subscription_valid_until: "2099-12-31",
      trial_ends_at: null,
      owner_phone: "9000000000",
      manager_pin: "1234",
      fast_billing_enabled: type === "mart" || type === "grocery",
      default_print_format: type === "restaurant" ? "thermal58" : "full",
    })
    .select("id")
    .single();
  if (shopError || !shop) throw new Error(`demo: could not create shop: ${shopError?.message}`);

  const { error: staffError } = await admin.from("staff").insert({ id: userId, shop_id: shop.id, name: biz.ownerName, role: "owner" });
  if (staffError) throw new Error(`demo: could not create owner: ${staffError.message}`);

  const session = await buildSessionForUser(userId, email);
  if (!session) throw new Error("demo: could not build the owner session");

  // A different seed per type, the same every night.
  const seed = DEMO_TYPES.indexOf(type) * 7919 + 13;
  const ctx: SeedCtx = { admin, session, shopId: shop.id, type, random: rng(seed) };
  await runAsSession(session, () => SEEDERS[type](ctx));
  return { shopId: shop.id };
}
