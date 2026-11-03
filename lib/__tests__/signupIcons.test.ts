// The signup grid (app/(auth)/AuthForm) keeps its own icon lookup; wholesale and garment were missing
// from it and showed as blank tiles. Every trade must show the icon the app gives it.
import { describe, expect, it } from "vitest";
import { BUSINESS_TYPES } from "../businessType";
import { BUSINESS_ICON_MAP } from "../../app/(auth)/AuthForm";

describe("signup business grid", () => {
  it("shows every business type with the app's own icon", () => {
    for (const b of BUSINESS_TYPES) expect(BUSINESS_ICON_MAP[b.value], b.value).toBe(b.icon);
  });
});
