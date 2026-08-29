import { describe, it, expect } from "vitest";
import { applyCorrections } from "../applyCorrections";

describe("applyCorrections", () => {
  const corrections = [
    { wrong: "Besmati Rice", correct: "Basmati Rice" },
    { wrong: "Tornato Ketchup", correct: "Tomato Ketchup" },
  ];

  it("applies an exact (case-insensitive) match", () => {
    expect(applyCorrections("besmati rice", corrections)).toBe("Basmati Rice");
  });

  it("applies a fuzzy near-miss match", () => {
    expect(applyCorrections("Besmatti Rice", corrections)).toBe("Basmati Rice");
  });

  it("leaves an unrelated name unchanged", () => {
    expect(applyCorrections("Chicken Biryani", corrections)).toBe("Chicken Biryani");
  });

  it("does nothing when there are no corrections yet", () => {
    expect(applyCorrections("Besmati Rice", [])).toBe("Besmati Rice");
  });

  it("does not over-correct something only loosely similar", () => {
    expect(applyCorrections("Rice", corrections)).toBe("Rice");
  });
});
