import { describe, expect, it } from "vitest";
import { shopSettingsSchema } from "../validation/schemas";

const base = { name: "Amit resto", stateCode: "27" };

describe("shop settings: GSTIN and state", () => {
  it("accepts a GSTIN registered in the chosen state", () => {
    expect(shopSettingsSchema.safeParse({ ...base, gstin: "27ABCDE1234F1Z5" }).success).toBe(true);
  });

  it("refuses a GSTIN from another state — it would bill CGST + SGST where IGST is due", () => {
    const r = shopSettingsSchema.safeParse({ ...base, gstin: "24AAACC1206D1ZM" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["stateCode"]);
  });

  it("does not ask for a match when there is no GSTIN yet", () => {
    expect(shopSettingsSchema.safeParse({ ...base, gstin: "" }).success).toBe(true);
  });
});
