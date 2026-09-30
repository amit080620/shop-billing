"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isModuleEnabled } from "../modules";
import { moduleLockMessage } from "../plans";
import { financialYearFor } from "../gst";
import { todayIso } from "../dateHelpers";
import { normalizePhone } from "../phone";
import { gapsReady, GAPS_NOT_READY } from "../gapsData";
import { cleanChallanLines, type ChallanLine } from "../challans";
import { moveChallanStock } from "../challanData";
import { findOrCreateCustomerByPhone } from "./customers";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "") || null;

/** Goods going out before the bill: a numbered challan with quantities (no prices). With
 * `takeStock` the goods leave stock now; the bill later doesn't count them twice. */
export async function createChallanAction(input: {
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  date: string;
  site: string;
  vehicle: string;
  notes: string;
  takeStock: boolean;
  items: ChallanLine[];
}): Promise<{ error?: string; id?: string }> {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "delivery_challan")) return { error: moduleLockMessage("delivery_challan") };
  const admin = createSupabaseAdminClient();
  if (!(await gapsReady(admin))) return { error: GAPS_NOT_READY };

  const items = cleanChallanLines(input.items ?? []);
  if (!items.length) return { error: "Add the goods going out." };
  if (items.some((i) => !i.productId)) return { error: "Pick every item from your catalogue — the bill needs its price." };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date) && input.date <= todayIso() ? input.date : todayIso();

  // Catalogue items must be this shop's.
  const ids = [...new Set(items.map((i) => i.productId).filter((x): x is string => !!x))];
  if (ids.length) {
    const { data: own } = await admin.from("products").select("id").eq("shop_id", session.shopId).in("id", ids);
    if ((own ?? []).length !== ids.length) return { error: "One of the items isn't in your catalogue." };
  }

  let customerId: string | null = null;
  let name = text(input.customerName, 120);
  let phone = input.customerPhone ? normalizePhone(input.customerPhone) : null;
  if (input.customerId && /^[0-9a-f-]{36}$/i.test(input.customerId)) {
    const { data: c } = await admin.from("customers").select("id, name, phone").eq("id", input.customerId).eq("shop_id", session.shopId).maybeSingle();
    if (!c) return { error: "Customer not found." };
    customerId = c.id;
    name = c.name;
    phone = c.phone;
  } else if (name && phone) {
    const linked = await findOrCreateCustomerByPhone(admin, session.shopId, phone, name);
    customerId = linked?.id ?? null;
  }
  if (!name) return { error: "Whom are the goods going to?" };

  const fy = financialYearFor(new Date(`${date}T12:00:00+05:30`));
  const { data: n, error: numberError } = await admin.rpc("next_challan_number", { p_shop_id: session.shopId, p_financial_year: fy });
  if (numberError || n == null) return { error: "Could not number the challan — try again." };

  const { data: row, error } = await admin
    .from("delivery_challans")
    .insert({
      shop_id: session.shopId,
      challan_number: `DC/${fy}/${String(n).padStart(5, "0")}`,
      challan_date: date,
      customer_id: customerId,
      customer_name: name,
      customer_phone: phone,
      site: text(input.site, 120),
      vehicle: text(input.vehicle, 40),
      notes: text(input.notes, 300),
      items,
      stock_taken: !!input.takeStock,
      staff_id: session.userId,
    })
    .select("id")
    .single();
  if (error || !row) return { error: "Could not save — try again." };
  if (input.takeStock) await moveChallanStock(admin, session.shopId, items, -1);
  revalidatePath("/challans");
  return { id: row.id };
}

/** Who took the goods at the site (written on the challan once delivered). */
export async function setChallanReceivedByAction(id: string, receivedBy: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!(await gapsReady(admin))) return { error: GAPS_NOT_READY };
  const { error } = await admin.from("delivery_challans").update({ received_by: text(receivedBy, 80) }).eq("id", id).eq("shop_id", session.shopId);
  if (error) return { error: "Could not save — try again." };
  revalidatePath(`/challans/${id}`);
  return {};
}

/** A challan made by mistake, or goods that came back unbilled: it is cancelled and its goods return to stock. */
export async function cancelChallanAction(id: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!(await gapsReady(admin))) return { error: GAPS_NOT_READY };
  const { data: c } = await admin.from("delivery_challans").select("id, status, items, stock_taken").eq("id", id).eq("shop_id", session.shopId).maybeSingle();
  if (!c) return { error: "Challan not found." };
  if (c.status === "billed") return { error: "This challan is billed — void the bill first." };
  if (c.status === "cancelled") return {};
  const { data: done } = await admin.from("delivery_challans").update({ status: "cancelled" }).eq("id", id).eq("status", "open").select("id");
  if (done?.length && c.stock_taken) await moveChallanStock(admin, session.shopId, c.items, 1);
  revalidatePath("/challans");
  revalidatePath(`/challans/${id}`);
  return {};
}
