import { describe, expect, it } from "vitest";
import { fineWeight, settleKarigar } from "../karigar";

describe("settleKarigar", () => {
  const job = { issuedWeight: 20, purityPercent: 91.6, wastageAllowedPercent: 2 };

  it("owes nothing when the loss is within the agreed wastage", () => {
    expect(settleKarigar(job, { receivedWeight: 19.7, returnedMetal: 0 })).toEqual({ loss: 0.3, allowed: 0.4, owed: 0, owedFine: 0, lossPercent: 1.5 });
  });

  it("owes the loss beyond the agreed wastage, also in fine gold", () => {
    const s = settleKarigar(job, { receivedWeight: 19.1, returnedMetal: 0.2 });
    expect(s.loss).toBe(0.7);
    expect(s.owed).toBe(0.3);
    expect(s.owedFine).toBe(0.275);
  });

  it("never shows a negative loss when more comes back than went", () => {
    expect(settleKarigar(job, { receivedWeight: 20.05, returnedMetal: 0 }).loss).toBe(0);
  });
});

describe("fineWeight", () => {
  it("is the pure gold in a weight", () => {
    expect(fineWeight(10, 91.6)).toBe(9.16);
  });
});
