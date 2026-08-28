import { describe, it, expect } from "vitest";
import { normalizePhone } from "../phone";

describe("normalizePhone", () => {
  it("returns a plain 10-digit number as-is", () => {
    expect(normalizePhone("9876543210")).toBe("9876543210");
  });

  it("strips a +91 country code", () => {
    expect(normalizePhone("+919876543210")).toBe("9876543210");
  });

  it("strips a 91 country code without the plus", () => {
    expect(normalizePhone("919876543210")).toBe("9876543210");
  });

  it("strips spaces, dashes, and a leading 0", () => {
    expect(normalizePhone("0 987-654-3210")).toBe("9876543210");
    expect(normalizePhone("+91 98765 43210")).toBe("9876543210");
  });

  it("treats all common formats of the same number as identical", () => {
    const forms = ["9876543210", "+919876543210", "919876543210", "09876543210", "+91 98765 43210"];
    const normalized = new Set(forms.map(normalizePhone));
    expect(normalized.size).toBe(1);
  });
});
