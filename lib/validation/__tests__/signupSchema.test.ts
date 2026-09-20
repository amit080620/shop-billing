import { describe, it, expect } from "vitest";
import { signupSchema } from "../schemas";
import { INDIAN_STATES } from "@/lib/constants/states";

const valid = {
  shopName: "Sharma General Store",
  businessType: "grocery",
  stateCode: "27",
  ownerName: "Rakesh Sharma",
  ownerPhone: "9876543210",
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

  it("needs a 10-digit Indian mobile so support and renewals can reach the shop", () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
    expect(signupSchema.safeParse({ ...valid, ownerPhone: "98765 43210" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, ownerPhone: "12345" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, ownerPhone: "1234567890" }).success).toBe(false); // must start 6-9
    expect(signupSchema.safeParse({ ...valid, ownerPhone: "" }).success).toBe(false);
    const withoutPhone: Partial<typeof valid> = { ...valid };
    delete withoutPhone.ownerPhone;
    expect(signupSchema.safeParse(withoutPhone).success).toBe(false);
  });
});
