/** Everything a plan can switch on or off, in one list. A plan names the modules it includes
 * (lib/plans); a screen or action for a module checks it (isModuleEnabled / moduleLockMessage);
 * the Plan screen, the menu's lock badges and the admin's per-shop override all read this list —
 * so a new feature is one line here plus the plan it belongs to.
 *
 * `businessTypes` says whom a module matters to (none = every shop), so a salon's Plan screen talks
 * about packages and stylists, not gym kiosks. `href` is where the feature lives.
 *
 * A shop with `enabled_modules === null` before plans existed gets everything. */
export const MODULES = [
  { key: "multi_branch", label: "Multi-branch", description: "Multiple locations, branch-wise reporting", href: "/branches" },
  { key: "bulk_import_export", label: "Bulk import/export", description: "CSV import/export for products and customers", href: "/products" },
  { key: "public_catalog", label: "Public online ordering", description: "Shareable storefront link + order queue", href: "/catalog-settings" },
  { key: "whatsapp_reminders", label: "WhatsApp reminders", description: "Payment, membership, and appointment reminders", href: "/reminders" },
  { key: "offers", label: "Offers & coupons", description: "Discount codes and promotions", href: "/offers" },
  { key: "quotations", label: "Quotations", description: "Price offers, billed in one tap when the customer agrees", href: "/quotations" },
  { key: "staff_payroll", label: "Staff attendance & salary", description: "Daily register, advances, monthly salary and salary slips", href: "/staff-attendance" },
  { key: "customer_prepaid", label: "Prepaid balance & packages", description: "Customers pay in advance; sessions sold up front, used visit by visit", href: "/prepaid" },
  { key: "gold_schemes", label: "Gold saving schemes", description: "Monthly instalments with a bonus, used to buy jewellery", href: "/jewellery/schemes", businessTypes: ["jewellery"] },
  { key: "advanced_reports", label: "Advanced reports", description: "Insights, profit, CA export pack, staff reports", href: "/reports" },
  { key: "stylist_commission", label: "Stylist commission", description: "Work done by each stylist, and their commission added to salary", href: "/salon", businessTypes: ["salon"] },
  { key: "recipe_stock", label: "Recipes & kitchen stock", description: "Raw materials come off stock as dishes sell; food cost per plate, wastage and staff meals", href: "/restaurant/recipes", businessTypes: ["restaurant", "hotel"] },
  { key: "vehicle_profit", label: "Vehicle expenses & profit", description: "Diesel, toll and bhatta per vehicle; each vehicle's profit and diesel average", href: "/transport/expenses", businessTypes: ["transport"] },
  { key: "self_checkin_kiosk", label: "Self check-in kiosk", description: "Gym: member self check-in tablet", href: "/gym/kiosk-settings", businessTypes: ["gym"] },
  { key: "leads_crm", label: "Leads tracker", description: "Gym: trial enquiries and walk-in tracking", href: "/gym/leads", businessTypes: ["gym"] },
  { key: "class_schedule", label: "Class schedule", description: "Gym: weekly classes and bookings", href: "/gym/classes", businessTypes: ["gym"] },
  { key: "audit_log", label: "Audit & error logs", description: "Sensitive-action history and failure detection", href: "/audit-log" },
  { key: "petty_cash", label: "Petty cash", description: "Small day-to-day expense tracking", href: "/petty-cash" },
  { key: "stock_audit", label: "Stock audit", description: "Physical stock count reconciliation", href: "/stock-audit" },
] as const satisfies readonly { key: string; label: string; description: string; href: string; businessTypes?: readonly string[] }[];

export type ModuleKey = (typeof MODULES)[number]["key"];

/** Whether a module matters to this kind of shop at all. */
export function moduleRelevant(key: ModuleKey, businessType: string): boolean {
  const m = MODULES.find((x) => x.key === key) as { businessTypes?: readonly string[] } | undefined;
  return !m?.businessTypes || m.businessTypes.includes(businessType);
}

/** null means "not yet restricted" — everything on. Otherwise, only
 * keys present in the array are enabled. */
export function isModuleEnabled(enabledModules: string[] | null, key: ModuleKey): boolean {
  if (enabledModules === null) return true;
  return enabledModules.includes(key);
}

/** Server-side enforcement — call this at the top of any action or
 * page for a gated module. Hiding a menu link is not access control by
 * itself; a disabled module must also reject the action/page directly,
 * or someone with the URL/a saved bookmark bypasses the toggle
 * entirely. Throws so callers can let it propagate as a hard failure
 * (page-level) or catch it for a friendly error (action-level). */
export function assertModuleEnabled(enabledModules: string[] | null, key: ModuleKey): void {
  if (!isModuleEnabled(enabledModules, key)) {
    const label = MODULES.find((m) => m.key === key)?.label ?? key;
    throw new Error(`The "${label}" module isn't enabled for this shop.`);
  }
}
