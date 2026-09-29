import { describe, expect, it } from "vitest";
import { rentalReturnFigures } from "../rentalReturn";

describe("rental return: where the deposit goes", () => {
  it("hands the whole deposit back when nothing is owed", () => {
    expect(rentalReturnFigures({ depositCollected: 2000, rentDue: 0, damageCharge: 0, lateFee: 0, useDepositForRentDue: true })).toEqual({ charges: 0, rentPaidFromDeposit: 0, depositReturned: 2000, creditAfter: 0 });
  });

  it("takes damage and the late fee out of the deposit first", () => {
    const f = rentalReturnFigures({ depositCollected: 2000, rentDue: 0, damageCharge: 300, lateFee: 200, useDepositForRentDue: true });
    expect(f.depositReturned).toBe(1500);
    expect(f.creditAfter).toBe(0);
  });

  it("then settles unpaid rent from what is left, instead of handing it all back", () => {
    const f = rentalReturnFigures({ depositCollected: 2000, rentDue: 700, damageCharge: 300, lateFee: 0, useDepositForRentDue: true });
    expect(f.rentPaidFromDeposit).toBe(700);
    expect(f.depositReturned).toBe(1000);
    expect(f.creditAfter).toBe(0);
  });

  it("leaves the rent on udhaar when the shop chooses to", () => {
    const f = rentalReturnFigures({ depositCollected: 2000, rentDue: 700, damageCharge: 0, lateFee: 0, useDepositForRentDue: false });
    expect(f.depositReturned).toBe(2000);
    expect(f.creditAfter).toBe(700);
  });

  it("adds charges beyond the deposit to what the customer owes", () => {
    const f = rentalReturnFigures({ depositCollected: 500, rentDue: 400, damageCharge: 800, lateFee: 0, useDepositForRentDue: true });
    expect(f.depositReturned).toBe(0);
    expect(f.rentPaidFromDeposit).toBe(0);
    expect(f.creditAfter).toBe(700);
  });
});
