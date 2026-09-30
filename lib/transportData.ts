import type { createSupabaseAdminClient } from "./supabase/admin";
import type { Database } from "./supabase/database.types";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
export type Consignment = Database["public"]["Tables"]["consignments"]["Row"];

let ready = false;
/** Whether migration 0049 (bilty / LR and trip expenses) has been applied. */
export async function transportExtrasReady(admin: Admin): Promise<boolean> {
  if (ready) return true;
  const { error } = await admin.from("trip_expenses").select("id").limit(1);
  if (error) return false;
  ready = true;
  return true;
}

/** The freight an LR comes to. */
export const lrTotal = (c: Pick<Consignment, "freight" | "other_charges">) => Math.round((Number(c.freight) + Number(c.other_charges)) * 100) / 100;

/** Who the freight is billed to: the sender for a paid LR, the receiver for "to pay"; a "to be
 * billed" LR goes to whichever of them is a regular party (the sender unless only the receiver is). */
export function billedSide(c: Pick<Consignment, "pay_by" | "consignor_customer_id" | "consignee_customer_id">): "consignor" | "consignee" {
  if (c.pay_by === "paid") return "consignor";
  if (c.pay_by === "to_pay") return "consignee";
  return c.consignor_customer_id || !c.consignee_customer_id ? "consignor" : "consignee";
}

export async function loadConsignment(admin: Admin, id: string, shopId?: string): Promise<Consignment | null> {
  let q = admin.from("consignments").select("*").eq("id", id);
  if (shopId) q = q.eq("shop_id", shopId);
  const { data } = await q.maybeSingle();
  return (data as Consignment | null) ?? null;
}

/** The shop as printed at the top of an LR. */
export async function loadLrShop(admin: Admin, shopId: string) {
  const { data: s } = await admin.from("shops").select("name, gstin, address_line1, address_line2, city, state, pincode, owner_phone").eq("id", shopId).single();
  if (!s) return null;
  return {
    name: s.name,
    gstin: s.gstin,
    address: [s.address_line1, s.address_line2, s.city, s.state, s.pincode].filter(Boolean).join(", ") || null,
    phone: s.owner_phone,
  };
}

const STATUS_TEXT = { booked: "Booked", in_transit: "On the way", delivered: "Delivered", cancelled: "Cancelled" } as const;
const PAY_TEXT = { paid: "Paid", to_pay: "To pay", tbb: "To be billed" } as const;

/** The WhatsApp message for an LR: everything on the bilty, and a link to follow it. */
export function lrWhatsAppText(c: Consignment, shopName: string, trackUrl: string): string {
  const w = c.charged_weight ?? c.actual_weight;
  const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  return [
    `*${shopName}*`,
    `Bilty (LR) *${c.lr_number}* · ${new Date(`${c.lr_date}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`,
    `${c.from_place} → ${c.to_place}`,
    "",
    `From: ${c.consignor_name}`,
    `To: ${c.consignee_name}`,
    `Goods: ${c.goods}${c.packages != null ? ` · ${c.packages} ${c.packing ?? ""}`.trimEnd() : ""}${w != null ? ` · ${Number(w)} ${c.weight_unit}` : ""}`,
    c.vehicle_number ? `Vehicle: ${c.vehicle_number}${c.driver_name ? ` · ${c.driver_name}` : ""}${c.driver_phone ? ` (${c.driver_phone})` : ""}` : null,
    `Freight: *${money(lrTotal(c))}* (${PAY_TEXT[c.pay_by]})`,
    `Status: ${STATUS_TEXT[c.status]}${c.status === "delivered" && c.received_by ? ` — received by ${c.received_by}` : ""}`,
    "",
    `🚚 Track this consignment: ${trackUrl}`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}
