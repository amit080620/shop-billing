"use server";

import { revalidatePath } from "next/cache";
import { hasPermission, requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { logAuditEvent } from "../audit";
import { invalidateCache } from "../cache";
import { recordCashMovement, type CashMethod } from "../cashMovements";
import { loadPackages, packageUsable, salonExtrasReady, walletBalance, type PackageView } from "../salonExtras";

const NOT_READY = "Packages and prepaid balance need a one-time database update — ask the owner to run migration 0048.";
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const METHODS: CashMethod[] = ["cash", "card", "upi", "online", "other"];

/** A package plan ("Hair Spa — 5 sessions") is a catalogue item: selling it is an ordinary bill. */
export async function savePackagePlanAction(input: {
  serviceProductId: string;
  sessions: number;
  price: number;
  validityDays: number | null;
  name: string;
}): Promise<{ error?: string; productId?: string }> {
  const session = await requireSession();
  if (!hasPermission(session, "manage_products")) return { error: "Only staff allowed to manage items can add a package." };
  const admin = createSupabaseAdminClient();
  if (!(await salonExtrasReady(admin))) return { error: NOT_READY };

  const sessions = Math.round(Number(input.sessions));
  const price = round2(Number(input.price));
  const validity = input.validityDays ? Math.round(Number(input.validityDays)) : null;
  if (!(sessions >= 1 && sessions <= 500)) return { error: "Sessions must be between 1 and 500." };
  if (!(price > 0)) return { error: "Enter the package price." };
  if (validity !== null && !(validity >= 1 && validity <= 3660)) return { error: "Valid for 1 day to 10 years." };

  const { data: service } = await admin
    .from("products")
    .select("id, name, price, offer_price, gst_percent, hsn_code, package_sessions")
    .eq("id", input.serviceProductId)
    .eq("shop_id", session.shopId)
    .maybeSingle();
  if (!service || service.package_sessions != null) return { error: "Pick the service the package is for." };

  const name = (input.name.trim() || `${service.name} — ${sessions} sessions`).slice(0, 120);
  const { data: clash } = await admin.from("products").select("id").eq("shop_id", session.shopId).ilike("name", name.replace(/[\\%_]/g, (c) => `\\${c}`)).limit(1).maybeSingle();
  if (clash) return { error: `An item called "${name}" already exists — give the package another name.` };

  const { data, error } = await admin
    .from("products")
    .insert({
      shop_id: session.shopId,
      name,
      price,
      gst_percent: Number(service.gst_percent),
      hsn_code: service.hsn_code,
      unit: "NOS",
      track_inventory: false,
      package_service_id: service.id,
      package_sessions: sessions,
      package_validity_days: validity,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Could not save package plan", error);
    return { error: "Could not save the package — try again." };
  }
  await invalidateCache(`ray:cache:products:${session.shopId}`);
  revalidatePath("/salon/packages");
  revalidatePath("/products");
  revalidatePath("/bills/new");
  return { productId: data.id };
}

/** What a customer has to spend on New Bill: packages with sessions left, and prepaid balance. */
export async function customerBillExtrasAction(customerId: string): Promise<{ packages: PackageView[]; wallet: number }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!/^[0-9a-f-]{36}$/i.test(customerId) || !(await salonExtrasReady(admin))) return { packages: [], wallet: 0 };
  const [packages, wallet] = await Promise.all([loadPackages(admin, session.shopId, { customerId }), walletBalance(admin, session.shopId, customerId)]);
  return { packages: packages.filter(packageUsable), wallet };
}

async function ownCustomer(admin: ReturnType<typeof createSupabaseAdminClient>, shopId: string, customerId: string) {
  const { data } = await admin.from("customers").select("id, name").eq("id", customerId).eq("shop_id", shopId).maybeSingle();
  return data;
}

/** Money paid in advance onto the customer's balance — plus any extra the shop adds on top. The
 * money is an advance on the day it is paid (the Daily summary counts it then). */
export async function topUpWalletAction(input: { customerId: string; money: number; extra: number; method: CashMethod; note?: string }): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!(await salonExtrasReady(admin))) return { error: NOT_READY };
  const customer = await ownCustomer(admin, session.shopId, input.customerId);
  if (!customer) return { error: "Customer not found." };
  const money = round2(Number(input.money));
  const extra = round2(Math.max(0, Number(input.extra) || 0));
  if (!(money > 0) || money > 1_000_000) return { error: "Enter the amount paid." };
  if (extra > money) return { error: "The extra can't be more than the money paid." };
  const method = METHODS.includes(input.method) ? input.method : "cash";

  const { data: entry, error } = await admin
    .from("wallet_entries")
    .insert({
      shop_id: session.shopId,
      customer_id: customer.id,
      kind: "topup",
      money,
      credit: round2(money + extra),
      payment_method: method,
      note: input.note?.trim().slice(0, 120) || (extra > 0 ? `Paid ${money} + ${extra} extra` : null),
      staff_id: session.userId,
    })
    .select("id")
    .single();
  if (error || !entry) return { error: "Could not save — try again." };
  await recordCashMovement(admin, { shopId: session.shopId, staffId: session.userId, kind: "advance_received", source: "wallet", sourceId: customer.id, method, amount: money, note: `Prepaid balance — ${customer.name}` });
  revalidatePath(`/customers/${customer.id}`);
  revalidatePath("/prepaid");
  revalidatePath("/daily-summary");
  return {};
}

/** Closes the balance: the owner hands back what is agreed (up to the balance) and the rest —
 * usually the shop's own extra — lapses. */
export async function refundWalletAction(input: { customerId: string; money: number; method: CashMethod }): Promise<{ error?: string }> {
  const session = await requireSession();
  if (session.role !== "owner") return { error: "Only the owner can hand back a prepaid balance." };
  const admin = createSupabaseAdminClient();
  if (!(await salonExtrasReady(admin))) return { error: NOT_READY };
  const customer = await ownCustomer(admin, session.shopId, input.customerId);
  if (!customer) return { error: "Customer not found." };
  const balance = await walletBalance(admin, session.shopId, customer.id);
  if (balance <= 0) return { error: "There is no balance to hand back." };
  const money = round2(Math.max(0, Number(input.money) || 0));
  if (money > balance) return { error: "You can hand back at most the balance." };
  const method = METHODS.includes(input.method) ? input.method : "cash";

  const { error } = await admin.from("wallet_entries").insert({
    shop_id: session.shopId,
    customer_id: customer.id,
    kind: "refund",
    money,
    credit: -balance,
    payment_method: method,
    note: money < balance ? `Closed — ${round2(balance - money)} not handed back` : "Closed",
    staff_id: session.userId,
  });
  if (error) return { error: "Could not save — try again." };
  if (money > 0) await recordCashMovement(admin, { shopId: session.shopId, staffId: session.userId, kind: "refund_given", source: "wallet", sourceId: customer.id, method, amount: -money, note: `Prepaid balance handed back — ${customer.name}` });
  await logAuditEvent({ admin, shopId: session.shopId, staffId: session.userId, action: "wallet_refunded", entityType: "customer", entityId: customer.id, details: { balance, handedBack: money, method } });
  revalidatePath(`/customers/${customer.id}`);
  revalidatePath("/prepaid");
  revalidatePath("/daily-summary");
  return {};
}
