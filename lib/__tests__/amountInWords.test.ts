import { describe, it, expect } from "vitest";
import { amountInWords } from "../amountInWords";

describe("amountInWords", () => {
  it("writes small amounts", () => {
    expect(amountInWords(0)).toBe("Rupees Zero Only");
    expect(amountInWords(72)).toBe("Rupees Seventy Two Only");
    expect(amountInWords(100)).toBe("Rupees One Hundred Only");
    expect(amountInWords(115)).toBe("Rupees One Hundred Fifteen Only");
  });

  it("uses thousand, lakh and crore", () => {
    expect(amountInWords(1205)).toBe("Rupees One Thousand Two Hundred Five Only");
    expect(amountInWords(250000)).toBe("Rupees Two Lakh Fifty Thousand Only");
    expect(amountInWords(12345678)).toBe("Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only");
    expect(amountInWords(1500000000)).toBe("Rupees One Hundred Fifty Crore Only");
  });

  it("adds paise", () => {
    expect(amountInWords(68.57)).toBe("Rupees Sixty Eight and Fifty Seven Paise Only");
    expect(amountInWords(10.05)).toBe("Rupees Ten and Five Paise Only");
  });
});
