"use client";

import { useEffect } from "react";
import { useTVFocusManager } from "./TVNavigationProvider";

/** Mount once per TV-enabled screen. Listens for the standard remote
 * key set and drives the shared TVFocusManager — this is the ONLY
 * keydown listener in the tree; individual TVFocusable elements never
 * attach their own. onBack is optional and lets the screen decide what
 * "intelligent back" means for it (close a modal first, then leave the
 * page) rather than this handler making that decision generically. */
export function TVRemoteHandler({ onBack }: { onBack?: () => void }) {
  const manager = useTVFocusManager();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          manager.move("up");
          break;
        case "ArrowDown":
          e.preventDefault();
          manager.move("down");
          break;
        case "ArrowLeft":
          e.preventDefault();
          manager.move("left");
          break;
        case "ArrowRight":
          e.preventDefault();
          manager.move("right");
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          manager.select();
          break;
        case "Escape":
        case "Backspace":
          e.preventDefault();
          onBack?.();
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [manager, onBack]);

  return null;
}
