import { describe, expect, it } from "vitest";
import { formatInvoiceNumber } from "../invoiceNumber";

describe("invoice numbers", () => {
  it("use the shop's own prefix", () => {
    expect(formatInvoiceNumber("SS", "2026-27", 4)).toBe("SS/26-27/00004");
    expect(formatInvoiceNumber(" ss ", "2026-27", 4)).toBe("SS/26-27/00004");
  });
  it("stay plain for a shop on the default prefix, as they always were", () => {
    expect(formatInvoiceNumber("INV", "2026-27", 42)).toBe("2026-27/00042");
    expect(formatInvoiceNumber(null, "2026-27", 42)).toBe("2026-27/00042");
    expect(formatInvoiceNumber("", "2026-27", 42)).toBe("2026-27/00042");
  });
  it("never go past GST's 16 characters", () => {
    const n = formatInvoiceNumber("VFVAUG01", "2026-27", 12345);
    expect(n).toBe("VFVA/26-27/12345");
    expect(n.length).toBeLessThanOrEqual(16);
    expect(formatInvoiceNumber("A B/C", "2026-27", 1)).toBe("ABC/26-27/00001");
  });
});
