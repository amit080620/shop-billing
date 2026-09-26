import {
  addProgressLogAction,
  bookClassAction,
  checkInMemberAction,
  createClassAction,
  createDietPlanAction,
  createLeadAction,
  createMembershipPlanAction,
  createWorkoutPlanAction,
  freezeMembershipAction,
  saveKioskSettingsAction,
  sellMembershipAction,
  updateLeadStatusAction,
} from "@/lib/actions/gym";
import { dateOffset, fakePhone, formData, isoAt, personName } from "../util";
import type { Catalog } from "./catalogs";
import { insertCatalog, insertCustomers, insertVendors, seedBills, seedPettyCash, seedPurchases, STANDARD_PETTY_CASH, type SeedCtx } from "./common";

const SHOP: Catalog = [
  {
    category: "Supplements",
    items: [
      { name: "Whey Protein 1kg (Chocolate)", price: 2499, gst: 18, hsn: "2106", unit: "JAR", mrp: 2999, stock: 20, low: 5 },
      { name: "Creatine Monohydrate 250g", price: 899, gst: 18, hsn: "2106", unit: "JAR", stock: 25, low: 6 },
      { name: "BCAA Powder 300g", price: 1199, gst: 18, hsn: "2106", unit: "JAR", stock: 14, low: 4 },
      { name: "Protein Bar (box of 12)", price: 1080, gst: 18, hsn: "1806", unit: "BOX", stock: 18, low: 4 },
    ],
  },
  {
    category: "Gear & Drinks",
    items: [
      { name: "Gym Gloves", price: 349, gst: 18, hsn: "6116", unit: "PAIR", stock: 22, low: 5 },
      { name: "Shaker Bottle 700ml", price: 249, gst: 18, hsn: "3924", unit: "NOS", stock: 40, low: 8 },
      { name: "Gym Towel", price: 199, gst: 12, hsn: "6302", unit: "NOS", stock: 30, low: 6 },
      { name: "Electrolyte Drink", price: 60, gst: 12, hsn: "2202", unit: "BTL", stock: 90, low: 20 },
      { name: "Locker Rental (monthly)", price: 300, gst: 18, hsn: "9997", unit: "NOS", stock: 0 },
    ],
  },
];

const PLANS = [
  { name: "Monthly", days: 30, price: 1500, pt: 0 },
  { name: "Quarterly", days: 90, price: 4000, pt: 0 },
  { name: "Half-yearly", days: 180, price: 7000, pt: 0 },
  { name: "Annual", days: 365, price: 12000, pt: 0 },
  { name: "Personal Training - Monthly (12 sessions)", days: 30, price: 5500, pt: 12 },
];

export async function seedGym(ctx: SeedCtx): Promise<void> {
  const products = await insertCatalog(ctx, SHOP);
  const members = await insertCustomers(ctx, 42, { withGstin: 0, otherState: 0 });
  const vendors = await insertVendors(ctx, [{ name: "MuscleTech Distributors" }, { name: "FitGear Wholesale" }]);
  await seedPurchases(ctx, vendors, products, [{ daysAgo: 18, vendorIndex: 0, productIndexes: [0, 1, 2, 3], qty: 15, paidShare: 1 }, { daysAgo: 8, vendorIndex: 1, productIndexes: [4, 5, 6], qty: 20, paidShare: 0.7 }]);
  for (const [i, m] of members.entries()) {
    await ctx.admin.from("customers").update({ gender: i % 3 === 0 ? "female" : "male", height_cm: 155 + ((i * 5) % 30), weight_kg: 58 + ((i * 3) % 30), fitness_goal: ["Weight loss", "Muscle gain", "General fitness", "Strength"][i % 4] }).eq("id", m.id);
  }

  for (const p of PLANS) {
    await createMembershipPlanAction(null, formData({ name: p.name, durationDays: p.days, price: p.price, ptSessionsIncluded: p.pt }));
  }
  const { data: plans } = await ctx.admin.from("membership_plans").select("id, name, duration_days, price, pt_sessions_included").eq("shop_id", ctx.shopId);
  const planByName = (n: string) => plans!.find((p) => p.name === n)!;

  // Members in every state: settled in, expiring this week, lapsed, frozen. `startOffset` is when it began.
  const layout: { plan: string; startOffset: number; paidShare?: number }[] = [
    ...Array.from({ length: 14 }, (_, i) => ({ plan: "Monthly", startOffset: -(2 + i * 2) })),
    ...Array.from({ length: 8 }, (_, i) => ({ plan: "Quarterly", startOffset: -(8 + i * 9) })),
    ...Array.from({ length: 5 }, (_, i) => ({ plan: "Half-yearly", startOffset: -(20 + i * 30) })),
    ...Array.from({ length: 3 }, (_, i) => ({ plan: "Annual", startOffset: -(60 + i * 90) })),
    { plan: "Personal Training - Monthly (12 sessions)", startOffset: -6 },
    { plan: "Personal Training - Monthly (12 sessions)", startOffset: -15 },
    { plan: "Personal Training - Monthly (12 sessions)", startOffset: -24 },
    // ending in the next few days
    { plan: "Monthly", startOffset: -27 },
    { plan: "Monthly", startOffset: -28 },
    { plan: "Monthly", startOffset: -29 },
    { plan: "Quarterly", startOffset: -86 },
    // lapsed recently
    { plan: "Monthly", startOffset: -40 },
    { plan: "Monthly", startOffset: -48 },
    { plan: "Quarterly", startOffset: -110 },
    { plan: "Monthly", startOffset: -65 },
  ];
  const membershipIds: { id: string; memberId: string; start: number; days: number }[] = [];
  for (const [i, l] of layout.entries()) {
    const member = members[i % members.length];
    const plan = planByName(l.plan);
    const price = Number(plan.price);
    const paid = i % 11 === 5 ? Math.round(price * 0.5) : price; // one or two still owe the balance
    const sold = await sellMembershipAction({
      memberId: member.id,
      memberName: member.name,
      memberPhone: member.phone,
      planId: plan.id,
      planName: plan.name,
      durationDays: plan.duration_days,
      price,
      ptSessionsIncluded: plan.pt_sessions_included,
      paymentMethod: ctx.random.pick(["upi", "cash", "card"] as const),
      paidAmount: paid,
    });
    if (sold.error || !sold.billId) throw new Error(`demo: membership: ${sold.error}`);
    const start = dateOffset(l.startOffset);
    const end = dateOffset(l.startOffset + plan.duration_days);
    const { data: ms } = await ctx.admin.from("memberships").update({ start_date: start, end_date: end, created_at: isoAt(-l.startOffset, 10, 20) }).eq("bill_id", sold.billId).select("id").single();
    await ctx.admin.from("bills").update({ created_at: isoAt(-l.startOffset, 10, 20) }).eq("id", sold.billId);
    membershipIds.push({ id: ms!.id, memberId: member.id, start: l.startOffset, days: plan.duration_days });
  }
  // Personal-training members have used some of their sessions.
  for (const [k, ms] of membershipIds.filter((_, i) => layout[i].plan.startsWith("Personal")).entries()) {
    await ctx.admin.from("memberships").update({ pt_sessions_used: 3 + k * 3 }).eq("id", ms.id);
  }
  // One member is on a freeze.
  if (membershipIds[2]) await freezeMembershipAction(membershipIds[2].id, 7);

  // Attendance for the last fortnight: members with a live membership come most days.
  const live = membershipIds.filter((m) => m.start + m.days >= -14 && m.start <= -1);
  const rows: { shop_id: string; member_id: string; checked_in_at: string; checked_out_at: string }[] = [];
  for (let d = 14; d >= 1; d--) {
    for (const m of live) {
      if (!ctx.random.chance(0.42)) continue;
      const hour = ctx.random.pick([6, 7, 8, 18, 19, 20]);
      const inAt = isoAt(d, hour, ctx.random.int(0, 45));
      rows.push({ shop_id: ctx.shopId, member_id: m.memberId, checked_in_at: inAt, checked_out_at: new Date(new Date(inAt).getTime() + ctx.random.int(45, 95) * 60000).toISOString() });
    }
  }
  if (rows.length) await ctx.admin.from("gym_attendance").insert(rows);
  // Some members are inside right now.
  for (const m of live.slice(0, 5)) await checkInMemberAction(m.memberId);

  // Group classes and this week's bookings.
  const classes: { name: string; day: number; time: string; duration: number; cap: number }[] = [
    { name: "Morning Yoga", day: 1, time: "06:30", duration: 60, cap: 15 },
    { name: "Morning Yoga", day: 3, time: "06:30", duration: 60, cap: 15 },
    { name: "Morning Yoga", day: 5, time: "06:30", duration: 60, cap: 15 },
    { name: "Zumba", day: 2, time: "18:30", duration: 50, cap: 20 },
    { name: "Zumba", day: 4, time: "18:30", duration: 50, cap: 20 },
    { name: "HIIT Circuit", day: 6, time: "07:00", duration: 45, cap: 12 },
    { name: "Spin Class", day: 0, time: "18:00", duration: 45, cap: 10 },
  ];
  for (const c of classes) await createClassAction(null, formData({ name: c.name, dayOfWeek: c.day, startTime: c.time, durationMinutes: c.duration, capacity: c.cap }));
  const { data: classRows } = await ctx.admin.from("gym_classes").select("id, day_of_week").eq("shop_id", ctx.shopId);
  for (const c of classRows ?? []) {
    // The next date this class runs.
    let offset = 0;
    for (; offset < 7; offset++) if (new Date(`${dateOffset(offset)}T12:00:00Z`).getUTCDay() === c.day_of_week) break;
    for (const m of live.slice(0, 6 + (c.day_of_week % 4))) await bookClassAction(c.id, m.memberId, dateOffset(offset));
  }

  // People who asked about joining.
  const leads: { name: string; source: string; plan: string; status: "new" | "contacted" | "trial" | "converted" | "lost" }[] = [
    { name: personName(ctx.random), source: "Instagram", plan: "Quarterly", status: "new" },
    { name: personName(ctx.random), source: "Walk-in", plan: "Monthly", status: "new" },
    { name: personName(ctx.random), source: "Friend referral", plan: "Annual", status: "contacted" },
    { name: personName(ctx.random), source: "Google", plan: "Personal Training", status: "trial" },
    { name: personName(ctx.random), source: "Walk-in", plan: "Monthly", status: "trial" },
    { name: personName(ctx.random), source: "Instagram", plan: "Half-yearly", status: "converted" },
    { name: personName(ctx.random), source: "Poster", plan: "Monthly", status: "lost" },
  ];
  for (const [i, l] of leads.entries()) {
    await createLeadAction(null, formData({ name: l.name, phone: fakePhone(700 + i), source: l.source, interestedPlan: l.plan }));
  }
  const { data: leadRows } = await ctx.admin.from("leads").select("id").eq("shop_id", ctx.shopId).order("created_at");
  for (const [i, row] of (leadRows ?? []).entries()) {
    if (leads[i].status !== "new") await updateLeadStatusAction(row.id, leads[i].status);
    await ctx.admin.from("leads").update({ created_at: isoAt(i * 2, 12) }).eq("id", row.id);
  }

  // Workout and diet plans and progress for a few members.
  const strength = [
    { muscleGroup: "Chest", exerciseName: "Bench Press", sets: 4, reps: "8-10", restSeconds: 90 },
    { muscleGroup: "Chest", exerciseName: "Incline Dumbbell Press", sets: 3, reps: "10-12", restSeconds: 75 },
    { muscleGroup: "Triceps", exerciseName: "Rope Pushdown", sets: 3, reps: "12-15", restSeconds: 60 },
    { muscleGroup: "Legs", exerciseName: "Barbell Squat", sets: 4, reps: "8", restSeconds: 120 },
  ];
  for (const m of members.slice(0, 5)) {
    await createWorkoutPlanAction({ memberId: m.id, title: "4-week strength split", notes: "Increase weight when the top of the rep range feels easy.", exercises: strength });
    await createDietPlanAction({
      memberId: m.id,
      goal: "Lean muscle gain",
      notes: "2.5-3 litres of water a day.",
      meals: [
        { mealSlot: "breakfast", foodItems: "Oats with milk, 3 egg whites, banana", calories: 450 },
        { mealSlot: "lunch", foodItems: "2 rotis, dal, paneer sabzi, salad", calories: 650 },
        { mealSlot: "post_workout", foodItems: "Whey protein shake, 1 fruit", calories: 250 },
        { mealSlot: "dinner", foodItems: "Grilled chicken or tofu, sauteed vegetables, 1 roti", calories: 500 },
      ],
    });
    for (const w of [82, 81.2, 80.5, 79.9]) await addProgressLogAction({ memberId: m.id, weightKg: w - (members.indexOf(m) % 3), bodyFatPercent: 22 - (members.indexOf(m) % 4), note: "Feeling stronger" });
  }
  const { data: logs } = await ctx.admin.from("progress_logs").select("id").eq("shop_id", ctx.shopId).order("created_at");
  for (const [i, row] of (logs ?? []).entries()) await ctx.admin.from("progress_logs").update({ created_at: isoAt(28 - (i % 4) * 8, 9) }).eq("id", row.id);

  await saveKioskSettingsAction(true);

  // Supplements and gear sold at the desk.
  await seedBills(ctx, products, members, { count: 26, days: 30, itemsPerBill: [1, 2], qty: [1, 2], customerShare: 0.7, udhaarShare: 0.05 });
  await seedPettyCash(ctx, [{ description: "Equipment servicing - treadmill", amount: 3500, category: "Maintenance", daysAgo: 6 }, { description: "Music system repair", amount: 1800, category: "Maintenance", daysAgo: 11 }, ...STANDARD_PETTY_CASH.slice(0, 3)]);
}
