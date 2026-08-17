"use client";

import { useEffect } from "react";
import { useTVFocusManager } from "./TVNavigationProvider";

/** Remembers/restores focus for a given scope (a route, a modal
 * instance, a tab). Mount this in any screen/modal that needs to
 * "come back to where the person left off":
 *
 * - A modal: mount with the modal's own scope key. On open, it
 *   restores focus inside the modal's zone (or focuses the first
 *   element there); on close (unmount), it remembers what was
 *   focused OUTSIDE the modal so the underlying page can restore it.
 * - A page: mount with the route path as the scope key so returning
 *   to a previously-visited screen re-focuses the last item. */
export function useTVFocusMemory(scopeKey: string, fallbackZoneId?: string) {
  const manager = useTVFocusManager();

  useEffect(() => {
    manager.restore(scopeKey, fallbackZoneId);
    return () => {
      manager.remember(scopeKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);
}
