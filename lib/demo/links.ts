import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DemoType } from "./config";

/** The pages a demo shop shares with its customers (booking page, online catalogue,
 * table QR menu, self check-in kiosk, job tracking, khata). They need no login, so a
 * guide can link straight to them. Found by asking the demo shops themselves. */
export async function demoPublicLinks(base: string): Promise<{ label: string; url: string }[]> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: shops } = await admin
      .from("shops")
      .select("id, business_type")
      .like("legal_name", "% (demo)")
      .eq("plan", "pro_plus")
      .eq("manager_pin", "1234");
    const byType = new Map<string, string>((shops ?? []).map((s) => [s.business_type, s.id]));
    const id = (t: DemoType) => byType.get(t);
    const links: { label: string; url: string }[] = [];

    const booking = async (type: DemoType, label: string) => {
      const shopId = id(type);
      if (!shopId) return;
      const { data } = await admin.from("booking_settings").select("public_token, is_public_booking_enabled").eq("shop_id", shopId).maybeSingle();
      if (data?.is_public_booking_enabled) links.push({ label, url: `${base}/book/${data.public_token}` });
    };
    await booking("salon", "Salon: online appointment booking page");
    await booking("clinic", "Clinic: online appointment booking page");

    for (const type of ["grocery", "restaurant"] as DemoType[]) {
      const shopId = id(type);
      if (!shopId) continue;
      const { data } = await admin.from("catalog_settings").select("public_token, is_enabled").eq("shop_id", shopId).maybeSingle();
      if (data?.is_enabled) links.push({ label: `${type === "grocery" ? "Grocery" : "Restaurant"}: online catalogue customers can order from`, url: `${base}/shop/${data.public_token}` });
    }
    if (id("restaurant")) {
      const { data } = await admin.from("restaurant_tables").select("qr_token, name").eq("shop_id", id("restaurant")!).eq("is_deleted", false).order("name").limit(1).maybeSingle();
      if (data) links.push({ label: `Restaurant: the QR page stuck on table ${data.name} (guests order from their phone)`, url: `${base}/order/${data.qr_token}` });
    }
    if (id("gym")) {
      const { data } = await admin.from("gym_kiosk_settings").select("public_token, is_enabled").eq("shop_id", id("gym")!).maybeSingle();
      if (data?.is_enabled) links.push({ label: "Gym: the self check-in kiosk screen (a member types their number)", url: `${base}/gym-checkin/${data.public_token}` });
    }
    if (id("service")) {
      const { data } = await admin.from("service_jobs").select("id").eq("shop_id", id("service")!).eq("status", "in_progress").limit(1).maybeSingle();
      if (data) links.push({ label: "Repair shop: the job-status page a customer opens to track their repair", url: `${base}/job-status/${data.id}` });
    }
    if (id("grocery")) {
      const { data } = await admin.from("bills").select("customer_id").eq("shop_id", id("grocery")!).gt("credit_amount", 0).not("customer_id", "is", null).limit(1).maybeSingle();
      if (data?.customer_id) links.push({ label: "Grocery: a customer's khata statement page (what they owe)", url: `${base}/khata/${data.customer_id}` });
    }
    return links;
  } catch {
    return [];
  }
}
