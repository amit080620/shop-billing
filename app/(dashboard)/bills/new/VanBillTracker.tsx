"use client";

import { useEffect } from "react";
import { useTripTracker, type Fix } from "@/lib/van/useTripTracker";

/** A van's bill (Van sales route tracking): where the phone is, handed to the bill. Loaded only on a
 * van bill, so no other New Bill carries the tracker. */
export default function VanBillTracker({ tripId, onFix }: { tripId: string; onFix: (fix: Fix | null) => void }) {
  const { fix } = useTripTracker(tripId);
  useEffect(() => onFix(fix), [fix, onFix]);
  return null;
}
