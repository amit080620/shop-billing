import { MODULES, moduleRelevant, type ModuleKey } from "./modules";

/** The four plans The Ray sells, plus the custom deal a super admin can
 * shape per shop. One file so pricing, limits, module access, the badge
 * colour and the selling points can never drift apart. */
export type PlanKey = "free" | "basic" | "pro" | "pro_plus" | "custom";

export type PlanLimits = {
  /** Bills a shop may create per calendar month; null means no limit. */
  billsPerMonth: number | null;
  /** Items in the catalog; null means no limit. */
  products: number | null;
  /** Logins, owner included. */
  staff: number | null;
  /** Branches (the multi-branch module also has to be on). */
  branches: number | null;
};

export type Plan = {
  key: PlanKey;
  name: string;
  tagline: string;
  /** ₹ per year, and the per-month figure shown beside it. 0 for Free. */
  priceYearly: number;
  priceMonthly: number;
  badge: { label: string; bg: string; text: string; border: string };
  modules: ModuleKey[];
  limits: PlanLimits;
  /** What this plan adds over the one below it besides modules (limits, support, set-up) — the
   * modules it adds are listed from lib/modules, so the two can never disagree. */
  highlights: string[];
};

const ALL_MODULES: ModuleKey[] = MODULES.map((m) => m.key);

// What stays free is everything a shop needs to bill legally and run the day: GST invoices and
// filing, udhaar, the day's summary and closing the drawer, and each trade's own core (tables and
// KOT, appointments, rates by karat, bilty…).
// The ladder is built so most shops land on Pro: Basic is a light step up (no limits on bills, the
// counter's everyday helpers), Pro is where the money is — WhatsApp udhaar recovery, profit
// reports, online orders, staff salary, and the AI tools at a real daily allowance — for ₹1,000
// more than Basic; Pro + is for more than one shop, many staff or heavy AI use.
const BASIC_MODULES: ModuleKey[] = ["bulk_import_export", "quotations", "offers"];
const PRO_MODULES: ModuleKey[] = [
  ...BASIC_MODULES,
  "whatsapp_reminders",
  "delivery_challan",
  "staff_payroll",
  "customer_prepaid",
  "gold_schemes",
  "karigar_jobs",
  "advanced_reports",
  "public_catalog",
  "petty_cash",
  "stock_audit",
  "stylist_commission",
  "vehicle_profit",
  "recipe_stock",
  "leads_crm",
  "class_schedule",
];

export const PLANS: Record<Exclude<PlanKey, "custom">, Plan> & { custom: Plan } = {
  free: {
    key: "free",
    name: "Free",
    tagline: "Everything a small counter needs to bill legally",
    priceYearly: 0,
    priceMonthly: 0,
    badge: { label: "Free", bg: "#E2E8F0", text: "#334155", border: "#CBD5E1" },
    modules: [],
    limits: { billsPerMonth: 100, products: 60, staff: 1, branches: 1 },
    highlights: [
      "GST invoices, thermal and A4 printing",
      "GSTR-1, GSTR-3B and purchase register — always free",
      "100 bills a month, 60 items, 1 login",
      "Udhaar khata, day summary, closing the day and sales reports",
      "Works offline, and on the Android app",
    ],
  },
  basic: {
    key: "basic",
    name: "Basic",
    tagline: "No limit on bills — for a counter that is getting busy",
    priceYearly: 999,
    priceMonthly: 99,
    badge: { label: "Basic", bg: "#D1FAE5", text: "#065F46", border: "#6EE7B7" },
    modules: BASIC_MODULES,
    limits: { billsPerMonth: null, products: 300, staff: 2, branches: 1 },
    highlights: ["Unlimited bills", "300 items, 2 logins", "AI tools to try: a few a day"],
  },
  pro: {
    key: "pro",
    name: "Pro",
    tagline: "The full shop: udhaar recovery, profit, online orders, staff — and AI",
    priceYearly: 1999,
    priceMonthly: 199,
    badge: { label: "Pro", bg: "#E0E7FF", text: "#3730A3", border: "#A5B4FC" },
    modules: PRO_MODULES,
    limits: { billsPerMonth: null, products: null, staff: 5, branches: 1 },
    highlights: ["Unlimited items, 5 logins", "AI assistant, speak-to-bill and photo scan every day"],
  },
  pro_plus: {
    key: "pro_plus",
    name: "Pro +",
    tagline: "More than one shop, many staff, or heavy AI use",
    priceYearly: 2999,
    priceMonthly: 299,
    badge: { label: "Pro +", bg: "#FEF3C7", text: "#92400E", border: "#FCD34D" },
    modules: ALL_MODULES,
    limits: { billsPerMonth: null, products: null, staff: null, branches: 5 },
    highlights: ["Unlimited logins, up to 5 branches", "The most AI every day", "Priority support", "Set-up done for you: items loaded, printer, Google Business"],
  },
  custom: {
    key: "custom",
    name: "Custom",
    tagline: "A plan shaped for one shop",
    priceYearly: 0,
    priceMonthly: 0,
    badge: { label: "Custom", bg: "#FCE7F3", text: "#9D174D", border: "#F9A8D4" },
    modules: ALL_MODULES,
    limits: { billsPerMonth: null, products: null, staff: null, branches: null },
    highlights: ["Modules and limits set for this shop by The Ray"],
  },
};

export const PAID_PLAN_ORDER: PlanKey[] = ["free", "basic", "pro", "pro_plus"];

/** Restaurants and hotels run a kitchen, a floor and rooms — KOT, the kitchen screen, waiter and
 * captain logins, QR table orders, food cost per plate, room board and OTA bookings — so they buy
 * one complete plan, Pro + for their trade, at ₹12,000 a year (the price of a restaurant POS such
 * as Petpooja, with GST, udhaar and AI included). A smaller place builds a Custom plan instead. */
const VENUE_TRADES = ["restaurant", "hotel"] as const;
export const isVenueTrade = (businessType?: string | null) => VENUE_TRADES.includes(businessType as (typeof VENUE_TRADES)[number]);
const VENUE_PRICE = { yearly: 12000, monthly: 1199 };

/** The plans this kind of shop is offered, in order. */
export function offeredPlans(businessType?: string | null): PlanKey[] {
  return isVenueTrade(businessType) ? ["free", "pro_plus"] : PAID_PLAN_ORDER;
}

/** What a plan costs this kind of shop. */
export function planPrice(key: PlanKey, businessType?: string | null): { yearly: number; monthly: number } {
  if (key === "pro_plus" && isVenueTrade(businessType)) return VENUE_PRICE;
  const plan = planFor(key);
  return { yearly: plan.priceYearly, monthly: plan.priceMonthly };
}

/** The plan's name as this kind of shop sees it ("Pro + Restaurant"). */
export function planName(key: PlanKey, businessType?: string | null): string {
  if (key === "pro_plus" && isVenueTrade(businessType)) return businessType === "hotel" ? "Pro + Hotel" : "Pro + Restaurant";
  return key === "custom" ? PLANS.custom.name : planFor(key).name;
}

export function planTagline(key: PlanKey, businessType?: string | null): string {
  if (key === "pro_plus" && isVenueTrade(businessType)) {
    return businessType === "hotel" ? "Rooms, bookings, restaurant and room service — everything, one price" : "Tables, KOT, kitchen screen, QR orders and food cost — everything, one price";
  }
  return planFor(key).tagline;
}

/** AI allowance a day, by plan: the assistant (and the small AI helpers), speak-to-bill, and photo
 * scans (price lists, purchase bills, old khata, shelf watch). Each call costs The Ray money, so
 * Free and Basic get a taste and Pro is where it becomes an everyday tool. */
export type AiAllowance = { assistant: number; voice: number; scan: number };
export const AI_DAILY: Record<PlanKey, AiAllowance> = {
  free: { assistant: 5, voice: 5, scan: 2 },
  basic: { assistant: 10, voice: 10, scan: 3 },
  pro: { assistant: 100, voice: 100, scan: 30 },
  pro_plus: { assistant: 300, voice: 300, scan: 100 },
  custom: { assistant: 100, voice: 100, scan: 30 },
};

/** "Build your own plan": a base, then each feature the shop drops into its bucket, per year.
 * Priced so a full bucket costs more than the matching package — the screen then points to the
 * package (see cheaperPackage), which is what most shops should buy. */
export const CUSTOM_BASE = { standard: 499, venue: 4999 };
export const CUSTOM_MODULE_PRICE: Record<ModuleKey, number> = {
  bulk_import_export: 99,
  quotations: 149,
  offers: 149,
  whatsapp_reminders: 399,
  delivery_challan: 199,
  staff_payroll: 299,
  customer_prepaid: 249,
  gold_schemes: 299,
  karigar_jobs: 249,
  advanced_reports: 399,
  public_catalog: 399,
  petty_cash: 99,
  stock_audit: 149,
  stylist_commission: 199,
  vehicle_profit: 249,
  recipe_stock: 1499,
  leads_crm: 199,
  class_schedule: 199,
  self_checkin_kiosk: 299,
  audit_log: 199,
  multi_branch: 999,
};
export const CUSTOM_EXTRAS = { ai: 499, unlimitedItems: 199, extraLogins: 299 } as const;
/** Restaurant and hotel features cost more to run and support. */
const VENUE_FACTOR = 1.5;

export type CustomPick = { modules: ModuleKey[]; ai: boolean; unlimitedItems: boolean; extraLogins: boolean };

/** The yearly price of a custom bucket for this kind of shop. */
export function customQuote(pick: CustomPick, businessType?: string | null): number {
  const venue = isVenueTrade(businessType);
  const factor = venue ? VENUE_FACTOR : 1;
  const add = (n: number) => Math.round(n * factor);
  let total = venue ? CUSTOM_BASE.venue : CUSTOM_BASE.standard;
  for (const m of new Set(pick.modules)) total += add(CUSTOM_MODULE_PRICE[m] ?? 0);
  if (pick.ai) total += add(CUSTOM_EXTRAS.ai);
  if (pick.unlimitedItems) total += add(CUSTOM_EXTRAS.unlimitedItems);
  if (pick.extraLogins) total += add(CUSTOM_EXTRAS.extraLogins);
  // Ends in 9, like the packages.
  return Math.ceil((total + 1) / 10) * 10 - 1;
}

/** The cheapest package that already has everything in the bucket and costs less — so the screen
 * can say "Pro has all of this for ₹X less". */
export function cheaperPackage(pick: CustomPick, businessType?: string | null): { plan: PlanKey; yearly: number; saving: number } | null {
  const quote = customQuote(pick, businessType);
  for (const key of offeredPlans(businessType)) {
    if (key === "free") continue;
    const plan = planFor(key);
    const hasModules = pick.modules.every((m) => plan.modules.includes(m));
    const hasAi = !pick.ai || AI_DAILY[key].assistant >= AI_DAILY.pro.assistant;
    const hasItems = !pick.unlimitedItems || plan.limits.products === null;
    const hasLogins = !pick.extraLogins || plan.limits.staff === null || plan.limits.staff >= 5;
    const yearly = planPrice(key, businessType).yearly;
    if (hasModules && hasAi && hasItems && hasLogins && yearly < quote) return { plan: key, yearly, saving: quote - yearly };
  }
  return null;
}

export function planFor(key: string | null | undefined): Plan {
  return PLANS[(key ?? "free") as Exclude<PlanKey, "custom">] ?? PLANS.free;
}

/** Plans are ordered, so "does this shop have at least Pro" is a comparison
 * rather than a list of keys repeated at every call site. */
export function planRank(key: string | null | undefined): number {
  const index = PAID_PLAN_ORDER.indexOf((key ?? "free") as PlanKey);
  return index === -1 ? PAID_PLAN_ORDER.length : index; // custom sits above Pro+
}

/** The plan actually in force right now: a paid plan whose paid-until date
 * has passed falls back to Free (the shop keeps working, with Free's
 * limits, instead of being locked out), and a shop still inside its trial
 * gets Pro + regardless of what it pays. */
export function effectivePlan(shop: {
  plan?: string | null;
  subscription_valid_until?: string | null;
  trial_ends_at?: string | null;
}): { key: PlanKey; onTrial: boolean; expired: boolean } {
  const today = new Date();
  const trialEnds = shop.trial_ends_at ? new Date(shop.trial_ends_at) : null;
  // A date column means "through the end of that day": a plan that runs
  // until the 14th is still live on the 14th, not switched off at midnight
  // as it begins.
  const DAY = 86_400_000;
  const onTrial = !!trialEnds && trialEnds.getTime() + DAY > today.getTime();
  const plan = (shop.plan ?? "free") as PlanKey;
  const paidUntil = shop.subscription_valid_until ? new Date(shop.subscription_valid_until) : null;
  const expired = plan !== "free" && !!paidUntil && paidUntil.getTime() + DAY <= today.getTime();
  if (expired) return { key: onTrial ? "pro_plus" : "free", onTrial, expired: true };
  if (plan === "free" && onTrial) return { key: "pro_plus", onTrial: true, expired: false };
  return { key: plan, onTrial, expired: false };
}

/** The modules a plan includes, with any per-shop override winning — that
 * override is how a custom deal adds one module to an otherwise Basic
 * shop, and how support can switch something off for one shop. */
export function modulesForPlan(planKey: PlanKey, override: string[] | null): string[] {
  if (override !== null) return override;
  return planFor(planKey).modules;
}

export function limitsForPlan(planKey: PlanKey, override: Partial<PlanLimits> | null): PlanLimits {
  const base = planFor(planKey).limits;
  if (!override) return base;
  return {
    billsPerMonth: override.billsPerMonth === undefined ? base.billsPerMonth : override.billsPerMonth,
    products: override.products === undefined ? base.products : override.products,
    staff: override.staff === undefined ? base.staff : override.staff,
    branches: override.branches === undefined ? base.branches : override.branches,
  };
}

/** The message a shop sees when it runs into a limit — names the limit and
 * the plan that removes it, rather than a bare "not allowed". */
export function limitMessage(what: "bills" | "products" | "staff" | "branches", limit: number, planKey: PlanKey, businessType?: string | null): string {
  const next = nextPlanAfter(planKey, businessType);
  const nextName = next ? planName(next, businessType) : "a bigger plan";
  const nouns = {
    bills: `${limit} bills a month`,
    products: `${limit} items`,
    staff: `${limit} ${limit === 1 ? "login" : "logins"}`,
    branches: `${limit} ${limit === 1 ? "branch" : "branches"}`,
  };
  return `Your ${planName(planKey, businessType)} plan covers ${nouns[what]}. Upgrade to ${nextName} to carry on — open More → Plan & billing.`;
}

export function nextPlanAfter(planKey: PlanKey, businessType?: string | null): PlanKey | null {
  const order = offeredPlans(businessType);
  const i = order.indexOf(planKey);
  if (i === -1 || i >= order.length - 1) return null;
  return order[i + 1];
}

/** The cheapest plan this kind of shop is offered that includes a module — what a blocked screen
 * tells the shop to upgrade to. */
export function minPlanForModule(key: ModuleKey, businessType?: string | null): PlanKey {
  for (const plan of offeredPlans(businessType)) {
    if (planFor(plan).modules.includes(key)) return plan;
  }
  return "pro_plus";
}

/** The modules a plan adds over the plan below it — what its card lists — for this kind of shop. */
export function modulesAddedBy(planKey: PlanKey, businessType?: string): ModuleKey[] {
  const order = offeredPlans(businessType);
  const i = order.indexOf(planKey);
  const below = i > 0 ? planFor(order[i - 1]).modules : [];
  return planFor(planKey).modules.filter((m) => !below.includes(m) && (!businessType || moduleRelevant(m, businessType)));
}

/** What an action answers when the shop's plan doesn't include the module: which plan does, and
 * where to upgrade — never a bare "not allowed". */
export function moduleLockMessage(key: ModuleKey, businessType?: string | null): string {
  const label = MODULES.find((m) => m.key === key)?.label ?? "This feature";
  return `${label} is part of the ${planName(minPlanForModule(key, businessType), businessType)} plan — upgrade in More → Plan & billing.`;
}

/** What the Free plan already gives each trade — its own daily core, which is never behind a plan. */
export const FREE_CORE: Record<string, string> = {
  restaurant: "Tables, KOT and the kitchen display",
  hotel: "Rooms, bookings, check-in and check-out",
  salon: "Appointments and your online booking link",
  jewellery: "Today's rate for each karat, billing by weight, old gold exchange",
  transport: "Bilty (LR), vehicles and trip charges on the bill",
  pharmacy: "Batches, expiry alerts and prescription billing",
  clinic: "Appointments, prescriptions and patient history",
  lab: "Test orders and reports",
  gym: "Memberships, renewals and attendance",
  rental: "Rentals with deposits and returns",
  service: "Repair jobs with advance, status and delivery",
};

export const limitText = (n: number | null, unit: string) => (n === null ? "Unlimited" : `${n.toLocaleString("en-IN")} ${unit}`);
