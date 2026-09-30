import type { createSupabaseAdminClient } from "./supabase/admin";
import { monthPay, type AttendanceStatus } from "./payroll";
import { salonExtrasReady } from "./salonExtras";
import { loadWorkLines, personKey, stylistTotals } from "./commission";

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

export type Worker = { id: string; name: string; phone: string | null; designation: string | null; payType: "monthly" | "daily"; monthlySalary: number; dailyWage: number; joinedOn: string | null; isActive: boolean; staffId: string | null; commissionServicePercent: number; commissionProductPercent: number };

type WorkerRow = { id: string; name: string; phone: string | null; designation: string | null; pay_type: "monthly" | "daily"; monthly_salary: number; daily_wage: number; joined_on: string | null; is_active: boolean; staff_id: string | null; commission_service_percent?: number; commission_product_percent?: number };

export async function loadWorkers(admin: Admin, shopId: string, includeInactive = false): Promise<Worker[]> {
  // Commission rates exist once migration 0048 has run.
  const columns = "id, name, phone, designation, pay_type, monthly_salary, daily_wage, joined_on, is_active, staff_id" + ((await salonExtrasReady(admin)) ? ", commission_service_percent, commission_product_percent" : "");
  let q = admin.from("workers").select(columns).eq("shop_id", shopId).order("name");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data } = (await q) as unknown as { data: WorkerRow[] | null };
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
    commissionServicePercent: Number(w.commission_service_percent ?? 0),
    commissionProductPercent: Number(w.commission_product_percent ?? 0),
  }));
}

export type Payment = { id: string; kind: "advance" | "salary" | "bonus"; amount: number; method: string; note: string | null; createdAt: string };

/** The salary sheet for a month: every worker's marks, pay and what was already given. */
export async function loadMonthSheet(admin: Admin, shopId: string, month: string) {
  const workers = await loadWorkers(admin, shopId, true);
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  // Commission for the month, for people with a rate: what they did in India's calendar month.
  const commissionOf = new Map<string, number>();
  if (workers.some((w) => w.commissionServicePercent > 0 || w.commissionProductPercent > 0)) {
    const from = new Date(`${start}T00:00:00+05:30`);
    const to = new Date(new Date(`${next}T00:00:00+05:30`).getTime() - 1);
    const { rows } = stylistTotals(
      await loadWorkLines(admin, shopId, from, to),
      workers.map((w) => ({ name: w.name, servicePercent: w.commissionServicePercent, productPercent: w.commissionProductPercent })),
    );
    for (const r of rows) commissionOf.set(personKey(r.name), r.commission);
  }
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
        commission: commissionOf.get(personKey(w.name)) ?? 0,
      });
      const payments: Payment[] = own.map((p) => ({ id: p.id, kind: p.kind, amount: Number(p.amount), method: p.payment_method, note: p.note, createdAt: p.created_at }));
      return { worker: w, pay, advances: sum("advance"), bonuses: sum("bonus"), salaryPaid: sum("salary"), payments };
    })
    // Former workers only while this month still concerns them.
    .filter((r) => r.worker.isActive || r.payments.length > 0);
}
