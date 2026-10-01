"use client";

import { createContext, useContext } from "react";

/** The signed-in shop's business type, for small client bits (the screen's video link) that don't
 * get it as a prop. Null outside the dashboard (public pages, print views, admin). */
const BusinessTypeContext = createContext<string | null>(null);

export function BusinessTypeProvider({ value, children }: { value: string; children: React.ReactNode }) {
  return <BusinessTypeContext.Provider value={value}>{children}</BusinessTypeContext.Provider>;
}

export const useBusinessType = () => useContext(BusinessTypeContext);
