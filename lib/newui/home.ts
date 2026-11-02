import "server-only";
import type { createSupabaseAdminClient } from "../supabase/admin";
import { allRows } from "../supabase/allRows";
import { addDaysIso, isoDaysAgo, todayIso } from "../dateHelpers";
import { loadBillPayments } from "../billPayments";
import { onlyUdhaar, paidByMode } from "../billPaymentSplit";
import { getShopMoneySummary } from "../moneyBalances";
import { computeProfit } from "../profit";
import { isModuleEnabled } from "../modules";
import { METHODS, emptyTotals, type Method } from "../dailyMoney";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type HomePeriod = "today" | "yesterday" | "month";
export const HOME_PERIODS: HomePeriod[] = ["today", "yesterday", "month"];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const IST_HOUR = new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" });
const IST_DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" });

/** IST days covered by a period, and the one it is compared with. */
export function periodRange(period: HomePeriod, today = todayIso()) {
  if (period === "yesterday") {
    const d = addDaysIso(today, -1);
    return { from: d, to: d, prevFrom: addDaysIso(today, -2), prevTo: addDaysIso(today, -2) };
  }
  if (period === "month") {
    const from = `${today.slice(0, 8)}01`;
    // Last month up to the same day of the month (or its end).
    const prevMonthEnd = addDaysIso(from, -1);
    const prevFrom = `${prevMonthEnd.slice(0, 8)}01`;
    const day = Math.min(Number(today.slice(8, 10)), Number(prevMonthEnd.slice(8, 10)));
    return { from, to: today, prevFrom, prevTo: `${prevMonthEnd.slice(0, 8)}${String(day).padStart(2, "0")}` };
  }
  return { from: today, to: today, prevFrom: isoDaysAgo(1), prevTo: isoDaysAgo(1) };
}

const startOf = (d: string) => `${d}T00:00:00+05:30`;
const endOf = (d: string) => `${d}T23:59:59.999+05:30`;

type BillRow = {
  id: string;
  invoice_number: string;
  total: number;
  paid_amount: number;
  credit_amount: number;
  payment_method: string;
  gst_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  created_at: string;
  customer_id: string | null;
};

/** Everything the New look's retail Home shows (app/(dashboard)/dashboard/NewRetailHome), from the
 * same records and helpers as the Classic Home and the Daily summary: bills of the period, money
 * received by mode the way the Daily summary splits it (lib/billPaymentSplit paidByMode), udhaar
 * given, GST on sales, the Profit report's figures (Pro), balances (shop_money_summary) and stock
 * at or below its alert level. */
export async function loadNewHome(admin: Admin, shop: { shopId: string; enabledModules: string[] | null }, period: HomePeriod) {
  const { from, to, prevFrom, prevTo } = periodRange(period);
  const profitOn = isModuleEnabled(shop.enabledModules, "advanced_reports");

  const [bills, prev, money, products, profit] = await Promise.all([
    allRows<BillRow>((a, b) =>
      admin
        .from("bills")
        .select("id, invoice_number, total, paid_amount, credit_amount, payment_method, gst_amount, cgst_amount, sgst_amount, igst_amount, created_at, customer_id")
        .eq("shop_id", shop.shopId)
        .eq("status", "active")
        .gte("created_at", startOf(from))
        .lte("created_at", endOf(to))
        .order("created_at", { ascending: true })
        .order("id")
        .range(a, b),
    ),
    allRows<{ total: number }>((a, b) =>
      admin.from("bills").select("total").eq("shop_id", shop.shopId).eq("status", "active").gte("created_at", startOf(prevFrom)).lte("created_at", endOf(prevTo)).order("id").range(a, b),
    ),
    getShopMoneySummary(admin, shop.shopId),
    allRows<{ id: string; name: string; stock_quantity: number; low_stock_threshold: number }>((a, b) =>
      admin.from("products").select("id, name, stock_quantity, low_stock_threshold").eq("shop_id", shop.shopId).eq("track_inventory", true).order("id").range(a, b),
    ),
    profitOn ? computeProfit(admin, shop, from, to) : Promise.resolve(null),
  ]);

  const list = bills.data;
  const total = round2(list.reduce((s, b) => s + Number(b.total), 0));
  const prevTotal = round2(prev.data.reduce((s, b) => s + Number(b.total), 0));

  // Money received at the sale, by mode — split bills count each part (migration 0061).
  const rows = await loadBillPayments(admin, list.map((b) => b.id));
  const byMode = emptyTotals();
  let udhaar = 0;
  for (const b of list) {
    for (const p of paidByMode(Number(b.paid_amount), b.payment_method, rows.get(b.id))) {
      const m = (METHODS as readonly string[]).includes(p.method) ? (p.method as Method) : "other";
      byMode[m] = round2(byMode[m] + p.amount);
    }
    udhaar = round2(udhaar + Number(b.credit_amount));
  }

  const gst = {
    total: round2(list.reduce((s, b) => s + Number(b.gst_amount), 0)),
    cgst: round2(list.reduce((s, b) => s + Number(b.cgst_amount), 0)),
    sgst: round2(list.reduce((s, b) => s + Number(b.sgst_amount), 0)),
    igst: round2(list.reduce((s, b) => s + Number(b.igst_amount), 0)),
  };

  // Sales through the day (by hour) or through the month (by day).
  const series: { label: string; value: number; count: number }[] = [];
  if (period === "month") {
    const days = Number(to.slice(8, 10));
    for (let d = 1; d <= days; d++) series.push({ label: String(d), value: 0, count: 0 });
    for (const b of list) {
      const s = series[Number(IST_DAY.format(new Date(b.created_at))) - 1];
      if (s) { s.value = round2(s.value + Number(b.total)); s.count += 1; }
    }
  } else {
    const hours = list.map((b) => Number(IST_HOUR.format(new Date(b.created_at))));
    const first = Math.min(8, ...hours);
    const last = Math.max(21, ...hours);
    for (let h = first; h <= last; h++) series.push({ label: hourLabel(h), value: 0, count: 0 });
    for (let i = 0; i < list.length; i++) {
      const s = series[hours[i] - first];
      s.value = round2(s.value + Number(list[i].total));
      s.count += 1;
    }
  }
  const busiest = [...series].sort((a, b) => b.value - a.value)[0];

  // The latest bills of the period, newest first, with what the register table shows.
  const latest = [...list].reverse().slice(0, 8);
  const [{ data: who }, { data: items }] = latest.length
    ? await Promise.all([
        admin.from("customers").select("id, name, phone").in("id", [...new Set(latest.map((b) => b.customer_id).filter((id): id is string => !!id))]),
        admin.from("bill_items").select("bill_id").in("bill_id", latest.map((b) => b.id)),
      ])
    : [{ data: [] as { id: string; name: string; phone: string | null }[] }, { data: [] as { bill_id: string }[] }];
  const people = new Map((who ?? []).map((c) => [c.id, c]));
  const itemCount = new Map<string, number>();
  for (const i of items ?? []) itemCount.set(i.bill_id, (itemCount.get(i.bill_id) ?? 0) + 1);
  const recent = latest.map((b) => {
    const split = rows.get(b.id) ?? [];
    const paid = Number(b.paid_amount);
    const credit = Number(b.credit_amount);
    const mode: { kind: "udhaar" | "part" | "split" | "single"; methods: string[] } = onlyUdhaar(paid, credit)
      ? { kind: "udhaar", methods: [] }
      : split.length > 1
        ? { kind: "split", methods: split.map((s) => s.method) }
        : { kind: credit > 0.005 ? "part" : "single", methods: [split[0]?.method ?? b.payment_method] };
    const person = b.customer_id ? people.get(b.customer_id) : undefined;
    return {
      id: b.id,
      number: b.invoice_number,
      at: b.created_at,
      customer: person?.name ?? null,
      phone: person?.phone ?? null,
      items: itemCount.get(b.id) ?? 0,
      gst: Number(b.gst_amount),
      total: Number(b.total),
      credit,
      mode,
    };
  });

  const stock = products.data;
  const low = stock.filter((p) => Number(p.stock_quantity) <= Number(p.low_stock_threshold)).sort((a, b) => Number(a.stock_quantity) - Number(b.stock_quantity));

  return {
    period,
    from,
    to,
    sales: { total, count: list.length, prevTotal, average: list.length ? round2(total / list.length) : 0 },
    byMode,
    udhaar,
    gst,
    series,
    busiest: busiest && busiest.value > 0 ? busiest : null,
    recent,
    money,
    stock: { low: low.length, out: low.filter((p) => Number(p.stock_quantity) <= 0).length, names: low.slice(0, 4).map((p) => p.name) },
    profit: profit ? { total: round2(profit.totalProfit), margin: profit.margin, uncosted: profit.unknown.length } : null,
    profitOn,
  };
}

function hourLabel(h: number) {
  const suffix = h < 12 ? "am" : "pm";
  const n = h % 12 === 0 ? 12 : h % 12;
  return `${n}${suffix}`;
}

export type NewHomeData = Awaited<ReturnType<typeof loadNewHome>>;
