"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import { TVFocusManager } from "./TVFocusManager";

const TVNavigationContext = createContext<TVFocusManager | null>(null);

/** Wraps a subtree with one TVFocusManager. Deliberately NOT mounted at
 * the app root — it only wraps the specific screens that opt into
 * D-pad navigation (e.g. the KDS), so every other page in the app
 * never even loads this code and is completely unaffected. */
export function TVNavigationProvider({ children }: { children: ReactNode }) {
  const managerRef = useRef<TVFocusManager | null>(null);
  if (!managerRef.current) managerRef.current = new TVFocusManager();

  return <TVNavigationContext.Provider value={managerRef.current}>{children}</TVNavigationContext.Provider>;
}

export function useTVFocusManager(): TVFocusManager {
  const manager = useContext(TVNavigationContext);
  if (!manager) {
    throw new Error("useTVFocusManager must be used within a TVNavigationProvider");
  }
  return manager;
}
