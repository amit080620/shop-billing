import { describe, expect, it } from "vitest";
import { countedFromDenominations, dayCloseFigures } from "../dayClose";

describe("closing the day", () => {
  it("adds up the notes counted, plus coins", () => {
    expect(countedFromDenominations({ 500: 4, 200: 3, 100: 7, 50: 2, 20: 5, 10: 8, coins: 37 })).toBe(2000 + 600 + 700 + 100 + 100 + 80 + 37);
  });

  it("ignores blanks and nonsense counts", () => {
    expect(countedFromDenominations({ 500: -2, 100: 2.7 })).toBe(200);
  });

  it("expects the opening cash plus the day's cash change, and shows a shortage as negative", () => {
    const f = dayCloseFigures({ openingCash: 2000, cashChange: 5450, countedCash: 7300, cashRemoved: 0 });
    expect(f.expected).toBe(7450);
    expect(f.difference).toBe(-150);
    expect(f.carryForward).toBe(7300);
  });

  it("leaves in the drawer what was counted minus what went to the bank", () => {
    const f = dayCloseFigures({ openingCash: 1500, cashChange: -300, countedCash: 1250, cashRemoved: 1000 });
    expect(f.expected).toBe(1200);
    expect(f.difference).toBe(50);
    expect(f.carryForward).toBe(250);
  });
});
