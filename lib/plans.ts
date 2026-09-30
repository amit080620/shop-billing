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
// KOT, appointments, rates by karat, bilty…). Basic adds the tools a busy counter uses every day;
// Pro adds control and insight; Pro + adds scale.
const BASIC_MODULES: ModuleKey[] = ["whatsapp_reminders", "bulk_import_export", "offers", "quotations", "delivery_challan", "staff_payroll", "customer_prepaid", "gold_schemes", "karigar_jobs"];
const PRO_MODULES: ModuleKey[] = [...BASIC_MODULES, "advanced_reports", "public_catalog", "petty_cash", "stock_audit", "audit_log", "stylist_commission", "vehicle_profit", "recipe_stock"];

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
    tagline: "For a shop that bills all day and chases its udhaar",
    priceYearly: 1999,
    priceMonthly: 249,
    badge: { label: "Basic", bg: "#D1FAE5", text: "#065F46", border: "#6EE7B7" },
    modules: BASIC_MODULES,
    limits: { billsPerMonth: null, products: 500, staff: 3, branches: 1 },
    highlights: ["Unlimited bills", "500 items, 3 logins for your staff"],
  },
  pro: {
    key: "pro",
    name: "Pro",
    tagline: "The full shop: profit insight, online orders, staff accountability",
    priceYearly: 3999,
    priceMonthly: 449,
    badge: { label: "Pro", bg: "#E0E7FF", text: "#3730A3", border: "#A5B4FC" },
    modules: PRO_MODULES,
    limits: { billsPerMonth: null, products: null, staff: 10, branches: 1 },
    highlights: ["Unlimited items, 10 logins"],
  },
  pro_plus: {
    key: "pro_plus",
    name: "Pro +",
    tagline: "More than one shop, or a gym that runs on schedules",
    priceYearly: 6999,
    priceMonthly: 749,
    badge: { label: "Pro +", bg: "#FEF3C7", text: "#92400E", border: "#FCD34D" },
    modules: ALL_MODULES,
    limits: { billsPerMonth: null, products: null, staff: null, branches: 5 },
    highlights: ["Unlimited logins", "Priority support on WhatsApp", "Google Business and WhatsApp setup done for you"],
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
export function limitMessage(what: "bills" | "products" | "staff" | "branches", limit: number, planKey: PlanKey): string {
  const next = nextPlanAfter(planKey);
  const nextName = next ? planFor(next).name : "a bigger plan";
  const nouns = {
    bills: `${limit} bills a month`,
    products: `${limit} items`,
    staff: `${limit} ${limit === 1 ? "login" : "logins"}`,
    branches: `${limit} ${limit === 1 ? "branch" : "branches"}`,
  };
  return `Your ${planFor(planKey).name} plan covers ${nouns[what]}. Upgrade to ${nextName} to carry on — open More → Plan & billing.`;
}

export function nextPlanAfter(planKey: PlanKey): PlanKey | null {
  const i = PAID_PLAN_ORDER.indexOf(planKey);
  if (i === -1 || i >= PAID_PLAN_ORDER.length - 1) return null;
  return PAID_PLAN_ORDER[i + 1];
}

/** The cheapest plan that includes a module — what a blocked screen tells
 * the shop to upgrade to. */
export function minPlanForModule(key: ModuleKey): PlanKey {
  for (const plan of PAID_PLAN_ORDER) {
    if (planFor(plan).modules.includes(key)) return plan;
  }
  return "pro_plus";
}

/** The modules a plan adds over the plan below it — what its card lists — for this kind of shop. */
export function modulesAddedBy(planKey: PlanKey, businessType?: string): ModuleKey[] {
  const i = PAID_PLAN_ORDER.indexOf(planKey);
  const below = i > 0 ? planFor(PAID_PLAN_ORDER[i - 1]).modules : [];
  return planFor(planKey).modules.filter((m) => !below.includes(m) && (!businessType || moduleRelevant(m, businessType)));
}

/** What an action answers when the shop's plan doesn't include the module: which plan does, and
 * where to upgrade — never a bare "not allowed". */
export function moduleLockMessage(key: ModuleKey): string {
  const label = MODULES.find((m) => m.key === key)?.label ?? "This feature";
  return `${label} is part of the ${planFor(minPlanForModule(key)).name} plan — upgrade in More → Plan & billing.`;
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
