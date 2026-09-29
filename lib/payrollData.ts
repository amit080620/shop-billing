import type { createSupabaseAdminClient } from "./supabase/admin";
import { monthPay, type AttendanceStatus } from "./payroll";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

let ready = false;
/** Whether migration 0046 (workers, attendance, payments) has been applied. */
export async function payrollReady(admin: Admin): Promise<boolean> {
  if (ready) return true;
  const { error } = await admin.from("workers").select("id").limit(1);
  if (error) return false;
  ready = true;
  return true;
}

export type Worker = { id: string; name: string; phone: string | null; designation: string | null; payType: "monthly" | "daily"; monthlySalary: number; dailyWage: number; joinedOn: string | null; isActive: boolean; staffId: string | null };

export async function loadWorkers(admin: Admin, shopId: string, includeInactive = false): Promise<Worker[]> {
  let q = admin.from("workers").select("id, name, phone, designation, pay_type, monthly_salary, daily_wage, joined_on, is_active, staff_id").eq("shop_id", shopId).order("name");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data } = await q;
  return (data ?? []).map((w) => ({
    id: w.id,
    name: w.name,
    phone: w.phone,
    designation: w.designation,
    payType: w.pay_type,
    monthlySalary: Number(w.monthly_salary),
    dailyWage: Number(w.daily_wage),
    joinedOn: w.joined_on,
    isActive: w.is_active,
    staffId: w.staff_id,
  }));
}

export type Payment = { id: string; kind: "advance" | "salary" | "bonus"; amount: number; method: string; note: string | null; createdAt: string };

/** The salary sheet for a month: every worker's marks, pay and what was already given. */
export async function loadMonthSheet(admin: Admin, shopId: string, month: string) {
  const workers = await loadWorkers(admin, shopId, true);
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const [{ data: marks }, { data: pays }] = await Promise.all([
    admin.from("worker_attendance").select("worker_id, status").eq("shop_id", shopId).gte("work_date", start).lt("work_date", next),
    admin.from("worker_payments").select("id, worker_id, kind, amount, payment_method, note, created_at").eq("shop_id", shopId).eq("for_month", month).order("created_at"),
  ]);
  return workers
    .map((w) => {
      const own = (pays ?? []).filter((p) => p.worker_id === w.id);
      const sum = (k: string) => own.filter((p) => p.kind === k).reduce((s, p) => s + Number(p.amount), 0);
      const pay = monthPay({
        month,
        payType: w.payType,
        monthlySalary: w.monthlySalary,
        dailyWage: w.dailyWage,
        joinedOn: w.joinedOn,
        marks: (marks ?? []).filter((a) => a.worker_id === w.id).map((a) => a.status as AttendanceStatus),
        advances: sum("advance"),
        bonuses: sum("bonus"),
        salaryPaid: sum("salary"),
      });
      const payments: Payment[] = own.map((p) => ({ id: p.id, kind: p.kind, amount: Number(p.amount), method: p.payment_method, note: p.note, createdAt: p.created_at }));
      return { worker: w, pay, advances: sum("advance"), bonuses: sum("bonus"), salaryPaid: sum("salary"), payments };
    })
    // Former workers only while this month still concerns them.
    .filter((r) => r.worker.isActive || r.payments.length > 0);
}
