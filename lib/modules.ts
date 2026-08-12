/** Add-on modules the super admin can turn on/off per shop —
 * separate from business-type gating (which controls what's
 * *relevant*), this controls what's *allowed* on their plan.
 * A shop with `enabled_modules === null` gets everything (existing
 * shops, and any shop before the super admin ever touches this) —
 * this list only restricts once the super admin explicitly saves a
 * selection for that shop. */
export const MODULES = [
  { key: "multi_branch", label: "Multi-branch", description: "Multiple locations, branch-wise reporting" },
  { key: "bulk_import_export", label: "Bulk import/export", description: "CSV import/export for products and customers" },
  { key: "public_catalog", label: "Public online ordering", description: "Shareable storefront link + order queue" },
  { key: "whatsapp_reminders", label: "WhatsApp reminders", description: "Payment, membership, and appointment reminders" },
  { key: "offers", label: "Offers & coupons", description: "Discount codes and promotions" },
  { key: "advanced_reports", label: "Advanced reports", description: "GSTR-1, GSTR-3B, Insights, Daily summary by staff" },
  { key: "self_checkin_kiosk", label: "Self check-in kiosk", description: "Gym: member self check-in tablet" },
  { key: "leads_crm", label: "Leads tracker", description: "Gym: trial enquiries and walk-in tracking" },
  { key: "class_schedule", label: "Class schedule", description: "Gym: weekly classes and bookings" },
  { key: "audit_log", label: "Audit & error logs", description: "Sensitive-action history and failure detection" },
  { key: "petty_cash", label: "Petty cash", description: "Small day-to-day expense tracking" },
  { key: "stock_audit", label: "Stock audit", description: "Physical stock count reconciliation" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

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
