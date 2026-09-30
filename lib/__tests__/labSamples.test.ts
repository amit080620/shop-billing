import { describe, expect, it } from "vitest";
import { orderNumberFromScan, sampleLabels } from "../labSamples";

describe("sampleLabels", () => {
  it("makes one label per kind of sample, blood first", () => {
    const labels = sampleLabels("2026-27/LAB00012", [
      { testName: "Urine Routine", sampleType: "urine" },
      { testName: "CBC", sampleType: "blood" },
      { testName: "Lipid Profile", sampleType: "blood" },
    ]);
    expect(labels).toEqual([
      { code: "2026-27/LAB00012-B", sampleType: "blood", tests: ["CBC", "Lipid Profile"] },
      { code: "2026-27/LAB00012-U", sampleType: "urine", tests: ["Urine Routine"] },
    ]);
  });

  it("puts a test without a sample type under other", () => {
    expect(sampleLabels("2026-27/LAB00001", [{ testName: "Custom", sampleType: null }])).toEqual([{ code: "2026-27/LAB00001-O", sampleType: "other", tests: ["Custom"] }]);
  });
});

describe("orderNumberFromScan", () => {
  it("reads the order number from a sticker or the order number itself", () => {
    expect(orderNumberFromScan("2026-27/LAB00012-B")).toBe("2026-27/LAB00012");
    expect(orderNumberFromScan(" 2026-27/lab00012 ")).toBe("2026-27/LAB00012");
  });

  it("ignores anything else", () => {
    expect(orderNumberFromScan("Ramesh")).toBeNull();
    expect(orderNumberFromScan("2026-27/LAB00012-X")).toBeNull();
  });
});
