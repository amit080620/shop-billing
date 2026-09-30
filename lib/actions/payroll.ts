"use server";

import { revalidatePath } from "next/cache";
import { hasPermission, requireOwner, requireSession, type SessionContext } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { logAuditEvent } from "../audit";
import { payrollReady } from "../payrollData";
import { todayIso } from "../dateHelpers";
import { salonExtrasReady } from "../salonExtras";

const NOT_READY = "Staff attendance needs a one-time database update — ask the owner to run migration 0046.";
const NO_PERMISSION = "Only the owner (or staff allowed to manage staff) can do this.";

const canManage = (s: SessionContext) => hasPermission(s, "manage_staff");

async function open() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!(await payrollReady(admin))) return { error: NOT_READY } as const;
  if (!canManage(session)) return { error: NO_PERMISSION } as const;
  return { session, admin } as const;
}

function refresh() {
  revalidatePath("/staff-attendance");
  revalidatePath("/staff-attendance/salary");
  revalidatePath("/staff-attendance/people");
}

export async function saveWorkerAction(input: {
  id?: string | null;
  name: string;
  phone: string;
  designation: string;
  payType: "monthly" | "daily";
  monthlySalary: number;
  dailyWage: number;
  joinedOn: string;
  isActive: boolean;
  /** A salon's commission: the share of services (and products) this person does. */
  commissionServicePercent?: number;
  commissionProductPercent?: number;
}): Promise<{ error?: string }> {
  const ctx = await open();
  if ("error" in ctx) return { error: ctx.error };
  const { session, admin } = ctx;
  const name = input.name.trim();
  if (!name) return { error: "Enter the name" };
  const salary = Math.max(0, Number(input.monthlySalary) || 0);
  const wage = Math.max(0, Number(input.dailyWage) || 0);
  if (input.payType === "monthly" && salary <= 0) return { error: "Enter the monthly salary" };
  if (input.payType === "daily" && wage <= 0) return { error: "Enter the daily wage" };
  const row = {
    name: name.slice(0, 80),
    phone: input.phone.replace(/\D/g, "").slice(-10) || null,
    designation: input.designation.trim().slice(0, 60) || null,
    pay_type: input.payType,
    monthly_salary: input.payType === "monthly" ? salary : 0,
    daily_wage: input.payType === "daily" ? wage : 0,
    joined_on: /^\d{4}-\d{2}-\d{2}$/.test(input.joinedOn) ? input.joinedOn : null,
    is_active: input.isActive,
  };
  const percent = (n: number | undefined) => Math.round(Math.min(100, Math.max(0, Number(n) || 0)) * 100) / 100;
  const commission =
    (input.commissionServicePercent !== undefined || input.commissionProductPercent !== undefined) && (await salonExtrasReady(admin))
      ? { commission_service_percent: percent(input.commissionServicePercent), commission_product_percent: percent(input.commissionProductPercent) }
      : {};
  const { error } = input.id
    ? await admin.from("workers").update({ ...row, ...commission }).eq("id", input.id).eq("shop_id", session.shopId)
    : await admin.from("workers").insert({ ...row, ...commission, shop_id: session.shopId });
  if (error) return { error: "Could not save — try again." };
  refresh();
  return {};
}

/** Puts every staff login on the payroll list (salary to be filled in), once. */
export async function addLoginStaffToListAction(): Promise<{ error?: string; added?: number }> {
  const ctx = await open();
  if ("error" in ctx) return { error: ctx.error };
  const { session, admin } = ctx;
  const [{ data: logins }, { data: existing }] = await Promise.all([
    admin.from("staff").select("id, name, role").eq("shop_id", session.shopId),
    admin.from("workers").select("staff_id").eq("shop_id", session.shopId).not("staff_id", "is", null),
  ]);
  const have = new Set((existing ?? []).map((w) => w.staff_id));
  const toAdd = (logins ?? []).filter((s) => s.role !== "owner" && !have.has(s.id));
  if (toAdd.length) {
    const { error } = await admin.from("workers").insert(toAdd.map((s) => ({ shop_id: session.shopId, staff_id: s.id, name: s.name, pay_type: "monthly" as const, monthly_salary: 0 })));
    if (error) return { error: "Could not add — try again." };
  }
  refresh();
  return { added: toAdd.length };
}

/** One mark for one worker on one day; `null` clears it. */
export async function markAttendanceAction(workerId: string, date: string, status: "present" | "half" | "absent" | "leave" | "off" | null): Promise<{ error?: string }> {
  const ctx = await open();
  if ("error" in ctx) return { error: ctx.error };
  const { session, admin } = ctx;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIso()) return { error: "Pick today or an earlier day." };
  const { data: worker } = await admin.from("workers").select("id").eq("id", workerId).eq("shop_id", session.shopId).maybeSingle();
  if (!worker) return { error: "Not found" };
  const { error } = status
    ? await admin.from("worker_attendance").upsert({ shop_id: session.shopId, worker_id: workerId, work_date: date, status, marked_by: session.userId }, { onConflict: "worker_id,work_date" })
    : await admin.from("worker_attendance").delete().eq("worker_id", workerId).eq("work_date", date);
  if (error) return { error: "Could not save — try again." };
  revalidatePath("/staff-attendance");
  return {};
}

/** Marks everyone not yet marked on that day as present. */
export async function markAllPresentAction(date: string): Promise<{ error?: string }> {
  const ctx = await open();
  if ("error" in ctx) return { error: ctx.error };
  const { session, admin } = ctx;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIso()) return { error: "Pick today or an earlier day." };
  const [{ data: workers }, { data: marked }] = await Promise.all([
    admin.from("workers").select("id").eq("shop_id", session.shopId).eq("is_active", true),
    admin.from("worker_attendance").select("worker_id").eq("shop_id", session.shopId).eq("work_date", date),
  ]);
  const done = new Set((marked ?? []).map((m) => m.worker_id));
  const rows = (workers ?? []).filter((w) => !done.has(w.id)).map((w) => ({ shop_id: session.shopId, worker_id: w.id, work_date: date, status: "present" as const, marked_by: session.userId }));
  if (rows.length) {
    const { error } = await admin.from("worker_attendance").insert(rows);
    if (error) return { error: "Could not save — try again." };
  }
  revalidatePath("/staff-attendance");
  return {};
}

/** Money given to a worker — an advance, the salary or a bonus — against a month. */
export async function recordWorkerPaymentAction(input: {
  workerId: string;
  month: string;
  kind: "advance" | "salary" | "bonus";
  amount: number;
  method: "cash" | "card" | "upi" | "online" | "other";
  note: string;
}): Promise<{ error?: string }> {
  const ctx = await open();
  if ("error" in ctx) return { error: ctx.error };
  const { session, admin } = ctx;
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!(amount > 0)) return { error: "Enter the amount" };
  if (!/^\d{4}-\d{2}$/.test(input.month)) return { error: "Pick the month" };
  const { data: worker } = await admin.from("workers").select("id, name").eq("id", input.workerId).eq("shop_id", session.shopId).maybeSingle();
  if (!worker) return { error: "Not found" };
  const { data: row, error } = await admin
    .from("worker_payments")
    .insert({ shop_id: session.shopId, worker_id: worker.id, for_month: input.month, kind: input.kind, amount, payment_method: input.method, note: input.note.trim().slice(0, 200) || null, staff_id: session.userId })
    .select("id")
    .single();
  if (error || !row) return { error: "Could not save — try again." };
  await logAuditEvent({ admin, shopId: session.shopId, staffId: session.userId, action: `worker_${input.kind}_paid`, entityType: "worker_payment", entityId: row.id, details: { worker: worker.name, month: input.month, amount, method: input.method } });
  refresh();
  revalidatePath("/daily-summary");
  return {};
}

/** Removes a payment entered by mistake — owner only, and written to the audit log. */
export async function deleteWorkerPaymentAction(paymentId: string): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin.from("worker_payments").select("id, kind, amount, for_month").eq("id", paymentId).eq("shop_id", session.shopId).maybeSingle();
  if (!row) return { error: "Not found" };
  const { error } = await admin.from("worker_payments").delete().eq("id", paymentId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not remove — try again." };
  await logAuditEvent({ admin, shopId: session.shopId, staffId: session.userId, action: "worker_payment_removed", entityType: "worker_payment", entityId: paymentId, details: { kind: row.kind, amount: Number(row.amount), month: row.for_month } });
  refresh();
  revalidatePath("/daily-summary");
  return {};
}
