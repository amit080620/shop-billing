import type { ModuleKey } from "./modules";

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
  /** What this plan adds over the one below it, in the owner's words. */
  highlights: string[];
};

const ALL_MODULES: ModuleKey[] = [
  "multi_branch",
  "bulk_import_export",
  "public_catalog",
  "whatsapp_reminders",
  "offers",
  "advanced_reports",
  "self_checkin_kiosk",
  "leads_crm",
  "class_schedule",
  "audit_log",
  "petty_cash",
  "stock_audit",
];

const BASIC_MODULES: ModuleKey[] = ["whatsapp_reminders", "bulk_import_export", "offers"];
const PRO_MODULES: ModuleKey[] = [...BASIC_MODULES, "advanced_reports", "public_catalog", "petty_cash", "stock_audit", "audit_log"];

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
      "Udhaar khata, day summary and sales reports",
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
    highlights: [
      "Unlimited bills",
      "WhatsApp reminders for udhaar and appointments",
      "3 logins for your staff",
      "Import and export items and customers (Excel/CSV)",
      "Offers and discount coupons",
    ],
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
    highlights: [
      "Profit report and shop Insights",
      "CA export pack and staff-wise reports",
      "Your own online order link and order queue",
      "Petty cash, stock audit, audit log",
      "10 logins, unlimited items",
    ],
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
    highlights: [
      "Up to 5 branches with branch-wise reporting",
      "Unlimited logins",
      "Gym: self check-in kiosk, leads tracker, class schedule",
      "Priority support on WhatsApp",
      "Google Business and WhatsApp setup done for you",
    ],
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
