// Gold given to a karigar and the jewellery that comes back: the weight that went, what returned
// (the piece and any leftover metal), the loss, and whether it stayed within the wastage agreed.
// Pure, so the register, the receive form and the tests agree. Weights in grams, to the milligram.

const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export type KarigarSettlement = {
  /** Metal lost in the making: issued − (piece + leftover returned). */
  loss: number;
  /** The wastage the karigar may keep, by the agreed percent of what was issued. */
  allowed: number;
  /** Loss beyond what was agreed — metal the karigar owes the shop (0 when within the limit). */
  owed: number;
  /** The same loss in fine (24K) gold, by the purity of the metal given. */
  owedFine: number;
  lossPercent: number;
};

export function settleKarigar(job: { issuedWeight: number; purityPercent: number; wastageAllowedPercent: number }, back: { receivedWeight: number; returnedMetal: number }): KarigarSettlement {
  const loss = r3(Math.max(0, job.issuedWeight - back.receivedWeight - back.returnedMetal));
  const allowed = r3((job.issuedWeight * Math.max(0, job.wastageAllowedPercent)) / 100);
  const owed = r3(Math.max(0, loss - allowed));
  return {
    loss,
    allowed,
    owed,
    owedFine: r3((owed * job.purityPercent) / 100),
    lossPercent: job.issuedWeight > 0 ? Math.round((loss / job.issuedWeight) * 10000) / 100 : 0,
  };
}

/** Fine (24K) gold in a weight of the given purity. */
export const fineWeight = (weight: number, purityPercent: number) => r3((weight * purityPercent) / 100);
