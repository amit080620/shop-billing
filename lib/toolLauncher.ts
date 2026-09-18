"use client";

import { useEffect, useRef } from "react";

/** The calculator and assistant panels are opened from header buttons
 * instead of floating bubbles (a bubble always ends up covering some
 * screen's primary button). The header and the panels live in different
 * parts of the tree, so a window event connects them. */
export type ToolName = "calculator" | "assistant";

const EVENT = "ray:open-tool";

export function openTool(name: ToolName) {
  window.dispatchEvent(new CustomEvent<ToolName>(EVENT, { detail: name }));
}

export function useToolLauncher(name: ToolName, onOpen: () => void) {
  const handler = useRef(onOpen);
  handler.current = onOpen;
  useEffect(() => {
    function listen(e: Event) {
      if ((e as CustomEvent<ToolName>).detail === name) handler.current();
    }
    window.addEventListener(EVENT, listen);
    return () => window.removeEventListener(EVENT, listen);
  }, [name]);
}

/** Where a panel opens: top-right, just under the sticky header. */
export function panelAnchor(width: number) {
  return { x: Math.max(8, window.innerWidth - width - 12), y: window.innerWidth < 768 ? 120 : 72 };
}
