import { describe, it, expect } from "vitest";
import { barcodeFromQuery } from "../barcodeQuery";

const products = [
  { name: "Amul Butter 100g", barcode: "8901262010016" },
  { name: "Parle-G Biscuit", barcode: null },
  { name: "Maggi 280", barcode: "ABC-12" },
];

describe("barcodeFromQuery", () => {
  it("treats a known barcode as a scan", () => {
    expect(barcodeFromQuery(" 8901262010016 ", products)).toBe("8901262010016");
    expect(barcodeFromQuery("ABC-12", products)).toBe("ABC-12");
  });

  it("treats an unknown long number as a scan, so the person hears it was not found", () => {
    expect(barcodeFromQuery("8901234567890", products)).toBe("8901234567890");
  });

  it("leaves names and short numbers to the normal search", () => {
    expect(barcodeFromQuery("amul", products)).toBeNull();
    expect(barcodeFromQuery("280", products)).toBeNull();
    expect(barcodeFromQuery("", products)).toBeNull();
  });
});
