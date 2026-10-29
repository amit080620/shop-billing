import { describe, expect, it } from "vitest";
import { ACCESS_V2, STAFF_AREAS, canOpen } from "../staffAccess";

const staff = (permissions: string[], businessType = "grocery") => ({ role: "staff", businessType, permissions: [ACCESS_V2, ...permissions] });

describe("what a staff member may open", () => {
  it("the owner opens everything", () => {
    for (const p of ["/dashboard", "/reports", "/settings", "/staff", "/anything-new"]) expect(canOpen({ role: "owner", businessType: "grocery", permissions: [] }, p)).toBe(true);
  });

  it("a staff member added before the list keeps what they had", () => {
    expect(canOpen({ role: "staff", businessType: "grocery", permissions: ["give_discounts"] }, "/reports")).toBe(true);
  });

  it("a new staff member gets billing and nothing more", () => {
    const s = staff([]);
    for (const p of ["/", "/bills/new", "/fast-billing", "/print/bill/abc", "/offline-bill", "/profile", "/help/videos/01", "/no-access"]) expect(canOpen(s, p), p).toBe(true);
    for (const p of ["/dashboard", "/bills/all", "/reports", "/products", "/purchases", "/customers", "/udhaar", "/settings", "/staff", "/staff-attendance", "/offers", "/returns", "/something-new"]) expect(canOpen(s, p), p).toBe(false);
  });

  it("each area the owner switches on opens its screens, and only those", () => {
    const s = staff(["view_reports", "manage_products"]);
    expect(canOpen(s, "/reports/gstr1")).toBe(true);
    expect(canOpen(s, "/daily-summary")).toBe(true);
    expect(canOpen(s, "/products/labels")).toBe(true);
    expect(canOpen(s, "/purchases")).toBe(false);
    // The longest matching address decides: attendance isn't staff management.
    expect(canOpen(staff(["manage_staff"]), "/staff-attendance")).toBe(true);
    expect(canOpen(staff(["view_bills"]), "/bills/all")).toBe(true);
  });

  it("a trade's own counter is billing; its other screens are an area", () => {
    const waiter = staff([], "restaurant");
    expect(canOpen(waiter, "/restaurant")).toBe(true);
    expect(canOpen(waiter, "/restaurant/orders/9")).toBe(true);
    expect(canOpen(waiter, "/restaurant/menu")).toBe(false);
    expect(canOpen(staff(["trade_screens"], "restaurant"), "/restaurant/menu")).toBe(true);
    expect(canOpen(staff([], "grocery"), "/restaurant")).toBe(false);
  });

  it("every area has its own key and screens", () => {
    expect(new Set(STAFF_AREAS.map((a) => a.key)).size).toBe(STAFF_AREAS.length);
    for (const a of STAFF_AREAS) expect(a.prefixes.length).toBeGreaterThan(0);
  });
});
