import { describe, expect, it } from "vitest";
import { ean13Valid, parseScaleBarcode, pluMatches } from "../scaleBarcode";

// Builds a valid label: prefix + code + value, plus its check digit.
function label(body12: string): string {
  const sum = body12.split("").map(Number).reduce((s, d, i) => s + d * (i % 2 ? 3 : 1), 0);
  return body12 + ((10 - (sum % 10)) % 10);
}

describe("parseScaleBarcode", () => {
  const weight = { prefix: "21", mode: "weight" as const, codeDigits: 5 };

  it("reads the item code and the weight in kg", () => {
    expect(parseScaleBarcode(label("210012301250"), weight)).toEqual({ plu: "00123", weightKg: 1.25 });
  });

  it("reads a price label in rupees", () => {
    expect(parseScaleBarcode(label("210012304550"), { ...weight, mode: "price" })).toEqual({ plu: "00123", price: 45.5 });
  });

  it("works with a one-digit prefix and four-digit codes", () => {
    expect(parseScaleBarcode(label("201230000750"), { prefix: "2", mode: "weight", codeDigits: 4 })).toEqual({ plu: "0123", weightKg: 0.75 });
  });

  it("rejects other barcodes, a wrong check digit and a missing setting", () => {
    expect(parseScaleBarcode("8901234567890", weight)).toBeNull();
    const good = label("210012301250");
    expect(parseScaleBarcode(good.slice(0, 12) + ((Number(good[12]) + 1) % 10), weight)).toBeNull();
    expect(parseScaleBarcode(good, null)).toBeNull();
  });
});

describe("ean13Valid / pluMatches", () => {
  it("checks the check digit", () => {
    expect(ean13Valid("8901063010208")).toBe(true);
    expect(ean13Valid("8901063010209")).toBe(false);
  });
  it("matches a PLU whatever the leading zeros", () => {
    expect(pluMatches("123", "00123")).toBe(true);
    expect(pluMatches("00124", "00123")).toBe(false);
    expect(pluMatches("ABC", "00123")).toBe(false);
  });
});
