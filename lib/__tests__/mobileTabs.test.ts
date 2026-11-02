import { describe, it, expect } from "vitest";
import { mobileTabs } from "../mobileTabs";

const tab = (href: string) => ({ href });
const extra = { home: tab("/dashboard"), customers: tab("/customers") };
const hrefs = (list: string[]) => mobileTabs(list.map(tab), extra).map((t) => t.href);

describe("mobile bottom tabs", () => {
  it("puts Home first and Customers next to Sell for a shop", () => {
    expect(hrefs(["/bills/new", "/purchases", "/reports"])).toEqual(["/dashboard", "/bills/new", "/customers", "/purchases", "/reports"]);
  });

  it("keeps five tabs when fast billing is on, moving Reports to More so Purchase stays", () => {
    expect(hrefs(["/bills/new", "/purchases", "/reports", "/fast-billing"])).toEqual([
      "/dashboard",
      "/bills/new",
      "/customers",
      "/purchases",
      "/fast-billing",
    ]);
  });

  it("keeps Purchase for trades with their own tab next to Sell", () => {
    expect(hrefs(["/bills/new", "/rentals/new", "/purchases", "/reports"])).toEqual(["/dashboard", "/bills/new", "/customers", "/rentals/new", "/purchases"]);
    // Seven would-be tabs (a trade tab and Fast Bill too): Purchase joins Reports in More, under Daily work.
    expect(hrefs(["/bills/new", "/garment", "/purchases", "/reports", "/fast-billing"])).toEqual(["/dashboard", "/bills/new", "/customers", "/garment", "/fast-billing"]);
  });

  it("adds only Home where bills are not made on a tab", () => {
    expect(hrefs(["/restaurant", "/restaurant-kds", "/purchases", "/reports"])).toEqual([
      "/dashboard",
      "/restaurant",
      "/restaurant-kds",
      "/purchases",
      "/reports",
    ]);
  });

  it("leaves kitchen-only staff with just the kitchen", () => {
    expect(hrefs(["/restaurant-kds"])).toEqual(["/restaurant-kds"]);
  });
});
