"use client";

import { useEffect } from "react";

/** New look only (lib/uiVersion): marks <html> as well as the page's own box, so pop-ups and menus
 * opened outside that box, and the page background behind them, take the New colours too. */
export function NewUiRoot() {
  useEffect(() => {
    document.documentElement.dataset.ui = "new";
    return () => {
      delete document.documentElement.dataset.ui;
    };
  }, []);
  return null;
}
