/** GST on hotel accommodation depends on the room's tariff for one night,
 * before tax — not on the bill total:
 *   up to ₹1,000          → exempt
 *   ₹1,001 – ₹7,500       → 5%
 *   above ₹7,500          → 18%
 * (Rates in force since 22 Sep 2025.) The rules have changed before, so a
 * room type can carry its own GST % override instead of relying on this. */
export const ACCOMMODATION_EXEMPT_UP_TO = 1000;
export const ACCOMMODATION_LOW_SLAB_UP_TO = 7500;

export function accommodationGstPercent(ratePerNight: number): number {
  if (ratePerNight <= ACCOMMODATION_EXEMPT_UP_TO) return 0;
  if (ratePerNight <= ACCOMMODATION_LOW_SLAB_UP_TO) return 5;
  return 18;
}

/** The GST % to charge for a room: the room type's own override when the
 * owner has set one, otherwise the slab for that night's rate. */
export function roomGstPercent(ratePerNight: number, override: number | null | undefined): number {
  if (override != null && Number.isFinite(override) && override >= 0) return override;
  return accommodationGstPercent(ratePerNight);
}
