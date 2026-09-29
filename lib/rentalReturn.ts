const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The money side of a rental coming back. The deposit first pays for damage and a late fee; if
 * the shop chooses, what is left of it then pays any rent still owed; the rest goes back to the
 * customer. Charges the deposit can't cover are added to what the customer owes. The same
 * figures are shown on the return screen before saving and written when it is saved. */
export function rentalReturnFigures(input: {
  depositCollected: number;
  rentDue: number;
  damageCharge: number;
  lateFee: number;
  useDepositForRentDue: boolean;
}) {
  const deposit = Math.max(0, input.depositCollected);
  const charges = round2(Math.max(0, input.damageCharge) + Math.max(0, input.lateFee));
  const leftAfterCharges = Math.max(0, round2(deposit - charges));
  const shortfall = Math.max(0, round2(charges - deposit));
  const rentDue = Math.max(0, input.rentDue);
  const rentPaidFromDeposit = input.useDepositForRentDue ? Math.min(leftAfterCharges, rentDue) : 0;
  return {
    charges,
    rentPaidFromDeposit: round2(rentPaidFromDeposit),
    depositReturned: round2(leftAfterCharges - rentPaidFromDeposit),
    /** What the customer still owes on this rental afterwards. */
    creditAfter: round2(rentDue - rentPaidFromDeposit + shortfall),
  };
}
