import { describe, it, expect } from "vitest";
import { checkRateLimit } from "../rateLimit";

describe("checkRateLimit — genuine best-effort abuse deterrence for public endpoints", () => {
  it("genuinely allows requests within the limit", () => {
    const key = `test-${Math.random()}`;
    expect(checkRateLimit(key, 3, 60000)).toBe(true);
    expect(checkRateLimit(key, 3, 60000)).toBe(true);
    expect(checkRateLimit(key, 3, 60000)).toBe(true);
  });

  it("genuinely rejects requests once the limit is exceeded", () => {
    const key = `test-${Math.random()}`;
    checkRateLimit(key, 2, 60000);
    checkRateLimit(key, 2, 60000);
    expect(checkRateLimit(key, 2, 60000)).toBe(false);
  });

  it("genuinely tracks different keys independently", () => {
    const keyA = `test-a-${Math.random()}`;
    const keyB = `test-b-${Math.random()}`;
    checkRateLimit(keyA, 1, 60000);
    // keyA is genuinely now at its limit, but keyB is genuinely unaffected.
    expect(checkRateLimit(keyA, 1, 60000)).toBe(false);
    expect(checkRateLimit(keyB, 1, 60000)).toBe(true);
  });

  it("genuinely allows a fresh request after the window has passed", async () => {
    const key = `test-${Math.random()}`;
    expect(checkRateLimit(key, 1, 50)).toBe(true);
    expect(checkRateLimit(key, 1, 50)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(checkRateLimit(key, 1, 50)).toBe(true);
  });
});
