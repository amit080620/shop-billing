"use client";

import { useEffect } from "react";
import { noteUsedNumber } from "@/lib/van/offlineVan";

/** A van bill's page (Van sales): the salesman's phone moves its next kept number past this bill, so a
 * bill it makes offline next never repeats it. Shows nothing. */
export default function VanNumberNote({ tripId, invoiceNumber }: { tripId: string; invoiceNumber: string }) {
  useEffect(() => noteUsedNumber(tripId, invoiceNumber), [tripId, invoiceNumber]);
  return null;
}
