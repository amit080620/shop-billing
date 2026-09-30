"use server";

import { revalidatePath } from "next/cache";
import { hasPermission, requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { financialYearFor, round2 } from "../gst";
import { todayIso } from "../dateHelpers";
import { findOrCreateCustomerByPhone } from "./customers";
import { createBillCore } from "./bills";
import { billedSide, loadConsignment, transportExtrasReady, type Consignment } from "../transportData";
import { EXPENSE_CATEGORIES, type ExpenseCategory, type PayBy } from "../transport";
import type { CashMethod } from "../cashMovements";
import { isModuleEnabled } from "../modules";
import { moduleLockMessage } from "../plans";

const NOT_READY = "Bilty and trip expenses need a one-time database update — ask the owner to run migration 0049.";
const METHODS: CashMethod[] = ["cash", "card", "upi", "online", "other"];
const text = (v: string | null | undefined, max: number) => (v ?? "").trim().slice(0, max) || null;
const num = (v: unknown) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const phone = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").slice(-10) || null;

type Party = { customerId: string | null; name: string; phone: string; gstin: string; address: string };
export type LrInput = {
  id?: string | null;
  lrDate: string;
  vehicleId: string | null;
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
  consignor: Party;
  consignee: Party;
  fromPlace: string;
  toPlace: string;
  goods: string;
  packages: number | null;
  packing: string;
  actualWeight: number | null;
  chargedWeight: number | null;
  weightUnit: string;
  declaredValue: number | null;
  invoiceRef: string;
  ewayBillNo: string;
  freight: number;
  otherCharges: number;
  payBy: PayBy;
  notes: string;
};

function refresh(id?: string) {
  revalidatePath("/transport/lr");
  if (id) revalidatePath(`/transport/lr/${id}`);
  revalidatePath("/transport/reports");
}

/** Books a consignment (a new LR number) or corrects one not yet billed. */
export async function saveConsignmentAction(input: LrInput): Promise<{ error?: string; id?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!(await transportExtrasReady(admin))) return { error: NOT_READY };

  const consignorName = text(input.consignor.name, 120);
  const consigneeName = text(input.consignee.name, 120);
  if (!consignorName) return { error: "Enter the consignor (who is sending the goods)." };
  if (!consigneeName) return { error: "Enter the consignee (who receives the goods)." };
  const from = text(input.fromPlace, 80);
  const to = text(input.toPlace, 80);
  if (!from || !to) return { error: "Enter from where and to where." };
  const goods = text(input.goods, 200);
  if (!goods) return { error: "Describe the goods." };
  const freight = round2(Number(input.freight));
  const other = round2(Math.max(0, Number(input.otherCharges) || 0));
  if (!(freight >= 0) || freight > 10_000_000) return { error: "Enter the freight." };
  if (!["paid", "to_pay", "tbb"].includes(input.payBy)) return { error: "Choose who pays the freight." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.lrDate)) return { error: "Enter the LR date." };

  // Parties and the vehicle must be this shop's own.
  const partyIds = [input.consignor.customerId, input.consignee.customerId].filter((x): x is string => !!x);
  if (partyIds.length) {
    const { data } = await admin.from("customers").select("id").eq("shop_id", session.shopId).in("id", partyIds);
    if ((data ?? []).length !== new Set(partyIds).size) return { error: "Customer not found." };
  }
  let vehicleNumber = text(input.vehicleNumber, 20);
  if (input.vehicleId) {
    const { data: v } = await admin.from("vehicles").select("id, vehicle_number").eq("id", input.vehicleId).eq("shop_id", session.shopId).maybeSingle();
    if (!v) return { error: "Vehicle not found." };
    vehicleNumber = vehicleNumber ?? v.vehicle_number;
  }

  const row = {
    lr_date: input.lrDate,
    vehicle_id: input.vehicleId || null,
    vehicle_number: vehicleNumber ? vehicleNumber.toUpperCase() : null,
    driver_name: text(input.driverName, 80),
    driver_phone: phone(input.driverPhone),
    consignor_customer_id: input.consignor.customerId || null,
    consignor_name: consignorName,
    consignor_phone: phone(input.consignor.phone),
    consignor_gstin: text(input.consignor.gstin, 15)?.toUpperCase() ?? null,
    consignor_address: text(input.consignor.address, 250),
    consignee_customer_id: input.consignee.customerId || null,
    consignee_name: consigneeName,
    consignee_phone: phone(input.consignee.phone),
    consignee_gstin: text(input.consignee.gstin, 15)?.toUpperCase() ?? null,
    consignee_address: text(input.consignee.address, 250),
    from_place: from,
    to_place: to,
    goods,
    packages: num(input.packages) != null ? Math.max(0, Math.round(Number(input.packages))) : null,
    packing: text(input.packing, 40),
    actual_weight: num(input.actualWeight),
    charged_weight: num(input.chargedWeight),
    weight_unit: text(input.weightUnit, 10)?.toUpperCase() ?? "KG",
    declared_value: num(input.declaredValue),
    invoice_ref: text(input.invoiceRef, 60),
    eway_bill_no: text(input.ewayBillNo, 20),
    freight,
    other_charges: other,
    pay_by: input.payBy,
    notes: text(input.notes, 300),
  };

  if (input.id) {
    const existing = await loadConsignment(admin, input.id, session.shopId);
    if (!existing) return { error: "LR not found." };
    if (existing.bill_id) return { error: "This LR is already billed — void that bill first to change it." };
    if (existing.status === "cancelled") return { error: "This LR was cancelled." };
    const { error } = await admin.from("consignments").update(row).eq("id", input.id).eq("shop_id", session.shopId);
    if (error) return { error: "Could not save — try again." };
    refresh(input.id);
    return { id: input.id };
  }

  const fy = financialYearFor(new Date(`${input.lrDate}T12:00:00+05:30`));
  const { data: n, error: numberError } = await admin.rpc("next_lr_number", { p_shop_id: session.shopId, p_financial_year: fy });
  if (numberError || n == null) return { error: "Could not get an LR number — try again." };
  const { data, error } = await admin
    .from("consignments")
    .insert({ ...row, shop_id: session.shopId, lr_number: `LR/${fy}/${String(n).padStart(5, "0")}`, staff_id: session.userId })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Could not save consignment", error);
    return { error: "Could not save — try again." };
  }
  refresh();
  return { id: data.id };
}

/** Dispatched, delivered (and to whom), back to booked, or cancelled (only while not billed). */
export async function setConsignmentStatusAction(
  id: string,
  status: Consignment["status"],
  extra: { receivedBy?: string; note?: string } = {},
): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!(await transportExtrasReady(admin))) return { error: NOT_READY };
  const c = await loadConsignment(admin, id, session.shopId);
  if (!c) return { error: "LR not found." };
  if (c.status === "cancelled") return { error: "This LR was cancelled." };
  const now = new Date().toISOString();
  let patch: Partial<Consignment>;
  if (status === "in_transit") patch = { status, dispatched_at: c.dispatched_at ?? now, delivered_at: null, received_by: null };
  else if (status === "delivered") {
    const receivedBy = text(extra.receivedBy, 80);
    if (!receivedBy) return { error: "Who received the goods?" };
    patch = { status, dispatched_at: c.dispatched_at ?? now, delivered_at: now, received_by: receivedBy, delivery_note: text(extra.note, 200) };
  } else if (status === "cancelled") {
    if (c.bill_id) return { error: "This LR is billed — void the bill first." };
    if (session.role !== "owner" && !hasPermission(session, "void_bills")) return { error: "Only the owner can cancel an LR." };
    patch = { status };
  } else patch = { status: "booked", dispatched_at: null, delivered_at: null, received_by: null };
  const { error } = await admin.from("consignments").update(patch).eq("id", id).eq("shop_id", session.shopId);
  if (error) return { error: "Could not save — try again." };
  refresh(id);
  return {};
}

/** Makes the freight bill: one LR, or several for the same party (a monthly "to be billed"
 * account). An ordinary bill — so udhaar, GST reports and the Daily summary treat it like any sale. */
export async function billConsignmentsAction(input: {
  ids: string[];
  gstPercent: number;
  paidAmount: number;
  paymentMethod: CashMethod;
}): Promise<{ error?: string; billId?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!(await transportExtrasReady(admin))) return { error: NOT_READY };
  const ids = [...new Set(input.ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!ids.length) return { error: "Pick the LRs to bill." };
  const { data: rows } = await admin.from("consignments").select("*").eq("shop_id", session.shopId).in("id", ids).order("lr_date");
  const lrs = (rows ?? []) as Consignment[];
  if (lrs.length !== ids.length) return { error: "LR not found." };
  if (lrs.some((c) => c.bill_id)) return { error: "One of these LRs is already billed." };
  if (lrs.some((c) => c.status === "cancelled")) return { error: "One of these LRs was cancelled." };

  // Everyone on one bill must be the same party.
  const parties = lrs.map((c) => {
    const side = billedSide(c);
    return side === "consignor"
      ? { customerId: c.consignor_customer_id, name: c.consignor_name, phone: c.consignor_phone, gstin: c.consignor_gstin, address: c.consignor_address }
      : { customerId: c.consignee_customer_id, name: c.consignee_name, phone: c.consignee_phone, gstin: c.consignee_gstin, address: c.consignee_address };
  });
  const key = (p: (typeof parties)[number]) => p.customerId ?? (p.phone ? `phone:${p.phone}` : `name:${p.name.toLowerCase()}`);
  if (new Set(parties.map(key)).size > 1) return { error: "These LRs are for different parties — bill each party separately." };
  const party = parties[0];

  let customerId = party.customerId;
  if (!customerId) {
    if (!party.phone) return { error: `Add ${party.name}'s phone number on the LR (or pick them from your customers) to bill them.` };
    const found = await findOrCreateCustomerByPhone(admin, session.shopId, party.phone, party.name);
    if (!found) return { error: "Could not save the party — try again." };
    customerId = found.id;
    // A new party's GSTIN and address come from the LR, so the bill is made out properly.
    const { data: cust } = await admin.from("customers").select("gstin, address").eq("id", customerId).single();
    const patch: { gstin?: string; state_code?: string; address?: string } = {};
    if (!cust?.gstin && party.gstin && /^\d{2}[A-Z0-9]{13}$/.test(party.gstin)) {
      patch.gstin = party.gstin;
      patch.state_code = party.gstin.slice(0, 2);
    }
    if (!cust?.address && party.address) patch.address = party.address;
    if (Object.keys(patch).length) await admin.from("customers").update(patch).eq("id", customerId);
  }

  const gst = [0, 5, 12, 18].includes(Number(input.gstPercent)) ? Number(input.gstPercent) : 0;
  // Freight is quoted before GST, which goes on top. A shop whose prices include GST gets the
  // line with the GST already in it, so the bill backs out exactly this GST, not a share of the freight.
  const charge = (amount: number) => (session.priceIncludesGst && session.gstScheme !== "composition" && gst > 0 ? round2(amount * (1 + gst / 100)) : amount);
  const weight = (c: Consignment) => (c.charged_weight ?? c.actual_weight ? `, ${Number(c.charged_weight ?? c.actual_weight)} ${c.weight_unit}` : "");
  const items = lrs.flatMap((c) => [
    { productId: null, description: `Freight ${c.lr_number}: ${c.from_place} → ${c.to_place} (${c.goods}${weight(c)})`.slice(0, 250), hsnCode: "9965", quantity: 1, unitPrice: charge(Number(c.freight)), gstPercent: gst },
    ...(Number(c.other_charges) > 0 ? [{ productId: null, description: `Other charges ${c.lr_number} (loading, hamali…)`, hsnCode: "9965", quantity: 1, unitPrice: charge(Number(c.other_charges)), gstPercent: gst }] : []),
  ]).filter((i) => i.unitPrice > 0);
  if (!items.length) return { error: "These LRs have no freight to bill." };

  const method = METHODS.includes(input.paymentMethod) ? input.paymentMethod : "cash";
  const result = await createBillCore(session, {
    customerId,
    items,
    discountType: "flat",
    discountValue: 0,
    paidAmount: Math.max(0, Number(input.paidAmount) || 0),
    paymentMethod: method,
  });
  if ("error" in result) return { error: result.error };
  await admin.from("consignments").update({ bill_id: result.billId }).eq("shop_id", session.shopId).in("id", ids);
  refresh();
  for (const id of ids) revalidatePath(`/transport/lr/${id}`);
  return { billId: result.billId };
}

/** Diesel, toll, the driver's bhatta… paid for a vehicle (and an LR, if it belongs to one). */
export async function addTripExpenseAction(input: {
  vehicleId: string | null;
  consignmentId: string | null;
  date: string;
  category: ExpenseCategory;
  amount: number;
  method: CashMethod;
  litres: number | null;
  odometer: number | null;
  note: string;
}): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "vehicle_profit")) return { error: moduleLockMessage("vehicle_profit") };
  if (!hasPermission(session, "manage_expenses")) return { error: "You don't have permission to record expenses — ask the owner." };
  const admin = createSupabaseAdminClient();
  if (!(await transportExtrasReady(admin))) return { error: NOT_READY };
  const amount = round2(Number(input.amount));
  if (!(amount > 0) || amount > 10_000_000) return { error: "Enter the amount." };
  if (!EXPENSE_CATEGORIES.includes(input.category)) return { error: "Choose what it was for." };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : todayIso();
  if (date > todayIso()) return { error: "The date can't be in the future." };
  if (input.vehicleId) {
    const { data } = await admin.from("vehicles").select("id").eq("id", input.vehicleId).eq("shop_id", session.shopId).maybeSingle();
    if (!data) return { error: "Vehicle not found." };
  }
  if (input.consignmentId && !(await loadConsignment(admin, input.consignmentId, session.shopId))) return { error: "LR not found." };
  const litres = input.category === "diesel" ? num(input.litres) : null;
  const odometer = num(input.odometer);
  const { error } = await admin.from("trip_expenses").insert({
    shop_id: session.shopId,
    vehicle_id: input.vehicleId || null,
    consignment_id: input.consignmentId || null,
    expense_date: date,
    category: input.category,
    amount,
    payment_method: METHODS.includes(input.method) ? input.method : "cash",
    litres: litres != null && litres > 0 ? round2(litres) : null,
    odometer_km: odometer != null && odometer > 0 ? Math.round(odometer * 10) / 10 : null,
    note: text(input.note, 200),
    staff_id: session.userId,
  });
  if (error) return { error: "Could not save — try again." };
  revalidatePath("/transport/expenses");
  revalidatePath("/transport/reports");
  revalidatePath("/daily-summary");
  if (input.consignmentId) revalidatePath(`/transport/lr/${input.consignmentId}`);
  return {};
}

export async function deleteTripExpenseAction(id: string): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "vehicle_profit")) return { error: moduleLockMessage("vehicle_profit") };
  if (!hasPermission(session, "manage_expenses")) return { error: "You don't have permission to change expenses — ask the owner." };
  const admin = createSupabaseAdminClient();
  if (!(await transportExtrasReady(admin))) return { error: NOT_READY };
  const { data: row } = await admin.from("trip_expenses").select("id, expense_date, consignment_id").eq("id", id).eq("shop_id", session.shopId).maybeSingle();
  if (!row) return { error: "Not found." };
  // Staff can take back a mistake made today; older entries only the owner.
  if (session.role !== "owner" && row.expense_date !== todayIso()) return { error: "Only the owner can remove an older expense." };
  const { error } = await admin.from("trip_expenses").delete().eq("id", id).eq("shop_id", session.shopId);
  if (error) return { error: "Could not remove — try again." };
  revalidatePath("/transport/expenses");
  revalidatePath("/transport/reports");
  revalidatePath("/daily-summary");
  if (row.consignment_id) revalidatePath(`/transport/lr/${row.consignment_id}`);
  return {};
}

