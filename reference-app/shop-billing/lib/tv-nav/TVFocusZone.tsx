"use client";

import { createContext, useContext, useId, type ReactNode } from "react";

const TVFocusZoneContext = createContext<string>("default");

/** Wraps a logical row/section (e.g. one KDS ticket row, one settings
 * group) so every TVFocusable inside shares a zone id. Zones matter
 * for two things: modal focus-trapping (only elements in the modal's
 * zone are reachable while it's open) and focus memory (remembering
 * "the last focused item in THIS zone" rather than globally). */
export function TVFocusZone({ id: explicitId, children }: { id?: string; children: ReactNode }) {
  const autoId = useId();
  const id = explicitId ?? autoId;
  return <TVFocusZoneContext.Provider value={id}>{children}</TVFocusZoneContext.Provider>;
}

export function useTVFocusZone(): string {
  return useContext(TVFocusZoneContext);
}
