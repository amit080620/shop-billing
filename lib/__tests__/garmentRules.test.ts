import { describe, expect, it } from "vitest";
import {
  compareSizes,
  damageActions,
  discrepancyActions,
  financialYearBounds,
  financialYearOf,
  movementGst,
  nextFinancialYear,
  parseList,
  parseSizes,
  pendingOf,
  refusalMessage,
  transferActions,
  variantMatrix,
  variantName,
  variantSku,
} from "../garment/rules";

describe("transfer steps", () => {
  it("with approval on: request → approve → dispatch; cancel only before dispatch", () => {
    expect(transferActions("draft", true)).toEqual(["request", "cancel"]);
    expect(transferActions("requested", true)).toEqual(["approve", "cancel"]);
    expect(transferActions("approved", true)).toEqual(["dispatch", "cancel"]);
    expect(transferActions("dispatched", true)).toEqual(["receive", "close"]);
    expect(transferActions("partially_received", true)).toEqual(["receive", "close"]);
    expect(transferActions("received", true)).toEqual(["close"]);
    for (const s of ["closed", "cancelled"] as const) expect(transferActions(s, true)).toEqual([]);
  });

  it("with approval off a draft goes straight out", () => {
    expect(transferActions("draft", false)).toEqual(["dispatch", "cancel"]);
  });

  it("what's still on the way", () => {
    expect(pendingOf({ dispatched: 20, received: 18, damaged: 0, shortage: 0 })).toBe(2);
    expect(pendingOf({ dispatched: 20, received: 18, damaged: 0, shortage: 2 })).toBe(0);
  });
});

describe("register steps", () => {
  it("a transit shortage can't be rejected away", () => {
    expect(discrepancyActions("reported", "transit_shortage")).not.toContain("reject");
    expect(discrepancyActions("reported", "missing")).toContain("reject");
    expect(discrepancyActions("approved", "theft")).toEqual(["adjust"]);
  });
  it("damage: approve before dispose", () => {
    expect(damageActions("reported")).toEqual(["review", "approve", "reject"]);
    expect(damageActions("approved")).toEqual(["dispose"]);
    expect(damageActions("dispositioned")).toEqual([]);
  });
});

describe("sizes and variants", () => {
  it("sizes read S M L XL, then numbers, then the rest", () => {
    expect(["XL", "M", "S", "Free Size", "32", "28", "L", "XXL"].sort(compareSizes)).toEqual(["S", "M", "L", "XL", "XXL", "28", "32", "Free Size"]);
  });
  it("lists typed with commas, slashes, lines or spaces", () => {
    expect(parseList("Red, Blue,red / Green")).toEqual(["Red", "Blue", "Green"]);
    expect(parseSizes("XL S  M L")).toEqual(["S", "M", "L", "XL"]);
    expect(parseSizes("28, 30, 32")).toEqual(["28", "30", "32"]);
    // The New style form's "Free size" button: one size, not "Free" and "Size".
    expect(parseSizes("Free Size")).toEqual(["Free Size"]);
    expect(parseSizes("M free  size L")).toEqual(["M", "L", "Free Size"]);
  });
  it("every colour × size, named and coded", () => {
    const m = variantMatrix(["Red", "Blue"], ["L", "M"]);
    expect(m).toEqual([{ colour: "Red", size: "M" }, { colour: "Red", size: "L" }, { colour: "Blue", size: "M" }, { colour: "Blue", size: "L" }]);
    expect(variantMatrix([], [])).toEqual([{ colour: null, size: null }]);
    expect(variantName("Cotton Kurti", { colour: "Red", size: "M" })).toBe("Cotton Kurti — Red / M");
    expect(variantName("Dupatta", { colour: null, size: null })).toBe("Dupatta");
    expect(variantSku("KUR-101", { colour: "Red", size: "XL" })).toBe("KUR101-RED-XL");
  });
});

describe("GST flags for moving goods", () => {
  it("same GSTIN: internal, no tax decided; above ₹50,000 an e-way bill is flagged", () => {
    const g = movementGst({ fromGstin: "27AAAPL1234C1Z5", toGstin: "27AAAPL1234C1Z5", value: 60000 });
    expect([g.internal, g.review, g.ewayLikely, g.interState]).toEqual([true, false, true, false]);
  });
  it("different GSTINs: distinct persons, flagged for review", () => {
    const g = movementGst({ fromGstin: "27AAAPL1234C1Z5", toGstin: "29AAAPL1234C1Z5", value: 1000 });
    expect([g.internal, g.review, g.interState, g.ewayLikely]).toEqual([false, true, true, false]);
  });
  it("a missing GSTIN is flagged, never assumed", () => {
    expect(movementGst({ fromGstin: "27AAAPL1234C1Z5", toGstin: null, value: 100 }).review).toBe(true);
  });
});

describe("financial years", () => {
  it("April to March", () => {
    expect(financialYearOf("2026-03-31")).toBe("2025-26");
    expect(financialYearOf("2026-04-01")).toBe("2026-27");
    expect(nextFinancialYear("2099-00")).toBe("2100-01");
    expect(financialYearBounds("2025-26")).toEqual({ closing: "2026-03-31", opening: "2026-04-01" });
  });
});

describe("refusals in plain words", () => {
  it("names the item, the godown and the numbers", () => {
    expect(refusalMessage("insufficient_godown_stock", JSON.stringify({ name: "Kurti Red/M", godown: "Main", requested: 6, available: 5 }))).toBe("Kurti Red/M: only 5 in Main, 6 asked.");
    expect(refusalMessage("return_exceeds_purchase", JSON.stringify({ name: "K", eligible: 6 }))).toBe("K: only 6 can still go back against this purchase.");
    expect(refusalMessage("something_new")).toMatch(/try again/);
  });
});
