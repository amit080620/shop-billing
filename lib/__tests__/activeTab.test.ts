import { describe, it, expect } from "vitest";
import { activeTabHref } from "../activeTab";

describe("activeTabHref", () => {
  const lab = ["/lab/orders/new", "/lab/orders", "/purchases", "/reports"];

  it("highlights only the most specific tab", () => {
    expect(activeTabHref("/lab/orders/new", lab)).toBe("/lab/orders/new");
    expect(activeTabHref("/lab/orders", lab)).toBe("/lab/orders");
    expect(activeTabHref("/lab/orders/123", lab)).toBe("/lab/orders");
  });

  it("matches whole path segments only", () => {
    expect(activeTabHref("/purchases/new", lab)).toBe("/purchases");
    expect(activeTabHref("/purchases-archive", lab)).toBeNull();
    expect(activeTabHref("/dashboard", lab)).toBeNull();
  });
});
