// The New look's navigation (lib/newNav) against the Classic one, for all 16 trades: it never offers
// a screen the person couldn't reach from the Classic sidebar or phone bar, never one staff access
// closes, and loses none of the Classic sidebar's.
import { describe, expect, it } from "vitest";
import { tabsFor } from "@/app/(dashboard)/BottomNav";
import { BUSINESS_TYPES } from "../businessType";
import { mobileTabs } from "../mobileTabs";
import { primaryAction, sidebarTabs } from "../newNav";
import { ACCESS_V2, canOpen } from "../staffAccess";

const t = (key: string) => key;
const PEOPLE: Record<string, string[]> = {
  "owner / staff from before the access list": [],
  "new staff, billing only": [ACCESS_V2],
  "staff with reports and customers": [ACCESS_V2, "view_reports", "manage_customers"],
  "staff with items, purchases and trade screens": [ACCESS_V2, "manage_products", "purchases", "trade_screens"],
  "kitchen-only staff": [ACCESS_V2, "kitchen_only"],
};

function navFor(type: string, permissions: string[], fastBilling: boolean) {
  const can = (href: string) => canOpen({ role: "staff", businessType: type, permissions }, href);
  const tabs = tabsFor(type, t, permissions, fastBilling);
  const extra = { home: { href: "/dashboard" }, customers: { href: "/customers" } };
  const classicSidebar = [...(can("/dashboard") ? ["/dashboard"] : []), ...tabs.map((tab) => tab.href)];
  const classicPhone = mobileTabs<{ href: string }>(tabs, extra).filter((tab) => can(tab.href)).map((tab) => tab.href);
  const newSidebar = sidebarTabs<{ href: string }>(tabs, extra, can).map((tab) => tab.href);
  return { can, tabs, classicSidebar, classicPhone, newSidebar };
}

describe("New look navigation, every trade and kind of person", () => {
  for (const { value: type } of BUSINESS_TYPES) {
    for (const [who, permissions] of Object.entries(PEOPLE)) {
      for (const fastBilling of [false, true]) {
        it(`${type} · ${who}${fastBilling ? " · fast billing on" : ""}`, () => {
          const { can, tabs, classicSidebar, classicPhone, newSidebar } = navFor(type, permissions, fastBilling);
          const classicAny = new Set([...classicSidebar, ...classicPhone]);
          for (const href of newSidebar) {
            expect(classicAny.has(href), `${href} is not in the Classic navigation`).toBe(true);
            expect(can(href), `${href} is closed to this person`).toBe(true);
          }
          for (const href of classicSidebar) expect(newSidebar, `Classic sidebar's ${href} is missing`).toContain(href);
          expect(new Set(newSidebar).size).toBe(newSidebar.length);
          // Customers only beside Sell, as on the phone.
          const sells = tabs.some((tab) => tab.href === "/bills/new");
          expect(newSidebar.includes("/customers")).toBe(sells && can("/customers"));
          const action = primaryAction(tabs);
          if (action) {
            expect(tabs).toContain(action);
            expect(action.href.endsWith("/new")).toBe(true);
          }
        });
      }
    }
  }
});

describe("the computer header's main button", () => {
  it("is the trade's own way to start something new, and none where the first tab is a board", () => {
    const action = (type: string, permissions: string[] = []) => primaryAction(tabsFor(type, t, permissions, false))?.href ?? null;
    for (const type of ["grocery", "mart", "hardware", "pharmacy", "wholesale", "general", "rental", "transport", "service", "salon", "jewellery"]) expect(action(type), type).toBe("/bills/new");
    expect(action("clinic")).toBe("/clinic/prescriptions/new");
    expect(action("gym")).toBe("/gym/members/new");
    expect(action("lab")).toBe("/lab/orders/new");
    expect(action("restaurant")).toBeNull();
    expect(action("hotel")).toBeNull();
    expect(action("restaurant", [ACCESS_V2, "kitchen_only"])).toBeNull();
  });
});

describe("sidebar order", () => {
  it("Home first, then the trade's tabs with Customers right after Sell, and Buy kept", () => {
    expect(navFor("grocery", [], true).newSidebar).toEqual(["/dashboard", "/bills/new", "/customers", "/purchases", "/reports", "/fast-billing"]);
    expect(navFor("restaurant", [], false).newSidebar).toEqual(["/dashboard", "/restaurant", "/restaurant-kds", "/purchases", "/reports"]);
    expect(navFor("restaurant", [ACCESS_V2, "kitchen_only"], false).newSidebar).toEqual(["/restaurant-kds"]);
  });
});
