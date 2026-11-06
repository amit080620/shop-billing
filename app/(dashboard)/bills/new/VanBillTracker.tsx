"use client";

import { useEffect } from "react";
import { useTripTracker, type Fix } from "@/lib/van/useTripTracker";
import { numberHint } from "@/lib/van/offlineVan";
import type { KeptNumbers } from "@/lib/van/data";

/** A van's bill (Van sales route tracking): where the phone is, handed to the bill, and the bill number
 * the phone gives it from the trip's kept block (past any it made offline). Loaded only on a van bill,
 * so no other New Bill carries this. */
export default function VanBillTracker({ tripId, numbers, onFix, onNumber }: { tripId: string; numbers: KeptNumbers | null; onFix: (fix: Fix | null) => void; onNumber: (n: number | null) => void }) {
  const { fix } = useTripTracker(tripId);
  useEffect(() => onFix(fix), [fix, onFix]);
  useEffect(() => onNumber(numberHint(tripId, numbers)), [tripId, numbers, onNumber]);
  return null;
}
