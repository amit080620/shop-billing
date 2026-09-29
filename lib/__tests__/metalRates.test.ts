import { describe, expect, it } from "vitest";
import { goldRatesFrom, karatOf, silverRateFrom } from "../metalRates";

describe("gold rates by karat", () => {
  it("reads an old rate with no purity as 22K and works the others out from it", () => {
    const r = goldRatesFrom([{ metal_type: "gold", purity: "", rate_per_gram: 7700, effective_date: "2026-09-29" }]);
    expect(r["22K"]).toBe(7700);
    expect(r["24K"]).toBe(8400);
    expect(r["18K"]).toBe(6300);
  });

  it("uses the rate set for a karat over the worked-out one, newest first", () => {
    const r = goldRatesFrom([
      { metal_type: "gold", purity: "24K", rate_per_gram: 8000, effective_date: "2026-09-29" },
      { metal_type: "gold", purity: "18K", rate_per_gram: 6100, effective_date: "2026-09-29" },
      { metal_type: "gold", purity: "18K", rate_per_gram: 5900, effective_date: "2026-09-28" },
    ]);
    expect(r["18K"]).toBe(6100);
    expect(r["22K"]).toBe(7333.33);
    expect(r["14K"]).toBe(4666.67);
  });

  it("has no gold rate at all when none was ever set", () => {
    expect(goldRatesFrom([{ metal_type: "silver", purity: "", rate_per_gram: 95, effective_date: "2026-09-29" }])["22K"]).toBeNull();
    expect(silverRateFrom([{ metal_type: "silver", purity: "", rate_per_gram: 95, effective_date: "2026-09-29" }])).toBe(95);
  });

  it("reads the karat from an item's purity", () => {
    expect(karatOf("22K")).toBe("22K");
    expect(karatOf("916")).toBe("22K");
    expect(karatOf("18 kt")).toBe("18K");
    expect(karatOf("24K")).toBe("24K");
    expect(karatOf("925")).toBeNull();
  });
});
