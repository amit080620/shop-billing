import { describe, it, expect } from "vitest";
import { signupSchema } from "../schemas";
import { INDIAN_STATES } from "@/lib/constants/states";

const valid = {
  shopName: "Sharma General Store",
  businessType: "grocery",
  stateCode: "27",
  ownerName: "Rakesh Sharma",
  email: "rakesh@example.com",
  password: "secret123",
};

describe("signupSchema", () => {
  it("accepts every state in the signup dropdown", () => {
    // Regression: a mangled regex (/^d{2}$/) rejected every real state
    // code, so no new shop could sign up.
    for (const state of INDIAN_STATES) {
      expect(signupSchema.safeParse({ ...valid, stateCode: state.code }).success, state.name).toBe(true);
    }
  });

  it("rejects a missing or malformed state", () => {
    expect(signupSchema.safeParse({ ...valid, stateCode: "" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, stateCode: null }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, stateCode: "Maharashtra" }).success).toBe(false);
  });
});
