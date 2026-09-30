// "Buy X get Y free" on an item: of every X + Y the customer takes, Y are free. The bill shows the
// free ones as their own ₹0 line (so the invoice and GST are plain), and the counter is told when
// one more would be free. Pure, so New Bill's preview and the server's bill agree.

export type Bxgy = { buy: number; free: number };

/** How many of `quantity` are free under the offer (whole units only). */
export function freeUnits(quantity: number, offer: Bxgy | null | undefined): number {
  if (!offer || !(offer.buy >= 1) || !(offer.free >= 1) || !(quantity > 0)) return 0;
  return Math.floor(Math.floor(quantity) / (offer.buy + offer.free)) * offer.free;
}

/** When taking a few more would make some free: how many more, and how many that frees. */
export function nextFree(quantity: number, offer: Bxgy | null | undefined): { more: number; free: number } | null {
  if (!offer || !(offer.buy >= 1) || !(offer.free >= 1) || !(quantity > 0)) return null;
  const group = offer.buy + offer.free;
  const inGroup = Math.floor(quantity) % group;
  // Paid for a full "buy" in this round — the free ones are still to be picked up.
  if (inGroup >= offer.buy) return { more: group - inGroup, free: group - inGroup };
  return null;
}

export const bxgyLabel = (o: Bxgy) => `Buy ${o.buy} get ${o.free} free`;
