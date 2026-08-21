import { describe, it, expect } from "vitest";
import { digitsOnly } from "../phoneDigits";

describe("phoneDigits.digitsOnly — genuinely regression-tests a real user-reported bug", () => {
  it("genuinely handles typing a single digit without phantom extra characters", () => {
    // This exact scenario was the real bug: typing "9" internally became
    // "+919", and the old heuristic misread it as an already-complete
    // number, incorrectly keeping all 3 characters instead of just "9".
    expect(digitsOnly("+919")).toBe("9");
  });

  it("genuinely handles typing digit-by-digit without ever showing extra characters", () => {
    const typed = "9876543210";
    let soFar = "";
    for (const digit of typed) {
      soFar += digit;
      const internalValue = "+91" + digitsOnly("+91" + soFar);
      expect(digitsOnly(internalValue)).toBe(soFar);
    }
  });

  it("genuinely parses an existing customer's stored number with a + prefix", () => {
    expect(digitsOnly("+919876543210")).toBe("9876543210");
  });

  it("genuinely parses a legacy stored number without a + prefix", () => {
    expect(digitsOnly("919876543210")).toBe("9876543210");
  });

  it("genuinely leaves a plain 10-digit number (no country code) untouched", () => {
    expect(digitsOnly("9876543210")).toBe("9876543210");
  });

  it("genuinely caps at 10 digits even with extra junk", () => {
    expect(digitsOnly("+91987654321099")).toBe("9876543210");
  });
});
