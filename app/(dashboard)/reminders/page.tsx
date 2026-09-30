import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCreditEntries } from "@/lib/moneyBalances";
import { getTranslator } from "@/lib/i18n/server";
import { RemindersClient, type ReminderRow, type ReminderTab } from "./RemindersClient";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { formatMoney } from "@/lib/format";
import { addDaysIso, formatIsoDate, todayIso } from "@/lib/dateHelpers";

/** Which reminder lists a business gets besides udhaar. */
const MEMBERSHIPS = new Set(["gym"]);
const APPOINTMENTS = new Set(["salon", "clinic"]);
const time12 = (t: string) => {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "whatsapp_reminders")) return <ModuleBlocked moduleKey="whatsapp_reminders" />;
  const { lang, t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  const type = session.businessType;
  const tabs: ReminderTab[] = ["udhaar", ...(MEMBERSHIPS.has(type) ? (["membership"] as const) : []), ...(APPOINTMENTS.has(type) ? (["appointments"] as const) : [])];
  const { tab: tabParam } = await searchParams;
  // A gym's first worry is memberships running out; a salon's, tomorrow's bookings.
  const fallback: ReminderTab = MEMBERSHIPS.has(type) ? "membership" : APPOINTMENTS.has(type) ? "appointments" : "udhaar";
  const tab: ReminderTab = (tabs as string[]).includes(tabParam ?? "") ? (tabParam as ReminderTab) : fallback;
  const today = todayIso();

  let rows: ReminderRow[] = [];
  let summary: { label: string; value: string } | null = null;

  if (tab === "udhaar") {
    const [{ data: customers }, credits, { data: payments }] = await Promise.all([
      admin.from("customers").select("id, name, phone").eq("shop_id", session.shopId),
      // Oldest first (needed for FIFO aging below); includes restaurant-order
      // and rental udhaar, not just bills.
      getCreditEntries(admin, session.shopId),
      admin.from("payments").select("customer_id, amount").eq("shop_id", session.shopId),
    ]);

    const paidByCustomer = new Map<string, number>();
    for (const p of payments ?? []) {
      paidByCustomer.set(p.customer_id, (paidByCustomer.get(p.customer_id) ?? 0) + Number(p.amount));
    }

    const billsByCustomer = new Map<string, { credit: number; createdAt: string }[]>();
    for (const c of credits) {
      const list = billsByCustomer.get(c.customerId) ?? [];
      list.push({ credit: c.credit, createdAt: c.createdAt });
      billsByCustomer.set(c.customerId, list);
    }

    const now = Date.now();
    const withBalance = (customers ?? [])
      .map((c) => {
        const customerBills = billsByCustomer.get(c.id) ?? [];
        let remainingPayments = paidByCustomer.get(c.id) ?? 0;
        let balance = 0;
        let oldestPendingDate: string | null = null;

        // Apply payments against the oldest bills first (standard FIFO
        // settlement) — the age of the debt is how long the OLDEST bill that
        // still isn't fully covered has been sitting unpaid.
        for (const bill of customerBills) {
          const covered = Math.min(remainingPayments, bill.credit);
          remainingPayments -= covered;
          const pending = bill.credit - covered;
          if (pending > 0.01) {
            balance += pending;
            if (!oldestPendingDate) oldestPendingDate = bill.createdAt;
          }
        }

        const daysPending = oldestPendingDate ? Math.floor((now - new Date(oldestPendingDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;
        return { id: c.id, name: c.name, phone: c.phone, balance: Math.max(0, Math.round(balance * 100) / 100), daysPending };
      })
      .filter((c) => c.balance > 0)
      .sort((a, b) => b.daysPending - a.daysPending); // longest-overdue first

    summary = { label: t("Total outstanding"), value: formatMoney(withBalance.reduce((s, c) => s + c.balance, 0)) };
    rows = withBalance.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      href: `/customers/${c.id}`,
      detail: t("{amount} due", { amount: formatMoney(c.balance) }),
      badge: { label: c.daysPending === 0 ? t("Today") : t("{n}d pending", { n: c.daysPending }), tone: c.daysPending >= 30 ? "red" : c.daysPending >= 10 ? "orange" : "green" },
      message: t("wa.reminderMessage", { name: c.name, shop: session.shopName, amount: formatMoney(c.balance) }),
    }));
  } else if (tab === "membership") {
    // Ending in the next 7 days, or ended in the last 7 and not renewed yet.
    const { data: ms } = await admin
      .from("memberships")
      .select("id, member_id, plan_name, end_date")
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .gte("end_date", addDaysIso(today, -7))
      .lte("end_date", addDaysIso(today, 7))
      .order("end_date");
    const ids = [...new Set((ms ?? []).map((m) => m.member_id))];
    const [{ data: people }, { data: later }] = await Promise.all([
      ids.length ? admin.from("customers").select("id, name, phone").in("id", ids) : Promise.resolve({ data: [] as { id: string; name: string; phone: string }[] }),
      // Already renewed: a newer active membership that runs past this one.
      ids.length ? admin.from("memberships").select("member_id, end_date").eq("shop_id", session.shopId).eq("status", "active").in("member_id", ids).gt("end_date", addDaysIso(today, 7)) : Promise.resolve({ data: [] as { member_id: string; end_date: string }[] }),
    ]);
    const renewed = new Set((later ?? []).map((m) => m.member_id));
    const person = new Map((people ?? []).map((p) => [p.id, p]));
    const seen = new Set<string>();
    for (const m of ms ?? []) {
      const p = person.get(m.member_id);
      if (!p?.phone || renewed.has(m.member_id) || seen.has(m.member_id)) continue;
      seen.add(m.member_id);
      const days = Math.round((Date.parse(`${m.end_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
      rows.push({
        id: m.id,
        name: p.name,
        phone: p.phone,
        href: `/customers/${p.id}`,
        detail: `${m.plan_name} · ${formatIsoDate(m.end_date)}`,
        badge: { label: days < 0 ? t("Ended {n}d ago", { n: -days }) : days === 0 ? t("Ends today") : t("Ends in {n}d", { n: days }), tone: days < 0 ? "red" : days <= 2 ? "orange" : "green" },
        message: t("wa.gymExpiryReminder", { name: p.name, plan: m.plan_name, date: formatIsoDate(m.end_date) }) + t("— {shop}", { shop: session.shopName }),
      });
    }
    summary = { label: t("Memberships ending this week or just ended"), value: String(rows.length) };
  } else {
    const tomorrow = addDaysIso(today, 1);
    const list =
      type === "clinic"
        ? ((
            await admin
              .from("clinic_appointments")
              .select("id, patient_id, patient_name, patient_phone, reason_for_visit, appointment_time, doctor_name")
              .eq("shop_id", session.shopId)
              .eq("appointment_date", tomorrow)
              .in("status", ["booked", "confirmed"])
              .order("appointment_time")
          ).data ?? []
          ).map((a) => ({ id: a.id, customerId: a.patient_id, name: a.patient_name, phone: a.patient_phone, what: a.doctor_name ? `Dr. ${a.doctor_name}` : t("the doctor"), time: a.appointment_time }))
        : ((
            await admin
              .from("appointments")
              .select("id, customer_id, customer_name, customer_phone, service_name, stylist_name, appointment_time")
              .eq("shop_id", session.shopId)
              .eq("appointment_date", tomorrow)
              .in("status", ["booked", "confirmed"])
              .order("appointment_time")
          ).data ?? []
          ).map((a) => ({ id: a.id, customerId: a.customer_id, name: a.customer_name, phone: a.customer_phone, what: a.service_name, time: a.appointment_time }));
    rows = list
      .filter((a) => a.phone)
      .map((a) => ({
        id: a.id,
        name: a.name,
        phone: a.phone,
        href: a.customerId ? `/customers/${a.customerId}` : null,
        detail: `${a.what} · ${time12(a.time)}`,
        badge: { label: t("Tomorrow"), tone: "green" as const },
        message: t("wa.appointmentTomorrow", { name: a.name, shop: session.shopName, what: a.what, date: formatIsoDate(tomorrow), time: time12(a.time) }),
      }));
    summary = { label: t("Appointments tomorrow ({date})", { date: formatIsoDate(tomorrow) }), value: String(rows.length) };
  }

  return <RemindersClient lang={lang} tabs={tabs} tab={tab} rows={rows} summary={summary} today={today} />;
}
