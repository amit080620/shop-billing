import { describe, it, expect } from "vitest";
import { enquiryMessage, salesLink, HARDWARE, SERVICES, SALES_WHATSAPP, rupees } from "../sales";

describe("sales desk", () => {
  it("every enquiry names the shop and its mobile so the reply never starts with 'who is this?'", () => {
    const msg = enquiryMessage({ kind: "plan", item: "Pro", shopName: "Sharma Kirana", ownerPhone: "9876543210", plan: "free" });
    expect(msg).toContain("Sharma Kirana");
    expect(msg).toContain("9876543210");
    expect(msg).toContain("Pro");
    expect(msg).toContain("Free"); // the plan they're on today
  });

  it("still reads properly when the owner never gave a number", () => {
    const msg = enquiryMessage({ kind: "hardware", item: "58mm Bluetooth receipt printer", shopName: "Sharma Kirana" });
    expect(msg).toContain("Sharma Kirana");
    expect(msg).not.toContain("null");
    expect(msg).not.toContain("undefined");
    expect(msg).not.toContain("()");
  });

  it("builds a wa.me link to the sales number with the text encoded", () => {
    const url = salesLink("Hi & hello ₹5");
    expect(url.startsWith(`https://wa.me/${SALES_WHATSAPP}?text=`)).toBe(true);
    expect(url).toContain(encodeURIComponent("Hi & hello ₹5"));
  });

  it("catalog entries are complete and priced", () => {
    for (const item of [...HARDWARE, ...SERVICES]) {
      expect(item.name.length).toBeGreaterThan(3);
      expect(item.price).toBeGreaterThan(0);
    }
    const ids = [...HARDWARE, ...SERVICES].map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    // A bundle must actually cost less than its parts would separately.
    const bundle = HARDWARE.find((h) => h.id === "kit-counter")!;
    const parts = HARDWARE.find((h) => h.id === "printer-58-bt")!.price + HARDWARE.find((h) => h.id === "scanner")!.price;
    expect(bundle.price).toBeLessThan(parts + 20 * 26); // parts plus 20 rolls at ~₹26 each
  });

  it("formats rupees the Indian way", () => {
    expect(rupees(11499)).toBe("₹11,499");
  });
});
