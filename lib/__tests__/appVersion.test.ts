import { describe, it, expect } from "vitest";
import { isOlderVersion } from "../nativeApp";

describe("isOlderVersion", () => {
  it("compares each part as a number", () => {
    expect(isOlderVersion("1.0.2", "1.0.3")).toBe(true);
    expect(isOlderVersion("1.0.9", "1.0.10")).toBe(true);
    expect(isOlderVersion("1.1.0", "1.0.10")).toBe(false);
  });

  it("is false for the same or a newer version", () => {
    expect(isOlderVersion("1.0.3", "1.0.3")).toBe(false);
    expect(isOlderVersion("1.0.4", "1.0.3")).toBe(false);
    expect(isOlderVersion("2.0", "1.9.9")).toBe(false);
  });

  it("treats missing parts as zero", () => {
    expect(isOlderVersion("1.0", "1.0.0")).toBe(false);
    expect(isOlderVersion("1.0", "1.0.1")).toBe(true);
  });
});
