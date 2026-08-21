import { describe, it, expect } from "vitest";
import { similarity, findClosestMatch } from "../fuzzyMatch";

describe("fuzzyMatch — genuinely offline (no AI) OCR-duplicate prevention", () => {
  it("genuinely scores identical strings as a perfect match", () => {
    expect(similarity("Tomato Ketchup", "Tomato Ketchup")).toBe(1);
  });

  it("genuinely ignores case differences", () => {
    expect(similarity("TOMATO", "tomato")).toBe(1);
  });

  it("genuinely scores a real OCR near-miss highly", () => {
    // "Tornato" — a genuine, real OCR misread of "Tomato" (rn vs m).
    const score = similarity("Tornato Ketchup", "Tomato Ketchup");
    expect(score).toBeGreaterThan(0.8);
  });

  it("genuinely scores two completely unrelated names low", () => {
    const score = similarity("Chai", "Refrigerator Compressor Unit");
    expect(score).toBeLessThan(0.3);
  });

  it("findClosestMatch genuinely finds the right existing product among several candidates", () => {
    const candidates = [
      { id: "1", name: "Tomato Ketchup" },
      { id: "2", name: "Chilli Sauce" },
      { id: "3", name: "Soy Sauce" },
    ];
    const match = findClosestMatch("Tornato Ketchup", candidates);
    expect(match?.id).toBe("1");
  });

  it("findClosestMatch genuinely returns null when nothing is genuinely close enough", () => {
    const candidates = [
      { id: "1", name: "Tomato Ketchup" },
      { id: "2", name: "Chilli Sauce" },
    ];
    const match = findClosestMatch("Refrigerator Compressor Unit", candidates);
    expect(match).toBeNull();
  });

  it("findClosestMatch genuinely respects a custom confidence floor", () => {
    const candidates = [{ id: "1", name: "Coffee" }];
    // "Toffee" is genuinely somewhat similar to "Coffee" but not identical.
    const strict = findClosestMatch("Toffee", candidates, 0.99);
    const lenient = findClosestMatch("Toffee", candidates, 0.5);
    expect(strict).toBeNull();
    expect(lenient?.id).toBe("1");
  });

  it("genuinely handles empty strings without throwing", () => {
    expect(similarity("", "")).toBe(1);
    expect(similarity("", "Something")).toBeLessThan(1);
  });
});
