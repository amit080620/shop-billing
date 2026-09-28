import { describe, expect, it } from "vitest";
import { isPastGstPeriod } from "../gst";

describe("isPastGstPeriod", () => {
  const now = new Date(2026, 8, 28, 15, 0); // 28 Sep 2026

  it("leaves a bill from earlier this month open for edit/void", () => {
    expect(isPastGstPeriod(new Date(2026, 8, 1, 10, 0), now)).toBe(false);
    expect(isPastGstPeriod(new Date(2026, 8, 28, 9, 0), now)).toBe(false);
  });

  it("locks a bill from last month", () => {
    expect(isPastGstPeriod(new Date(2026, 7, 31, 23, 0), now)).toBe(true);
  });

  it("locks the same month of an earlier year", () => {
    expect(isPastGstPeriod(new Date(2025, 8, 15), now)).toBe(true);
  });

  it("accepts an ISO string straight from the database", () => {
    expect(isPastGstPeriod(new Date(2026, 5, 10).toISOString(), now)).toBe(true);
  });
});
