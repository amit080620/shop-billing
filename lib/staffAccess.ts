/** What a staff member may open. The owner can open everything. A staff member gets billing and
 * nothing more, until the owner switches on each area for them (Staff → Permissions).
 *
 * Staff accounts made before this (their permissions have no ACCESS_V2 mark) keep the access they
 * had — nothing is taken away from a counter in the middle of a day — until the owner saves their
 * permissions once, which applies this list.
 *
 * Checked in one place for every screen (app/(dashboard)/layout.tsx), so a screen can't be reached
 * by typing its address either, and used to leave its links out of the menus. */

/** Marks a staff member's permissions as following this list. */
export const ACCESS_V2 = "access_v2";

export type StaffArea = { key: string; label: string; description: string; prefixes: string[] };

export const STAFF_AREAS: StaffArea[] = [
  { key: "view_dashboard", label: "Home dashboard", description: "Today's sales, money at risk, shop health", prefixes: ["/dashboard"] },
  { key: "view_bills", label: "See all bills", description: "The list of bills and each bill's details", prefixes: ["/bills"] },
  { key: "process_returns", label: "Returns & debit notes", description: "Take goods back, refund, add to a past bill", prefixes: ["/returns", "/debit-notes"] },
  { key: "view_reports", label: "Reports & insights", description: "Sales and GST reports, daily summary, profit leaks, shop highlight", prefixes: ["/reports", "/daily-summary", "/insights", "/profit-leak", "/shelf-watch", "/shop-highlight"] },
  { key: "manage_products", label: "Items & stock", description: "Add or change items and prices, stock count, barcodes, reorder", prefixes: ["/products", "/stock-audit", "/barcode-settings", "/reorder", "/bulk-sale-entry"] },
  { key: "purchases", label: "Purchases & suppliers", description: "Buying stock, supplier bills and payments", prefixes: ["/purchases", "/vendors"] },
  { key: "manage_customers", label: "Customers & udhaar", description: "Customer list, udhaar, loyalty, prepaid balance", prefixes: ["/customers", "/udhaar", "/parties", "/birthdays", "/loyalty-settings", "/import-khata", "/prepaid"] },
  { key: "manage_expenses", label: "Petty cash", description: "Day-to-day cash expenses", prefixes: ["/petty-cash"] },
  { key: "marketing", label: "Offers & marketing", description: "Offers, festival posters, WhatsApp reminders", prefixes: ["/offers", "/festivals", "/festival-poster", "/reminders"] },
  { key: "orders", label: "Quotations, orders & challans", description: "Quotations, online and party orders, delivery challans, requests", prefixes: ["/quotations", "/orders", "/challans", "/catalog-orders", "/requests"] },
  { key: "trade_screens", label: "Your trade's other screens", description: "Menu & recipes, rooms, members, tests, appointments, rentals, rates and the like", prefixes: ["/restaurant", "/hotel", "/clinic", "/gym", "/lab", "/salon", "/rentals", "/jewellery", "/pharmacy", "/transport", "/service", "/warranty"] },
  { key: "manage_staff", label: "Staff & attendance", description: "Staff accounts, attendance and salary", prefixes: ["/staff", "/staff-attendance"] },
  { key: "manage_settings", label: "Shop settings & plan", description: "GST profile, bill design, printers, branches, plan, backup", prefixes: ["/settings", "/invoice-settings", "/thermal-print-settings", "/fast-billing-settings", "/catalog-settings", "/branches", "/plans", "/backup", "/audit-log", "/error-log", "/redis-status", "/import-sales-history"] },
];

/** What every staff member can always open: making bills, their own profile and help. */
const BILLING = ["/no-access", "/bills/new", "/fast-billing", "/print", "/offline-bill", "/profile", "/preferences", "/help", "/more", "/fast-print-setup"];

/** A trade's own billing counter (its home screen) — part of billing for that trade. */
const TRADE_BILLING: Record<string, { exact?: string[]; prefixes?: string[] }> = {
  restaurant: { exact: ["/restaurant"], prefixes: ["/restaurant/orders", "/restaurant-kds"] },
  hotel: { exact: ["/hotel"], prefixes: ["/hotel/bookings"] },
  clinic: { prefixes: ["/clinic/prescriptions"] },
  gym: { prefixes: ["/gym/members/new", "/gym/attendance"] },
  lab: { prefixes: ["/lab/orders"] },
  salon: { prefixes: ["/salon/appointments"] },
};

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

type Who = { role: string; businessType: string; permissions: string[] };

/** Is this staff member on the new list (owner-set areas), or one made before it? */
export const followsAreas = (who: Pick<Who, "permissions">) => who.permissions.includes(ACCESS_V2);

/** May this person open this screen? */
export function canOpen(who: Who, path: string): boolean {
  if (who.role === "owner" || !followsAreas(who)) return true;
  const clean = path.split("?")[0].replace(/\/+$/, "") || "/";
  if (clean === "/") return true; // sends them on to their billing screen
  if (BILLING.some((p) => under(clean, p))) return true;
  const trade = TRADE_BILLING[who.businessType];
  if (trade && (trade.exact?.includes(clean) || trade.prefixes?.some((p) => under(clean, p)))) return true;
  // The area with the longest matching address decides (/staff-attendance, not /staff).
  let best: StaffArea | null = null;
  let bestLength = -1;
  for (const area of STAFF_AREAS) {
    for (const p of area.prefixes) {
      if (under(clean, p) && p.length > bestLength) {
        best = area;
        bestLength = p.length;
      }
    }
  }
  // A screen in no area is closed to staff on the new list until it is given one.
  return best ? who.permissions.includes(best.key) : false;
}
