import { describe, expect, it } from "vitest";
import { financialYearFor } from "../gst";
import { addDaysIso } from "../dateHelpers";

describe("dates by the calendar in India", () => {
  it("opens the new financial year at midnight in India, not at 5:30 am", () => {
    // 1 April 2027, 00:30 IST = 31 March 2027, 19:00 UTC.
    expect(financialYearFor(new Date("2027-03-31T19:00:00Z"))).toBe("2027-28");
    // 31 March 2027, 23:00 IST is still the old year.
    expect(financialYearFor(new Date("2027-03-31T17:30:00Z"))).toBe("2026-27");
  });

  it("moves a calendar date across months and years", () => {
    expect(addDaysIso("2026-09-29", 30)).toBe("2026-10-29");
    expect(addDaysIso("2026-12-25", 10)).toBe("2027-01-04");
    expect(addDaysIso("2028-02-28", 1)).toBe("2028-02-29");
  });
});
