import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/LangContext", () => ({ useT: () => ({ t: (k: string) => k }) }));
const { changeFor, likelyNotes } = await import("../../app/components/CashChange");

describe("change at the counter", () => {
  it("offers the notes a customer is likely to hand over", () => {
    expect(likelyNotes(375)).toEqual([400, 500, 1000, 2000]);
    expect(likelyNotes(100)).toEqual([150, 200, 500, 1000]);
    expect(likelyNotes(0)).toEqual([]);
  });
  it("works out the change, or what is short, to the paisa", () => {
    expect(changeFor(375, 500)).toBe(125);
    expect(changeFor(99.5, 100)).toBe(0.5);
    expect(changeFor(375, 300)).toBe(-75);
  });
});
