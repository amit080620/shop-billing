/** The pilot set-up checklist The Ray's team follows for every new shop. Steps the app can see for
 * itself tick on their own (`auto`); the rest are ticked by the team in the admin panel. A step
 * with both ticks itself when the data shows it, and can also be ticked by hand (e.g. "no staff"). */
export type OnboardingFacts = {
  legalName: boolean;
  address: boolean;
  gstin: boolean;
  logo: boolean;
  items: number;
  sales: number;
  saleDays: number;
  customers: number;
  staff: number;
  paidPlan: boolean;
};

export type OnboardingStep = {
  id: string;
  stage: "Day 1 — set-up" | "Day 3" | "Week 2" | "Closing";
  title: string;
  hint?: string;
  auto?: (f: OnboardingFacts) => boolean;
  /** Auto steps that can also be ticked by hand when they don't apply. */
  manualToo?: boolean;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: "profile", stage: "Day 1 — set-up", title: "Shop details on the bill: legal name and address", auto: (f) => f.legalName && f.address },
  { id: "gst", stage: "Day 1 — set-up", title: "GST number entered (tick by hand if they have none)", auto: (f) => f.gstin, manualToo: true },
  { id: "logo", stage: "Day 1 — set-up", title: "Logo on the bill", auto: (f) => f.logo, manualToo: true },
  { id: "items", stage: "Day 1 — set-up", title: "Items loaded — 20 or more", hint: "Import from Excel, or Scan a price list (AI)", auto: (f) => f.items >= 20 },
  { id: "printer", stage: "Day 1 — set-up", title: "Printer connected and a test bill printed" },
  { id: "first_bill", stage: "Day 1 — set-up", title: "First real bill made together", auto: (f) => f.sales >= 1 },
  { id: "staff", stage: "Day 1 — set-up", title: "Staff logins made (tick by hand if no staff)", auto: (f) => f.staff >= 2, manualToo: true },
  { id: "phone_app", stage: "Day 1 — set-up", title: "App on the owner's phone (APK or Add to Home screen)" },
  { id: "videos", stage: "Day 1 — set-up", title: "Training videos link sent on WhatsApp" },
  { id: "day3_call", stage: "Day 3", title: "Day-3 call — are bills going fine? Any problem?" },
  { id: "daily_use", stage: "Day 3", title: "Selling on 3 different days", auto: (f) => f.saleDays >= 3 },
  { id: "customers", stage: "Day 3", title: "Customers / udhaar being recorded — 5 or more", auto: (f) => f.customers >= 5, manualToo: true },
  { id: "week2_feedback", stage: "Week 2", title: "Week-2 visit or call — what they like, what's missing (write it in the note)" },
  { id: "backup", stage: "Week 2", title: "Showed them More → Backup" },
  { id: "price", stage: "Closing", title: "Price agreed and plan assigned", auto: (f) => f.paidPlan, manualToo: true },
  { id: "paid", stage: "Closing", title: "Payment received" },
  { id: "referral", stage: "Closing", title: "Asked for 2 referrals — other shop owners they know" },
];

export type OnboardingTicks = Record<string, string>; // step id → date ticked (YYYY-MM-DD)

/** Which steps are done, and how many out of all. */
export function onboardingStatus(facts: OnboardingFacts, ticks: OnboardingTicks) {
  const steps = ONBOARDING_STEPS.map((s) => {
    const byData = s.auto ? s.auto(facts) : false;
    const byHand = !!ticks[s.id];
    return { ...s, auto: undefined, byData, byHand, done: byData || byHand, tickable: !s.auto || !!s.manualToo };
  });
  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length };
}
