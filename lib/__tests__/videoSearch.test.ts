import { describe, expect, it } from "vitest";
import { findVideos } from "../videoSearch";

describe("findVideos", () => {
  it("finds the udhaar part from a Hinglish complaint", () => {
    const hits = findVideos("customer ka udhaar kaise likhe", "grocery");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].topic.toLowerCase()).toMatch(/udhaar|khata/);
  });

  it("finds printing help for a printer problem", () => {
    const hits = findVideos("printer se bill nahi chhap raha", "grocery");
    expect(hits.some((h) => /print/i.test(h.topic))).toBe(true);
  });

  it("puts the shop's own trade first", () => {
    const hits = findVideos("expiry dawai return", "pharmacy");
    expect(hits[0].video.for).not.toBe("all");
    expect(hits[0].video.for).toContain("pharmacy");
  });

  it("never offers another trade's video", () => {
    for (const h of findVideos("gold rate making charge", "grocery")) {
      expect(h.video.for === "all" || h.video.for.includes("grocery")).toBe(true);
    }
  });

  it("returns nothing for empty or filler text", () => {
    expect(findVideos("", "grocery")).toEqual([]);
    expect(findVideos("hai kya ho", "grocery")).toEqual([]);
  });

  it("each hit points at a real second inside the video", () => {
    for (const h of findVideos("gst report", "mart")) {
      expect(h.t).toBeGreaterThanOrEqual(0);
      expect(h.t).toBeLessThan(h.video.seconds);
    }
  });
});
