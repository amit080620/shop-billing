"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** The New Home's quick-launch keys (the design's "Fast counter keys"): F1–F4 open the four tiles.
 * Keys typed into a box are left to it; a held key repeats nothing. */
export function HomeKeys({ keys }: { keys: Record<string, string> }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const href = keys[e.key];
      if (!href) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
      e.preventDefault();
      router.push(href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys, router]);
  return null;
}
